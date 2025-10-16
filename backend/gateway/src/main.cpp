#include <cstdlib>
#include <iostream>
#include <sstream>
#include <string>

#include "../common/security.h"
#include "httplib.h"

namespace {

std::string IdentityHost() {
  if (const char *env = std::getenv("IDENTITY_HOST")) {
    return env;
  }
  return "127.0.0.1";
}

int IdentityPort() {
  if (const char *env = std::getenv("IDENTITY_PORT")) {
    try {
      return std::stoi(env);
    } catch (...) {
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
    oss << p.first << '=' << p.second;
  }
  return oss.str();
}

}  // namespace

int main() {
  httplib::Server svr;
  security::AttachStandardHandlers(svr, "gateway");
  security::ExposeMetrics(svr, "gateway");
  svr.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("{\"ok\":true}", "application/json");
  });
  // Minimal facade endpoints
  svr.Post("/api/auth/login", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "gateway")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "gateway",
                               "login")) {
      return;
    }
    res.set_content("{\"token\":\"dev\"}", "application/json");
  });
  svr.Get("/api/profiles/search", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "gateway")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "gateway",
                               "search_profiles")) {
      return;
    }
    httplib::Client client(IdentityHost(), IdentityPort());
    client.set_connection_timeout(1, 0);    // 1 second
    client.set_read_timeout(1, 0);          // 1 second
    client.set_write_timeout(1, 0);         // 1 second

    const auto request_id = security::RequestId(req);
    httplib::Headers headers = {{"X-API-Key", security::ExpectedApiKey()},
                                {"X-Request-Id", request_id}};
    if (const auto role = req.get_header_value("X-Actor-Role"); !role.empty()) {
      headers.emplace("X-Actor-Role", role);
    }
    client.set_default_headers(headers);

    std::string path = "/profiles/search";
    if (!req.params.empty()) {
      path += '?' + ForwardQueryString(req.params);
    }

    if (auto identity_res = client.Get(path.c_str())) {
      res.status = identity_res->status;
      std::string content_type = identity_res->get_header_value("Content-Type");
      if (content_type.empty()) {
        content_type = "application/json";
      }
      res.set_content(identity_res->body, content_type.c_str());
      return;
    }

    res.status = 503;
    res.set_content(R"({"error":"identity_unavailable"})", "application/json");
  });
  std::cout << "Gateway listening on :8080\n";
  svr.listen("0.0.0.0", 8080);
  return 0;
}
