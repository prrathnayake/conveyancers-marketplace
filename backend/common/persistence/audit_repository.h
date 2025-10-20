#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_AUDIT_REPOSITORY_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_AUDIT_REPOSITORY_H

#include <nlohmann/json.hpp>

#include <memory>
#include <string>

#include "postgres.h"

namespace persistence {

class AuditRepository {
 public:
  explicit AuditRepository(std::shared_ptr<PostgresConfig> config);

  void RecordEvent(const std::string &actor_id, const std::string &action, const std::string &subject,
                   const nlohmann::json &details, const std::string &ip_address = {}) const;

 private:
  std::shared_ptr<PostgresConfig> config_;
};

}  // namespace persistence

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_AUDIT_REPOSITORY_H
