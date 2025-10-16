#ifndef CONVEYANCERS_MARKETPLACE_SECURITY_H
#define CONVEYANCERS_MARKETPLACE_SECURITY_H

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <initializer_list>
#include <iostream>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <utility>
#include <cstdio>
#include <ctime>
#include <system_error>

#include "../third_party/httplib.h"

namespace security {

namespace detail {

inline std::string EscapeJson(std::string_view value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char ch : value) {
    switch (ch) {
      case '"':
        escaped += "\\\"";
        break;
      case '\\':
        escaped += "\\\\";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        if (static_cast<unsigned char>(ch) < 0x20) {
          char buffer[7];
          std::snprintf(buffer, sizeof(buffer), "\\u%04x", ch);
          escaped += buffer;
        } else {
          escaped += ch;
        }
        break;
    }
  }
  return escaped;
}

inline std::string TimestampNow() {
  using clock = std::chrono::system_clock;
  const auto now = clock::now();
  const auto seconds = clock::to_time_t(now);
#ifdef _WIN32
  std::tm tm;
  gmtime_s(&tm, &seconds);
#else
  std::tm tm;
  gmtime_r(&seconds, &tm);
#endif
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S") << '.' << std::setfill('0') << std::setw(3) << ms.count() << 'Z';
  return oss.str();
}

inline std::string SanitizeServiceName(std::string_view service) {
  std::string sanitized;
  sanitized.reserve(service.size());
  for (const char ch : service) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-') {
      sanitized += ch;
    } else {
      sanitized += '_';
    }
  }
  if (sanitized.empty()) {
    sanitized = "service";
  }
  return sanitized;
}

inline const std::filesystem::path &LogDirectoryPath() {
  static std::once_flag flag;
  static std::filesystem::path directory;
  std::call_once(flag, []() {
    if (const char *env = std::getenv("LOG_DIRECTORY")) {
      directory = env;
    } else {
      directory = "logs";
    }
    if (!directory.is_absolute()) {
      directory = std::filesystem::current_path() / directory;
    }
    std::error_code ec;
    std::filesystem::create_directories(directory, ec);
  });
  return directory;
}

inline std::filesystem::path LogFilePath(std::string_view service) {
  return LogDirectoryPath() / (SanitizeServiceName(service) + ".log");
}

inline void WriteLogToFile(std::string_view service, std::string_view category, std::string_view message,
                           std::string_view context) {
  static std::mutex log_mutex;
  const std::lock_guard<std::mutex> lock(log_mutex);
  const auto path = LogFilePath(service);
  std::error_code ec;
  std::filesystem::create_directories(path.parent_path(), ec);
  std::ofstream stream(path, std::ios::app);
  if (!stream.is_open()) {
    return;
  }
  const auto timestamp = TimestampNow();
  stream << "{\"timestamp\":\"" << EscapeJson(timestamp) << "\",\"service\":\"" << EscapeJson(service)
         << "\",\"category\":\"" << EscapeJson(category) << "\",\"message\":\"" << EscapeJson(message) << "\"";
  if (!context.empty()) {
    stream << ",\"context\":\"" << EscapeJson(context) << "\"";
  }
  stream << "}\n";
}

inline void EmitLog(std::string_view service, std::string_view category, const std::string &message,
                    std::string_view context) {
  WriteLogToFile(service, category, message, context);
  if (context.empty()) {
    std::clog << '[' << service << "] " << message << std::endl;
  } else {
    std::clog << '[' << service << "] " << message << " (" << context << ")" << std::endl;
  }
}

}  // namespace detail

inline void LogEvent(std::string_view service, std::string_view category, const std::string &message,
                     std::string_view context = {}) {
  detail::EmitLog(service, category, message, context);
}

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
    std::ostringstream oss;
    oss << "Denied " << req.method << ' ' << req.path << " from " << req.remote_addr
        << " missing or invalid API key";
    LogEvent(service_name, "security", oss.str(), RequestId(req));
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
    return false;
  }
  if (std::find(allowed_roles.begin(), allowed_roles.end(), role) == allowed_roles.end()) {
    res.status = 403;
    res.set_content(R"({"error":"forbidden"})", "application/json");
    std::ostringstream oss;
    oss << "Role " << role << " blocked for action " << action;
    LogEvent(service_name, "authorization", oss.str(), RequestId(req));
    return false;
  }
  return true;
}

inline void ConfigureServer(httplib::Server &server, std::string_view service_name) {
  server.set_logger([service_name](const auto &req, const auto &res) {
    std::ostringstream oss;
    oss << req.method << ' ' << req.path << " -> " << res.status;
    LogEvent(service_name, "http", oss.str(), RequestId(req));
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

}  // namespace security

#endif  // CONVEYANCERS_MARKETPLACE_SECURITY_H
