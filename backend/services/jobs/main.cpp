#include <algorithm>
#include <iostream>
#include <optional>
#include <string>
#include <vector>

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
  std::vector<Milestone> milestones;
  std::vector<Message> messages;
  std::vector<Document> documents;
};

const std::vector<Job> kJobs = {
    {"job_2001",
     "Residential purchase",
     "NSW",
     "in_progress",
     "pro_1002",
     "Emily Carter",
     "Liam Nguyen",
     true,
     {{"ms_1", "Deposit paid", "completed", "2024-02-05", true},
      {"ms_2", "Finance approved", "completed", "2024-02-18", true},
      {"ms_3", "Searches lodged", "in_progress", "2024-03-01", true},
      {"ms_4", "Settlement", "scheduled", "2024-03-15", false}},
     {{"msg_1", "Emily Carter", "Thanks for the update on finance.", "2024-02-18T08:42:00+11:00"},
      {"msg_2", "Sydney Settlements", "Searches lodged with LPI.", "2024-02-20T14:10:00+11:00"}},
     {{"doc_1",
       "Contract of sale",
       "available",
       "https://files.example.com/job_2001/contract.pdf",
       false},
      {"doc_2",
       "Identification verification",
       "awaiting_signature",
       "https://files.example.com/job_2001/vois.pdf",
       true}}},
    {"job_2002",
     "Off-the-plan apartment",
     "VIC",
     "awaiting_client",
     "pro_1001",
     "Oliver Bennett",
     "Southbank Developments",
     true,
     {{"ms_1", "Deposit held in trust", "completed", "2024-01-12", true},
      {"ms_2", "Sunset clause review", "in_progress", "2024-03-30", true},
      {"ms_3", "Registration", "pending", "2024-10-01", false}},
     {{"msg_1",
       "Cora Conveyancer",
       "We are reviewing the draft disclosure statement and will report back shortly.",
       "2024-02-11T10:15:00+11:00"}},
     {{"doc_1",
       "Disclosure statement",
       "in_review",
       "https://files.example.com/job_2002/disclosure.pdf",
       false}}},
    {"job_2003",
     "Commercial lease assignment",
     "QLD",
     "in_progress",
     "pro_1003",
     "Harbourview Pty Ltd",
     "Cafe Collective",
     false,
     {{"ms_1", "Heads of agreement", "completed", "2024-02-01", false},
      {"ms_2", "Landlord consent", "in_progress", "2024-03-12", false},
      {"ms_3", "Assignment executed", "scheduled", "2024-03-28", false}},
     {{"msg_1",
       "Harbourview Pty Ltd",
       "Landlord has requested additional financials.",
       "2024-02-25T09:05:00+10:00"}},
     {{"doc_1",
       "Proposed deed of assignment",
       "awaiting_signature",
       "https://files.example.com/job_2003/deed.pdf",
       true}}}};

const Job *FindJobById(const std::string &id) {
  const auto it = std::find_if(kJobs.begin(), kJobs.end(), [&](const Job &job) {
    return job.id == id;
  });
  if (it == kJobs.end()) {
    return nullptr;
  }
  return &*it;
}

json MilestoneToJson(const Milestone &milestone) {
  return json{{"id", milestone.id},
              {"title", milestone.title},
              {"status", milestone.status},
              {"due_date", milestone.due_date},
              {"escrow_funded", milestone.escrow_funded}};
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
              {"requires_signature", document.requires_signature}};
}

std::optional<std::string> NextDueMilestone(const Job &job) {
  for (const auto &milestone : job.milestones) {
    if (milestone.status != "completed") {
      return milestone.due_date;
    }
  }
  return std::nullopt;
}

json JobSummaryToJson(const Job &job) {
  const auto completed = std::count_if(job.milestones.begin(), job.milestones.end(), [](const Milestone &m) {
    return m.status == "completed";
  });

  json summary{{"id", job.id},
               {"title", job.title},
               {"state", job.state},
               {"status", job.status},
               {"conveyancer_id", job.conveyancer_id},
               {"buyer_name", job.buyer_name},
               {"seller_name", job.seller_name},
               {"escrow_enabled", job.escrow_enabled},
               {"milestones_completed", completed},
               {"milestones_total", job.milestones.size()}};

  if (auto next_due = NextDueMilestone(job)) {
    summary["next_due"] = *next_due;
  }
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
  return payload;
}

std::vector<const Job *> FilterJobs(const httplib::Request &req) {
  std::vector<const Job *> filtered;
  for (const auto &job : kJobs) {
    filtered.push_back(&job);
  }

  if (req.has_param("state")) {
    const auto state_filter = req.get_param_value("state");
    filtered.erase(std::remove_if(filtered.begin(), filtered.end(), [&](const Job *job) {
                      return !state_filter.empty() && job->state != state_filter;
                    }),
                   filtered.end());
  }

  if (req.has_param("conveyancer_id")) {
    const auto conveyancer_id = req.get_param_value("conveyancer_id");
    filtered.erase(std::remove_if(filtered.begin(), filtered.end(), [&](const Job *job) {
                      return !conveyancer_id.empty() && job->conveyancer_id != conveyancer_id;
                    }),
                   filtered.end());
  }

  return filtered;
}

}  // namespace

int main() {
  httplib::Server server;

  server.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("{\"ok\":true}", "application/json");
  });

  server.Get("/jobs", [](const httplib::Request &req, httplib::Response &res) {
    json response = json::array();
    for (const auto *job : FilterJobs(req)) {
      response.push_back(JobSummaryToJson(*job));
    }
    res.set_content(response.dump(), "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    const auto job_id = req.matches[1];
    if (const auto *job = FindJobById(job_id)) {
      res.set_content(JobDetailToJson(*job).dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"job_not_found"})", "application/json");
  });

  server.Get(R"(/jobs/([\w_-]+)/milestones)", [](const httplib::Request &req, httplib::Response &res) {
    const auto job_id = req.matches[1];
    if (const auto *job = FindJobById(job_id)) {
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

  server.Get(R"(/jobs/([\w_-]+)/chat)", [](const httplib::Request &req, httplib::Response &res) {
    const auto job_id = req.matches[1];
    if (const auto *job = FindJobById(job_id)) {
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

  server.Get(R"(/jobs/([\w_-]+)/documents)", [](const httplib::Request &req, httplib::Response &res) {
    const auto job_id = req.matches[1];
    if (const auto *job = FindJobById(job_id)) {
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

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 9002;
  std::cout << "Jobs service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
