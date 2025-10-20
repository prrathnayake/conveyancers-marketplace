#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_POSTGRES_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_POSTGRES_H

#include <pqxx/pqxx>

#include <memory>
#include <string>

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
