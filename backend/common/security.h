#ifndef CONVEYANCERS_MARKETPLACE_SECURITY_H
#define CONVEYANCERS_MARKETPLACE_SECURITY_H

#include <algorithm>
#include <cstdlib>
#include <functional>
#include <initializer_list>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <tuple>
#include <utility>

#include "../third_party/httplib.h"
#include "logger.h"

namespace security {

class MetricsRegistry {
 public:
  static MetricsRegistry &Instance() {
    static MetricsRegistry instance;
    return instance;
  }

  void RecordRequest(std::string_view service, std::string_view method, int status) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto &service_bucket = request_totals_[std::string(service)];
    service_bucket[{std::string(method), status}] += 1;
  }

  void RecordAuthFailure(std::string_view service, std::string_view category) {
    std::lock_guard<std::mutex> lock(mutex_);
    auth_failures_[std::string(service)][std::string(category)] += 1;
  }

  std::string Render(std::string_view service) {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto service_key = std::string(service);
    std::ostringstream oss;
    oss << "# HELP service_request_total Total HTTP requests handled by the service" << '\n';
    oss << "# TYPE service_request_total counter" << '\n';
    if (auto it = request_totals_.find(service_key); it != request_totals_.end()) {
      for (const auto &entry : it->second) {
        const auto &method = std::get<0>(entry.first);
        const auto status = std::get<1>(entry.first);
        oss << "service_request_total{service=\"" << service_key << "\",method=\"" << method
            << "\",status=\"" << status << "\"} " << entry.second << '\n';
      }
    }
    oss << "# HELP service_auth_failures_total Authentication and authorization failures" << '\n';
    oss << "# TYPE service_auth_failures_total counter" << '\n';
    if (auto it = auth_failures_.find(service_key); it != auth_failures_.end()) {
      for (const auto &entry : it->second) {
        oss << "service_auth_failures_total{service=\"" << service_key << "\",category=\""
            << entry.first << "\"} " << entry.second << '\n';
      }
    }
    return oss.str();
  }

 private:
  using RequestKey = std::tuple<std::string, int>;

  MetricsRegistry() = default;

  std::mutex mutex_;
  std::map<std::string, std::map<RequestKey, long long>> request_totals_;
  std::map<std::string, std::map<std::string, long long>> auth_failures_;
};

inline void LogEvent(std::string_view service, std::string_view category, std::string_view message,
                     std::string_view context = {}) {
  logging::ServiceLogger::Instance(service).Log(category, message, context);
}

inline std::string ExpectedApiKey() {
  if (const char *env = std::getenv("SERVICE_API_KEY")) {
    return env;
  }
  return "local-dev-api-key";
}

inline std::string DeriveScopedToken(std::string_view scope, std::string_view subject) {
  std::string material;
  material.reserve(scope.size() + subject.size() + 32);
  material.append(scope);
  material.push_back(':');
  material.append(subject);
  material.push_back(':');
  material.append(ExpectedApiKey());
  const auto hash_value = std::hash<std::string>{}(material);
  std::ostringstream oss;
  oss << scope << '_' << std::hex << std::uppercase << hash_value;
  return oss.str();
}

inline bool VerifyScopedToken(std::string_view scope, std::string_view subject, std::string_view token) {
  return token == DeriveScopedToken(scope, subject);
}

inline std::string RequestId(const httplib::Request &req) {
  if (auto value = req.get_header_value("X-Request-Id"); !value.empty()) {
    return value;
  }
  return "generated-" + std::to_string(std::hash<std::string>{}(req.path + req.method));
}

inline bool Authorize(const httplib::Request &req, httplib::Response &res,
                      std::string_view service_name) {
  const auto provided_key = req.get_header_value("X-API-Key");
  if (provided_key.empty() || provided_key != ExpectedApiKey()) {
    res.status = 401;
    res.set_content(R"({"error":"unauthorized"})", "application/json");
    std::ostringstream oss;
    oss << "Denied " << req.method << ' ' << req.path << " from " << req.remote_addr
        << " missing or invalid API key";
    LogEvent(service_name, "security", oss.str(), RequestId(req));
    MetricsRegistry::Instance().RecordAuthFailure(service_name, "api_key");
    return false;
  }
  return true;
}

inline bool RequireRole(const httplib::Request &req, httplib::Response &res,
                        std::initializer_list<std::string_view> allowed_roles,
                        std::string_view service_name, std::string_view action) {
  const auto role = req.get_header_value("X-Actor-Role");
  if (role.empty()) {
    res.status = 403;
    res.set_content(R"({"error":"forbidden"})", "application/json");
    std::ostringstream oss;
    oss << "Missing role for action " << action;
    LogEvent(service_name, "authorization", oss.str(), RequestId(req));
    MetricsRegistry::Instance().RecordAuthFailure(service_name, "missing_role");
    return false;
  }
  if (std::find(allowed_roles.begin(), allowed_roles.end(), role) == allowed_roles.end()) {
    res.status = 403;
    res.set_content(R"({"error":"forbidden"})", "application/json");
    std::ostringstream oss;
    oss << "Role " << role << " blocked for action " << action;
    LogEvent(service_name, "authorization", oss.str(), RequestId(req));
    MetricsRegistry::Instance().RecordAuthFailure(service_name, "role_blocked");
    return false;
  }
  return true;
}

inline void ConfigureServer(httplib::Server &server, std::string_view service_name) {
  server.set_logger([service_name](const auto &req, const auto &res) {
    std::ostringstream oss;
    oss << req.method << ' ' << req.path << " -> " << res.status;
    LogEvent(service_name, "http", oss.str(), RequestId(req));
    MetricsRegistry::Instance().RecordRequest(service_name, req.method, res.status);
    if (res.status >= 400) {
      std::ostringstream error_oss;
      error_oss << "HTTP error " << req.method << ' ' << req.path << " -> " << res.status;
      LogEvent(service_name, "error", error_oss.str(), RequestId(req));
    }
  });

  server.set_exception_handler([service_name](const auto &req, auto &res, std::exception_ptr ep) {
    std::string message = "unknown";
    if (ep) {
      try {
        std::rethrow_exception(ep);
      } catch (const std::exception &ex) {
        message = ex.what();
      }
    }
    std::ostringstream oss;
    oss << "Exception handling " << req.method << ' ' << req.path << ": " << message;
    LogEvent(service_name, "error", oss.str(), RequestId(req));
    res.status = 500;
    res.set_content(R"({"error":"internal_server_error"})", "application/json");
  });
}

inline void AttachStandardHandlers(httplib::Server &server, std::string_view service_name) {
  ConfigureServer(server, service_name);
  server.set_error_handler([service_name](const auto &req, auto &res) {
    std::ostringstream oss;
    oss << "Error handler invoked for " << req.method << ' ' << req.path << " -> " << res.status;
    LogEvent(service_name, "error", oss.str(), RequestId(req));
  });
}

inline void ExposeMetrics(httplib::Server &server, std::string_view service_name) {
  server.Get("/metrics", [service_name](const httplib::Request &req, httplib::Response &res) {
    if (!Authorize(req, res, service_name)) {
      return;
    }
    if (!RequireRole(req, res, {"admin"}, service_name, "view_metrics")) {
      return;
    }
    res.set_content(MetricsRegistry::Instance().Render(service_name),
                    "text/plain; version=0.0.4; charset=utf-8");
  });
}

}  // namespace security

#endif  // CONVEYANCERS_MARKETPLACE_SECURITY_H
