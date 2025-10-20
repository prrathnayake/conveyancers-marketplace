#include <algorithm>
#include <array>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <optional>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "../../common/env_loader.h"
#include "../../common/security.h"
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
      security::LogEvent("jobs", "error", "redis_publish_failed", ex.what());
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
      security::LogEvent("jobs", "warn", "clamav_unavailable", ex.what());
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
      security::LogEvent("jobs", "error", "create_job_failed", ex.what());
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
      security::LogEvent("jobs", "error", "list_jobs_failed", ex.what());
      SendJson(res, json{{"error", "list_jobs_failed"}}, 500);
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
      security::LogEvent("jobs", "error", "get_job_failed", ex.what());
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
      security::LogEvent("jobs", "error", "create_milestone_failed", ex.what());
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
      security::LogEvent("jobs", "error", "list_milestones_failed", ex.what());
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
      security::LogEvent("jobs", "error", "store_document_failed", ex.what());
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
      security::LogEvent("jobs", "error", "list_documents_failed", ex.what());
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
      security::LogEvent("jobs", "error", "append_message_failed", ex.what());
      SendJson(res, json{{"error", "append_message_failed"}}, 500);
    }
  });

  server.Get(R"(/jobs/(.+)/messages)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto messages = jobs.FetchMessages(req.matches[1], 100);
      SendJson(res, json{{"messages", messages}});
    } catch (const std::exception &ex) {
      security::LogEvent("jobs", "error", "list_messages_failed", ex.what());
      SendJson(res, json{{"error", "list_messages_failed"}}, 500);
    }
  });

  const int port = ParseInt(GetEnvOrDefault("JOBS_PORT", "8082"), 8082);
  security::LogEvent("jobs", "info", "starting_jobs_service", json{{"port", port}}.dump());
  server.listen("0.0.0.0", port);
  return 0;
}
