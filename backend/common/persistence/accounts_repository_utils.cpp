#include "accounts_repository_utils.h"

#include <nlohmann/json.hpp>

namespace persistence::detail {

AccountRecord BuildAccountRecord(const AccountRowData &data) {
  AccountRecord record;
  record.id = data.id;
  record.email = data.email;
  record.role = data.role;
  record.full_name = data.full_name;
  record.state = data.state;
  record.suburb = data.suburb;
  record.phone = data.phone;
  record.password_hash = data.password_hash;
  record.password_salt = data.password_salt;
  record.two_factor_secret = data.two_factor_secret.value_or("");
  record.biography = data.biography.value_or("");
  record.licence_number = data.licence_number.value_or("");
  record.licence_state = data.licence_state.value_or("");
  record.verified = data.verified.value_or(false);
  record.specialties = ParseStringArray(data.specialties_json);
  record.services = ParseStringArray(data.services_json);
  return record;
}

std::string SerializeStringArray(const std::vector<std::string> &values) {
  nlohmann::json json_array = values;
  return json_array.dump();
}

std::vector<std::string> ParseStringArray(const std::optional<std::string> &json_payload) {
  if (!json_payload.has_value() || json_payload->empty()) {
    return {};
  }
  nlohmann::json parsed;
  try {
    parsed = nlohmann::json::parse(*json_payload);
  } catch (...) {
    return {};
  }
  if (!parsed.is_array()) {
    return {};
  }
  std::vector<std::string> values;
  values.reserve(parsed.size());
  for (const auto &item : parsed) {
    if (item.is_string()) {
      values.push_back(item.get<std::string>());
    }
  }
  return values;
}

}  // namespace persistence::detail
