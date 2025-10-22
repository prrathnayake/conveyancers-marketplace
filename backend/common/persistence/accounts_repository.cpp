#include "accounts_repository.h"
#include "postgres.h"


#include <sstream>
#include <stdexcept>

#include "accounts_repository_utils.h"

namespace persistence {
namespace {

AccountRecord RowToAccount(const pqxx::row &row) {
  detail::AccountRowData data;
  data.id = row["id"].c_str();
  data.email = row["email"].c_str();
  data.role = row["role"].c_str();
  data.full_name = row["full_name"].is_null() ? std::string{} : row["full_name"].c_str();
  data.state = row["state"].is_null() ? std::string{} : row["state"].c_str();
  data.suburb = row["suburb"].is_null() ? std::string{} : row["suburb"].c_str();
  data.phone = row["phone"].is_null() ? std::string{} : row["phone"].c_str();
  data.password_hash = row["password_hash"].c_str();
  data.password_salt = row["password_salt"].c_str();
  if (!row["two_factor_secret"].is_null()) {
    data.two_factor_secret = row["two_factor_secret"].c_str();
  }
  if (row.size() > 10) {
    if (!row["licence_number"].is_null()) {
      data.licence_number = row["licence_number"].c_str();
    }
    if (!row["licence_state"].is_null()) {
      data.licence_state = row["licence_state"].c_str();
    }
    if (!row["verified"].is_null()) {
      data.verified = row["verified"].as<bool>();
    }
    if (!row["bio"].is_null()) {
      data.biography = row["bio"].c_str();
    }
    if (!row["specialties"].is_null()) {
      data.specialties_json = row["specialties"].c_str();
    }
    if (!row["services"].is_null()) {
      data.services_json = row["services"].c_str();
    }
  }
  return detail::BuildAccountRecord(data);
}

}  // namespace

AccountsRepository::AccountsRepository(std::shared_ptr<PostgresConfig> config)
    : config_(std::move(config)) {}

AccountRecord AccountsRepository::CreateAccount(const AccountRegistrationInput &input) {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);

  const auto user_row = txn.exec_params1(
      "insert into users(role,email,phone,full_name,state,suburb) values ($1,$2,$3,$4,$5,$6) returning id, role, email, "
      "full_name, state, suburb, phone",
      input.role, input.email, input.phone, input.full_name, input.state, input.suburb);
  const std::string user_id = user_row["id"].c_str();

  txn.exec_params(
      "insert into auth_credentials(user_id,password_hash,password_salt,two_factor_secret) values ($1,$2,$3,$4)",
      user_id, input.password_hash, input.password_salt,
      input.two_factor_secret.empty() ? pqxx::null() : pqxx::zview(input.two_factor_secret.c_str()));

  if (input.role == "conveyancer") {
    txn.exec_params(
        "insert into conveyancer_profiles(user_id, licence_number, licence_state, specialties, services, insurance_policy, "
        "insurance_expiry, bio, verified) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::date,$8,$9)",
        user_id,
        input.licence_number.empty() ? pqxx::null() : pqxx::zview(input.licence_number.c_str()),
        input.licence_state.empty() ? pqxx::null() : pqxx::zview(input.licence_state.c_str()),
        detail::SerializeStringArray(input.specialties), detail::SerializeStringArray(input.services),
        input.insurance_policy.empty() ? pqxx::null() : pqxx::zview(input.insurance_policy.c_str()),
        input.insurance_expiry.empty() ? pqxx::null() : pqxx::zview(input.insurance_expiry.c_str()),
        input.biography.empty() ? pqxx::null() : pqxx::zview(input.biography.c_str()), input.verified);
  }

  txn.commit();

  AccountRecord record;
  record.id = user_id;
  record.email = input.email;
  record.role = input.role;
  record.full_name = input.full_name;
  record.state = input.state;
  record.suburb = input.suburb;
  record.phone = input.phone;
  record.password_hash = input.password_hash;
  record.password_salt = input.password_salt;
  record.two_factor_secret = input.two_factor_secret;
  record.services = input.services;
  record.specialties = input.specialties;
  record.biography = input.biography;
  record.licence_number = input.licence_number;
  record.licence_state = input.licence_state;
  record.verified = input.verified;
  return record;
}

std::optional<AccountRecord> AccountsRepository::FindByEmail(const std::string &email) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select u.id,u.email,u.role,u.full_name,u.state,u.suburb,u.phone,a.password_hash,a.password_salt,a.two_factor_secret,"
      "p.specialties,p.services,p.bio,p.licence_number,p.licence_state,p.verified "
      "from users u join auth_credentials a on a.user_id=u.id "
      "left join conveyancer_profiles p on p.user_id=u.id where lower(u.email)=lower($1)",
      email);
  if (result.empty()) {
    return std::nullopt;
  }
  return RowToAccount(result[0]);
}

std::optional<AccountRecord> AccountsRepository::FindById(const std::string &id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select u.id,u.email,u.role,u.full_name,u.state,u.suburb,u.phone,a.password_hash,a.password_salt,a.two_factor_secret,"
      "p.specialties,p.services,p.bio,p.licence_number,p.licence_state,p.verified "
      "from users u join auth_credentials a on a.user_id=u.id left join conveyancer_profiles p on p.user_id=u.id "
      "where u.id=$1",
      id);
  if (result.empty()) {
    return std::nullopt;
  }
  return RowToAccount(result[0]);
}

std::vector<AccountRecord> AccountsRepository::SearchConveyancers(const std::string &state,
                                                                  const std::string &query,
                                                                  int limit) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const std::string like_query = "%" + query + "%";
  const auto result = txn.exec_params(
      "select u.id,u.email,u.role,u.full_name,u.state,u.suburb,u.phone,a.password_hash,a.password_salt,a.two_factor_secret,"
      "p.specialties,p.services,p.bio,p.licence_number,p.licence_state,p.verified "
      "from users u join conveyancer_profiles p on p.user_id=u.id join auth_credentials a on a.user_id=u.id "
      "where ($1='' or lower(u.state)=lower($1)) and ($2='' or lower(u.full_name) like lower($3) or "
      "lower(coalesce(p.bio,'')) like lower($3)) order by u.full_name asc limit $4",
      state, query, like_query, limit);
  std::vector<AccountRecord> accounts;
  accounts.reserve(result.size());
  for (const auto &row : result) {
    accounts.push_back(RowToAccount(row));
  }
  return accounts;
}

void AccountsRepository::RecordLogin(const std::string &account_id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  txn.exec_params("update auth_credentials set last_login_at = now() where user_id=$1", account_id);
  txn.commit();
}

}  // namespace persistence
