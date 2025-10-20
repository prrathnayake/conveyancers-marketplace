#include <gtest/gtest.h>

#include "../gateway/src/http_utils.h"

#include "../gateway/src/http_utils.cpp"

using namespace gateway::http_utils;

TEST(HttpUtilsTest, ResolveIdentityHostUsesEnvValue) {
  EXPECT_EQ(ResolveIdentityHost("example.local"), "example.local");
  EXPECT_EQ(ResolveIdentityHost(nullptr), "127.0.0.1");
}

TEST(HttpUtilsTest, ResolveIdentityPortParsesInteger) {
  EXPECT_EQ(ResolveIdentityPort("9000"), 9000);
  EXPECT_EQ(ResolveIdentityPort("not a number"), 7001);
  EXPECT_EQ(ResolveIdentityPort(nullptr), 7001);
}

TEST(HttpUtilsTest, ForwardQueryStringEncodesParameters) {
  httplib::Params params = {{"state", "New South Wales"}, {"page", "1"}, {"empty", ""}};
  const auto encoded = ForwardQueryString(params);
  EXPECT_EQ(encoded, "empty&page=1&state=New%20South%20Wales");
}
