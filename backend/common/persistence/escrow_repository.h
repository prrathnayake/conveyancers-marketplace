#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_ESCROW_REPOSITORY_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_ESCROW_REPOSITORY_H

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "postgres.h"

namespace persistence {

struct EscrowCreateInput {
  std::string job_id;
  std::string milestone_id;
  int amount_authorised_cents = 0;
  std::string provider_ref;
};

struct EscrowRecord {
  std::string id;
  std::string job_id;
  std::string milestone_id;
  int amount_authorised_cents = 0;
  int amount_held_cents = 0;
  int amount_released_cents = 0;
  std::string provider_ref;
  std::string status;
  std::string created_at;
};

class EscrowRepository {
 public:
  explicit EscrowRepository(std::shared_ptr<PostgresConfig> config);

  EscrowRecord CreateEscrow(const EscrowCreateInput &input) const;
  void ReleaseFunds(const std::string &escrow_id, int amount_cents) const;
  std::vector<EscrowRecord> ListForJob(const std::string &job_id) const;
  std::optional<EscrowRecord> GetById(const std::string &escrow_id) const;

 private:
  std::shared_ptr<PostgresConfig> config_;
};

}  // namespace persistence

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_ESCROW_REPOSITORY_H
