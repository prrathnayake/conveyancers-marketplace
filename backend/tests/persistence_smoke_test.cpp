#include <cstdlib>
#include <iostream>

#include <pqxx/pqxx>

#include "../common/env_loader.h"
#include "../common/persistence/postgres.h"

int main() {
  env::LoadEnvironment();
  const char *url = std::getenv("TEST_DATABASE_URL");
  if (url == nullptr || *url == '\0') {
    std::cout << "persistence_smoke_test_skipped" << std::endl;
    return 0;
  }
  try {
    auto config = persistence::MakePostgresConfigFromEnv("TEST_DATABASE_URL", url);
    auto connection = config->Connect();
    pqxx::work txn(connection);
    txn.exec("select 1");
    txn.commit();
    std::cout << "persistence_smoke_test_ok" << std::endl;
    return 0;
  } catch (const std::exception &ex) {
    std::cerr << "persistence_smoke_test_failed: " << ex.what() << std::endl;
    return 1;
  }
}
