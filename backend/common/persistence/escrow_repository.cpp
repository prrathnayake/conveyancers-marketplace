#include "escrow_repository.h"


namespace persistence {
namespace {

EscrowRecord RowToEscrow(const pqxx::row &row) {
  EscrowRecord record;
  record.id = row["id"].c_str();
  record.job_id = row["job_id"].is_null() ? std::string{} : row["job_id"].c_str();
  record.milestone_id = row["milestone_id"].is_null() ? std::string{} : row["milestone_id"].c_str();
  record.amount_authorised_cents = row["amount_authorised_cents"].is_null() ? 0 : row["amount_authorised_cents"].as<int>();
  record.amount_held_cents = row["amount_held_cents"].is_null() ? 0 : row["amount_held_cents"].as<int>();
  record.amount_released_cents =
      row["amount_released_cents"].is_null() ? 0 : row["amount_released_cents"].as<int>();
  record.provider_ref = row["provider_ref"].is_null() ? std::string{} : row["provider_ref"].c_str();
  record.status = row["status"].is_null() ? std::string{} : row["status"].c_str();
  record.created_at = row["created_at"].is_null() ? std::string{} : row["created_at"].c_str();
  return record;
}

}  // namespace

EscrowRepository::EscrowRepository(std::shared_ptr<PostgresConfig> config) : config_(std::move(config)) {}

EscrowRecord EscrowRepository::CreateEscrow(const EscrowCreateInput &input) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto row = txn.exec_params1(
      "insert into escrow_payments(job_id, milestone_id, amount_authorised_cents, amount_held_cents, provider_ref, status) "
      "values ($1,$2,$3,$3,$4,$5) returning id, job_id, milestone_id, amount_authorised_cents, amount_held_cents, "
      "amount_released_cents, provider_ref, status, created_at",
      input.job_id, input.milestone_id.empty() ? pqxx::null() : pqxx::zview(input.milestone_id.c_str()),
      input.amount_authorised_cents,
      input.provider_ref.empty() ? pqxx::null() : pqxx::zview(input.provider_ref.c_str()), pqxx::zview("held"));
  txn.commit();
  return RowToEscrow(row);
}

void EscrowRepository::ReleaseFunds(const std::string &escrow_id, int amount_cents) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  txn.exec_params(
      "update escrow_payments set amount_released_cents = coalesce(amount_released_cents,0) + $2, "
      "amount_held_cents = greatest(coalesce(amount_held_cents,0) - $2, 0), status = 'released' where id=$1",
      escrow_id, amount_cents);
  txn.commit();
}

std::vector<EscrowRecord> EscrowRepository::ListForJob(const std::string &job_id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, job_id, milestone_id, amount_authorised_cents, amount_held_cents, amount_released_cents, provider_ref, "
      "status, created_at from escrow_payments where job_id=$1 order by created_at desc",
      job_id);
  std::vector<EscrowRecord> records;
  records.reserve(result.size());
  for (const auto &row : result) {
    records.push_back(RowToEscrow(row));
  }
  return records;
}

std::optional<EscrowRecord> EscrowRepository::GetById(const std::string &escrow_id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, job_id, milestone_id, amount_authorised_cents, amount_held_cents, amount_released_cents, provider_ref, "
      "status, created_at from escrow_payments where id=$1",
      escrow_id);
  if (result.empty()) {
    return std::nullopt;
  }
  return RowToEscrow(result[0]);
}

}  // namespace persistence
