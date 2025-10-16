#ifndef CONVEYANCERS_MARKETPLACE_SECURITY_H
#define CONVEYANCERS_MARKETPLACE_SECURITY_H

#include <algorithm>
#include <cstdlib>
#include <functional>
#include <initializer_list>
#include <iostream>
#include <string>
#include <string_view>

#include "../third_party/httplib.h"

namespace security {

inline std::string ExpectedApiKey() {
  if (const char *env = std::getenv("SERVICE_API_KEY")) {
    return env;
  }
  return "local-dev-api-key";
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
    std::clog << '[' << service_name << "] denied request " << req.method << ' ' << req.path
              << " from " << req.remote_addr << " missing or invalid API key" << std::endl;
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
    std::clog << '[' << service_name << "] missing role for action " << action << " (request "
              << RequestId(req) << ')' << std::endl;
    return false;
  }
  if (std::find(allowed_roles.begin(), allowed_roles.end(), role) == allowed_roles.end()) {
    res.status = 403;
    res.set_content(R"({"error":"forbidden"})", "application/json");
    std::clog << '[' << service_name << "] role " << role << " blocked for action " << action
              << " (request " << RequestId(req) << ')' << std::endl;
    return false;
  }
  return true;
}

inline void ConfigureServer(httplib::Server &server, std::string_view service_name) {
  server.set_logger([service_name](const auto &req, const auto &res) {
    std::clog << '[' << service_name << "] " << req.method << ' ' << req.path << " -> " << res.status
              << " (" << RequestId(req) << ')' << std::endl;
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
    std::clog << '[' << service_name << "] exception while handling " << req.method << ' ' << req.path
              << ": " << message << std::endl;
    res.status = 500;
    res.set_content(R"({"error":"internal_server_error"})", "application/json");
  });
}

inline void AttachStandardHandlers(httplib::Server &server, std::string_view service_name) {
  ConfigureServer(server, service_name);
  server.set_error_handler([service_name](const auto &req, auto &res) {
    std::clog << '[' << service_name << "] error handler invoked for " << req.method << ' ' << req.path
              << " -> " << res.status << std::endl;
  });
}

}  // namespace security

#endif  // CONVEYANCERS_MARKETPLACE_SECURITY_H
