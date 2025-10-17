#ifndef CONVEYANCERS_MARKETPLACE_ENV_LOADER_H
#define CONVEYANCERS_MARKETPLACE_ENV_LOADER_H

#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

namespace env {
namespace detail {

inline std::string Trim(std::string_view value) {
  std::size_t start = 0;
  std::size_t end = value.size();
  while (start < end && std::isspace(static_cast<unsigned char>(value[start]))) {
    ++start;
  }
  while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    --end;
  }
  return std::string(value.substr(start, end - start));
}

inline std::string StripInlineComment(const std::string &value) {
  bool in_single = false;
  bool in_double = false;
  for (std::size_t i = 0; i < value.size(); ++i) {
    const char ch = value[i];
    if (ch == '\'' && !in_double) {
      in_single = !in_single;
      continue;
    }
    if (ch == '"' && !in_single) {
      in_double = !in_double;
      continue;
    }
    if (ch == '#' && !in_single && !in_double) {
      return Trim(value.substr(0, i));
    }
  }
  return Trim(value);
}

inline void SetEnvVar(const std::string &key, const std::string &value, bool override_existing) {
  if (!override_existing && std::getenv(key.c_str()) != nullptr) {
    return;
  }
#ifdef _WIN32
  _putenv_s(key.c_str(), value.c_str());
#else
  setenv(key.c_str(), value.c_str(), 1);
#endif
}

inline bool LoadFile(const std::filesystem::path &path, bool override_existing) {
  std::ifstream stream(path);
  if (!stream.is_open()) {
    return false;
  }
  std::string line;
  while (std::getline(stream, line)) {
    if (line.empty()) {
      continue;
    }
    std::size_t equals = line.find('=');
    if (equals == std::string::npos) {
      continue;
    }
    std::string key = Trim(line.substr(0, equals));
    if (key.rfind("export ", 0) == 0) {
      key = Trim(key.substr(7));
    }
    if (key.empty()) {
      continue;
    }
    std::string value = StripInlineComment(line.substr(equals + 1));
    if (value.size() >= 2) {
      const char first = value.front();
      const char last = value.back();
      if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
        value = value.substr(1, value.size() - 2);
      }
    }
    SetEnvVar(key, value, override_existing);
  }
  return true;
}

inline std::optional<std::filesystem::path> FindBaseEnv(const std::filesystem::path &start) {
  namespace fs = std::filesystem;
  fs::path dir = start;
  for (int depth = 0; depth < 8; ++depth) {
    const fs::path candidate = dir / ".env";
    if (fs::exists(candidate) && fs::is_regular_file(candidate)) {
      return candidate;
    }
    const fs::path parent = dir.parent_path();
    if (parent.empty() || parent == dir) {
      break;
    }
    dir = parent;
  }
  return std::nullopt;
}

inline std::filesystem::path ResolvePath(const std::filesystem::path &input,
                                         const std::filesystem::path &base) {
  if (input.is_absolute()) {
    return input;
  }
  return base / input;
}

}  // namespace detail

inline void LoadEnvironment(std::filesystem::path start = std::filesystem::current_path()) {
  static std::once_flag once;
  std::call_once(once, [start = std::move(start)]() {
    namespace fs = std::filesystem;
    if (const char *explicit_env = std::getenv("CONVEYANCERS_ENV_FILE"); explicit_env && *explicit_env) {
      const fs::path path = detail::ResolvePath(explicit_env, start);
      detail::LoadFile(path, true);
      return;
    }
    const auto base_env = detail::FindBaseEnv(start);
    if (!base_env) {
      return;
    }
    detail::LoadFile(*base_env, false);
    fs::path local = *base_env;
    local += ".local";
    detail::LoadFile(local, true);
  });
}

}  // namespace env

#endif  // CONVEYANCERS_MARKETPLACE_ENV_LOADER_H
