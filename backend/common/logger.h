#ifndef CONVEYANCERS_MARKETPLACE_LOGGER_H
#define CONVEYANCERS_MARKETPLACE_LOGGER_H

#include <chrono>
#include <cstdlib>
#include <cstdio>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>

namespace logging {

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
  const auto ms =
      std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S") << '.' << std::setfill('0') << std::setw(3)
      << ms.count() << 'Z';
  return oss.str();
}

inline std::string SanitizeServiceName(std::string_view service) {
  std::string sanitized;
  sanitized.reserve(service.size());
  for (const char ch : service) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') ||
        ch == '_' || ch == '-') {
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

inline std::filesystem::path LogFilePath(std::string_view service_key) {
  return LogDirectoryPath() / (std::string(service_key) + ".log");
}

inline std::filesystem::path ErrorLogFilePath() {
  return LogDirectoryPath() / "errors.log";
}

inline std::string BuildLogEntry(std::string_view timestamp, std::string_view service,
                                 std::string_view category, std::string_view message,
                                 std::string_view context) {
  std::ostringstream oss;
  oss << "{\"timestamp\":\"" << EscapeJson(timestamp) << "\",\"service\":\"" << EscapeJson(service)
      << "\",\"category\":\"" << EscapeJson(category) << "\",\"message\":\"" << EscapeJson(message)
      << "\"";
  if (!context.empty()) {
    oss << ",\"context\":\"" << EscapeJson(context) << "\"";
  }
  oss << '}';
  return oss.str();
}

inline void AppendLogEntry(const std::filesystem::path &path, const std::string &entry) {
  std::error_code ec;
  std::filesystem::create_directories(path.parent_path(), ec);
  std::ofstream stream(path, std::ios::app);
  if (!stream.is_open()) {
    return;
  }
  stream << entry << '\n';
}

inline std::mutex &LogMutex() {
  static std::mutex mutex;
  return mutex;
}

inline void EmitConsole(std::string_view service, std::string_view message,
                        std::string_view context) {
  if (context.empty()) {
    std::clog << '[' << service << "] " << message << std::endl;
  } else {
    std::clog << '[' << service << "] " << message << " (" << context << ")" << std::endl;
  }
}

}  // namespace detail

class ServiceLogger {
 public:
  static ServiceLogger &Instance(std::string_view service_name) {
    std::string name = service_name.empty() ? "service" : std::string(service_name);
    const auto key = detail::SanitizeServiceName(name);
    static std::mutex registry_mutex;
    static std::map<std::string, std::unique_ptr<ServiceLogger>> registry;

    std::lock_guard<std::mutex> lock(registry_mutex);
    if (auto it = registry.find(key); it != registry.end()) {
      return *it->second;
    }

    auto logger = std::unique_ptr<ServiceLogger>(new ServiceLogger(std::move(name)));
    auto *raw = logger.get();
    registry.emplace(key, std::move(logger));
    return *raw;
  }

  ServiceLogger(const ServiceLogger &) = delete;
  ServiceLogger &operator=(const ServiceLogger &) = delete;

  void Log(std::string_view category, std::string_view message, std::string_view context = {}) {
    const auto timestamp = detail::TimestampNow();
    const auto entry = detail::BuildLogEntry(timestamp, service_name_, category, message, context);
    {
      std::lock_guard<std::mutex> lock(detail::LogMutex());
      detail::AppendLogEntry(log_file_, entry);
      if (category == "error") {
        detail::AppendLogEntry(detail::ErrorLogFilePath(), entry);
      }
    }
    detail::EmitConsole(service_name_, message, context);
  }

  void Info(std::string_view message, std::string_view context = {}) {
    Log("info", message, context);
  }

  void Warn(std::string_view message, std::string_view context = {}) {
    Log("warn", message, context);
  }

  void Error(std::string_view message, std::string_view context = {}) {
    Log("error", message, context);
  }

  const std::string &service() const { return service_name_; }
  const std::string &service_key() const { return service_key_; }

 private:
  explicit ServiceLogger(std::string service_name)
      : service_name_(std::move(service_name)),
        service_key_(detail::SanitizeServiceName(service_name_)),
        log_file_(detail::LogFilePath(service_key_)) {}

  std::string service_name_;
  std::string service_key_;
  std::filesystem::path log_file_;
};

}  // namespace logging

#endif  // CONVEYANCERS_MARKETPLACE_LOGGER_H
