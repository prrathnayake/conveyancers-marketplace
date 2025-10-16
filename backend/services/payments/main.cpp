#include <algorithm>
#include <chrono>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <optional>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
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
  std::string conveyancer_account_id;
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

struct CheckoutReceipt {
  std::string id;
  std::string payment_id;
  std::string job_id;
  std::string method;
  std::string currency;
  std::string reference;
  int hold_amount_cents = 0;
  int service_fee_cents = 0;
  double service_fee_rate = 0.0;
  int total_cents = 0;
  std::string processed_at;
  std::string invoice_id;
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
               {"conveyancer_account_id", record.conveyancer_account_id},
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

json CheckoutToJson(const CheckoutReceipt &receipt) {
  return json{{"id", receipt.id},
              {"payment_id", receipt.payment_id},
              {"job_id", receipt.job_id},
              {"method", receipt.method},
              {"currency", receipt.currency},
              {"reference", receipt.reference},
              {"hold_amount_cents", receipt.hold_amount_cents},
              {"service_fee_cents", receipt.service_fee_cents},
              {"service_fee_rate", receipt.service_fee_rate},
              {"total_cents", receipt.total_cents},
              {"processed_at", receipt.processed_at},
              {"invoice_id", receipt.invoice_id}};
}

class PaymentLedger {
 public:
  PaymentRecord CreateHold(const std::string &job_id, const std::string &milestone_id,
                           const std::string &currency, int amount_cents,
                           const std::string &reference,
                           const std::string &conveyancer_account_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    PaymentRecord record;
    record.id = GenerateId("hold_");
    record.job_id = job_id;
    record.milestone_id = milestone_id;
    record.currency = currency;
    record.amount_cents = amount_cents;
    record.reference = reference;
    record.conveyancer_account_id = conveyancer_account_id;
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

  std::optional<CheckoutReceipt> Checkout(const std::string &payment_id, const std::string &method,
                                          double service_fee_rate, const std::string &processed_at,
                                          const std::optional<std::string> &invoice_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = ledger_.find(payment_id);
    if (it == ledger_.end()) {
      return std::nullopt;
    }
    if (it->second.status != PaymentStatus::kHeld) {
      return std::nullopt;
    }

    CheckoutReceipt receipt;
    receipt.id = GenerateId("chk_");
    receipt.payment_id = payment_id;
    receipt.job_id = it->second.job_id;
    receipt.method = method;
    receipt.currency = it->second.currency;
    receipt.reference = it->second.reference;
    receipt.hold_amount_cents = it->second.amount_cents;
    receipt.service_fee_rate = service_fee_rate;
    receipt.service_fee_cents = static_cast<int>(std::llround(it->second.amount_cents * service_fee_rate));
    receipt.total_cents = receipt.hold_amount_cents + receipt.service_fee_cents;
    receipt.processed_at = processed_at;
    receipt.invoice_id = invoice_id.value_or("");

    it->second.status = PaymentStatus::kReleased;
    it->second.released_at = processed_at;
    it->second.refunded_at.reset();

    checkouts_[receipt.id] = receipt;
    checkout_lookup_[payment_id] = receipt.id;
    checkout_order_.push_back(receipt.id);
    return receipt;
  }

  std::optional<CheckoutReceipt> GetCheckout(const std::string &checkout_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = checkouts_.find(checkout_id); it != checkouts_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  std::optional<CheckoutReceipt> GetCheckoutForPayment(const std::string &payment_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = checkout_lookup_.find(payment_id); it != checkout_lookup_.end()) {
      if (auto receipt_it = checkouts_.find(it->second); receipt_it != checkouts_.end()) {
        return receipt_it->second;
      }
    }
    return std::nullopt;
  }

  std::vector<CheckoutReceipt> ListCheckouts() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<CheckoutReceipt> receipts;
    receipts.reserve(checkout_order_.size());
    for (const auto &id : checkout_order_) {
      if (auto it = checkouts_.find(id); it != checkouts_.end()) {
        receipts.push_back(it->second);
      }
    }
    return receipts;
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
  std::unordered_map<std::string, CheckoutReceipt> checkouts_;
  std::unordered_map<std::string, std::string> checkout_lookup_;
  std::vector<std::string> checkout_order_;
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

class LoyaltyEngine {
 public:
  struct Tier {
    int threshold;
    double rate;
    std::string name;
    std::string badge;
  };

  LoyaltyEngine() {
    tiers_.push_back({0, 0.018, "Launch", "ConveySafe Launch"});
    tiers_.push_back({3, 0.015, "Trusted Partner", "ConveySafe Trusted"});
    tiers_.push_back({8, 0.012, "Preferred Partner", "ConveySafe Preferred"});
  }

  double ResolveRate(const std::string &conveyancer_id) const {
    if (conveyancer_id.empty()) {
      return tiers_.front().rate;
    }
    std::lock_guard<std::mutex> lock(mutex_);
    const int count = CompletedCountUnlocked(conveyancer_id);
    return ResolveTierForCount(count).rate;
  }

  void RecordCheckout(const std::string &conveyancer_id, const std::string &job_id) {
    if (conveyancer_id.empty()) {
      return;
    }
    std::lock_guard<std::mutex> lock(mutex_);
    auto &jobs = completed_jobs_[conveyancer_id];
    if (jobs.insert(job_id).second) {
      completion_counts_[conveyancer_id] = static_cast<int>(jobs.size());
    }
  }

  json DescribeMember(const std::string &conveyancer_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const int count = CompletedCountUnlocked(conveyancer_id);
    const auto tier = ResolveTierForCount(count);
    return json{{"completed_jobs", count},
                {"tier", tier.name},
                {"badge", tier.badge},
                {"fee_rate", tier.rate}};
  }

  json Summaries() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::unordered_map<std::string, int> tier_counts;
    for (const auto &tier : tiers_) {
      tier_counts[tier.name] = 0;
    }
    for (const auto &[member, count] : completion_counts_) {
      const auto tier = ResolveTierForCount(count);
      tier_counts[tier.name] += 1;
    }
    json tiers = json::array();
    for (const auto &tier : tiers_) {
      tiers.push_back(json{{"name", tier.name},
                           {"threshold", tier.threshold},
                           {"fee_rate", tier.rate},
                           {"badge", tier.badge},
                           {"members", tier_counts[tier.name]}});
    }
    return json{{"members", static_cast<int>(completion_counts_.size())},
                {"tiers", tiers}};
  }

 private:
  Tier ResolveTierForCount(int count) const {
    Tier result = tiers_.front();
    for (const auto &tier : tiers_) {
      if (count >= tier.threshold) {
        result = tier;
      }
    }
    return result;
  }

  int CompletedCountUnlocked(const std::string &conveyancer_id) const {
    if (auto it = completion_counts_.find(conveyancer_id); it != completion_counts_.end()) {
      return it->second;
    }
    return 0;
  }

  mutable std::mutex mutex_;
  std::unordered_map<std::string, int> completion_counts_;
  std::unordered_map<std::string, std::unordered_set<std::string>> completed_jobs_;
  std::vector<Tier> tiers_;
};

LoyaltyEngine &GlobalLoyalty() {
  static LoyaltyEngine engine;
  return engine;
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

std::optional<double> RequireDoubleInRange(const json &payload, const std::string &field, double min_value,
                                          double max_value) {
  if (!payload.contains(field)) {
    return std::nullopt;
  }
  if (!payload[field].is_number_float() && !payload[field].is_number_integer()) {
    return std::nullopt;
  }
  const auto value = payload[field].get<double>();
  if (value < min_value || value > max_value) {
    return std::nullopt;
  }
  return value;
}

std::string CurrentIsoTimestamp() {
  const auto now = std::chrono::system_clock::now();
  const auto seconds = std::chrono::system_clock::to_time_t(now);
#ifdef _WIN32
  std::tm tm;
  gmtime_s(&tm, &seconds);
#else
  std::tm tm;
  gmtime_r(&seconds, &tm);
#endif
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S") << '.' << std::setfill('0') << std::setw(3) << ms.count()
      << 'Z';
  return oss.str();
}

std::string CurrentIsoDate() {
  const auto now = std::chrono::system_clock::now();
  const auto seconds = std::chrono::system_clock::to_time_t(now);
#ifdef _WIN32
  std::tm tm;
  gmtime_s(&tm, &seconds);
#else
  std::tm tm;
  gmtime_r(&seconds, &tm);
#endif
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%d");
  return oss.str();
}

bool IsIsoDate(const std::string &value) {
  static const std::regex kDatePattern(R"(^\d{4}-\d{2}-\d{2}$)");
  return std::regex_match(value, kDatePattern);
}

bool IsIsoDateTime(const std::string &value) {
  static const std::regex kDateTimePattern(R"(^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$)");
  return std::regex_match(value, kDateTimePattern);
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

json BuildMetricsPayload() {
  const auto payments = GlobalLedger().List();
  const auto checkouts = GlobalLedger().ListCheckouts();
  const auto invoices = GlobalInvoices().List();

  int held_count = 0;
  int released_count = 0;
  int refunded_count = 0;
  long long held_total = 0;
  long long released_total = 0;
  long long refunded_total = 0;

  for (const auto &record : payments) {
    switch (record.status) {
      case PaymentStatus::kHeld:
        ++held_count;
        held_total += record.amount_cents;
        break;
      case PaymentStatus::kReleased:
        ++released_count;
        released_total += record.amount_cents;
        break;
      case PaymentStatus::kRefunded:
        ++refunded_count;
        refunded_total += record.amount_cents;
        break;
    }
  }

  long long checkout_total = 0;
  long long checkout_fee_total = 0;
  json recent = json::array();
  for (auto it = checkouts.rbegin(); it != checkouts.rend() && recent.size() < 5; ++it) {
    recent.push_back(CheckoutToJson(*it));
  }
  for (const auto &receipt : checkouts) {
    checkout_total += receipt.total_cents;
    checkout_fee_total += receipt.service_fee_cents;
  }

  const int checkout_average = checkouts.empty() ? 0 : static_cast<int>(checkout_total / checkouts.size());

  int draft = 0;
  int issued = 0;
  int paid = 0;
  int voided = 0;
  int overdue = 0;
  long long invoice_total = 0;
  long long invoice_outstanding = 0;
  const auto today = CurrentIsoDate();
  for (const auto &invoice : invoices) {
    switch (invoice.status) {
      case InvoiceStatus::kDraft:
        ++draft;
        break;
      case InvoiceStatus::kIssued:
        ++issued;
        invoice_outstanding += invoice.total_cents;
        break;
      case InvoiceStatus::kPaid:
        ++paid;
        break;
      case InvoiceStatus::kVoided:
        ++voided;
        break;
    }
    invoice_total += invoice.total_cents;
    if (!invoice.due_at.empty() && invoice.due_at < today &&
        invoice.status != InvoiceStatus::kPaid && invoice.status != InvoiceStatus::kVoided) {
      ++overdue;
    }
  }

  return json{{"generated_at", CurrentIsoTimestamp()},
              {"payments",
               json{{"total", static_cast<int>(payments.size())},
                    {"held", json{{"count", held_count}, {"total_cents", held_total}}},
                    {"released", json{{"count", released_count}, {"total_cents", released_total}}},
                    {"refunded", json{{"count", refunded_count}, {"total_cents", refunded_total}}},
                    {"outstanding_cents", held_total}}},
              {"checkouts",
               json{{"total", static_cast<int>(checkouts.size())},
                    {"total_cents", checkout_total},
                    {"service_fee_cents", checkout_fee_total},
                    {"average_order_cents", checkout_average},
                    {"recent", recent}}},
              {"invoices",
               json{{"total", static_cast<int>(invoices.size())},
                    {"draft", draft},
                    {"issued", issued},
                    {"paid", paid},
                    {"voided", voided},
                    {"overdue", overdue},
                    {"outstanding_cents", invoice_outstanding},
                    {"total_cents", invoice_total}}},
              {"loyalty", GlobalLoyalty().Summaries()}};
}

}  // namespace

int main() {
  httplib::Server server;

  security::AttachStandardHandlers(server, "payments");
  security::ExposeMetrics(server, "payments");

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
    auto conveyancer_account_id = payload->value("conveyancer_account_id", std::string{});

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

    auto record = GlobalLedger().CreateHold(*job_id, *milestone_id, *currency, *amount_cents, reference,
                                            conveyancer_account_id);
    json response = PaymentToJson(record);
    if (!conveyancer_account_id.empty()) {
      response["loyalty"] = GlobalLoyalty().DescribeMember(conveyancer_account_id);
    }
    WriteJson(res, response, 201);
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

  server.Post("/payments/checkout", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "conveyancer", "finance_admin"}, "payments",
                               "checkout_hold")) {
      return;
    }
    auto payload = ParseJson(req);
    if (!payload.has_value()) {
      WriteJson(res, json{{"error", "invalid_json"}}, 400);
      return;
    }

    auto payment_id = RequireString(*payload, "payment_id");
    auto payment_method = RequireString(*payload, "payment_method");
    if (!payment_id || !payment_method) {
      WriteJson(res, json{{"error", "missing_required_fields"}}, 400);
      return;
    }

    auto hold = GlobalLedger().Get(*payment_id);
    if (!hold) {
      WriteJson(res, json{{"error", "payment_not_found"}}, 404);
      return;
    }
    if (hold->status != PaymentStatus::kHeld) {
      WriteJson(res, json{{"error", "hold_not_available"}}, 409);
      return;
    }

    const auto fee_rate_override = RequireDoubleInRange(*payload, "service_fee_rate", 0.0, 0.25);
    const double default_loyalty_rate = GlobalLoyalty().ResolveRate(hold->conveyancer_account_id);
    const double service_fee_rate = fee_rate_override.value_or(default_loyalty_rate);
    std::string processed_at = payload->value("processed_at", std::string{});
    if (processed_at.empty()) {
      processed_at = CurrentIsoTimestamp();
    } else if (!IsIsoDateTime(processed_at)) {
      WriteJson(res, json{{"error", "invalid_processed_at"}}, 400);
      return;
    }

    const bool should_create_invoice = payload->value("generate_invoice", true);
    std::optional<std::string> invoice_id;
    json invoice_json;

    if (should_create_invoice) {
      std::string issued_at = payload->value("issued_at", CurrentIsoDate());
      std::string due_at = payload->value("due_at", issued_at);
      if (!IsIsoDate(issued_at) || !IsIsoDate(due_at)) {
        WriteJson(res, json{{"error", "invalid_invoice_date"}}, 400);
        return;
      }
      if (due_at < issued_at) {
        WriteJson(res, json{{"error", "due_before_issue"}}, 400);
        return;
      }

      const std::string recipient = payload->value("invoice_recipient", hold->job_id + std::string{"-client"});
      const std::string item_description = payload->value("line_description", std::string{"Conveyancing milestone"});
      const double base_tax_rate = std::clamp(payload->value("line_tax_rate", 0.0), 0.0, 1.0);
      const double fee_tax_rate = std::clamp(payload->value("service_fee_tax_rate", 0.0), 0.0, 1.0);

      std::vector<InvoiceLine> invoice_lines;
      invoice_lines.push_back({item_description, hold->amount_cents, base_tax_rate});
      const int service_fee_cents = static_cast<int>(std::llround(hold->amount_cents * service_fee_rate));
      if (service_fee_cents > 0) {
        invoice_lines.push_back({payload->value("service_fee_description", std::string{"Payment processing fee"}),
                                service_fee_cents, fee_tax_rate});
      }

      auto invoice = GlobalInvoices().CreateInvoice(hold->job_id, recipient, issued_at, due_at, invoice_lines);
      const auto status = ParseInvoiceStatus(payload->value("invoice_status", std::string{"issued"}));
      if (auto updated = GlobalInvoices().UpdateStatus(invoice.id, status)) {
        invoice = *updated;
      }
      invoice_json = InvoiceToJson(invoice);
      invoice_id = invoice.id;
    }

    auto receipt = GlobalLedger().Checkout(*payment_id, *payment_method, service_fee_rate, processed_at, invoice_id);
    if (!receipt) {
      WriteJson(res, json{{"error", "hold_not_available"}}, 409);
      return;
    }

    json response = CheckoutToJson(*receipt);
    if (invoice_id.has_value()) {
      response["invoice"] = invoice_json;
    }
    if (!hold->conveyancer_account_id.empty()) {
      GlobalLoyalty().RecordCheckout(hold->conveyancer_account_id, hold->job_id);
      response["loyalty"] = GlobalLoyalty().DescribeMember(hold->conveyancer_account_id);
    }
    WriteJson(res, response, 201);
  });

  server.Get("/payments/checkout", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin", "admin"}, "payments",
                               "list_checkouts")) {
      return;
    }
    if (const auto payment_id = req.get_param_value("payment_id"); !payment_id.empty()) {
      if (auto receipt = GlobalLedger().GetCheckoutForPayment(payment_id)) {
        WriteJson(res, CheckoutToJson(*receipt));
        return;
      }
      WriteJson(res, json{{"error", "checkout_not_found"}}, 404);
      return;
    }
    json response = json::array();
    for (const auto &receipt : GlobalLedger().ListCheckouts()) {
      response.push_back(CheckoutToJson(receipt));
    }
    WriteJson(res, response);
  });

  server.Get(R"(/payments/checkout/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin", "admin"}, "payments",
                               "get_checkout")) {
      return;
    }
    const auto checkout_id = req.matches[1];
    if (auto receipt = GlobalLedger().GetCheckout(checkout_id)) {
      WriteJson(res, CheckoutToJson(*receipt));
      return;
    }
    WriteJson(res, json{{"error", "checkout_not_found"}}, 404);
  });

  server.Get("/payments/loyalty/schedule", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin", "admin"}, "payments",
                               "view_loyalty_schedule")) {
      return;
    }
    WriteJson(res, GlobalLoyalty().Summaries());
  });

  server.Get(R"(/payments/loyalty/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "finance_admin", "admin"}, "payments",
                               "view_loyalty_status")) {
      return;
    }
    const auto account_id = req.matches[1];
    json payload = GlobalLoyalty().DescribeMember(account_id);
    payload["account_id"] = account_id;
    WriteJson(res, payload);
  });

  server.Get("/payments/metrics", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"finance_admin", "admin"}, "payments", "view_metrics")) {
      return;
    }
    WriteJson(res, BuildMetricsPayload());
  });

  server.Get("/payments/invoices/summary", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "payments")) {
      return;
    }
    if (!security::RequireRole(req, res, {"finance_admin", "admin"}, "payments", "invoice_summary")) {
      return;
    }
    auto metrics = BuildMetricsPayload();
    WriteJson(res, metrics["invoices"]);
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
    if (!IsIsoDate(*issued_at) || !IsIsoDate(*due_at)) {
      WriteJson(res, json{{"error", "invalid_date"}}, 400);
      return;
    }
    if (*due_at < *issued_at) {
      WriteJson(res, json{{"error", "due_before_issue"}}, 400);
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
      if (invoice_line.amount_cents <= 0) {
        continue;
      }
      invoice_line.tax_rate = line.value("tax_rate", 0.0);
      if (invoice_line.tax_rate < 0.0) {
        invoice_line.tax_rate = 0.0;
      }
      if (invoice_line.tax_rate > 1.0) {
        invoice_line.tax_rate = 1.0;
      }
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
