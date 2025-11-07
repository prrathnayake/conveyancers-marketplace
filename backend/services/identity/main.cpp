#include <algorithm>
#include <array>
#include <cctype>
#include <cstdlib>
#include <optional>
#include <random>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include "../../common/env_loader.h"
#include "../../common/logger.h"
#include "../../common/persistence/accounts_repository.h"
#include "../../common/persistence/audit_repository.h"
#include "../../common/persistence/postgres.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

#include <openssl/evp.h>
#include <openssl/rand.h>

using json = nlohmann::json;

namespace {

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

std::string HexEncode(const unsigned char *data, std::size_t len) {
  static const char *kHex = "0123456789abcdef";
  std::string output;
  output.reserve(len * 2);
  for (std::size_t i = 0; i < len; ++i) {
    const unsigned char value = data[i];
    output.push_back(kHex[value >> 4]);
    output.push_back(kHex[value & 0x0F]);
  }
  return output;
}

std::vector<unsigned char> HexDecode(const std::string &hex) {
  if (hex.size() % 2 != 0) {
    throw std::runtime_error("invalid_hex");
  }
  std::vector<unsigned char> output;
  output.reserve(hex.size() / 2);
  for (std::size_t i = 0; i < hex.size(); i += 2) {
    auto decode = [](char ch) -> int {
      if (ch >= '0' && ch <= '9') {
        return ch - '0';
      }
      if (ch >= 'a' && ch <= 'f') {
        return 10 + (ch - 'a');
      }
      if (ch >= 'A' && ch <= 'F') {
        return 10 + (ch - 'A');
      }
      return -1;
    };
    const int high = decode(hex[i]);
    const int low = decode(hex[i + 1]);
    if (high < 0 || low < 0) {
      throw std::runtime_error("invalid_hex");
    }
    output.push_back(static_cast<unsigned char>((high << 4) | low));
  }
  return output;
}

bool ConstantTimeEquals(const std::string &lhs, const std::string &rhs) {
  if (lhs.size() != rhs.size()) {
    return false;
  }
  unsigned char diff = 0;
  for (std::size_t i = 0; i < lhs.size(); ++i) {
    diff |= static_cast<unsigned char>(lhs[i]) ^ static_cast<unsigned char>(rhs[i]);
  }
  return diff == 0;
}

std::string GenerateSalt() {
  std::array<unsigned char, 16> buffer{};
  if (RAND_bytes(buffer.data(), static_cast<int>(buffer.size())) != 1) {
    throw std::runtime_error("salt_generation_failed");
  }
  return HexEncode(buffer.data(), buffer.size());
}

std::string DerivePasswordHash(const std::string &password, const std::string &salt_hex) {
  const auto salt_bytes = HexDecode(salt_hex);
  std::array<unsigned char, 32> output{};
  if (PKCS5_PBKDF2_HMAC(password.c_str(), static_cast<int>(password.size()), salt_bytes.data(),
                         static_cast<int>(salt_bytes.size()), 100000, EVP_sha256(),
                         static_cast<int>(output.size()), output.data()) != 1) {
    throw std::runtime_error("password_hash_failed");
  }
  return HexEncode(output.data(), output.size());
}

std::string GenerateSecret() {
  static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  static std::mt19937 rng{std::random_device{}()};
  static std::uniform_int_distribution<int> dist(0, 31);
  std::string secret;
  secret.reserve(16);
  for (int i = 0; i < 16; ++i) {
    secret.push_back(alphabet[dist(rng)]);
  }
  return secret;
}

std::vector<std::string> ExtractStringArray(const json &payload, const std::string &key) {
  std::vector<std::string> values;
  if (!payload.contains(key)) {
    return values;
  }
  const auto &node = payload.at(key);
  if (!node.is_array()) {
    return values;
  }
  for (const auto &item : node) {
    if (item.is_string()) {
      values.push_back(item.get<std::string>());
    }
  }
  return values;
}

json AccountToJson(const persistence::AccountRecord &account) {
  json payload = {{"id", account.id},
                  {"email", account.email},
                  {"role", account.role},
                  {"fullName", account.full_name},
                  {"state", account.state},
                  {"suburb", account.suburb},
                  {"phone", account.phone},
                  {"verified", account.verified},
                  {"services", account.services},
                  {"specialties", account.specialties},
                  {"licenceNumber", account.licence_number},
                  {"licenceState", account.licence_state},
                  {"biography", account.biography}};
  return payload;
}

}  // namespace

int main() {
  env::LoadEnvironment();

  auto &logger = logging::ServiceLogger::Instance("identity");

  const auto database_url = GetEnvOrDefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/conveyancers");
  auto config = persistence::MakePostgresConfigFromEnv("DATABASE_URL", database_url);

  persistence::AccountsRepository accounts(config);
  persistence::AuditRepository audit(config);

  httplib::Server server;

  server.Get("/health", [](const httplib::Request &, httplib::Response &res) {
    SendJson(res, json{{"status", "ok"}});
  });

  server.Post("/accounts/register", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      const std::string email = body.value("email", "");
      const std::string password = body.value("password", "");
      const std::string role = body.value("role", "customer");
      const std::string full_name = body.value("fullName", "");
      if (email.empty() || password.empty() || full_name.empty()) {
        SendJson(res, json{{"error", "missing_fields"}}, 400);
        return;
      }
      if (role != "customer" && role != "conveyancer" && role != "admin") {
        SendJson(res, json{{"error", "invalid_role"}}, 400);
        return;
      }
      if (accounts.FindByEmail(email)) {
        SendJson(res, json{{"error", "account_exists"}}, 409);
        return;
      }

      const std::string salt = GenerateSalt();
      const std::string hash = DerivePasswordHash(password, salt);
      const std::string secret = GenerateSecret();

      persistence::AccountRegistrationInput input;
      input.email = email;
      input.password_hash = hash;
      input.password_salt = salt;
      input.two_factor_secret = secret;
      input.role = role;
      input.full_name = full_name;
      input.phone = body.value("phone", "");
      input.state = body.value("state", "");
      input.suburb = body.value("suburb", "");
      input.biography = body.value("biography", "");
      input.services = ExtractStringArray(body, "services");
      input.specialties = ExtractStringArray(body, "specialties");
      input.licence_number = body.value("licenceNumber", "");
      input.licence_state = body.value("licenceState", "");
      input.insurance_policy = body.value("insurancePolicy", "");
      input.insurance_expiry = body.value("insuranceExpiry", "");
      input.verified = body.value("verified", false);

      const auto account = accounts.CreateAccount(input);
      audit.RecordEvent(account.id, "account_registered", account.id,
                        json{{"email", email}, {"role", role}}, req.remote_addr);

      SendJson(res, json{{"accountId", account.id}, {"twoFactorSecret", secret}}, 201);
    } catch (const std::exception &ex) {
      logger.Error("registration_failed", ex.what());
      SendJson(res, json{{"error", "registration_failed"}}, 500);
    }
  });

  server.Post("/sessions/login", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      const std::string email = body.value("email", "");
      const std::string password = body.value("password", "");
      if (email.empty() || password.empty()) {
        SendJson(res, json{{"error", "missing_credentials"}}, 400);
        return;
      }
      const auto account = accounts.FindByEmail(email);
      if (!account) {
        SendJson(res, json{{"error", "invalid_credentials"}}, 401);
        return;
      }
      const std::string computed = DerivePasswordHash(password, account->password_salt);
      if (!ConstantTimeEquals(computed, account->password_hash)) {
        SendJson(res, json{{"error", "invalid_credentials"}}, 401);
        return;
      }
      accounts.RecordLogin(account->id);
      audit.RecordEvent(account->id, "login", account->id, json{{"email", account->email}}, req.remote_addr);
      SendJson(res, json{{"accountId", account->id}, {"twoFactorSecret", account->two_factor_secret}});
    } catch (const std::exception &ex) {
      logger.Error("login_failed", ex.what());
      SendJson(res, json{{"error", "login_failed"}}, 500);
    }
  });

  server.Get(R"(/profiles/(.+))", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto account = accounts.FindById(req.matches[1]);
      if (!account) {
        SendJson(res, json{{"error", "not_found"}}, 404);
        return;
      }
      SendJson(res, AccountToJson(*account));
    } catch (const std::exception &ex) {
      logger.Error("profile_lookup_failed", ex.what());
      SendJson(res, json{{"error", "profile_lookup_failed"}}, 500);
    }
  });

  server.Get("/profiles", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const std::string state = req.get_param_value("state");
      const std::string query = req.get_param_value("q");
      int limit = 25;
      if (const auto limit_param = req.get_param_value("limit"); !limit_param.empty()) {
        try {
          limit = std::clamp(std::stoi(limit_param), 1, 100);
        } catch (...) {
          limit = 25;
        }
      }
      const auto results = accounts.SearchConveyancers(state, query, limit);
      json response = json::array();
      for (const auto &account : results) {
        response.push_back(AccountToJson(account));
      }
      SendJson(res, json{{"profiles", response}});
    } catch (const std::exception &ex) {
      logger.Error("search_failed", ex.what());
      SendJson(res, json{{"error", "search_failed"}}, 500);
    }
  });

  const int port = ParseInt(GetEnvOrDefault("IDENTITY_PORT", "8081"), 8081);
  logger.Info("starting_identity_service", json{{"port", port}}.dump());
  server.listen("0.0.0.0", port);
  return 0;
}
