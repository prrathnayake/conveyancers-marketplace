#include "jobs_repository_utils.h"

namespace persistence::detail {

TemplateTaskRecord MakeTaskRecord(const nlohmann::json &task) {
  TemplateTaskRecord task_record;
  task_record.name = task.value("name", "");
  task_record.due_days = task.value("dueDays", 0);
  task_record.assigned_role = task.value("assignedRole", "");
  return task_record;
}

TemplateRecord BuildTemplateRecord(const TemplateRowData &data) {
  TemplateRecord record;
  record.id = data.id;
  record.name = data.name;
  record.jurisdiction = data.jurisdiction.value_or("");
  record.description = data.description.value_or("");
  record.integration_url = data.integration_url.value_or("");
  record.integration_auth = nlohmann::json::object();
  if (data.integration_auth_json.has_value() && !data.integration_auth_json->empty()) {
    try {
      record.integration_auth = nlohmann::json::parse(*data.integration_auth_json);
    } catch (...) {
      record.integration_auth = nlohmann::json::object();
    }
  }
  record.latest_version = data.latest_version.value_or(0);
  nlohmann::json payload = nlohmann::json::object();
  if (data.payload_json.has_value() && !data.payload_json->empty()) {
    try {
      payload = nlohmann::json::parse(*data.payload_json);
    } catch (...) {
      payload = nlohmann::json::object();
    }
  }
  if (payload.contains("tasks") && payload["tasks"].is_array()) {
    for (const auto &task : payload["tasks"]) {
      if (task.is_object()) {
        record.tasks.push_back(MakeTaskRecord(task));
      }
    }
  }
  if (payload.contains("syncMetadata")) {
    record.metadata = payload["syncMetadata"];
  } else {
    record.metadata = payload;
  }
  if (!record.metadata.is_object()) {
    record.metadata = nlohmann::json::object();
  }
  return record;
}

}  // namespace persistence::detail
