#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <optional>
#include <string>
#include <vector>

#include "../../common/env_loader.h"
#include "../../common/logger.h"
#include "../../common/persistence/audit_repository.h"
#include "../../common/persistence/escrow_repository.h"
#include "../../common/persistence/postgres.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

using json = nlohmann::json;

namespace {

std::string GetEnvOrDefault(const std::string &key, const std::string &fallback) {
  if (const char *value = std::getenv(key.c_str()); value && *value) {
    return value;
  }
  return fallback;
}

int ParseInt(const std::string &value, int fallback) {
  if (value.empty()) {
    return fallback;
  }
  try {
    return std::stoi(value);
  } catch (...) {
    return fallback;
  }
}

void SendJson(httplib::Response &res, const json &payload, int status = 200) {
  res.status = status;
  res.set_header("Content-Type", "application/json");
  res.body = payload.dump();
}

json EscrowToJson(const persistence::EscrowRecord &record) {
  return {{"id", record.id},
          {"jobId", record.job_id},
          {"milestoneId", record.milestone_id},
          {"amountAuthorisedCents", record.amount_authorised_cents},
          {"amountHeldCents", record.amount_held_cents},
          {"amountReleasedCents", record.amount_released_cents},
          {"providerRef", record.provider_ref},
          {"status", record.status},
          {"createdAt", record.created_at}};
}

}  // namespace

int main() {
  env::LoadEnvironment();

  auto &logger = logging::ServiceLogger::Instance("payments");

  const auto database_url = GetEnvOrDefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/conveyancers");
  auto config = persistence::MakePostgresConfigFromEnv("DATABASE_URL", database_url);

  persistence::EscrowRepository escrow(config);
  persistence::AuditRepository audit(config);

  httplib::Server server;

  server.Get("/health", [](const httplib::Request &, httplib::Response &res) {
    SendJson(res, json{{"status", "ok"}});
  });

  server.Post("/escrow", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      persistence::EscrowCreateInput input;
      input.job_id = body.value("jobId", "");
      input.milestone_id = body.value("milestoneId", "");
      input.amount_authorised_cents = body.value("amountAuthorisedCents", 0);
      input.provider_ref = body.value("providerRef", "");
      if (input.job_id.empty() || input.amount_authorised_cents <= 0) {
        SendJson(res, json{{"error", "invalid_request"}}, 400);
        return;
      }
      const auto record = escrow.CreateEscrow(input);
      audit.RecordEvent(body.value("actorId", ""), "escrow_created", record.job_id,
                        json{{"escrowId", record.id}, {"amountCents", record.amount_authorised_cents}}, req.remote_addr);
      logger.Info("escrow_created", json{{"escrowId", record.id}, {"jobId", record.job_id}}.dump());
      SendJson(res, EscrowToJson(record), 201);
    } catch (const std::exception &ex) {
      logger.Error("create_escrow_failed", ex.what());
      SendJson(res, json{{"error", "create_escrow_failed"}}, 500);
    }
  });

  server.Post(R"(/escrow/(.+)/release)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto body = json::parse(req.body);
      const std::string escrow_id = req.matches[1];
      const int amount = body.value("amountCents", 0);
      if (amount <= 0) {
        SendJson(res, json{{"error", "invalid_amount"}}, 400);
        return;
      }
      escrow.ReleaseFunds(escrow_id, amount);
      audit.RecordEvent(body.value("actorId", ""), "escrow_released", escrow_id,
                        json{{"amountCents", amount}}, req.remote_addr);
      const auto updated = escrow.GetById(escrow_id);
      if (!updated) {
        SendJson(res, json{{"error", "not_found"}}, 404);
        return;
      }
      logger.Info("escrow_released", json{{"escrowId", escrow_id}, {"amountCents", amount}}.dump());
      SendJson(res, EscrowToJson(*updated));
    } catch (const std::exception &ex) {
      logger.Error("release_escrow_failed", ex.what());
      SendJson(res, json{{"error", "release_escrow_failed"}}, 500);
    }
  });

  server.Get(R"(/escrow/(.+))", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto record = escrow.GetById(req.matches[1]);
      if (!record) {
        SendJson(res, json{{"error", "not_found"}}, 404);
        return;
      }
      SendJson(res, EscrowToJson(*record));
    } catch (const std::exception &ex) {
      logger.Error("get_escrow_failed", ex.what());
      SendJson(res, json{{"error", "get_escrow_failed"}}, 500);
    }
  });

  server.Get(R"(/jobs/(.+)/escrow)", [&](const httplib::Request &req, httplib::Response &res) {
    try {
      const auto records = escrow.ListForJob(req.matches[1]);
      json array = json::array();
      for (const auto &record : records) {
        array.push_back(EscrowToJson(record));
      }
      SendJson(res, json{{"escrow", array}});
    } catch (const std::exception &ex) {
      logger.Error("list_escrow_failed", ex.what());
      SendJson(res, json{{"error", "list_escrow_failed"}}, 500);
    }
  });

  const int port = ParseInt(GetEnvOrDefault("PAYMENTS_PORT", "8083"), 8083);
  logger.Info("starting_payments_service", json{{"port", port}}.dump());
  server.listen("0.0.0.0", port);
  return 0;
}
