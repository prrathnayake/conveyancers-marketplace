#ifndef CONVEYANCERS_MARKETPLACE_PERSISTENCE_JOBS_REPOSITORY_H
#define CONVEYANCERS_MARKETPLACE_PERSISTENCE_JOBS_REPOSITORY_H

#include <nlohmann/json.hpp>

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace persistence {

class PostgresConfig;

struct JobCreateInput {
  std::string customer_id;
  std::string conveyancer_id;
  std::string state;
  std::string property_type;
  std::string status;
};

struct JobRecord {
  std::string id;
  std::string customer_id;
  std::string conveyancer_id;
  std::string state;
  std::string property_type;
  std::string status;
  std::string created_at;
};

struct MilestoneInput {
  std::string job_id;
  std::string name;
  int amount_cents = 0;
  std::string due_date;
};

struct MilestoneRecord {
  std::string id;
  std::string job_id;
  std::string name;
  int amount_cents = 0;
  std::string due_date;
  std::string status;
};

struct DocumentRecord {
  std::string id;
  std::string job_id;
  std::string doc_type;
  std::string url;
  std::string checksum;
  std::string uploaded_by;
  int version = 1;
  std::string created_at;
};

struct TemplateTaskRecord {
  std::string name;
  int due_days = 0;
  std::string assigned_role;
};

struct TemplateRecord {
  std::string id;
  std::string name;
  std::string jurisdiction;
  std::string description;
  std::string integration_url;
  nlohmann::json integration_auth = nlohmann::json::object();
  int latest_version = 0;
  std::vector<TemplateTaskRecord> tasks;
  nlohmann::json metadata = nlohmann::json::object();
};

struct TemplateUpsertInput {
  std::string template_id;
  std::string name;
  std::string jurisdiction;
  std::string description;
  std::string integration_url;
  nlohmann::json integration_auth = nlohmann::json::object();
  std::vector<TemplateTaskRecord> tasks;
  nlohmann::json source = nlohmann::json::object();
  nlohmann::json metadata = nlohmann::json::object();
};

class JobsRepository {
 public:
  explicit JobsRepository(std::shared_ptr<PostgresConfig> config);

  JobRecord CreateJob(const JobCreateInput &input) const;
  std::optional<JobRecord> GetJobById(const std::string &id) const;
  std::vector<JobRecord> ListJobsForAccount(const std::string &account_id, int limit) const;
  MilestoneRecord CreateMilestone(const MilestoneInput &input) const;
  std::vector<MilestoneRecord> ListMilestones(const std::string &job_id) const;
  DocumentRecord StoreDocument(const DocumentRecord &input) const;
  std::vector<DocumentRecord> ListDocuments(const std::string &job_id) const;
  void AppendMessage(const std::string &job_id, const std::string &author_id, const std::string &content,
                     const nlohmann::json &attachments) const;
  std::vector<nlohmann::json> FetchMessages(const std::string &job_id, int limit) const;
  void UpdateJobStatus(const std::string &job_id, const std::string &status) const;
  TemplateRecord UpsertTemplateVersion(const TemplateUpsertInput &input) const;
  std::vector<TemplateRecord> ListTemplates() const;

 private:
  std::shared_ptr<PostgresConfig> config_;
};

}  // namespace persistence

#endif  // CONVEYANCERS_MARKETPLACE_PERSISTENCE_JOBS_REPOSITORY_H
