#include <gtest/gtest.h>

#include <optional>

#include "../common/persistence/accounts_repository_utils.h"
#include "../common/persistence/jobs_repository_utils.h"

#include "../common/persistence/accounts_repository_utils.cpp"
#include "../common/persistence/jobs_repository_utils.cpp"

using namespace persistence::detail;

TEST(AccountsRepositoryUtilsTest, SerializesAndParsesServices) {
  std::vector<std::string> values{"conveyancing", "settlements"};
  const auto json = SerializeStringArray(values);
  EXPECT_EQ(json, "[\"conveyancing\",\"settlements\"]");
  const auto parsed = ParseStringArray(std::optional<std::string>(json));
  EXPECT_EQ(parsed, values);
}

TEST(AccountsRepositoryUtilsTest, ParseStringArrayHandlesInvalidJson) {
  const auto parsed = ParseStringArray(std::optional<std::string>("not_json"));
  EXPECT_TRUE(parsed.empty());
}

TEST(AccountsRepositoryUtilsTest, BuildAccountRecordPopulatesOptionalFields) {
  AccountRowData data;
  data.id = "user-123";
  data.email = "person@example.com";
  data.role = "conveyancer";
  data.full_name = "Jane Convey";
  data.state = "NSW";
  data.suburb = "Sydney";
  data.phone = "0400 000 000";
  data.password_hash = "hash";
  data.password_salt = "salt";
  data.two_factor_secret = "secret";
  data.biography = "Bio";
  data.licence_number = "LIC123";
  data.licence_state = "NSW";
  data.specialties_json = std::string("[\"commercial\"]");
  data.services_json = std::string("[\"online\"]");
  data.verified = true;

  const auto record = BuildAccountRecord(data);
  EXPECT_EQ(record.id, data.id);
  EXPECT_EQ(record.licence_number, "LIC123");
  EXPECT_TRUE(record.verified);
  ASSERT_EQ(record.specialties.size(), 1);
  EXPECT_EQ(record.specialties[0], "commercial");
  ASSERT_EQ(record.services.size(), 1);
  EXPECT_EQ(record.services[0], "online");
}

TEST(JobsRepositoryUtilsTest, BuildTemplateRecordExtractsTasksAndMetadata) {
  TemplateRowData data;
  data.id = "template-1";
  data.name = "Sale";
  data.jurisdiction = "QLD";
  data.integration_url = "https://example.com";
  data.integration_auth_json = std::string("{\"token\":\"abc\"}");
  data.latest_version = 3;
  data.payload_json = std::string(R"({
    "tasks": [
      {"name": "Review", "dueDays": 2, "assignedRole": "conveyancer"},
      {"name": "Approve", "dueDays": 5}
    ],
    "syncMetadata": {"region": "brisbane"}
  })");

  const auto record = BuildTemplateRecord(data);
  EXPECT_EQ(record.id, data.id);
  EXPECT_EQ(record.latest_version, 3);
  ASSERT_EQ(record.tasks.size(), 2);
  EXPECT_EQ(record.tasks[0].name, "Review");
  EXPECT_EQ(record.tasks[0].due_days, 2);
  EXPECT_EQ(record.tasks[0].assigned_role, "conveyancer");
  EXPECT_EQ(record.tasks[1].name, "Approve");
  EXPECT_EQ(record.tasks[1].due_days, 5);
  EXPECT_EQ(record.metadata.at("region"), "brisbane");
}

TEST(JobsRepositoryUtilsTest, BuildTemplateRecordHandlesInvalidPayload) {
  TemplateRowData data;
  data.id = "template-2";
  data.name = "Lease";
  data.payload_json = std::string("not json");

  const auto record = BuildTemplateRecord(data);
  EXPECT_TRUE(record.tasks.empty());
  EXPECT_TRUE(record.metadata.is_object());
}
