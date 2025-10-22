#include "audit_repository.h"


namespace persistence {

AuditRepository::AuditRepository(std::shared_ptr<PostgresConfig> config)
    : config_(std::move(config)) {}

void AuditRepository::RecordEvent(const std::string &actor_id, const std::string &action,
                                  const std::string &subject, const nlohmann::json &details,
                                  const std::string &ip_address) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  txn.exec_params("insert into audit_logs(actor, action, subject, details, ip) values ($1,$2,$3,$4::jsonb,$5)",
                  actor_id.empty() ? pqxx::null() : pqxx::zview(actor_id.c_str()), action, subject,
                  details.dump(), ip_address.empty() ? pqxx::null() : pqxx::zview(ip_address.c_str()));
  txn.commit();
}

}  // namespace persistence
