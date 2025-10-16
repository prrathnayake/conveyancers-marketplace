#include <algorithm>
#include <chrono>
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
    it->second.completed_at = NowIso8601();
    it->second.compliance_notes = summary;
    return true;
  }

 private:
  static std::string GenerateId(const std::string &prefix) {
    static std::mt19937 rng{std::random_device{}()};
    static std::uniform_int_distribution<int> dist(10000, 99999);
    return prefix + std::to_string(dist(rng));
  }

  static std::string NowIso8601() {
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

    jobs_[job1.id] = job1;
    jobs_[job2.id] = job2;
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
               {"compliance_notes", job.compliance_notes}};
  return summary;
}

json JobDetailToJson(const Job &job) {
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
    res.status = 201;
    res.set_content(JobDetailToJson(*job).dump(), "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "jobs")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "jobs",
                               "job_detail")) {
      return;
    }
    const auto job_id = req.matches[1];
    if (auto job = Store().Get(job_id)) {
      res.set_content(JobDetailToJson(*job).dump(), "application/json");
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
    const auto job_id = req.matches[1];
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
    const auto job_id = req.matches[1];
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
                 const auto job_id = req.matches[1];
                 const auto milestone_id = req.matches[2];
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
    const auto job_id = req.matches[1];
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
    const auto job_id = req.matches[1];
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
    const auto job_id = req.matches[1];
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
    const auto job_id = req.matches[1];
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
                const auto job_id = req.matches[1];
                const auto document_id = req.matches[2];
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
    const auto job_id = req.matches[1];
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
    const auto job_id = req.matches[1];
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
    const auto job_id = req.matches[1];
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
                const auto job_id = req.matches[1];
                const auto dispute_id = req.matches[2];
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

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 9002;
  std::cout << "Jobs service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
