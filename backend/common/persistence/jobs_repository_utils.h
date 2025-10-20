#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_JOBS_REPOSITORY_UTILS_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_JOBS_REPOSITORY_UTILS_H

#include <optional>
#include <string>

#include <nlohmann/json.hpp>

#include "jobs_repository.h"

namespace persistence::detail {

struct TemplateRowData {
  std::string id;
  std::string name;
  std::optional<std::string> jurisdiction;
  std::optional<std::string> description;
  std::optional<std::string> integration_url;
  std::optional<std::string> integration_auth_json;
  std::optional<int> latest_version;
  std::optional<std::string> payload_json;
};

TemplateRecord BuildTemplateRecord(const TemplateRowData &data);

TemplateTaskRecord MakeTaskRecord(const nlohmann::json &task);

}  // namespace persistence::detail

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_JOBS_REPOSITORY_UTILS_H
