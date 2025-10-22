#include "jobs_repository.h"
#include "postgres.h"


#include "jobs_repository_utils.h"

namespace persistence {
namespace {

JobRecord RowToJob(const pqxx::row &row) {
  JobRecord job;
  job.id = row["id"].c_str();
  job.customer_id = row["customer_id"].is_null() ? std::string{} : row["customer_id"].c_str();
  job.conveyancer_id = row["conveyancer_id"].is_null() ? std::string{} : row["conveyancer_id"].c_str();
  job.state = row["state"].is_null() ? std::string{} : row["state"].c_str();
  job.property_type = row["property_type"].is_null() ? std::string{} : row["property_type"].c_str();
  job.status = row["status"].is_null() ? std::string{} : row["status"].c_str();
  job.created_at = row["created_at"].is_null() ? std::string{} : row["created_at"].c_str();
  return job;
}

MilestoneRecord RowToMilestone(const pqxx::row &row) {
  MilestoneRecord record;
  record.id = row["id"].c_str();
  record.job_id = row["job_id"].c_str();
  record.name = row["name"].c_str();
  record.amount_cents = row["amount_cents"].as<int>();
  record.due_date = row["due_date"].is_null() ? std::string{} : row["due_date"].c_str();
  record.status = row["status"].is_null() ? std::string{} : row["status"].c_str();
  return record;
}

DocumentRecord RowToDocument(const pqxx::row &row) {
  DocumentRecord record;
  record.id = row["id"].c_str();
  record.job_id = row["job_id"].c_str();
  record.doc_type = row["doc_type"].is_null() ? std::string{} : row["doc_type"].c_str();
  record.url = row["url"].is_null() ? std::string{} : row["url"].c_str();
  record.checksum = row["checksum"].is_null() ? std::string{} : row["checksum"].c_str();
  record.uploaded_by = row["uploaded_by"].is_null() ? std::string{} : row["uploaded_by"].c_str();
  record.version = row["version"].is_null() ? 1 : row["version"].as<int>();
  record.created_at = row["created_at"].is_null() ? std::string{} : row["created_at"].c_str();
  return record;
}

TemplateRecord RowToTemplate(const pqxx::row &row) {
  detail::TemplateRowData data;
  data.id = row["id"].c_str();
  data.name = row["name"].c_str();
  if (!row["jurisdiction"].is_null()) {
    data.jurisdiction = row["jurisdiction"].c_str();
  }
  if (!row["description"].is_null()) {
    data.description = row["description"].c_str();
  }
  if (!row["integration_url"].is_null()) {
    data.integration_url = row["integration_url"].c_str();
  }
  if (!row["integration_auth"].is_null()) {
    data.integration_auth_json = row["integration_auth"].c_str();
  }
  if (!row["latest_version"].is_null()) {
    data.latest_version = row["latest_version"].as<int>();
  }
  if (!row["payload"].is_null()) {
    data.payload_json = row["payload"].c_str();
  }
  return detail::BuildTemplateRecord(data);
}

}  // namespace

JobsRepository::JobsRepository(std::shared_ptr<PostgresConfig> config) : config_(std::move(config)) {}

JobRecord JobsRepository::CreateJob(const JobCreateInput &input) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto row = txn.exec_params1(
      "insert into jobs(customer_id, conveyancer_id, state, property_type, status) values ($1,$2,$3,$4,$5) "
      "returning id, customer_id, conveyancer_id, state, property_type, status, created_at",
      input.customer_id.empty() ? pqxx::null() : pqxx::zview(input.customer_id.c_str()),
      input.conveyancer_id.empty() ? pqxx::null() : pqxx::zview(input.conveyancer_id.c_str()),
      input.state.empty() ? pqxx::null() : pqxx::zview(input.state.c_str()),
      input.property_type.empty() ? pqxx::null() : pqxx::zview(input.property_type.c_str()),
      input.status.empty() ? pqxx::zview("quote_pending") : pqxx::zview(input.status.c_str()));
  txn.commit();
  return RowToJob(row);
}

std::optional<JobRecord> JobsRepository::GetJobById(const std::string &id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, customer_id, conveyancer_id, state, property_type, status, created_at from jobs where id=$1", id);
  if (result.empty()) {
    return std::nullopt;
  }
  return RowToJob(result[0]);
}

std::vector<JobRecord> JobsRepository::ListJobsForAccount(const std::string &account_id, int limit) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, customer_id, conveyancer_id, state, property_type, status, created_at from jobs "
      "where ($1='' or customer_id=$1 or conveyancer_id=$1) order by created_at desc limit $2",
      account_id, limit);
  std::vector<JobRecord> jobs;
  jobs.reserve(result.size());
  for (const auto &row : result) {
    jobs.push_back(RowToJob(row));
  }
  return jobs;
}

MilestoneRecord JobsRepository::CreateMilestone(const MilestoneInput &input) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto row = txn.exec_params1(
      "insert into milestones(job_id, name, amount_cents, due_date) values ($1,$2,$3,$4::date) "
      "returning id, job_id, name, amount_cents, due_date, status",
      input.job_id, input.name, input.amount_cents,
      input.due_date.empty() ? pqxx::null() : pqxx::zview(input.due_date.c_str()));
  txn.commit();
  return RowToMilestone(row);
}

std::vector<MilestoneRecord> JobsRepository::ListMilestones(const std::string &job_id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, job_id, name, amount_cents, due_date, status from milestones where job_id=$1 order by due_date asc, id",
      job_id);
  std::vector<MilestoneRecord> milestones;
  milestones.reserve(result.size());
  for (const auto &row : result) {
    milestones.push_back(RowToMilestone(row));
  }
  return milestones;
}

DocumentRecord JobsRepository::StoreDocument(const DocumentRecord &input) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto row = txn.exec_params1(
      "insert into documents(job_id, doc_type, url, checksum, uploaded_by, version) values ($1,$2,$3,$4,$5,$6) "
      "returning id, job_id, doc_type, url, checksum, uploaded_by, version, created_at",
      input.job_id, input.doc_type.empty() ? pqxx::null() : pqxx::zview(input.doc_type.c_str()),
      input.url, input.checksum.empty() ? pqxx::null() : pqxx::zview(input.checksum.c_str()),
      input.uploaded_by.empty() ? pqxx::null() : pqxx::zview(input.uploaded_by.c_str()), input.version);
  txn.commit();
  return RowToDocument(row);
}

std::vector<DocumentRecord> JobsRepository::ListDocuments(const std::string &job_id) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, job_id, doc_type, url, checksum, uploaded_by, version, created_at from documents where job_id=$1 order by "
      "created_at desc",
      job_id);
  std::vector<DocumentRecord> documents;
  documents.reserve(result.size());
  for (const auto &row : result) {
    documents.push_back(RowToDocument(row));
  }
  return documents;
}

void JobsRepository::AppendMessage(const std::string &job_id, const std::string &author_id,
                                   const std::string &content, const nlohmann::json &attachments) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  txn.exec_params("insert into messages(job_id, from_user, content, attachments) values ($1,$2,$3,$4::jsonb)", job_id,
                  author_id.empty() ? pqxx::null() : pqxx::zview(author_id.c_str()), content, attachments.dump());
  txn.commit();
}

std::vector<nlohmann::json> JobsRepository::FetchMessages(const std::string &job_id, int limit) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec_params(
      "select id, from_user, content, attachments, created_at from messages where job_id=$1 order by created_at desc limit $2",
      job_id, limit);
  std::vector<nlohmann::json> messages;
  messages.reserve(result.size());
  for (const auto &row : result) {
    nlohmann::json payload;
    payload["id"] = row["id"].c_str();
    payload["from"] = row["from_user"].is_null() ? nlohmann::json{} : nlohmann::json(row["from_user"].c_str());
    payload["content"] = row["content"].c_str();
    payload["attachments"] = nlohmann::json::parse(row["attachments"].is_null() ? "[]" : row["attachments"].c_str());
    payload["createdAt"] = row["created_at"].is_null() ? nlohmann::json{} : nlohmann::json(row["created_at"].c_str());
    messages.push_back(std::move(payload));
  }
  return messages;
}

void JobsRepository::UpdateJobStatus(const std::string &job_id, const std::string &status) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  txn.exec_params("update jobs set status=$2 where id=$1", job_id, status);
  txn.commit();
}

TemplateRecord JobsRepository::UpsertTemplateVersion(const TemplateUpsertInput &input) const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);

  std::string template_id = input.template_id;
  if (template_id.empty()) {
    const auto row = txn.exec_params1(
        "insert into job_templates(name, jurisdiction, description, integration_url, integration_auth, latest_version) "
        "values ($1,$2,$3,$4,$5::jsonb,0) returning id",
        input.name, input.jurisdiction.empty() ? pqxx::null() : pqxx::zview(input.jurisdiction.c_str()),
        input.description.empty() ? pqxx::null() : pqxx::zview(input.description.c_str()),
        input.integration_url.empty() ? pqxx::null() : pqxx::zview(input.integration_url.c_str()),
        input.integration_auth.dump());
    template_id = row["id"].c_str();
  } else {
    txn.exec_params(
        "update job_templates set name=$2, jurisdiction=$3, description=$4, integration_url=$5, integration_auth=$6::jsonb "
        "where id=$1",
        template_id, input.name, input.jurisdiction.empty() ? pqxx::null() : pqxx::zview(input.jurisdiction.c_str()),
        input.description.empty() ? pqxx::null() : pqxx::zview(input.description.c_str()),
        input.integration_url.empty() ? pqxx::null() : pqxx::zview(input.integration_url.c_str()), input.integration_auth.dump());
  }

  const auto version_row = txn.exec_params1(
      "select coalesce(max(version),0) as current_version from job_template_versions where template_id=$1", template_id);
  const int next_version = version_row["current_version"].as<int>() + 1;

  nlohmann::json payload;
  payload["tasks"] = nlohmann::json::array();
  for (const auto &task : input.tasks) {
    nlohmann::json task_json;
    task_json["name"] = task.name;
    task_json["dueDays"] = task.due_days;
    task_json["assignedRole"] = task.assigned_role;
    payload["tasks"].push_back(std::move(task_json));
  }
  if (!input.metadata.is_null()) {
    payload["syncMetadata"] = input.metadata;
  }

  txn.exec_params(
      "insert into job_template_versions(template_id, version, payload, source) values ($1,$2,$3::jsonb,$4::jsonb)",
      template_id, next_version, payload.dump(), input.source.dump());
  txn.exec_params("update job_templates set latest_version=$2 where id=$1", template_id, next_version);

  const auto row = txn.exec_params1(
      "select t.id, t.name, t.jurisdiction, t.description, t.integration_url, t.integration_auth, t.latest_version, "
      "v.payload from job_templates t join job_template_versions v on v.template_id=t.id and v.version=$2 where t.id=$1",
      template_id, next_version);
  txn.commit();
  return RowToTemplate(row);
}

std::vector<TemplateRecord> JobsRepository::ListTemplates() const {
  pqxx::connection conn = config_->Connect();
  pqxx::work txn(conn);
  const auto result = txn.exec(
      "select t.id, t.name, t.jurisdiction, t.description, t.integration_url, t.integration_auth, t.latest_version, "
      "coalesce(v.payload,'{}') as payload from job_templates t left join lateral (select payload from "
      "job_template_versions v where v.template_id=t.id order by version desc limit 1) v on true order by t.name");
  std::vector<TemplateRecord> templates;
  templates.reserve(result.size());
  for (const auto &row : result) {
    templates.push_back(RowToTemplate(row));
  }
  return templates;
}

}  // namespace persistence
