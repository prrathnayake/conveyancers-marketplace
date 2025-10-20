#include "http_utils.h"

#include <cstdlib>
#include <sstream>
#include <string>

namespace gateway::http_utils {

std::string ResolveIdentityHost(const char *env_value) {
  if (env_value != nullptr && *env_value != '\0') {
    return env_value;
  }
  return "127.0.0.1";
}

int ResolveIdentityPort(const char *env_value) {
  if (env_value != nullptr && *env_value != '\0') {
    try {
      return std::stoi(env_value);
    } catch (...) {
      return 7001;
    }
  }
  return 7001;
}

std::string ForwardQueryString(const httplib::Params &params) {
  if (params.empty()) {
    return {};
  }
  std::ostringstream oss;
  bool first = true;
  for (const auto &p : params) {
    if (!first) {
      oss << '&';
    }
    first = false;
    const auto encoded_key = httplib::detail::encode_url(p.first);
    const auto encoded_value = httplib::detail::encode_url(p.second);
    oss << encoded_key;
    if (!p.second.empty()) {
      oss << '=' << encoded_value;
    }
  }
  return oss.str();
}

}  // namespace gateway::http_utils
