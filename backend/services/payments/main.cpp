#include <iostream>
#include <mutex>
#include <optional>
#include <random>
#include <string>
#include <unordered_map>

#include "../../common/security.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

using json = nlohmann::json;

namespace {

enum class PaymentStatus { kHeld, kReleased, kRefunded };

struct PaymentRecord {
  std::string id;
  std::string job_id;
  std::string milestone_id;
  std::string currency;
  int amount_cents;
  std::string reference;
  PaymentStatus status;
  std::optional<std::string> released_at;
  std::optional<std::string> refunded_at;
};

std::string PaymentStatusToString(PaymentStatus status) {
  switch (status) {
    case PaymentStatus::kHeld:
      return "held";
    case PaymentStatus::kReleased:
      return "released";
    case PaymentStatus::kRefunded:
      return "refunded";
  }
  return "unknown";
}

json PaymentToJson(const PaymentRecord &record) {
  json payload{{"id", record.id},
               {"job_id", record.job_id},
               {"milestone_id", record.milestone_id},
               {"currency", record.currency},
               {"amount_cents", record.amount_cents},
               {"reference", record.reference},
               {"status", PaymentStatusToString(record.status)}};
  if (record.released_at.has_value()) {
    payload["released_at"] = *record.released_at;
  }
  if (record.refunded_at.has_value()) {
    payload["refunded_at"] = *record.refunded_at;
  }
  return payload;
}

class PaymentLedger {
 public:
  PaymentRecord CreateHold(const std::string &job_id, const std::string &milestone_id,
                           const std::string &currency, int amount_cents,
                           const std::string &reference) {
    std::lock_guard<std::mutex> lock(mutex_);
    PaymentRecord record;
    record.id = GenerateId();
    record.job_id = job_id;
    record.milestone_id = milestone_id;
    record.currency = currency;
    record.amount_cents = amount_cents;
    record.reference = reference;
    record.status = PaymentStatus::kHeld;
    ledger_[record.id] = record;
    return record;
  }

  std::optional<PaymentRecord> Get(const std::string &id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = ledger_.find(id); it != ledger_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  std::optional<PaymentRecord> Release(const std::string &id,
                                       const std::string &released_at) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = ledger_.find(id);
    if (it == ledger_.end()) {
      return std::nullopt;
    }
    if (it->second.status == PaymentStatus::kRefunded) {
      return std::nullopt;
    }
    it->second.status = PaymentStatus::kReleased;
    it->second.released_at = released_at;
    it->second.refunded_at.reset();
    return it->second;
  }

  std::optional<PaymentRecord> Refund(const std::string &id, const std::string &refunded_at) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = ledger_.find(id);
    if (it == ledger_.end()) {
      return std::nullopt;
    }
    if (it->second.status == PaymentStatus::kReleased) {
      // Released funds cannot be refunded through the PSP integration.
      return std::nullopt;
    }
    it->second.status = PaymentStatus::kRefunded;
    it->second.refunded_at = refunded_at;
    it->second.released_at.reset();
    return it->second;
  }

 private:
  std::string GenerateId() {
    std::uniform_int_distribution<int> distribution(10000, 99999);
    return "hold_" + std::to_string(distribution(random_engine_));
  }

  std::mutex mutex_;
  std::unordered_map<std::string, PaymentRecord> ledger_;
  std::mt19937 random_engine_{std::random_device{}()};
};

PaymentLedger &GlobalLedger() {
  static PaymentLedger ledger;
  return ledger;
}

std::optional<json> ParseJson(const httplib::Request &req) {
  try {
    return json::parse(req.body.empty() ? "{}" : req.body);
  } catch (const json::exception &) {
    return std::nullopt;
  }
}

std::optional<std::string> RequireString(const json &payload, const std::string &field) {
  if (!payload.contains(field) || !payload[field].is_string()) {
    return std::nullopt;
  }
  const auto value = payload[field].get<std::string>();
  if (value.empty()) {
    return std::nullopt;
  }
  return value;
}

std::optional<int> RequirePositiveInt(const json &payload, const std::string &field) {
  if (!payload.contains(field) || !payload[field].is_number_integer()) {
    return std::nullopt;
  }
  const auto value = payload[field].get<int>();
  if (value <= 0) {
    return std::nullopt;
  }
  return value;
}

void WriteJson(httplib::Response &res, const json &payload, int status = 200) {
  res.status = status;
  res.set_content(payload.dump(), "application/json");
}

}  // namespace

int main() {
  httplib::Server server;

  security::AttachStandardHandlers(server, "payments");

  server.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("{\"ok\":true}", "application/json");
  });

  server.Post("/payments/hold", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "buyer", "finance_admin"}, "payments",
                               "create_hold")) {
      return;
    }
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }

    auto job_id = RequireString(*payload, "job_id");
    auto milestone_id = RequireString(*payload, "milestone_id");
    auto currency = RequireString(*payload, "currency");
    auto amount_cents = RequirePositiveInt(*payload, "amount_cents");
    auto reference = payload->value("reference", std::string{});

    if (!job_id || !milestone_id || !currency || !amount_cents) {
      WriteJson(res, json{{"error", "missing_required_fields"}}, 400);
      return;
    }

    if (currency->size() != 3) {
      WriteJson(res, json{{"error", "invalid_currency"}}, 400);
      return;
    }

    if (reference.empty()) {
      reference = job_id.value() + "-" + milestone_id.value();
    }

    auto record = GlobalLedger().CreateHold(*job_id, *milestone_id, *currency, *amount_cents, reference);
    WriteJson(res, PaymentToJson(record), 201);
  });

  server.Get(R"(/payments/hold/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "buyer", "seller", "finance_admin"},
                               "payments", "get_hold")) {
      return;
    }
    const auto payment_id = req.matches[1];
    if (auto record = GlobalLedger().Get(payment_id)) {
      WriteJson(res, PaymentToJson(*record));
      return;
    }
    WriteJson(res, json{{"error", "payment_not_found"}}, 404);
  });

  server.Post(R"(/payments/hold/([\w_-]+)/release)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin"}, "payments",
                               "release_hold")) {
      return;
    }
    const auto payment_id = req.matches[1];
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }

    auto released_at = RequireString(*payload, "released_at");
    if (!released_at) {
      WriteJson(res, json{{"error", "missing_released_at"}}, 400);
      return;
    }

    if (auto record = GlobalLedger().Release(payment_id, *released_at)) {
      WriteJson(res, PaymentToJson(*record));
      return;
    }
    WriteJson(res, json{{"error", "invalid_transition"}}, 409);
  });

  server.Post(R"(/payments/hold/([\w_-]+)/refund)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin"}, "payments",
                               "refund_hold")) {
      return;
    }
    const auto payment_id = req.matches[1];
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }

    auto refunded_at = RequireString(*payload, "refunded_at");
    if (!refunded_at) {
      WriteJson(res, json{{"error", "missing_refunded_at"}}, 400);
      return;
    }

    if (auto record = GlobalLedger().Refund(payment_id, *refunded_at)) {
      WriteJson(res, PaymentToJson(*record));
      return;
    }
    WriteJson(res, json{{"error", "invalid_transition"}}, 409);
  });

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 9103;
  std::cout << "Payments service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
