#include "postgres.h"

#include <cstdlib>
#include <stdexcept>

namespace persistence {

PostgresConfig::PostgresConfig(std::string conninfo) : conninfo_(std::move(conninfo)) {
  if (conninfo_.empty()) {
    throw std::invalid_argument("connection string must not be empty");
  }
}

const std::string &PostgresConfig::ConnInfo() const {
  return conninfo_;
}

pqxx::connection PostgresConfig::Connect() const {
  return pqxx::connection(conninfo_);
}

std::shared_ptr<PostgresConfig> MakePostgresConfigFromEnv(const std::string &env_var,
                                                          const std::string &default_url) {
  const char *value = std::getenv(env_var.c_str());
  std::string conninfo = (value && *value) ? std::string(value) : default_url;
  return std::make_shared<PostgresConfig>(std::move(conninfo));
}

}  // namespace persistence
