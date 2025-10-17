#include <algorithm>
#include <chrono>
#include <cctype>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <numeric>
#include <optional>
#include <random>
#include <regex>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include "../../common/env_loader.h"
#include "../../common/security.h"
#include "../../third_party/httplib.h"
#include "../../third_party/json.hpp"

using json = nlohmann::json;

namespace {

struct Job;
struct CallSession;

json JobSummaryToJson(const Job &job);
json ContactPolicyToJson(const Job &job, bool reveal_full, bool include_internal);
json CallSessionToJson(const CallSession &session, bool include_token = false);

const std::regex kEmailPattern(R"(([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,}))", std::regex::icase);
const std::regex kPhonePattern(R"((\+?61|0)[0-9\s-]{8,})", std::regex::icase);
const std::regex kOffPlatformPattern(R"((whatsapp|signal|telegram|zoom|meet\s?link|call\s+me|email\s+me))",
                                     std::regex::icase);

std::string NowIso8601() {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);
  std::tm tm;
#if defined(_WIN32)
  gmtime_s(&tm, &time);
#else
  gmtime_r(&time, &tm);
#endif
  char buffer[32];
  std::strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return buffer;
}

std::string MaskEmail(const std::string &value) {
  if (value.empty()) {
    return value;
  }
  std::smatch match;
  if (!std::regex_search(value, match, kEmailPattern)) {
    return "••••";
  }
  const auto local = match[1].str();
  const auto domain = match[2].str();
  std::string prefix = local.substr(0, std::min<size_t>(2, local.size()));
  return prefix + "•••@" + domain;
}

std::string MaskPhone(const std::string &value) {
  if (value.empty()) {
    return value;
  }
  std::string digits;
  digits.reserve(value.size());
  for (const auto ch : value) {
    if (std::isdigit(static_cast<unsigned char>(ch))) {
      digits.push_back(ch);
    }
  }
  if (digits.size() < 4) {
    return "••••";
  }
  std::string mask;
  mask.reserve((digits.size() - 3) * 3);
  for (size_t i = 0; i < digits.size() - 3; ++i) {
    mask += "\u2022";
  }
  return mask + digits.substr(digits.size() - 3);
}

bool ContainsContactCoordinates(const std::string &text) {
  return std::regex_search(text, kEmailPattern) || std::regex_search(text, kPhonePattern);
}

bool ContainsOffPlatformHint(const std::string &text) {
  return std::regex_search(text, kOffPlatformPattern);
}

std::string ComposeJoinUrl(const std::string &call_id) {
  return "https://calls.conveysafe.example/join/" + call_id;
}

std::string ComposeRecordingUrl(const std::string &call_id) {
  return "https://calls.conveysafe.example/recordings/" + call_id + ".mp4";
}

std::string GenerateId(const std::string &prefix) {
  static std::mt19937 rng{std::random_device{}()};
  static std::uniform_int_distribution<int> dist(10000, 99999);
  return prefix + std::to_string(dist(rng));
}

std::time_t ToUtcTimestamp(std::tm *tm) {
#if defined(_WIN32)
  return _mkgmtime(tm);
#else
  return timegm(tm);
#endif
}

std::string AddDaysToDate(const std::string &date, int days) {
  std::tm tm = {};
  std::istringstream iss(date);
  iss >> std::get_time(&tm, "%Y-%m-%d");
  if (iss.fail()) {
    return date;
  }
  auto timestamp = ToUtcTimestamp(&tm);
  if (timestamp == -1) {
    return date;
  }
  timestamp += static_cast<long long>(days) * 24 * 60 * 60;
  std::tm result;
#if defined(_WIN32)
  gmtime_s(&result, &timestamp);
#else
  gmtime_r(&timestamp, &result);
#endif
  char buffer[16];
  std::strftime(buffer, sizeof(buffer), "%Y-%m-%d", &result);
  return buffer;
}

struct ContactPolicy {
  bool unlocked = false;
  std::optional<std::string> unlocked_at;
  std::string unlocked_by_role;
  std::string buyer_email;
  std::string buyer_phone;
  std::string seller_email;
  std::string seller_phone;
  std::string conveyancer_email;
  std::string conveyancer_phone;
  std::string buyer_email_masked;
  std::string buyer_phone_masked;
  std::string seller_email_masked;
  std::string seller_phone_masked;
  std::string conveyancer_email_masked;
  std::string conveyancer_phone_masked;
};

ContactPolicy GenerateContactPolicy(const std::string &job_id, const std::string &conveyancer_id,
                                    const std::string &buyer_email_override = std::string{},
                                    const std::string &buyer_phone_override = std::string{},
                                    const std::string &seller_email_override = std::string{},
                                    const std::string &seller_phone_override = std::string{}) {
  ContactPolicy policy;
  policy.buyer_email = buyer_email_override.empty() ? "buyer-" + job_id + "@clients.conveysafe"
                                                    : buyer_email_override;
  policy.buyer_phone = buyer_phone_override.empty() ? "+611300" + job_id.substr(std::min<size_t>(job_id.size(), 4))
                                                    : buyer_phone_override;
  policy.seller_email = seller_email_override.empty() ? "seller-" + job_id + "@clients.conveysafe"
                                                      : seller_email_override;
  policy.seller_phone = seller_phone_override.empty() ? "+611300" + job_id.substr(std::min<size_t>(job_id.size(), 4))
                                                      : seller_phone_override;
  policy.conveyancer_email = conveyancer_id + "@pro.conveysafe";
  policy.conveyancer_phone = "+612800" + conveyancer_id.substr(std::min<size_t>(conveyancer_id.size(), 4));
  policy.buyer_email_masked = MaskEmail(policy.buyer_email);
  policy.buyer_phone_masked = MaskPhone(policy.buyer_phone);
  policy.seller_email_masked = MaskEmail(policy.seller_email);
  policy.seller_phone_masked = MaskPhone(policy.seller_phone);
  policy.conveyancer_email_masked = MaskEmail(policy.conveyancer_email);
  policy.conveyancer_phone_masked = MaskPhone(policy.conveyancer_phone);
  return policy;
}

struct Milestone {
  std::string id;
  std::string title;
  std::string status;
  std::string due_date;
  bool escrow_funded;
  std::string assigned_to;
  std::string updated_at;
};

struct Message {
  std::string id;
  std::string sender;
  std::string body;
  std::string sent_at;
};

struct Document {
  std::string id;
  std::string name;
  std::string status;
  std::string signed_url;
  bool requires_signature;
  bool scanned = false;
  bool is_signed = false;
};

struct Dispute {
  std::string id;
  std::string type;
  std::string description;
  std::string status;
  std::string created_at;
  std::vector<std::string> evidence_urls;
};

struct CallSession {
  std::string id;
  std::string type;
  std::string status;
  std::string created_at;
  std::string created_by;
  std::vector<std::string> participants;
  std::string join_url;
  std::string access_token;
};

struct CompletionCertificate {
  std::string id;
  std::string job_id;
  std::string summary;
  std::string issued_at;
  std::string issued_by;
  std::string download_url;
  std::string verification_code;
  bool verified = false;
};

struct TemplateTask {
  std::string id;
  std::string title;
  std::string default_assignee;
  int due_in_days = 0;
  bool escrow_required = false;
};

struct TemplateDefinition {
  std::string id;
  std::string name;
  std::string jurisdiction;
  std::string description;
  std::vector<TemplateTask> tasks;
};

class TemplateLibrary {
 public:
  TemplateLibrary() {
    TemplateDefinition purchase;
    purchase.id = "tpl_residential_purchase";
    purchase.name = "Residential purchase essentials";
    purchase.jurisdiction = "NSW";
    purchase.description = "Standard conveyancing workflow with finance, searches, and settlement prep.";
    purchase.tasks = {{"tt_1", "Engagement agreement", "conveyancer", 1, false},
                      {"tt_2", "Order council and strata searches", "conveyancer", 3, true},
                      {"tt_3", "Prepare settlement pack", "conveyancer", 10, true}};
    templates_.emplace(purchase.id, purchase);

    TemplateDefinition sale;
    sale.id = "tpl_residential_sale";
    sale.name = "Residential sale checklist";
    sale.jurisdiction = "VIC";
    sale.description = "Tasks covering vendor statement, discharge of mortgage, and settlement handover.";
    sale.tasks = {{"tt_4", "Issue Section 32 vendor statement", "conveyancer", 2, false},
                  {"tt_5", "Coordinate discharge authority", "conveyancer", 5, true},
                  {"tt_6", "Final settlement statement", "finance", 12, true}};
    templates_.emplace(sale.id, sale);
  }

  std::vector<TemplateDefinition> List() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<TemplateDefinition> results;
    for (const auto &entry : templates_) {
      results.push_back(entry.second);
    }
    std::sort(results.begin(), results.end(), [](const auto &a, const auto &b) { return a.name < b.name; });
    return results;
  }

  std::optional<TemplateDefinition> Get(const std::string &id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = templates_.find(id); it != templates_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  TemplateDefinition Create(const std::string &name, const std::string &jurisdiction,
                            const std::string &description, const std::vector<TemplateTask> &tasks) {
    TemplateDefinition definition;
    definition.id = GenerateId("tpl_");
    definition.name = name;
    definition.jurisdiction = jurisdiction;
    definition.description = description;
    definition.tasks = tasks;
    std::lock_guard<std::mutex> lock(mutex_);
    templates_[definition.id] = definition;
    return definition;
  }

 private:
  mutable std::mutex mutex_;
  std::map<std::string, TemplateDefinition> templates_;
};

TemplateLibrary &Templates() {
  static TemplateLibrary library;
  return library;
}

struct Job {
  std::string id;
  std::string title;
  std::string state;
  std::string status;
  std::string conveyancer_id;
  std::string buyer_name;
  std::string seller_name;
  bool escrow_enabled;
  std::string opened_at;
  std::optional<std::string> completed_at;
  std::vector<Milestone> milestones;
  std::vector<Message> messages;
  std::vector<Document> documents;
  std::vector<Dispute> disputes;
  std::string risk_level = "low";
  std::string compliance_notes;
  ContactPolicy contact_policy;
  std::vector<CallSession> calls;
  std::vector<std::string> compliance_flags;
  std::optional<CompletionCertificate> certificate;
  std::string buyer_ip;
  std::string seller_ip;
  std::string quote_issued_at;
  std::string last_activity_at;
};

class JobStore {
 public:
  JobStore() { Seed(); }

  std::vector<Job> ListJobs(const std::optional<std::string> &state,
                            const std::optional<std::string> &conveyancer_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<Job> jobs;
    for (const auto &[_, job] : jobs_) {
      if (state && job.state != *state) {
        continue;
      }
      if (conveyancer_id && job.conveyancer_id != *conveyancer_id) {
        continue;
      }
      jobs.push_back(job);
    }
    std::sort(jobs.begin(), jobs.end(), [](const Job &a, const Job &b) {
      return a.opened_at > b.opened_at;
    });
    return jobs;
  }

  std::optional<Job> Get(const std::string &id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = jobs_.find(id); it != jobs_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  std::optional<Job> Create(const std::string &title, const std::string &state,
                            const std::string &conveyancer_id, const std::string &buyer_name,
                            const std::string &seller_name, bool escrow_enabled,
                            const std::vector<Milestone> &milestones) {
    std::lock_guard<std::mutex> lock(mutex_);
    Job job;
    job.id = GenerateId("job_");
    job.title = title;
    job.state = state;
    job.status = "in_progress";
    job.conveyancer_id = conveyancer_id;
    job.buyer_name = buyer_name;
    job.seller_name = seller_name;
    job.escrow_enabled = escrow_enabled;
    job.opened_at = NowIso8601();
    job.milestones = milestones;
    job.compliance_notes = "Escrow monitoring enabled";
    job.quote_issued_at = job.opened_at;
    job.last_activity_at = job.opened_at;
    job.contact_policy = GenerateContactPolicy(job.id, conveyancer_id);
    job.buyer_ip = "203.0.113." + std::to_string((jobs_.size() % 30) + 10);
    job.seller_ip = "198.51.100." + std::to_string((jobs_.size() % 40) + 5);
    jobs_[job.id] = job;
    return job;
  }

  std::optional<Milestone> AddMilestone(const std::string &job_id, const std::string &title,
                                        const std::string &due_date, const std::string &assigned_to) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return std::nullopt;
    }
    Milestone milestone;
    milestone.id = GenerateId("ms_");
    milestone.title = title;
    milestone.status = "pending";
    milestone.due_date = due_date;
    milestone.escrow_funded = false;
    milestone.assigned_to = assigned_to;
    milestone.updated_at = NowIso8601();
    it->second.milestones.push_back(milestone);
    it->second.status = "in_progress";
    it->second.last_activity_at = milestone.updated_at;
    return milestone;
  }

  bool UpdateMilestone(const std::string &job_id, const std::string &milestone_id,
                       const std::string &status, const std::optional<std::string> &due_date,
                       bool escrow_funded) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return false;
    }
    for (auto &milestone : it->second.milestones) {
      if (milestone.id == milestone_id) {
        milestone.status = status;
        if (due_date) {
          milestone.due_date = *due_date;
        }
        milestone.escrow_funded = escrow_funded;
        milestone.updated_at = NowIso8601();
        it->second.last_activity_at = milestone.updated_at;
        return true;
      }
    }
    return false;
  }

  std::optional<Message> AddMessage(const std::string &job_id, const std::string &sender,
                                    const std::string &body) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return std::nullopt;
    }
    Message message;
    message.id = GenerateId("msg_");
    message.sender = sender;
    message.body = body;
    message.sent_at = NowIso8601();
    it->second.messages.push_back(message);
    it->second.last_activity_at = message.sent_at;
    if (ContainsContactCoordinates(body) && !it->second.contact_policy.unlocked) {
      it->second.compliance_flags.push_back("contact_coordinates:" + message.id);
    }
    if (ContainsOffPlatformHint(body)) {
      it->second.compliance_flags.push_back("off_platform_hint:" + message.id);
    }
    return message;
  }

  std::optional<Document> AddDocument(const std::string &job_id, const std::string &name,
                                      bool requires_signature, const std::string &content_type) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return std::nullopt;
    }
    Document document;
    document.id = GenerateId("doc_");
    document.name = name;
    document.status = "processing";
    document.requires_signature = requires_signature;
    document.signed_url = "https://files.example.com/" + job_id + "/" + document.id + "?ct=" + content_type;
    document.scanned = true;
    document.is_signed = false;
    it->second.documents.push_back(document);
    it->second.last_activity_at = NowIso8601();
    return document;
  }

  bool MarkDocumentSigned(const std::string &job_id, const std::string &document_id,
                          bool signed_flag) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return false;
    }
    for (auto &document : it->second.documents) {
      if (document.id == document_id) {
        if (document.requires_signature) {
          document.is_signed = signed_flag;
          document.status = signed_flag ? "signed" : "awaiting_signature";
        }
        it->second.last_activity_at = NowIso8601();
        return true;
      }
    }
    return false;
  }

  std::optional<Dispute> CreateDispute(const std::string &job_id, const std::string &type,
                                       const std::string &description) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return std::nullopt;
    }
    Dispute dispute;
    dispute.id = GenerateId("disp_");
    dispute.type = type;
    dispute.description = description;
    dispute.status = "open";
    dispute.created_at = NowIso8601();
    it->second.disputes.push_back(dispute);
    it->second.risk_level = "medium";
    it->second.compliance_notes = "Dispute opened; monitoring required";
    it->second.last_activity_at = dispute.created_at;
    return dispute;
  }

  bool UpdateDisputeStatus(const std::string &job_id, const std::string &dispute_id,
                           const std::string &status, const std::vector<std::string> &evidence) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return false;
    }
    for (auto &dispute : it->second.disputes) {
      if (dispute.id == dispute_id) {
        dispute.status = status;
        dispute.evidence_urls.insert(dispute.evidence_urls.end(), evidence.begin(), evidence.end());
        if (status == "resolved") {
          it->second.risk_level = "low";
          it->second.compliance_notes = "Dispute resolved";
        }
        it->second.last_activity_at = NowIso8601();
        return true;
      }
    }
    return false;
  }

  bool CompleteJob(const std::string &job_id, const std::string &summary) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return false;
    }
    it->second.status = "completed";
    const auto issued_at = NowIso8601();
    it->second.completed_at = issued_at;
    it->second.compliance_notes = summary;
    it->second.last_activity_at = issued_at;
    CompletionCertificate certificate;
    certificate.id = GenerateId("cert_");
    certificate.job_id = job_id;
    certificate.summary = summary;
    certificate.issued_at = issued_at;
    certificate.issued_by = "ConveySafe automation";
    certificate.download_url = "https://certs.conveysafe.example/" + job_id + "/" + certificate.id + ".pdf";
    certificate.verification_code = security::DeriveScopedToken("certificate", job_id + certificate.id);
    certificate.verified = true;
    it->second.certificate = certificate;
    return true;
  }

  bool UnlockContact(const std::string &job_id, const std::string &actor_role) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return false;
    }
    if (!it->second.contact_policy.unlocked) {
      it->second.contact_policy.unlocked = true;
      it->second.contact_policy.unlocked_by_role = actor_role;
      it->second.contact_policy.unlocked_at = NowIso8601();
      it->second.compliance_notes = "Contact released post-payment verification";
    }
    return true;
  }

  std::optional<ContactPolicy> GetContactPolicy(const std::string &job_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = jobs_.find(job_id); it != jobs_.end()) {
      return it->second.contact_policy;
    }
    return std::nullopt;
  }

  std::optional<CallSession> CreateCallSession(const std::string &job_id, const std::string &type,
                                               const std::string &created_by,
                                               const std::vector<std::string> &participants) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return std::nullopt;
    }
    CallSession session;
    session.id = GenerateId("call_");
    session.type = type;
    session.status = "scheduled";
    session.created_at = NowIso8601();
    session.created_by = created_by;
    session.participants = participants;
    session.join_url = ComposeJoinUrl(session.id);
    session.access_token = security::DeriveScopedToken("call", session.id);
    it->second.calls.push_back(session);
    it->second.last_activity_at = session.created_at;
    return session;
  }

  std::vector<CallSession> ListCalls(const std::string &job_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = jobs_.find(job_id); it != jobs_.end()) {
      return it->second.calls;
    }
    return {};
  }

  std::optional<CompletionCertificate> GetCertificate(const std::string &job_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = jobs_.find(job_id); it != jobs_.end()) {
      return it->second.certificate;
    }
    return std::nullopt;
  }

  bool ApplyTemplate(const std::string &job_id, const TemplateDefinition &definition,
                     const std::string &start_date) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = jobs_.find(job_id);
    if (it == jobs_.end()) {
      return false;
    }
    for (const auto &task : definition.tasks) {
      Milestone milestone;
      milestone.id = GenerateId("ms_");
      milestone.title = task.title;
      milestone.status = "pending";
      milestone.due_date = AddDaysToDate(start_date, task.due_in_days);
      milestone.escrow_funded = task.escrow_required;
      milestone.assigned_to = task.default_assignee.empty() ? it->second.conveyancer_id : task.default_assignee;
      milestone.updated_at = NowIso8601();
      it->second.milestones.push_back(milestone);
    }
    it->second.last_activity_at = NowIso8601();
    return true;
  }

  json AdminContactPolicies() const {
    std::lock_guard<std::mutex> lock(mutex_);
    json response = json::array();
    for (const auto &[job_id, job] : jobs_) {
      json entry = JobSummaryToJson(job);
      entry["contact_policy"] = ContactPolicyToJson(job, true, true);
      entry["call_sessions"] = json::array();
      for (const auto &call : job.calls) {
        entry["call_sessions"].push_back(CallSessionToJson(call, true));
      }
      entry["compliance_flags"] = job.compliance_flags;
      entry["quote_issued_at"] = job.quote_issued_at;
      entry["last_activity_at"] = job.last_activity_at;
      entry["buyer_ip"] = job.buyer_ip;
      entry["seller_ip"] = job.seller_ip;
      response.push_back(entry);
    }
    return response;
  }

  json AdminInsights() const {
    std::lock_guard<std::mutex> lock(mutex_);
    json signals = json::array();
    int active_jobs = 0;
    std::map<std::pair<std::string, std::string>, int> ip_pairs;
    for (const auto &[_, job] : jobs_) {
      if (job.status != "completed") {
        active_jobs += 1;
      }
      ip_pairs[{job.buyer_ip, job.seller_ip}] += 1;
      if (!job.compliance_flags.empty()) {
        signals.push_back(json{{"type", "contact_signal"},
                               {"job_id", job.id},
                               {"severity", job.contact_policy.unlocked ? "info" : "warning"},
                               {"evidence", job.compliance_flags},
                               {"detail", "Messages indicate attempted contact exchange."}});
      }
      if (job.contact_policy.unlocked && job.status != "completed" && job.messages.size() < 3) {
        signals.push_back(json{{"type", "payment_without_activity"},
                               {"job_id", job.id},
                               {"detail", "Payment initiated but conversation stalled."}});
      }
    }

    for (const auto &[pair, count] : ip_pairs) {
      if (count > 1) {
        signals.push_back(json{{"type", "ip_correlation"},
                               {"buyer_ip", pair.first},
                               {"seller_ip", pair.second},
                               {"occurrences", count},
                               {"detail", "Repeated buyer/seller IP pairing detected."}});
      }
    }

    const int total_jobs = static_cast<int>(jobs_.size());
    if (total_jobs > 0 && active_jobs < std::max(1, total_jobs / 2)) {
      signals.push_back(json{{"type", "active_jobs_drop"},
                             {"detail", "Active pipeline dropped below historical average."},
                             {"active_jobs", active_jobs},
                             {"total_jobs", total_jobs}});
    }

    json message_metadata = json::array();
    for (const auto &[_, job] : jobs_) {
      const auto avg_length = job.messages.empty()
                                  ? 0.0
                                  : std::accumulate(job.messages.begin(), job.messages.end(), 0.0,
                                                    [](double acc, const Message &msg) {
                                                      return acc + static_cast<double>(msg.body.size());
                                                    }) /
                                        job.messages.size();
      message_metadata.push_back(json{{"job_id", job.id},
                                      {"message_count", job.messages.size()},
                                      {"average_length", avg_length},
                                      {"last_activity_at", job.last_activity_at}});
    }

    json payment_activity = json::array();
    for (const auto &[_, job] : jobs_) {
      payment_activity.push_back(json{{"job_id", job.id},
                                      {"contact_unlocked", job.contact_policy.unlocked},
                                      {"completed_at", job.completed_at.value_or("")},
                                      {"quote_issued_at", job.quote_issued_at}});
    }

    json retention = json{{"completed_jobs", std::count_if(jobs_.begin(), jobs_.end(), [](const auto &entry) {
                            return entry.second.status == "completed";
                          })}};

    json ip_correlation = json::array();
    for (const auto &[pair, count] : ip_pairs) {
      ip_correlation.push_back(json{{"buyer_ip", pair.first}, {"seller_ip", pair.second}, {"count", count}});
    }

    return json{{"generated_at", NowIso8601()},
                {"signals", signals},
                {"training_inputs", json{{"message_metadata", message_metadata},
                                           {"payment_activity", payment_activity},
                                           {"user_retention_metrics", retention},
                                           {"ip_correlation", ip_correlation}}}};
  }

 private:
  void Seed() {
    Milestone deposit{"ms_1", "Deposit paid", "completed", "2024-02-05", true,
                      "Sydney Settlements", NowIso8601()};
    Milestone finance{"ms_2", "Finance approved", "completed", "2024-02-18", true,
                      "Sydney Settlements", NowIso8601()};
    Milestone searches{"ms_3", "Searches lodged", "in_progress", "2024-03-01", true,
                       "Sydney Settlements", NowIso8601()};
    Milestone settlement{"ms_4", "Settlement", "scheduled", "2024-03-15", false,
                         "Sydney Settlements", NowIso8601()};

    Job job1;
    job1.id = "job_2001";
    job1.title = "Residential purchase";
    job1.state = "NSW";
    job1.status = "in_progress";
    job1.conveyancer_id = "pro_1002";
    job1.buyer_name = "Emily Carter";
    job1.seller_name = "Liam Nguyen";
    job1.escrow_enabled = true;
    job1.opened_at = "2024-02-01T01:00:00Z";
    job1.milestones = {deposit, finance, searches, settlement};
    job1.messages = {{"msg_1", "Emily Carter", "Thanks for the update on finance.",
                      "2024-02-18T08:42:00+11:00"},
                     {"msg_2", "Sydney Settlements", "Searches lodged with LPI.",
                      "2024-02-20T14:10:00+11:00"}};
    job1.documents = {{"doc_1",
                       "Contract of sale",
                       "available",
                       "https://files.example.com/job_2001/contract.pdf",
                       false,
                       true,
                       true},
                      {"doc_2",
                       "Identification verification",
                       "awaiting_signature",
                       "https://files.example.com/job_2001/vois.pdf",
                       true,
                       true,
                       false}};
    job1.compliance_notes = "KYC complete for both parties";
    job1.contact_policy = GenerateContactPolicy(job1.id, job1.conveyancer_id,
                                                "emily.carter@propertymail.example", "+61400987654",
                                                "liam.nguyen@sellers.example", "+61418882211");
    job1.contact_policy.unlocked = true;
    job1.contact_policy.unlocked_by_role = "finance_admin";
    job1.contact_policy.unlocked_at = std::string{"2024-02-12T00:30:00Z"};
    job1.quote_issued_at = "2024-01-25T22:00:00Z";
    job1.last_activity_at = "2024-02-20T14:10:00+11:00";
    job1.buyer_ip = "203.0.113.18";
    job1.seller_ip = "198.51.100.22";
    job1.compliance_flags = {"contact_coordinates:msg_1"};
    CallSession review_call{"call_5001",
                            "video",
                            "recorded",
                            "2024-02-14T03:00:00Z",
                            "Sydney Settlements",
                            {"Emily Carter", "Sydney Settlements"},
                            ComposeJoinUrl("call_5001"),
                            security::DeriveScopedToken("call", "call_5001")};
    job1.calls.push_back(review_call);

    Job job2 = job1;
    job2.id = "job_2002";
    job2.title = "Off-the-plan apartment";
    job2.state = "VIC";
    job2.status = "awaiting_client";
    job2.conveyancer_id = "pro_1001";
    job2.buyer_name = "Oliver Bennett";
    job2.seller_name = "Southbank Developments";
    job2.opened_at = "2024-01-10T01:00:00Z";
    job2.documents = {{"doc_1",
                       "Disclosure statement",
                       "in_review",
                       "https://files.example.com/job_2002/disclosure.pdf",
                       false,
                       true,
                       false}};
    job2.contact_policy = GenerateContactPolicy(job2.id, job2.conveyancer_id,
                                                "oliver.bennett@buyers.example", "+61415555510",
                                                "developer@vendor.example", "+61295550123");
    job2.contact_policy.unlocked = false;
    job2.contact_policy.unlocked_by_role = "";
    job2.quote_issued_at = "2023-12-18T09:00:00Z";
    job2.last_activity_at = "2024-01-10T01:00:00Z";
    job2.buyer_ip = "203.0.113.34";
    job2.seller_ip = "198.51.100.40";
    job2.calls.clear();
    job2.compliance_flags.clear();

    Job job3 = job1;
    job3.id = "job_2003";
    job3.title = "Refinance settlement";
    job3.state = "NSW";
    job3.status = "completed";
    job3.conveyancer_id = "pro_1001";
    job3.buyer_name = "Sophie Walker";
    job3.seller_name = "National Bank";
    job3.opened_at = "2023-11-20T04:00:00Z";
    job3.quote_issued_at = "2023-11-19T22:00:00Z";
    job3.completed_at = std::string{"2024-01-15T02:10:00Z"};
    job3.last_activity_at = *job3.completed_at;
    job3.compliance_notes = "Settlement complete, certificate issued";
    job3.contact_policy = GenerateContactPolicy(job3.id, job3.conveyancer_id,
                                                "sophie.walker@clientmail.example", "+61400011222",
                                                "portfolio.team@nationalbank.example", "+61280008888");
    job3.contact_policy.unlocked = true;
    job3.contact_policy.unlocked_by_role = "finance_admin";
    job3.contact_policy.unlocked_at = std::string{"2023-12-01T01:00:00Z"};
    job3.buyer_ip = "203.0.113.50";
    job3.seller_ip = "198.51.100.51";
    job3.calls.clear();
    job3.compliance_flags = {"off_platform_hint:msg_1"};
    job3.certificate = CompletionCertificate{"cert_seed_1",
                                              job3.id,
                                              "Refinance settled with all funds reconciled",
                                              *job3.completed_at,
                                              "ConveySafe automation",
                                              "https://certs.conveysafe.example/job_2003/cert_seed_1.pdf",
                                              security::DeriveScopedToken("certificate", job3.id + "cert_seed_1"),
                                              true};

    jobs_[job1.id] = job1;
    jobs_[job2.id] = job2;
    jobs_[job3.id] = job3;
  }

  mutable std::mutex mutex_;
  std::unordered_map<std::string, Job> jobs_;
};

JobStore &Store() {
  static JobStore store;
  return store;
}

json MilestoneToJson(const Milestone &milestone) {
  return json{{"id", milestone.id},
              {"title", milestone.title},
              {"status", milestone.status},
              {"due_date", milestone.due_date},
              {"escrow_funded", milestone.escrow_funded},
              {"assigned_to", milestone.assigned_to},
              {"updated_at", milestone.updated_at}};
}

json MessageToJson(const Message &message) {
  return json{{"id", message.id},
              {"sender", message.sender},
              {"body", message.body},
              {"sent_at", message.sent_at}};
}

json DocumentToJson(const Document &document) {
  return json{{"id", document.id},
              {"name", document.name},
              {"status", document.status},
              {"signed_url", document.signed_url},
              {"requires_signature", document.requires_signature},
              {"scanned", document.scanned},
              {"signed", document.is_signed}};
}

json DisputeToJson(const Dispute &dispute) {
  return json{{"id", dispute.id},
              {"type", dispute.type},
              {"description", dispute.description},
              {"status", dispute.status},
              {"created_at", dispute.created_at},
              {"evidence_urls", dispute.evidence_urls}};
}

json CallSessionToJson(const CallSession &session, bool include_token) {
  json payload{{"id", session.id},
               {"type", session.type},
               {"status", session.status},
               {"created_at", session.created_at},
               {"created_by", session.created_by},
               {"participants", session.participants},
               {"join_url", session.join_url}};
  if (include_token) {
    payload["access_token"] = session.access_token;
  }
  return payload;
}

json CertificateToJson(const CompletionCertificate &certificate) {
  return json{{"id", certificate.id},
              {"job_id", certificate.job_id},
              {"summary", certificate.summary},
              {"issued_at", certificate.issued_at},
              {"issued_by", certificate.issued_by},
              {"download_url", certificate.download_url},
              {"verification_code", certificate.verification_code},
              {"verified", certificate.verified}};
}

json ContactPolicyToJson(const Job &job, bool reveal_full, bool include_internal) {
  const auto &policy = job.contact_policy;
  json masked{{"buyer", json{{"email", policy.buyer_email_masked}, {"phone", policy.buyer_phone_masked}}},
              {"seller", json{{"email", policy.seller_email_masked}, {"phone", policy.seller_phone_masked}}},
              {"conveyancer",
               json{{"email", policy.conveyancer_email_masked}, {"phone", policy.conveyancer_phone_masked}}}};
  json payload{{"unlocked", policy.unlocked},
               {"requires_payment", !policy.unlocked},
               {"masked", masked}};
  if (reveal_full) {
    payload["full"] = json{{"buyer", json{{"email", policy.buyer_email}, {"phone", policy.buyer_phone}}},
                            {"seller", json{{"email", policy.seller_email}, {"phone", policy.seller_phone}}},
                            {"conveyancer",
                             json{{"email", policy.conveyancer_email}, {"phone", policy.conveyancer_phone}}}};
  }
  if (include_internal) {
    payload["unlock_token"] = security::DeriveScopedToken("contact", job.id);
    payload["unlocked_at"] = policy.unlocked_at.value_or("");
    payload["unlocked_by_role"] = policy.unlocked_by_role;
  }
  return payload;
}

json TemplateToJson(const TemplateDefinition &definition) {
  json tasks = json::array();
  for (const auto &task : definition.tasks) {
    tasks.push_back(json{{"id", task.id},
                        {"title", task.title},
                        {"default_assignee", task.default_assignee},
                        {"due_in_days", task.due_in_days},
                        {"escrow_required", task.escrow_required}});
  }
  return json{{"id", definition.id},
              {"name", definition.name},
              {"jurisdiction", definition.jurisdiction},
              {"description", definition.description},
              {"tasks", tasks}};
}

int CountCompleted(const Job &job) {
  return static_cast<int>(std::count_if(job.milestones.begin(), job.milestones.end(), [](const Milestone &m) {
    return m.status == "completed";
  }));
}

json JobSummaryToJson(const Job &job) {
  json summary{{"id", job.id},
               {"title", job.title},
               {"state", job.state},
               {"status", job.status},
               {"conveyancer_id", job.conveyancer_id},
               {"buyer_name", job.buyer_name},
               {"seller_name", job.seller_name},
               {"escrow_enabled", job.escrow_enabled},
               {"opened_at", job.opened_at},
               {"completed_at", job.completed_at.value_or("")},
               {"milestones_completed", CountCompleted(job)},
               {"milestones_total", job.milestones.size()},
               {"risk_level", job.risk_level},
               {"compliance_notes", job.compliance_notes},
               {"contact_unlocked", job.contact_policy.unlocked},
               {"quote_issued_at", job.quote_issued_at},
               {"last_activity_at", job.last_activity_at}};
  return summary;
}

json JobDetailToJson(const Job &job, bool reveal_contact, bool include_internal) {
  json payload = JobSummaryToJson(job);
  payload["milestones"] = json::array();
  for (const auto &milestone : job.milestones) {
    payload["milestones"].push_back(MilestoneToJson(milestone));
  }
  payload["messages"] = json::array();
  for (const auto &message : job.messages) {
    payload["messages"].push_back(MessageToJson(message));
  }
  payload["documents"] = json::array();
  for (const auto &document : job.documents) {
    payload["documents"].push_back(DocumentToJson(document));
  }
  payload["disputes"] = json::array();
  for (const auto &dispute : job.disputes) {
    payload["disputes"].push_back(DisputeToJson(dispute));
  }
  payload["contact_policy"] = ContactPolicyToJson(job, reveal_contact, include_internal);
  payload["calls"] = json::array();
  for (const auto &call : job.calls) {
    payload["calls"].push_back(CallSessionToJson(call, include_internal));
  }
  if (job.certificate.has_value()) {
    payload["completion_certificate"] = CertificateToJson(*job.certificate);
  }
  return payload;
}

json ParseJson(const httplib::Request &req, httplib::Response &res) {
  try {
    return json::parse(req.body);
  } catch (...) {
    res.status = 400;
    res.set_content(R"({"error":"invalid_json"})", "application/json");
    return json{};
  }
}

bool RequireFields(const json &payload, httplib::Response &res,
                   const std::vector<std::string> &fields) {
  for (const auto &field : fields) {
    if (!payload.contains(field) || payload[field].is_null()) {
      res.status = 400;
      res.set_content(json{{"error", "missing_field"}, {"field", field}}.dump(), "application/json");
      return false;
    }
  }
  return true;
}

}  // namespace

int main() {
  env::LoadEnvironment();
  httplib::Server server;

  security::AttachStandardHandlers(server, "jobs");
  security::ExposeMetrics(server, "jobs");

  server.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("{\"ok\":true}", "application/json");
  });

  server.Get("/jobs", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "list_jobs")) {
      return;
    }
    std::optional<std::string> state;
    std::optional<std::string> conveyancer;
    if (req.has_param("state")) {
      state = req.get_param_value("state");
    }
    if (req.has_param("conveyancer_id")) {
      conveyancer = req.get_param_value("conveyancer_id");
    }
    json response = json::array();
    for (const auto &job : Store().ListJobs(state, conveyancer)) {
      response.push_back(JobSummaryToJson(job));
    }
    res.set_content(response.dump(), "application/json");
  });

  server.Post("/jobs", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "jobs", "create_job")) {
      return;
    }
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res,
                       {"title", "state", "conveyancer_id", "buyer_name", "seller_name", "escrow_enabled"})) {
      return;
    }
    std::vector<Milestone> milestones;
    if (payload.contains("milestones") && payload["milestones"].is_array()) {
      for (const auto &entry : payload["milestones"]) {
        Milestone milestone;
        milestone.id = entry.value("id", "");
        milestone.title = entry.value("title", "Client milestone");
        milestone.status = entry.value("status", "pending");
        milestone.due_date = entry.value("due_date", "");
        milestone.escrow_funded = entry.value("escrow_funded", false);
        milestone.assigned_to = entry.value("assigned_to", payload["conveyancer_id"].get<std::string>());
        milestone.updated_at = entry.value("updated_at", "");
        milestones.push_back(milestone);
      }
    }
    auto job = Store().Create(payload["title"].get<std::string>(), payload["state"].get<std::string>(),
                              payload["conveyancer_id"].get<std::string>(),
                              payload["buyer_name"].get<std::string>(),
                              payload["seller_name"].get<std::string>(),
                              payload["escrow_enabled"].get<bool>(), milestones);
    if (!job) {
      res.status = 500;
      res.set_content(R"({"error":"job_creation_failed"})", "application/json");
      return;
    }
    const auto role = req.get_header_value("X-Actor-Role");
    const bool include_internal = role == "admin" || role == "finance_admin";
    const bool reveal_contact = include_internal || job->contact_policy.unlocked;
    res.status = 201;
    res.set_content(JobDetailToJson(*job, reveal_contact, include_internal).dump(), "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "job_detail")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    if (auto job = Store().Get(job_id)) {
      const auto role = req.get_header_value("X-Actor-Role");
      const bool include_internal = role == "admin" || role == "finance_admin";
      const bool reveal_contact = include_internal || job->contact_policy.unlocked;
      res.set_content(JobDetailToJson(*job, reveal_contact, include_internal).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+)/milestones)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "job_milestones")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    if (auto job = Store().Get(job_id)) {
      json response = json::array();
      for (const auto &milestone : job->milestones) {
        response.push_back(MilestoneToJson(milestone));
      }
      res.set_content(response.dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/milestones)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "jobs", "create_milestone")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"title", "due_date", "assigned_to"})) {
      return;
    }
    if (auto milestone =
            Store().AddMilestone(job_id, payload["title"].get<std::string>(),
                                 payload["due_date"].get<std::string>(),
                                 payload["assigned_to"].get<std::string>())) {
      res.status = 201;
      res.set_content(MilestoneToJson(*milestone).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Patch(R"(/jobs/([\w_-]+)/milestones/([\w_-]+))",
               [](const httplib::Request &req, httplib::Response &res) {
                 if (!security::Authorize(req, res, "jobs")) {
                   return;
                 }
                 if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "jobs",
                                              "update_milestone")) {
                   return;
                 }
                 const auto job_id = req.matches[1].str();
                 const auto milestone_id = req.matches[2].str();
                 auto payload = ParseJson(req, res);
                 if (res.status == 400 && !res.body.empty()) {
                   return;
                 }
                 const auto status = payload.value("status", std::string{"pending"});
                 auto due_date = std::optional<std::string>{};
                 if (payload.contains("due_date") && payload["due_date"].is_string()) {
                   due_date = payload["due_date"].get<std::string>();
                 }
                 const auto escrow_funded = payload.value("escrow_funded", false);
                 if (Store().UpdateMilestone(job_id, milestone_id, status, due_date, escrow_funded)) {
                   res.set_content(R"({"ok":true})", "application/json");
                   return;
                 }
                 res.status = 404;
                 res.set_content(R"({"error":"milestone_not_found"})", "application/json");
               });

  server.Get(R"(/jobs/([\w_-]+)/chat)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "job_chat")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    if (auto job = Store().Get(job_id)) {
      json response = json::array();
      for (const auto &message : job->messages) {
        response.push_back(MessageToJson(message));
      }
      res.set_content(response.dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/chat)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "post_message")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"sender", "body"})) {
      return;
    }
    if (auto message = Store().AddMessage(job_id, payload["sender"].get<std::string>(),
                                          payload["body"].get<std::string>())) {
      res.status = 201;
      res.set_content(MessageToJson(*message).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+)/documents)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "job_documents")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    if (auto job = Store().Get(job_id)) {
      json response = json::array();
      for (const auto &document : job->documents) {
        response.push_back(DocumentToJson(document));
      }
      res.set_content(response.dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/documents)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "jobs", "create_document")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"name", "requires_signature", "content_type"})) {
      return;
    }
    if (auto document = Store().AddDocument(job_id, payload["name"].get<std::string>(),
                                            payload["requires_signature"].get<bool>(),
                                            payload["content_type"].get<std::string>())) {
      res.status = 201;
      res.set_content(DocumentToJson(*document).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/documents/([\w_-]+)/sign)",
              [](const httplib::Request &req, httplib::Response &res) {
                if (!security::Authorize(req, res, "jobs")) {
                  return;
                }
                if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"},
                                             "jobs", "sign_document")) {
                  return;
                }
                const auto job_id = req.matches[1].str();
                const auto document_id = req.matches[2].str();
                auto payload = ParseJson(req, res);
                if (res.status == 400 && !res.body.empty()) {
                  return;
                }
                const auto signed_flag = payload.value("signed", true);
                if (Store().MarkDocumentSigned(job_id, document_id, signed_flag)) {
                  res.set_content(R"({"ok":true})", "application/json");
                  return;
                }
                res.status = 404;
                res.set_content(R"({"error":"document_not_found"})", "application/json");
              });

  server.Post(R"(/jobs/([\w_-]+)/complete)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "jobs", "complete_job")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    const auto summary = payload.value("summary", std::string{"Escrow release pending"});
    if (Store().CompleteJob(job_id, summary)) {
      res.set_content(R"({"ok":true})", "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/disputes)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "open_dispute")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"type", "description"})) {
      return;
    }
    if (auto dispute = Store().CreateDispute(job_id, payload["type"].get<std::string>(),
                                             payload["description"].get<std::string>())) {
      res.status = 201;
      res.set_content(DisputeToJson(*dispute).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+)/disputes)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "view_disputes")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    if (auto job = Store().Get(job_id)) {
      json response = json::array();
      for (const auto &dispute : job->disputes) {
        response.push_back(DisputeToJson(dispute));
      }
      res.set_content(response.dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/disputes/([\w_-]+)/status)",
              [](const httplib::Request &req, httplib::Response &res) {
                if (!security::Authorize(req, res, "jobs")) {
                  return;
                }
                if (!security::RequireRole(req, res, {"admin"}, "jobs", "update_dispute")) {
                  return;
                }
                const auto job_id = req.matches[1].str();
                const auto dispute_id = req.matches[2].str();
                auto payload = ParseJson(req, res);
                if (res.status == 400 && !res.body.empty()) {
                  return;
                }
                if (!RequireFields(payload, res, {"status"})) {
                  return;
                }
                std::vector<std::string> evidence;
                if (payload.contains("evidence_urls") && payload["evidence_urls"].is_array()) {
                  for (const auto &value : payload["evidence_urls"]) {
                    if (value.is_string()) {
                      evidence.push_back(value.get<std::string>());
                    }
                  }
                }
                if (Store().UpdateDisputeStatus(job_id, dispute_id,
                                                payload["status"].get<std::string>(), evidence)) {
                  res.set_content(R"({"ok":true})", "application/json");
                  return;
                }
                res.status = 404;
                res.set_content(R"({"error":"dispute_not_found"})", "application/json");
              });

  server.Get(R"(/jobs/([\w_-]+)/contact)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "finance_admin", "admin"},
                               "jobs", "view_contact")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    if (auto job = Store().Get(job_id)) {
      const auto role = req.get_header_value("X-Actor-Role");
      const bool include_internal = role == "admin" || role == "finance_admin";
      const bool reveal_contact = include_internal || job->contact_policy.unlocked;
      res.set_content(ContactPolicyToJson(*job, reveal_contact, include_internal).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/contact/unlock)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"finance_admin", "admin"}, "jobs", "unlock_contact")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"token"})) {
      return;
    }
    const auto token = payload["token"].get<std::string>();
    if (!security::VerifyScopedToken("contact", job_id, token)) {
      res.status = 403;
      res.set_content(R"({"error":"invalid_token"})", "application/json");
      return;
    }
    const auto role = req.get_header_value("X-Actor-Role");
    if (!Store().UnlockContact(job_id, role.empty() ? "finance_admin" : role)) {
      res.status = 404;
      res.set_content(R"({"error":"job_not_found"})", "application/json");
      return;
    }
    if (auto job = Store().Get(job_id)) {
      res.set_content(ContactPolicyToJson(*job, true, true).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/calls)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs", "schedule_call")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"type", "created_by"})) {
      return;
    }
    const auto type = payload["type"].get<std::string>();
    if (type != "voice" && type != "video") {
      res.status = 400;
      res.set_content(R"({"error":"invalid_call_type"})", "application/json");
      return;
    }
    std::vector<std::string> participants;
    if (payload.contains("participants") && payload["participants"].is_array()) {
      for (const auto &value : payload["participants"]) {
        if (value.is_string()) {
          participants.push_back(value.get<std::string>());
        }
      }
    }
    const auto created_by = payload["created_by"].get<std::string>();
    if (auto session = Store().CreateCallSession(job_id, type, created_by, participants)) {
      const auto role = req.get_header_value("X-Actor-Role");
      const bool include_internal = role == "admin";
      res.status = 201;
      res.set_content(CallSessionToJson(*session, include_internal).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+)/calls)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs", "list_calls")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    const auto role = req.get_header_value("X-Actor-Role");
    const bool include_internal = role == "admin";
    json response = json::array();
    for (const auto &session : Store().ListCalls(job_id)) {
      response.push_back(CallSessionToJson(session, include_internal));
    }
    res.set_content(response.dump(), "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+)/completion-certificate)",
             [](const httplib::Request &req, httplib::Response &res) {
               if (!security::Authorize(req, res, "jobs")) {
                 return;
               }
               if (!security::RequireRole(req, res,
                                          {"buyer", "seller", "conveyancer", "finance_admin", "admin"}, "jobs",
                                          "view_certificate")) {
                 return;
               }
               const auto job_id = req.matches[1].str();
               if (auto certificate = Store().GetCertificate(job_id)) {
                 res.set_content(CertificateToJson(*certificate).dump(), "application/json");
                 return;
               }
               res.status = 404;
               res.set_content(R"({"error":"certificate_not_ready"})", "application/json");
             });

  server.Get("/jobs/templates", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin", "finance_admin"}, "jobs", "list_templates")) {
      return;
    }
    json response = json::array();
    for (const auto &definition : Templates().List()) {
      response.push_back(TemplateToJson(definition));
    }
    res.set_content(response.dump(), "application/json");
  });

  server.Post("/jobs/templates", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "jobs", "create_template")) {
      return;
    }
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"name", "jurisdiction", "description", "tasks"})) {
      return;
    }
    if (!payload["tasks"].is_array() || payload["tasks"].empty()) {
      res.status = 400;
      res.set_content(R"({"error":"invalid_tasks"})", "application/json");
      return;
    }
    std::vector<TemplateTask> tasks;
    for (const auto &entry : payload["tasks"]) {
      TemplateTask task;
      task.id = entry.value("id", GenerateId("tt_"));
      task.title = entry.value("title", std::string{"Checklist item"});
      task.default_assignee = entry.value("default_assignee", std::string{});
      task.due_in_days = entry.value("due_in_days", 0);
      task.escrow_required = entry.value("escrow_required", false);
      tasks.push_back(task);
    }
    auto created = Templates().Create(payload["name"].get<std::string>(),
                                      payload["jurisdiction"].get<std::string>(),
                                      payload["description"].get<std::string>(), tasks);
    res.status = 201;
    res.set_content(TemplateToJson(created).dump(), "application/json");
  });

  server.Post(R"(/jobs/([\w_-]+)/templates/apply)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "jobs", "apply_template")) {
      return;
    }
    const auto job_id = req.matches[1].str();
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"template_id"})) {
      return;
    }
    const auto template_id = payload["template_id"].get<std::string>();
    auto definition = Templates().Get(template_id);
    if (!definition) {
      res.status = 404;
      res.set_content(R"({"error":"template_not_found"})", "application/json");
      return;
    }
    std::string start_date;
    if (payload.contains("start_date") && payload["start_date"].is_string()) {
      start_date = payload["start_date"].get<std::string>();
    } else if (auto job = Store().Get(job_id)) {
      start_date = job->opened_at.substr(0, 10);
    }
    if (start_date.empty()) {
      start_date = NowIso8601().substr(0, 10);
    }
    if (!Store().ApplyTemplate(job_id, *definition, start_date)) {
      res.status = 404;
      res.set_content(R"({"error":"job_not_found"})", "application/json");
      return;
    }
    if (auto job = Store().Get(job_id)) {
      const auto role = req.get_header_value("X-Actor-Role");
      const bool include_internal = role == "admin";
      const bool reveal_contact = include_internal || job->contact_policy.unlocked;
      res.set_content(JobDetailToJson(*job, reveal_contact, include_internal).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Get("/admin/contact-policies", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "jobs", "admin_contact_policies")) {
      return;
    }
    res.set_content(Store().AdminContactPolicies().dump(), "application/json");
  });

  server.Get("/admin/ml/insights", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "jobs", "admin_ml_insights")) {
      return;
    }
    res.set_content(Store().AdminInsights().dump(), "application/json");
  });

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 9002;
  std::cout << "Jobs service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
