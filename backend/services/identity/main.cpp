#include <algorithm>
#include <cctype>
#include <iostream>
#include <optional>
#include <string>
#include <vector>

#include "../../common/security.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

using json = nlohmann::json;

namespace {

struct Profile {
  std::string id;
  std::string name;
  std::string state;
  std::string suburb;
  bool verified;
};

const std::vector<Profile> kProfiles = {
    {"pro_1001", "Cora Conveyancer", "VIC", "Richmond", true},
    {"pro_1002", "Sydney Settlements", "NSW", "Parramatta", true},
    {"pro_1003", "QLD Property Law", "QLD", "Brisbane", false},
    {"pro_1004", "Capital Conveyancing", "ACT", "Canberra", true},
    {"pro_1005", "Northern Territory Solicitors", "NT", "Darwin", true},
};

std::string ToLower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
    return static_cast<char>(std::tolower(c));
  });
  return value;
}

bool MatchesQuery(const Profile &profile, const std::optional<std::string> &query,
                  const std::optional<std::string> &state_filter,
                  bool verified_only) {
  if (verified_only && !profile.verified) {
    return false;
  }

  const auto requires_solicitor = profile.state == "QLD" || profile.state == "ACT";
  if (requires_solicitor && !profile.verified) {
    return false;
  }

  if (state_filter.has_value()) {
    if (ToLower(profile.state) != ToLower(*state_filter)) {
      return false;
    }
  }
  if (!query.has_value() || query->empty()) {
    return true;
  }
  const auto haystack = ToLower(profile.name + " " + profile.suburb);
  const auto needle = ToLower(*query);
  return haystack.find(needle) != std::string::npos;
}

json ProfileToJson(const Profile &profile) {
  return json{{"id", profile.id},
              {"name", profile.name},
              {"state", profile.state},
              {"suburb", profile.suburb},
              {"verified", profile.verified}};
}

}  // namespace

int main() {
  httplib::Server server;

  security::AttachStandardHandlers(server, "identity");

  server.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("{\"ok\":true}", "application/json");
  });

  server.Get("/profiles/search", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "identity",
                               "search_profiles")) {
      return;
    }
    std::optional<std::string> query;
    std::optional<std::string> state;
    bool verified_only = false;

    if (req.has_param("q")) {
      query = req.get_param_value("q");
    }
    if (req.has_param("state")) {
      state = req.get_param_value("state");
    }
    if (req.has_param("verified")) {
      verified_only = req.get_param_value("verified") == "true";
    }

    json response = json::array();
    for (const auto &profile : kProfiles) {
      if (MatchesQuery(profile, query, state, verified_only)) {
        response.push_back(ProfileToJson(profile));
      }
    }

    res.set_content(response.dump(), "application/json");
  });

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 7001;
  std::cout << "Identity service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
