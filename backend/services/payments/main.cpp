#include <iostream>
#include <mutex>
#include <optional>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

#include "../../common/security.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

using json = nlohmann::json;

namespace {

enum class PaymentStatus { kHeld, kReleased, kRefunded };

enum class InvoiceStatus { kDraft, kIssued, kPaid, kVoided };

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

struct TrustPayout {
  std::string id;
  std::string payment_id;
  std::string account_name;
  std::string account_number;
  std::string bsb;
  std::string reference;
  std::string processed_at;
};

struct InvoiceLine {
  std::string description;
  int amount_cents;
  double tax_rate;
};

struct InvoiceRecord {
  std::string id;
  std::string job_id;
  std::string recipient;
  InvoiceStatus status = InvoiceStatus::kDraft;
  std::vector<InvoiceLine> lines;
  int subtotal_cents = 0;
  int tax_cents = 0;
  int total_cents = 0;
  std::string issued_at;
  std::string due_at;
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

std::string InvoiceStatusToString(InvoiceStatus status) {
  switch (status) {
    case InvoiceStatus::kDraft:
      return "draft";
    case InvoiceStatus::kIssued:
      return "issued";
    case InvoiceStatus::kPaid:
      return "paid";
    case InvoiceStatus::kVoided:
      return "voided";
  }
  return "draft";
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

json TrustPayoutToJson(const TrustPayout &payout) {
  return json{{"id", payout.id},
              {"payment_id", payout.payment_id},
              {"account_name", payout.account_name},
              {"account_number", payout.account_number},
              {"bsb", payout.bsb},
              {"reference", payout.reference},
              {"processed_at", payout.processed_at}};
}

json InvoiceToJson(const InvoiceRecord &invoice) {
  json lines = json::array();
  for (const auto &line : invoice.lines) {
    lines.push_back(json{{"description", line.description},
                        {"amount_cents", line.amount_cents},
                        {"tax_rate", line.tax_rate}});
  }
  return json{{"id", invoice.id},
              {"job_id", invoice.job_id},
              {"recipient", invoice.recipient},
              {"status", InvoiceStatusToString(invoice.status)},
              {"lines", lines},
              {"subtotal_cents", invoice.subtotal_cents},
              {"tax_cents", invoice.tax_cents},
              {"total_cents", invoice.total_cents},
              {"issued_at", invoice.issued_at},
              {"due_at", invoice.due_at}};
}

class PaymentLedger {
 public:
  PaymentRecord CreateHold(const std::string &job_id, const std::string &milestone_id,
                           const std::string &currency, int amount_cents,
                           const std::string &reference) {
    std::lock_guard<std::mutex> lock(mutex_);
    PaymentRecord record;
    record.id = GenerateId("hold_");
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
      return std::nullopt;
    }
    it->second.status = PaymentStatus::kRefunded;
    it->second.refunded_at = refunded_at;
    it->second.released_at.reset();
    return it->second;
  }

  std::optional<TrustPayout> RecordPayout(const std::string &payment_id,
                                          const std::string &account_name,
                                          const std::string &account_number,
                                          const std::string &bsb,
                                          const std::string &reference,
                                          const std::string &processed_at) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = ledger_.find(payment_id);
    if (it == ledger_.end() || it->second.status != PaymentStatus::kReleased) {
      return std::nullopt;
    }
    TrustPayout payout;
    payout.id = GenerateId("payout_");
    payout.payment_id = payment_id;
    payout.account_name = account_name;
    payout.account_number = account_number;
    payout.bsb = bsb;
    payout.reference = reference;
    payout.processed_at = processed_at;
    trust_payouts_[payment_id] = payout;
    return payout;
  }

  std::optional<TrustPayout> GetPayout(const std::string &payment_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = trust_payouts_.find(payment_id); it != trust_payouts_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  std::vector<PaymentRecord> List() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PaymentRecord> records;
    for (const auto &[_, record] : ledger_) {
      records.push_back(record);
    }
    return records;
  }

 private:
  static std::string GenerateId(const std::string &prefix) {
    static std::mt19937 rng{std::random_device{}()};
    static std::uniform_int_distribution<int> distribution(10000, 99999);
    return prefix + std::to_string(distribution(rng));
  }

  mutable std::mutex mutex_;
  std::unordered_map<std::string, PaymentRecord> ledger_;
  std::unordered_map<std::string, TrustPayout> trust_payouts_;
};

class InvoiceLedger {
 public:
  InvoiceRecord CreateInvoice(const std::string &job_id, const std::string &recipient,
                              const std::string &issued_at, const std::string &due_at,
                              const std::vector<InvoiceLine> &lines) {
    std::lock_guard<std::mutex> lock(mutex_);
    InvoiceRecord invoice;
    invoice.id = GenerateId("inv_");
    invoice.job_id = job_id;
    invoice.recipient = recipient;
    invoice.issued_at = issued_at;
    invoice.due_at = due_at;
    invoice.lines = lines;
    invoice.status = InvoiceStatus::kDraft;
    Recalculate(invoice);
    invoices_[invoice.id] = invoice;
    return invoice;
  }

  std::optional<InvoiceRecord> Get(const std::string &id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = invoices_.find(id); it != invoices_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  std::vector<InvoiceRecord> List() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<InvoiceRecord> result;
    for (const auto &[_, invoice] : invoices_) {
      result.push_back(invoice);
    }
    return result;
  }

  std::optional<InvoiceRecord> UpdateStatus(const std::string &id, InvoiceStatus status) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = invoices_.find(id);
    if (it == invoices_.end()) {
      return std::nullopt;
    }
    it->second.status = status;
    return it->second;
  }

 private:
  static std::string GenerateId(const std::string &prefix) {
    static std::mt19937 rng{std::random_device{}()};
    static std::uniform_int_distribution<int> distribution(10000, 99999);
    return prefix + std::to_string(distribution(rng));
  }

  static void Recalculate(InvoiceRecord &invoice) {
    int subtotal = 0;
    int tax = 0;
    for (const auto &line : invoice.lines) {
      subtotal += line.amount_cents;
      tax += static_cast<int>(line.amount_cents * line.tax_rate);
    }
    invoice.subtotal_cents = subtotal;
    invoice.tax_cents = tax;
    invoice.total_cents = subtotal + tax;
  }

  mutable std::mutex mutex_;
  std::unordered_map<std::string, InvoiceRecord> invoices_;
};

PaymentLedger &GlobalLedger() {
  static PaymentLedger ledger;
  return ledger;
}

InvoiceLedger &GlobalInvoices() {
  static InvoiceLedger ledger;
  return ledger;
}

std::optional<json> ParseJson(const httplib::Request &req) {
  try {
    return json::parse(req.body);
  } catch (...) {
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

InvoiceStatus ParseInvoiceStatus(const std::string &status) {
  if (status == "issued") return InvoiceStatus::kIssued;
  if (status == "paid") return InvoiceStatus::kPaid;
  if (status == "voided") return InvoiceStatus::kVoided;
  return InvoiceStatus::kDraft;
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

  server.Get("/payments/hold", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "buyer", "seller", "finance_admin"},
                               "payments", "list_holds")) {
      return;
    }
    json response = json::array();
    for (const auto &record : GlobalLedger().List()) {
      response.push_back(PaymentToJson(record));
    }
    WriteJson(res, response);
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
    if (!security::RequireRole(req, res, {"finance_admin"}, "payments", "refund_hold")) {
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

  server.Post(R"(/payments/hold/([\w_-]+)/payout)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"finance_admin"}, "payments", "trust_payout")) {
      return;
    }
    const auto payment_id = req.matches[1];
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }
    auto account_name = RequireString(*payload, "account_name");
    auto account_number = RequireString(*payload, "account_number");
    auto bsb = RequireString(*payload, "bsb");
    auto processed_at = RequireString(*payload, "processed_at");
    if (!account_name || !account_number || !bsb || !processed_at) {
      WriteJson(res, json{{"error", "missing_required_fields"}}, 400);
      return;
    }
    auto payout = GlobalLedger().RecordPayout(payment_id, *account_name, *account_number, *bsb,
                                             payload->value("reference", std::string{"ESCROW_PAYOUT"}),
                                             *processed_at);
    if (!payout) {
      WriteJson(res, json{{"error", "payout_not_available"}}, 409);
      return;
    }
    WriteJson(res, TrustPayoutToJson(*payout));
  });

  server.Get(R"(/payments/hold/([\w_-]+)/payout)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"finance_admin", "conveyancer"}, "payments",
                               "view_trust_payout")) {
      return;
    }
    const auto payment_id = req.matches[1];
    if (auto payout = GlobalLedger().GetPayout(payment_id)) {
      WriteJson(res, TrustPayoutToJson(*payout));
      return;
    }
    WriteJson(res, json{{"error", "payout_not_found"}}, 404);
  });

  server.Post("/payments/invoices", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin"}, "payments",
                               "create_invoice")) {
      return;
    }
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }
    auto job_id = RequireString(*payload, "job_id");
    auto recipient = RequireString(*payload, "recipient");
    auto issued_at = RequireString(*payload, "issued_at");
    auto due_at = RequireString(*payload, "due_at");
    if (!job_id || !recipient || !issued_at || !due_at) {
      WriteJson(res, json{{"error", "missing_required_fields"}}, 400);
      return;
    }
    if (!payload->contains("lines") || !(*payload)["lines"].is_array()) {
      WriteJson(res, json{{"error", "missing_line_items"}}, 400);
      return;
    }
    std::vector<InvoiceLine> lines;
    for (const auto &line : (*payload)["lines"]) {
      if (!line.contains("description") || !line.contains("amount_cents")) {
        continue;
      }
      InvoiceLine invoice_line;
      invoice_line.description = line.value("description", std::string{"Fee"});
      invoice_line.amount_cents = line.value("amount_cents", 0);
      invoice_line.tax_rate = line.value("tax_rate", 0.0);
      lines.push_back(invoice_line);
    }
    if (lines.empty()) {
      WriteJson(res, json{{"error", "missing_line_items"}}, 400);
      return;
    }
    auto invoice = GlobalInvoices().CreateInvoice(*job_id, *recipient, *issued_at, *due_at, lines);
    WriteJson(res, InvoiceToJson(invoice), 201);
  });

  server.Get("/payments/invoices", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin", "admin"}, "payments",
                               "list_invoices")) {
      return;
    }
    json response = json::array();
    for (const auto &invoice : GlobalInvoices().List()) {
      response.push_back(InvoiceToJson(invoice));
    }
    WriteJson(res, response);
  });

  server.Get(R"(/payments/invoices/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin", "admin"}, "payments",
                               "get_invoice")) {
      return;
    }
    const auto invoice_id = req.matches[1];
    if (auto invoice = GlobalInvoices().Get(invoice_id)) {
      WriteJson(res, InvoiceToJson(*invoice));
      return;
    }
    WriteJson(res, json{{"error", "invoice_not_found"}}, 404);
  });

  server.Post(R"(/payments/invoices/([\w_-]+)/status)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"finance_admin", "admin"}, "payments",
                               "update_invoice")) {
      return;
    }
    const auto invoice_id = req.matches[1];
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }
    auto status = RequireString(*payload, "status");
    if (!status) {
      WriteJson(res, json{{"error", "missing_status"}}, 400);
      return;
    }
    auto updated = GlobalInvoices().UpdateStatus(invoice_id, ParseInvoiceStatus(*status));
    if (!updated) {
      WriteJson(res, json{{"error", "invoice_not_found"}}, 404);
      return;
    }
    WriteJson(res, InvoiceToJson(*updated));
  });

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 9103;
  std::cout << "Payments service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
