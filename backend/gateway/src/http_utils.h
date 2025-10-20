#ifndef CONVEYANCERS_MARKETPLACE_GATEWAY_HTTP_UTILS_H
#define CONVEYANCERS_MARKETPLACE_GATEWAY_HTTP_UTILS_H

#include <string>

#include "../third_party/httplib.h"

namespace gateway::http_utils {

std::string ResolveIdentityHost(const char *env_value);
int ResolveIdentityPort(const char *env_value);
std::string ForwardQueryString(const httplib::Params &params);

}  // namespace gateway::http_utils

#endif  // CONVEYANCERS_MARKETPLACE_GATEWAY_HTTP_UTILS_H
