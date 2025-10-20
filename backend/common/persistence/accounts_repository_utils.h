#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_ACCOUNTS_REPOSITORY_UTILS_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_ACCOUNTS_REPOSITORY_UTILS_H

#include <optional>
#include <string>
#include <vector>

#include "accounts_repository.h"

namespace persistence::detail {

struct AccountRowData {
  std::string id;
  std::string email;
  std::string role;
  std::string full_name;
  std::string state;
  std::string suburb;
  std::string phone;
  std::string password_hash;
  std::string password_salt;
  std::optional<std::string> two_factor_secret;
  std::optional<std::string> licence_number;
  std::optional<std::string> licence_state;
  std::optional<std::string> biography;
  std::optional<std::string> specialties_json;
  std::optional<std::string> services_json;
  std::optional<bool> verified;
};

AccountRecord BuildAccountRecord(const AccountRowData &data);

std::string SerializeStringArray(const std::vector<std::string> &values);
std::vector<std::string> ParseStringArray(const std::optional<std::string> &json_payload);

}  // namespace persistence::detail

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_ACCOUNTS_REPOSITORY_UTILS_H
