#include <algorithm>
#include <array>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <iomanip>
#include <memory>
#include <optional>
#include <random>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "../../common/env_loader.h"
#include "../../common/logger.h"
#include "../../common/persistence/audit_repository.h"
#include "../../common/persistence/jobs_repository.h"
#include "../../common/persistence/postgres.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

#include <openssl/bio.h>
#include <openssl/buffer.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <openssl/sha.h>

#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>

using json = nlohmann::json;

namespace {

logging::ServiceLogger &JobsLogger() {
  static auto &logger = logging::ServiceLogger::Instance("jobs");
  return logger;
}

int ParseInt(const std::string &value, int fallback);

struct ParsedUrl {
  std::string scheme;
  std::string host;
  int port = 0;
  std::string path;
  bool secure = false;
};

ParsedUrl ParseUrl(const std::string &url) {
  static const std::regex kRegex(R"(^([a-zA-Z][a-zA-Z0-9+.-]*)://([^/ :]+)(:([0-9]+))?(.*)$)");
  std::smatch matches;
  if (!std::regex_match(url, matches, kRegex)) {
    throw std::runtime_error("invalid_url");
  }
  ParsedUrl parsed;
  parsed.scheme = matches[1];
  parsed.host = matches[2];
  parsed.path = matches[5].str().empty() ? std::string{"/"} : matches[5].str();
  parsed.secure = parsed.scheme == "https" || parsed.scheme == "wss";
  if (matches[4].matched) {
    parsed.port = ParseInt(matches[4], parsed.secure ? 443 : 80);
  } else {
    parsed.port = parsed.secure ? 443 : 80;
  }
  return parsed;
}

class TcpSocket {
 public:
  TcpSocket(const std::string &host, int port) {
    if (host.empty() || port <= 0) {
      throw std::runtime_error("invalid_target");
    }
    struct addrinfo hints {};
    std::memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    struct addrinfo *result = nullptr;
    const std::string port_str = std::to_string(port);
    if (const int rc = getaddrinfo(host.c_str(), port_str.c_str(), &hints, &result); rc != 0) {
      throw std::runtime_error("getaddrinfo_failed");
    }
    int fd = -1;
    for (auto *entry = result; entry != nullptr; entry = entry->ai_next) {
      fd = ::socket(entry->ai_family, entry->ai_socktype, entry->ai_protocol);
      if (fd < 0) {
        continue;
      }
      if (::connect(fd, entry->ai_addr, entry->ai_addrlen) == 0) {
        break;
      }
      ::close(fd);
      fd = -1;
    }
    freeaddrinfo(result);
    if (fd < 0) {
      throw std::runtime_error("connect_failed");
    }
    fd_ = fd;
  }

  TcpSocket(const TcpSocket &) = delete;
  TcpSocket &operator=(const TcpSocket &) = delete;

  TcpSocket(TcpSocket &&other) noexcept : fd_(other.fd_) { other.fd_ = -1; }

  TcpSocket &operator=(TcpSocket &&other) noexcept {
    if (this != &other) {
      if (fd_ >= 0) {
        ::close(fd_);
      }
      fd_ = other.fd_;
      other.fd_ = -1;
    }
    return *this;
  }

  ~TcpSocket() {
    if (fd_ >= 0) {
      ::close(fd_);
    }
  }

  void Send(const std::string &data) const { SendRaw(data.data(), data.size()); }

  void SendRaw(const char *data, std::size_t length) const {
    std::size_t sent = 0;
    while (sent < length) {
      const ssize_t rc = ::send(fd_, data + sent, length - sent, 0);
      if (rc < 0) {
        throw std::runtime_error("send_failed");
      }
      sent += static_cast<std::size_t>(rc);
    }
  }

  std::string ReadLine() const {
    std::string line;
    char ch = 0;
    while (true) {
      const ssize_t rc = ::recv(fd_, &ch, 1, 0);
      if (rc <= 0) {
        break;
      }
      if (ch == '\n') {
        break;
      }
      if (ch != '\r') {
        line.push_back(ch);
      }
    }
    return line;
  }

 private:
  int fd_ = -1;
};

std::string GetEnvOrDefault(const std::string &key, const std::string &fallback) {
  if (const char *value = std::getenv(key.c_str()); value && *value) {
    return value;
  }
  return fallback;
}

int ParseInt(const std::string &value, int fallback) {
  if (value.empty()) {
    return fallback;
  }
  try {
    return std::stoi(value);
  } catch (...) {
    return fallback;
  }
}

void SendJson(httplib::Response &res, const json &payload, int status = 200) {
  res.status = status;
  res.set_header("Content-Type", "application/json");
  res.body = payload.dump();
}

std::vector<unsigned char> Base64Decode(const std::string &value) {
  BIO *b64 = BIO_new(BIO_f_base64());
  BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
  BIO *source = BIO_new_mem_buf(value.data(), static_cast<int>(value.size()));
  BIO *bio = BIO_push(b64, source);
  std::vector<unsigned char> buffer(value.size());
  const int decoded = BIO_read(bio, buffer.data(), static_cast<int>(buffer.size()));
  BIO_free_all(bio);
  if (decoded < 0) {
    throw std::runtime_error("base64_decode_failed");
  }
  buffer.resize(static_cast<std::size_t>(decoded));
  return buffer;
}

std::string Sha256Hex(const std::vector<unsigned char> &data) {
  std::array<unsigned char, SHA256_DIGEST_LENGTH> digest{};
  SHA256(data.data(), data.size(), digest.data());
  static const char *kHex = "0123456789abcdef";
  std::string output;
  output.reserve(digest.size() * 2);
  for (const auto value : digest) {
    output.push_back(kHex[value >> 4]);
    output.push_back(kHex[value & 0x0F]);
  }
  return output;
}

struct TemplateSyncResult {
  std::vector<persistence::TemplateTaskRecord> tasks;
  json metadata;
  json source;
};

TemplateSyncResult SyncTemplateFromPortal(const std::string &url, const json &auth) {
  if (url.empty()) {
    throw std::runtime_error("portal_url_missing");
  }
  const ParsedUrl parsed = ParseUrl(url);
  std::unique_ptr<httplib::Client> client;
  if (parsed.secure) {
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
    auto ssl_client = std::make_unique<httplib::SSLClient>(parsed.host, parsed.port);
    ssl_client->enable_server_certificate_verification(false);
    client = std::move(ssl_client);
#else
    throw std::runtime_error("ssl_not_supported");
#endif
  } else {
    client = std::make_unique<httplib::Client>(parsed.host, parsed.port);
  }
  if (!client) {
    throw std::runtime_error("client_init_failed");
  }
  client->set_read_timeout(10, 0);
  client->set_connection_timeout(5, 0);
  httplib::Headers headers;
  if (auth.is_object()) {
    if (const auto api_key = auth.find("apiKey"); api_key != auth.end() && api_key->is_string()) {
      headers.emplace("Authorization", "Bearer " + api_key->get<std::string>());
    }
    if (const auto header_values = auth.find("headers"); header_values != auth.end() && header_values->is_object()) {
      for (const auto &item : header_values->items()) {
        if (item.value().is_string()) {
          headers.emplace(item.key(), item.value().get<std::string>());
        }
      }
    }
  }
  const auto response = client->Get(parsed.path.c_str(), headers);
  if (!response) {
    throw std::runtime_error("portal_request_failed");
  }
  if (response->status >= 400) {
    throw std::runtime_error("portal_request_failed");
  }
  json payload = json::parse(response->body);
  TemplateSyncResult result;
  result.metadata = json::object();
  const auto now = std::chrono::system_clock::now();
  std::time_t now_time = std::chrono::system_clock::to_time_t(now);
  std::tm tm{};
#ifdef _WIN32
  gmtime_s(&tm, &now_time);
#else
  gmtime_r(&now_time, &tm);
#endif
  std::ostringstream timestamp;
  timestamp << std::put_time(&tm, "%FT%TZ");
  result.metadata["syncedAt"] = timestamp.str();
  result.metadata["statusCode"] = response->status;
  result.source = json{{"type", "portal"}, {"url", url}, {"statusCode", response->status}};
  if (payload.contains("version")) {
    result.metadata["portalVersion"] = payload["version"];
    result.source["version"] = payload["version"];
  }
  const auto *tasks_ptr = &payload;
  if (payload.contains("tasks")) {
    tasks_ptr = &payload["tasks"];
  } else if (payload.contains("workflow") && payload["workflow"].is_object() && payload["workflow"].contains("tasks")) {
    tasks_ptr = &payload["workflow"]["tasks"];
  }
  if (!tasks_ptr->is_array()) {
    throw std::runtime_error("portal_tasks_missing");
  }
  for (const auto &task : *tasks_ptr) {
    persistence::TemplateTaskRecord task_record;
    if (task.is_object()) {
      task_record.name = task.value("name", task.value("title", ""));
      task_record.due_days = task.value("dueDays", task.value("due_days", 0));
      task_record.assigned_role = task.value("assignedRole", task.value("owner", ""));
    }
    result.tasks.push_back(std::move(task_record));
  }
  return result;
}

class RedisAdapter {
 public:
  RedisAdapter(std::string host, int port, std::string password)
      : host_(std::move(host)), port_(port), password_(std::move(password)) {}

  bool Publish(const std::string &channel, const json &message) const {
    if (host_.empty() || port_ <= 0) {
      return false;
    }
    try {
      TcpSocket socket(host_, port_);
      if (!password_.empty()) {
        std::ostringstream auth;
        auth << "*2\r\n$4\r\nAUTH\r\n$" << password_.size() << "\r\n" << password_ << "\r\n";
        socket.Send(auth.str());
        socket.ReadLine();
      }
      const std::string payload = message.dump();
      std::ostringstream cmd;
      cmd << "*3\r\n$7\r\nPUBLISH\r\n$" << channel.size() << "\r\n" << channel << "\r\n$" << payload.size() << "\r\n"
          << payload << "\r\n";
      socket.Send(cmd.str());
      socket.ReadLine();
      return true;
    } catch (const std::exception &ex) {
      JobsLogger().Error("redis_publish_failed", ex.what());
      return false;
    }
  }

 private:
  std::string host_;
  int port_ = 0;
  std::string password_;
};

std::string TrimScheme(const std::string &endpoint, std::string *scheme) {
  const std::string http = "http://";
  const std::string https = "https://";
  if (endpoint.rfind(http, 0) == 0) {
    *scheme = "http";
    return endpoint.substr(http.size());
  }
  if (endpoint.rfind(https, 0) == 0) {
    *scheme = "https";
    return endpoint.substr(https.size());
  }
  *scheme = "https";
  return endpoint;
}

std::string HmacSha256(const std::string &key, const std::string &data) {
  unsigned int len = 0;
  std::array<unsigned char, EVP_MAX_MD_SIZE> buffer{};
  HMAC(EVP_sha256(), key.data(), static_cast<int>(key.size()),
       reinterpret_cast<const unsigned char *>(data.data()), static_cast<int>(data.size()), buffer.data(), &len);
  return std::string(reinterpret_cast<char *>(buffer.data()), len);
}

std::string ToHex(const std::string &data) {
  static const char *kHex = "0123456789abcdef";
  std::string output;
  output.reserve(data.size() * 2);
  for (unsigned char ch : data) {
    output.push_back(kHex[ch >> 4]);
    output.push_back(kHex[ch & 0x0F]);
  }
  return output;
}

std::string Sha256Hex(const std::string &data) {
  std::array<unsigned char, SHA256_DIGEST_LENGTH> digest{};
  SHA256(reinterpret_cast<const unsigned char *>(data.data()), data.size(), digest.data());
  static const char *kHex = "0123456789abcdef";
  std::string output;
  output.reserve(digest.size() * 2);
  for (const auto value : digest) {
    output.push_back(kHex[value >> 4]);
    output.push_back(kHex[value & 0x0F]);
  }
  return output;
}

std::string UrlEncode(std::string_view value) {
  std::ostringstream oss;
  for (unsigned char ch : value) {
    if (std::isalnum(ch) || ch == '-' || ch == '_' || ch == '.' || ch == '~' || ch == '/') {
      oss << static_cast<char>(ch);
    } else {
      oss << '%' << std::uppercase << std::setw(2) << std::setfill('0') << std::hex << static_cast<int>(ch)
          << std::nouppercase << std::setfill(' ') << std::dec;
    }
  }
  return oss.str();
}

class MinioAdapter {
 public:
  MinioAdapter(std::string endpoint, std::string bucket, std::string access_key, std::string secret_key,
               std::string region)
      : bucket_(std::move(bucket)), access_key_(std::move(access_key)), secret_key_(std::move(secret_key)),
        region_(std::move(region)) {
    scheme_ = "https";
    host_ = TrimScheme(endpoint, &scheme_);
    if (region_.empty()) {
      region_ = "us-east-1";
    }
  }

  bool Configured() const {
    return !host_.empty() && !bucket_.empty() && !access_key_.empty() && !secret_key_.empty();
  }

  std::string ObjectUrl(const std::string &object_key) const {
    return scheme_ + "://" + host_ + "/" + bucket_ + "/" + object_key;
  }

  std::string GeneratePresignedPut(const std::string &object_key, std::chrono::minutes expiry) const {
    if (!Configured()) {
      return {};
    }
    const auto now = std::chrono::system_clock::now();
    const auto time = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
#if defined(_WIN32)
    gmtime_s(&tm, &time);
#else
    gmtime_r(&time, &tm);
#endif
    char date[9];
    std::strftime(date, sizeof(date), "%Y%m%d", &tm);
    char timestamp[17];
    std::strftime(timestamp, sizeof(timestamp), "%Y%m%dT%H%M%SZ", &tm);

    const std::string credential_scope = std::string(date) + "/" + region_ + "/s3/aws4_request";
    const std::string canonical_uri = "/" + bucket_ + "/" + object_key;
    const std::string signed_headers = "host";
    std::ostringstream canonical_query;
    canonical_query << "X-Amz-Algorithm=AWS4-HMAC-SHA256";
    canonical_query << "&X-Amz-Credential=" << UrlEncode(access_key_ + "/" + credential_scope);
    canonical_query << "&X-Amz-Date=" << timestamp;
    canonical_query << "&X-Amz-Expires=" << std::chrono::duration_cast<std::chrono::seconds>(expiry).count();
    canonical_query << "&X-Amz-SignedHeaders=" << signed_headers;

    const std::string canonical_headers = "host:" + host_ + "\n";
    const std::string payload_hash = Sha256Hex("");
    const std::string canonical_request = "PUT\n" + canonical_uri + "\n" + canonical_query.str() + "\n" +
                                          canonical_headers + "\n" + signed_headers + "\n" + payload_hash;
    const std::string string_to_sign =
        "AWS4-HMAC-SHA256\n" + std::string(timestamp) + "\n" + credential_scope + "\n" + Sha256Hex(canonical_request);
    const std::string k_date = HmacSha256("AWS4" + secret_key_, date);
    const std::string k_region = HmacSha256(k_date, region_);
    const std::string k_service = HmacSha256(k_region, "s3");
    const std::string k_signing = HmacSha256(k_service, "aws4_request");
    const std::string signature = ToHex(HmacSha256(k_signing, string_to_sign));

    std::ostringstream url;
    url << scheme_ << "://" << host_ << canonical_uri << "?" << canonical_query.str()
        << "&X-Amz-Signature=" << signature;
    return url.str();
  }

 private:
  std::string scheme_;
  std::string host_;
  std::string bucket_;
  std::string access_key_;
  std::string secret_key_;
  std::string region_ = "us-east-1";
};

class ClamAvAdapter {
 public:
  ClamAvAdapter(std::string host, int port) : host_(std::move(host)), port_(port) {}

  bool Scan(const std::vector<unsigned char> &data, std::string *reason) const {
    if (ContainsEicar(data)) {
      if (reason) {
        *reason = "EICAR test string detected";
      }
      return false;
    }
    if (host_.empty() || port_ <= 0) {
      return true;
    }
    try {
      TcpSocket socket(host_, port_);
      socket.Send("zINSTREAM\0");
      std::size_t offset = 0;
      while (offset < data.size()) {
        const std::size_t chunk = std::min<std::size_t>(8192, data.size() - offset);
        const uint32_t len = htonl(static_cast<uint32_t>(chunk));
        socket.SendRaw(reinterpret_cast<const char *>(&len), sizeof(len));
        socket.SendRaw(reinterpret_cast<const char *>(data.data() + offset), chunk);
        offset += chunk;
      }
      const uint32_t terminator = 0;
      socket.SendRaw(reinterpret_cast<const char *>(&terminator), sizeof(terminator));
      const std::string response = socket.ReadLine();
      if (response.find("FOUND") != std::string::npos) {
        if (reason) {
          *reason = response;
        }
        return false;
      }
      return true;
    } catch (const std::exception &ex) {
      JobsLogger().Warn("clamav_unavailable", ex.what());
      return true;
    }
  }

 private:
  static bool ContainsEicar(const std::vector<unsigned char> &data) {
    static const std::string kEicar =
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    const std::string sample(reinterpret_cast<const char *>(data.data()), data.size());
    return sample.find(kEicar) != std::string::npos;
  }

  std::string host_;
  int port_ = 0;
};

json JobToJson(const persistence::JobRecord &job) {
  return {{"id", job.id},
          {"customerId", job.customer_id},
          {"conveyancerId", job.conveyancer_id},
          {"state", job.state},
          {"propertyType", job.property_type},
          {"status", job.status},
          {"createdAt", job.created_at}};
}

json MilestoneToJson(const persistence::MilestoneRecord &milestone) {
  return {{"id", milestone.id},
          {"jobId", milestone.job_id},
          {"name", milestone.name},
          {"amountCents", milestone.amount_cents},
          {"dueDate", milestone.due_date},
          {"status", milestone.status}};
}

json DocumentToJson(const persistence::DocumentRecord &document) {
  return {{"id", document.id},
          {"jobId", document.job_id},
          {"docType", document.doc_type},
          {"url", document.url},
          {"checksum", document.checksum},
          {"uploadedBy", document.uploaded_by},
          {"version", document.version},
          {"createdAt", document.created_at}};
}

json TemplateToJson(const persistence::TemplateRecord &record) {
  json tasks = json::array();
  for (const auto &task : record.tasks) {
    tasks.push_back({{"name", task.name}, {"dueDays", task.due_days}, {"assignedRole", task.assigned_role}});
  }
  return {{"id", record.id},
          {"name", record.name},
          {"jurisdiction", record.jurisdiction},
          {"description", record.description},
          {"integrationUrl", record.integration_url},
          {"integrationAuthConfigured", !record.integration_auth.empty()},
          {"latestVersion", record.latest_version},
          {"tasks", tasks},
          {"metadata", record.metadata}};
}

}  // namespace

int main() {
  env::LoadEnvironment();

  const auto database_url = GetEnvOrDefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/conveyancers");
  auto config = persistence::MakePostgresConfigFromEnv("DATABASE_URL", database_url);

  persistence::JobsRepository jobs(config);
  persistence::AuditRepository audit(config);

  RedisAdapter redis(GetEnvOrDefault("REDIS_HOST", ""),
                     ParseInt(GetEnvOrDefault("REDIS_PORT", ""), 0),
                     GetEnvOrDefault("REDIS_PASSWORD", ""));
  MinioAdapter minio(GetEnvOrDefault("MINIO_ENDPOINT", ""), GetEnvOrDefault("MINIO_BUCKET", "documents"),
                     GetEnvOrDefault("MINIO_ACCESS_KEY", ""), GetEnvOrDefault("MINIO_SECRET_KEY", ""),
                     GetEnvOrDefault("MINIO_REGION", "us-east-1"));
  ClamAvAdapter clamav(GetEnvOrDefault("CLAMAV_HOST", ""), ParseInt(GetEnvOrDefault("CLAMAV_PORT", ""), 0));

  httplib::Server server;

  server.Get("/health", [](const httplib::Request &, httplib::Response &res) {
    SendJson(res, json{{"status", "ok"}});
  });

  server.Post("/jobs", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      persistence::JobCreateInput input;
      input.customer_id = body.value("customerId", "");
      input.conveyancer_id = body.value("conveyancerId", "");
      input.state = body.value("state", "");
      input.property_type = body.value("propertyType", "");
      input.status = body.value("status", "quote_pending");
      const auto job = jobs.CreateJob(input);
      audit.RecordEvent(input.customer_id, "job_created", job.id,
                        json{{"conveyancerId", input.conveyancer_id}, {"state", input.state}}, req.remote_addr);
      SendJson(res, JobToJson(job), 201);
    } catch (const std::exception &ex) {
      JobsLogger().Error("create_job_failed", ex.what());
      SendJson(res, json{{"error", "create_job_failed"}}, 500);
    }
  });

  server.Get("/jobs", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const std::string account_id = req.get_param_value("accountId");
      int limit = 25;
      if (const auto limit_param = req.get_param_value("limit"); !limit_param.empty()) {
        try {
          limit = std::clamp(std::stoi(limit_param), 1, 100);
        } catch (...) {
          limit = 25;
        }
      }
      const auto records = jobs.ListJobsForAccount(account_id, limit);
      json array = json::array();
      for (const auto &record : records) {
        array.push_back(JobToJson(record));
      }
      SendJson(res, json{{"jobs", array}});
    } catch (const std::exception &ex) {
      JobsLogger().Error("list_jobs_failed", ex.what());
      SendJson(res, json{{"error", "list_jobs_failed"}}, 500);
    }
  });

  server.Get("/jobs/templates", [&](const httplib::Request &, httplib::Response &res) {
    try {
      const auto templates = jobs.ListTemplates();
      json payload = json::array();
      for (const auto &record : templates) {
        payload.push_back(TemplateToJson(record));
      }
      SendJson(res, json{{"templates", payload}});
    } catch (const std::exception &ex) {
      JobsLogger().Error("list_templates_failed", ex.what());
      SendJson(res, json{{"error", "list_templates_failed"}}, 500);
    }
  });

  server.Post("/jobs/templates", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      const std::string actor_id = body.value("actorId", "");
      persistence::TemplateUpsertInput input;
      input.template_id = body.value("templateId", std::string{});
      input.name = body.value("name", std::string{});
      if (input.name.empty()) {
        SendJson(res, json{{"error", "name_required"}}, 400);
        return;
      }
      input.jurisdiction = body.value("jurisdiction", std::string{});
      input.description = body.value("description", std::string{});
      input.integration_url = body.value("integrationUrl", std::string{});
      input.integration_auth = body.contains("integrationAuth") && body["integrationAuth"].is_object()
                                   ? body["integrationAuth"]
                                   : json::object();
      input.source = body.contains("source") && body["source"].is_object() ? body["source"] : json::object();
      input.metadata = body.contains("metadata") && body["metadata"].is_object() ? body["metadata"] : json::object();

      bool synced_from_portal = false;
      if (input.source.value("type", "") == "portal" || body.value("syncFromPortal", false)) {
        const auto sync = SyncTemplateFromPortal(input.integration_url, input.integration_auth);
        input.tasks = sync.tasks;
        input.metadata = sync.metadata;
        input.source = sync.source;
        synced_from_portal = true;
      } else {
        const auto tasks_json = body.value("tasks", json::array());
        if (!tasks_json.is_array()) {
          SendJson(res, json{{"error", "tasks_invalid"}}, 400);
          return;
        }
        for (const auto &task_json : tasks_json) {
          if (!task_json.is_object()) {
            continue;
          }
          persistence::TemplateTaskRecord task;
          task.name = task_json.value("name", std::string{});
          task.due_days = task_json.value("dueDays", 0);
          task.assigned_role = task_json.value("assignedRole", std::string{});
          if (task.name.empty()) {
            continue;
          }
          input.tasks.push_back(std::move(task));
        }
        if (input.tasks.empty()) {
          SendJson(res, json{{"error", "tasks_required"}}, 400);
          return;
        }
        if (input.source.empty()) {
          input.source = json{{"type", "manual"}};
        }
      }

      if (input.metadata.is_null() || !input.metadata.is_object()) {
        input.metadata = json::object();
      }
      if (!input.metadata.contains("syncedFromPortal")) {
        input.metadata["syncedFromPortal"] = synced_from_portal;
      }

      const auto record = jobs.UpsertTemplateVersion(input);
      json audit_details = {{"latestVersion", record.latest_version},
                            {"templateName", record.name},
                            {"tasks", record.tasks.size()},
                            {"source", input.source}};
      if (!input.metadata.empty()) {
        audit_details["metadata"] = input.metadata;
      }
      audit.RecordEvent(actor_id, "template_version_created", record.id, audit_details, req.remote_addr);
      SendJson(res, TemplateToJson(record), input.template_id.empty() ? 201 : 200);
    } catch (const std::exception &ex) {
      JobsLogger().Error("upsert_template_failed", ex.what());
      SendJson(res, json{{"error", "upsert_template_failed"}}, 500);
    }
  });

  server.Get(R"(/jobs/(.+))", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto job = jobs.GetJobById(req.matches[1]);
      if (!job) {
        SendJson(res, json{{"error", "not_found"}}, 404);
        return;
      }
      SendJson(res, JobToJson(*job));
    } catch (const std::exception &ex) {
      JobsLogger().Error("get_job_failed", ex.what());
      SendJson(res, json{{"error", "get_job_failed"}}, 500);
    }
  });

  server.Post(R"(/jobs/(.+)/milestones)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      persistence::MilestoneInput input;
      input.job_id = req.matches[1];
      input.name = body.value("name", "");
      input.amount_cents = body.value("amountCents", 0);
      input.due_date = body.value("dueDate", "");
      const auto milestone = jobs.CreateMilestone(input);
      audit.RecordEvent(body.value("actorId", ""), "milestone_created", input.job_id,
                        json{{"milestoneId", milestone.id}, {"amountCents", milestone.amount_cents}}, req.remote_addr);
      SendJson(res, MilestoneToJson(milestone), 201);
    } catch (const std::exception &ex) {
      JobsLogger().Error("create_milestone_failed", ex.what());
      SendJson(res, json{{"error", "create_milestone_failed"}}, 500);
    }
  });

  server.Get(R"(/jobs/(.+)/milestones)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto milestones = jobs.ListMilestones(req.matches[1]);
      json array = json::array();
      for (const auto &item : milestones) {
        array.push_back(MilestoneToJson(item));
      }
      SendJson(res, json{{"milestones", array}});
    } catch (const std::exception &ex) {
      JobsLogger().Error("list_milestones_failed", ex.what());
      SendJson(res, json{{"error", "list_milestones_failed"}}, 500);
    }
  });

  server.Post(R"(/jobs/(.+)/documents)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      const std::string job_id = req.matches[1];
      const std::string uploader = body.value("uploadedBy", "");
      const std::string file_name = body.value("fileName", "document.bin");
      const std::string doc_type = body.value("docType", "general");
      const std::string content_base64 = body.value("content", "");
      if (content_base64.empty()) {
        SendJson(res, json{{"error", "content_required"}}, 400);
        return;
      }
      const auto data = Base64Decode(content_base64);
      std::string reason;
      if (!clamav.Scan(data, &reason)) {
        SendJson(res, json{{"error", "virus_detected"}, {"reason", reason}}, 422);
        return;
      }
      const std::string object_key = job_id + "/" + file_name;
      const std::string checksum = Sha256Hex(data);
      const std::string upload_url =
          minio.Configured() ? minio.GeneratePresignedPut(object_key, std::chrono::minutes(15)) : std::string{};
      const std::string object_url =
          minio.Configured() ? minio.ObjectUrl(object_key) : ("https://storage.local/" + object_key);
      persistence::DocumentRecord record;
      record.job_id = job_id;
      record.doc_type = doc_type;
      record.url = object_url;
      record.checksum = checksum;
      record.uploaded_by = uploader;
      record.version = 1;
      const auto document = jobs.StoreDocument(record);
      audit.RecordEvent(uploader, "document_uploaded", job_id,
                        json{{"documentId", document.id}, {"checksum", checksum}}, req.remote_addr);
      json response = DocumentToJson(document);
      response["uploadUrl"] = upload_url;
      SendJson(res, response, 201);
    } catch (const std::exception &ex) {
      JobsLogger().Error("store_document_failed", ex.what());
      SendJson(res, json{{"error", "store_document_failed"}}, 500);
    }
  });

  server.Get(R"(/jobs/(.+)/documents)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto documents = jobs.ListDocuments(req.matches[1]);
      json array = json::array();
      for (const auto &doc : documents) {
        array.push_back(DocumentToJson(doc));
      }
      SendJson(res, json{{"documents", array}});
    } catch (const std::exception &ex) {
      JobsLogger().Error("list_documents_failed", ex.what());
      SendJson(res, json{{"error", "list_documents_failed"}}, 500);
    }
  });

  server.Post(R"(/jobs/(.+)/messages)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      const std::string job_id = req.matches[1];
      const std::string author_id = body.value("authorId", "");
      const std::string content = body.value("content", "");
      const json attachments = body.value("attachments", json::array());
      jobs.AppendMessage(job_id, author_id, content, attachments);
      json payload{{"jobId", job_id}, {"authorId", author_id}, {"content", content}, {"attachments", attachments}};
      redis.Publish("jobs:" + job_id, payload);
      SendJson(res, payload, 201);
    } catch (const std::exception &ex) {
      JobsLogger().Error("append_message_failed", ex.what());
      SendJson(res, json{{"error", "append_message_failed"}}, 500);
    }
  });

  server.Get(R"(/jobs/(.+)/messages)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto messages = jobs.FetchMessages(req.matches[1], 100);
      SendJson(res, json{{"messages", messages}});
    } catch (const std::exception &ex) {
      JobsLogger().Error("list_messages_failed", ex.what());
      SendJson(res, json{{"error", "list_messages_failed"}}, 500);
    }
  });

  const int port = ParseInt(GetEnvOrDefault("JOBS_PORT", "8082"), 8082);
  JobsLogger().Info("starting_jobs_service", json{{"port", port}}.dump());
  server.listen("0.0.0.0", port);
  return 0;
}
