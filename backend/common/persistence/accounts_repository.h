#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_ACCOUNTS_REPOSITORY_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_ACCOUNTS_REPOSITORY_H

#include <nlohmann/json.hpp>

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "postgres.h"

namespace persistence {

struct AccountRecord {
  std::string id;
  std::string email;
  std::string role;
  std::string full_name;
  std::string state;
  std::string suburb;
  std::string phone;
  std::string password_hash;
  std::string password_salt;
  std::string two_factor_secret;
  std::vector<std::string> services;
  std::vector<std::string> specialties;
  std::string biography;
  std::string licence_number;
  std::string licence_state;
  bool verified = false;
};

struct AccountRegistrationInput {
  std::string email;
  std::string password_hash;
  std::string password_salt;
  std::string two_factor_secret;
  std::string role;
  std::string full_name;
  std::string phone;
  std::string state;
  std::string suburb;
  std::string biography;
  std::vector<std::string> services;
  std::vector<std::string> specialties;
  std::string licence_number;
  std::string licence_state;
  std::string insurance_policy;
  std::string insurance_expiry;
  bool verified = false;
};

class AccountsRepository {
 public:
  explicit AccountsRepository(std::shared_ptr<PostgresConfig> config);

  AccountRecord CreateAccount(const AccountRegistrationInput &input);
  std::optional<AccountRecord> FindByEmail(const std::string &email) const;
  std::optional<AccountRecord> FindById(const std::string &id) const;
  std::vector<AccountRecord> SearchConveyancers(const std::string &state, const std::string &query,
                                                int limit) const;
  void RecordLogin(const std::string &account_id) const;

 private:
  std::shared_ptr<PostgresConfig> config_;
};

}  // namespace persistence

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_ACCOUNTS_REPOSITORY_H
