#include <string>
#include <iostream>
// NOTE: Replace with real cpp-httplib / crow; this is a placeholder simple server.
#include "../third_party/httplib.h"
#include "../third_party/json.hpp"
using json = nlohmann::json;

int main() {
  httplib::Server svr;
  svr.Get("/healthz", [](const httplib::Request&, httplib::Response& res){
    res.set_content("{\"ok\":true}", "application/json");
  });
  // Minimal facade endpoints
  svr.Post("/api/auth/login", [](const httplib::Request& req, httplib::Response& res){
    // TODO: forward to identity service
    res.set_content("{\"token\":\"dev\"}", "application/json");
  });
  svr.Get("/api/profiles/search", [](const httplib::Request& req, httplib::Response& res){
    res.set_content(R"([{\"name\":\"Cora Conveyancer\",\"state\":\"VIC\",\"verified\":true}])", "application/json");
  });
  std::cout << "Gateway listening on :8080\n";
  svr.listen("0.0.0.0", 8080);
  return 0;
}
