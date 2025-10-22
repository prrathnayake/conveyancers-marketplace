#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_POSTGRES_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_POSTGRES_H

#include "pqxx_compat.h"

#include <cstddef>
#include <memory>
#include <string>

#ifndef PQXX_COMPAT_NULL_DEFINED
#define PQXX_COMPAT_NULL_DEFINED
namespace pqxx {
inline std::nullptr_t null() noexcept { return nullptr; }
}  // namespace pqxx
#endif

namespace persistence {

class PostgresConfig {
 public:
  explicit PostgresConfig(std::string conninfo);

  const std::string &ConnInfo() const;
  pqxx::connection Connect() const;

 private:
  std::string conninfo_;
};

std::shared_ptr<PostgresConfig> MakePostgresConfigFromEnv(const std::string &env_var,
                                                          const std::string &default_url);

}  // namespace persistence

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_POSTGRES_H
