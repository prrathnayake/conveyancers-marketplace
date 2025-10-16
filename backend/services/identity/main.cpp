#include <algorithm>
#include <chrono>
#include <cctype>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <optional>
#include <random>
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

struct Review {
  std::string id;
  std::string author_name;
  std::string role;
  int rating;
  std::string comment;
  std::string created_at;
};

struct ComplianceStatus {
  bool kyc_verified = false;
  std::string kyc_reference;
  bool licence_verified = false;
  std::string licence_number;
  std::string insurance_provider;
  std::string insurance_expiry;
  std::string last_verified_at;
};

struct LicenceRegistryEntry {
  std::string licence_number;
  std::string holder_name;
  std::string state;
  std::string insurance_provider;
  std::string insurance_expiry;
  bool active = true;
};

struct Profile {
  std::string id;
  std::string account_id;
  std::string name;
  std::string email;
  std::string role;
  std::string state;
  std::string suburb;
  std::string biography;
  bool verified = false;
  ComplianceStatus compliance;
  std::vector<std::string> specialties;
  std::vector<std::string> services;
  double rating_average = 0.0;
  int rating_count = 0;
};

struct Account {
  std::string id;
  std::string email;
  std::string password;
  std::string role;
  std::string full_name;
  std::string two_factor_secret;
  bool active = true;
};

struct PendingTwoFactor {
  std::string token;
  std::string account_id;
  std::chrono::system_clock::time_point expires_at;
  int attempts = 0;
};

struct AuditEvent {
  std::string id;
  std::string actor_account_id;
  std::string action;
  std::string entity;
  json metadata;
  std::string created_at;
};

class IdentityStore {
 public:
 IdentityStore() {
    const auto ninety_days = FormatDateOnly(std::chrono::system_clock::now() + std::chrono::hours(24 * 90));
    const auto one_eighty_days =
        FormatDateOnly(std::chrono::system_clock::now() + std::chrono::hours(24 * 180));
    const auto one_year = FormatDateOnly(std::chrono::system_clock::now() + std::chrono::hours(24 * 365));

    licence_registry_.emplace("VIC-SET-8821",
                              LicenceRegistryEntry{"VIC-SET-8821", "Cora Conveyancer", "VIC",
                                                    "Guardian PI Underwriting", one_year, true});
    licence_registry_.emplace("NSW-CNV-4410",
                              LicenceRegistryEntry{"NSW-CNV-4410", "Sydney Settlements", "NSW",
                                                    "Harbour Mutual Insurance", one_eighty_days, true});
    licence_registry_.emplace("QLD-SOL-9902",
                              LicenceRegistryEntry{"QLD-SOL-9902", "QLD Property Law", "QLD",
                                                    "LegalSure Australia", ninety_days, true});
    licence_registry_.emplace("ACT-SOL-2211",
                              LicenceRegistryEntry{"ACT-SOL-2211", "Capital Conveyancing", "ACT",
                                                    "Southern Cross Insurers", one_year, false});
    licence_registry_.emplace("NT-SOL-8891",
                              LicenceRegistryEntry{"NT-SOL-8891", "Northern Territory Solicitors", "NT",
                                                    "TopEnd Liability Mutual", one_year, true});

    // Seed a handful of conveyancers so search is immediately useful.
    RegisterSeedAccount("pro_1001", "cora@settlehub.example", "Cora Conveyancer", "conveyancer",
                        "VIC", "Richmond", true, "VIC-SET-8821", "Guardian PI Underwriting", one_year);
    RegisterSeedAccount("pro_1002", "info@sydneysettlements.example", "Sydney Settlements",
                        "conveyancer", "NSW", "Parramatta", true, "NSW-CNV-4410",
                        "Harbour Mutual Insurance", one_eighty_days);
    RegisterSeedAccount("pro_1003", "hello@qldlaw.example", "QLD Property Law", "conveyancer",
                        "QLD", "Brisbane", false, "QLD-SOL-9902", "LegalSure Australia", ninety_days);
    RegisterSeedAccount("pro_1004", "team@capitalconveyancing.example", "Capital Conveyancing",
                        "conveyancer", "ACT", "Canberra", true, "ACT-SOL-2211",
                        "Southern Cross Insurers", one_year);
    RegisterSeedAccount("pro_1005", "support@ntsolicitors.example",
                        "Northern Territory Solicitors", "conveyancer", "NT", "Darwin", true,
                        "NT-SOL-8891", "TopEnd Liability Mutual", one_year);
  }

  std::string RegisterAccount(const std::string &email, const std::string &password,
                              const std::string &role, const std::string &full_name,
                              const std::string &state, const std::string &suburb,
                              const std::vector<std::string> &services,
                              const std::vector<std::string> &specialties,
                              const std::string &biography) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (account_by_email_.count(email) > 0) {
      throw std::runtime_error("account_exists");
    }

    Account account;
    account.id = GenerateId("acct_");
    account.email = email;
    account.password = password;
    account.role = role;
    account.full_name = full_name;
    account.two_factor_secret = GenerateSecret();

    Profile profile;
    profile.id = GenerateId("pro_");
    profile.account_id = account.id;
    profile.name = full_name;
    profile.email = email;
    profile.role = role;
    profile.state = state;
    profile.suburb = suburb;
    profile.biography = biography;
    profile.services = services;
    profile.specialties = specialties;
    profile.verified = false;

    accounts_[account.id] = account;
    account_by_email_[email] = account.id;
    profiles_[profile.id] = profile;
    profile_by_account_[account.id] = profile.id;

    AuditEvent event;
    event.id = GenerateId("audit_");
    event.actor_account_id = account.id;
    event.entity = "profile";
    event.action = "register";
    event.metadata = json{{"email", email}, {"role", role}, {"state", state}};
    event.created_at = NowIso8601();
    audit_log_.push_back(event);

    return account.id;
  }

  const Profile *GetProfileById(const std::string &id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = profiles_.find(id); it != profiles_.end()) {
      return &it->second;
    }
    return nullptr;
  }

  std::optional<Profile> GetProfile(const std::string &id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (auto it = profiles_.find(id); it != profiles_.end()) {
      return it->second;
    }
    return std::nullopt;
  }

  std::vector<Profile> SearchProfiles(const std::optional<std::string> &query,
                                      const std::optional<std::string> &state,
                                      bool verified_only) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<Profile> result;
    for (const auto &[_, profile] : profiles_) {
      if (verified_only && !profile.verified) {
        continue;
      }
      if (state.has_value()) {
        if (!CaseInsensitiveEquals(profile.state, *state)) {
          continue;
        }
      }
      if (RequiresSolicitor(profile.state) && !profile.verified) {
        continue;
      }
      if (query.has_value() && !query->empty()) {
        const auto haystack = ToLower(profile.name + " " + profile.suburb + " " + profile.biography);
        if (haystack.find(ToLower(*query)) == std::string::npos) {
          continue;
        }
      }
      result.push_back(profile);
    }
    std::sort(result.begin(), result.end(), [](const Profile &a, const Profile &b) {
      if (a.verified != b.verified) {
        return a.verified && !b.verified;
      }
      return a.rating_average > b.rating_average;
    });
    return result;
  }

  std::vector<Profile> AllProfiles() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<Profile> result;
    for (const auto &[_, profile] : profiles_) {
      result.push_back(profile);
    }
    std::sort(result.begin(), result.end(), [](const Profile &a, const Profile &b) {
      return a.name < b.name;
    });
    return result;
  }

  std::vector<Review> GetReviews(const std::string &profile_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<Review> result;
    if (auto it = reviews_.find(profile_id); it != reviews_.end()) {
      result = it->second;
    }
    std::sort(result.begin(), result.end(), [](const Review &a, const Review &b) {
      return a.created_at > b.created_at;
    });
    return result;
  }

  bool AddReview(const std::string &profile_id, const std::string &author_name,
                 const std::string &role, int rating, const std::string &comment) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto profile_it = profiles_.find(profile_id);
    if (profile_it == profiles_.end()) {
      return false;
    }
    Review review;
    review.id = GenerateId("rev_");
    review.author_name = author_name;
    review.role = role;
    review.rating = rating;
    review.comment = comment;
    review.created_at = NowIso8601();
    reviews_[profile_id].push_back(review);

    auto &profile = profile_it->second;
    profile.rating_count += 1;
    profile.rating_average = ((profile.rating_average * (profile.rating_count - 1)) + rating) /
                             static_cast<double>(profile.rating_count);

    AuditEvent event;
    event.id = GenerateId("audit_");
    event.actor_account_id = profile.account_id;
    event.entity = "review";
    event.action = "created";
    event.metadata = json{{"profile_id", profile_id}, {"rating", rating}};
    event.created_at = review.created_at;
    audit_log_.push_back(event);
    return true;
  }

  bool UpdateKycStatus(const std::string &profile_id, const std::string &reference,
                       bool approved) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = profiles_.find(profile_id);
    if (it == profiles_.end()) {
      return false;
    }
    it->second.compliance.kyc_verified = approved;
    it->second.compliance.kyc_reference = reference;
    if (approved) {
      it->second.verified = it->second.compliance.licence_verified;
    }
    RecordAudit(it->second.account_id, "kyc_update", "profile",
                json{{"profile_id", profile_id}, {"approved", approved}});
    return true;
  }

  bool UpdateLicence(const std::string &profile_id, const std::string &licence_number,
                     const std::string &insurance_provider,
                     const std::string &insurance_expiry, bool licence_verified) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = profiles_.find(profile_id);
    if (it == profiles_.end()) {
      return false;
    }
    auto &profile = it->second;
    json audit_metadata;
    const bool verified = ApplyLicenceVerification(profile, licence_number, insurance_provider,
                                                   insurance_expiry, licence_verified, &audit_metadata);
    audit_metadata["profile_id"] = profile_id;

    if (!verified) {
      profile.compliance.last_verified_at.clear();
    }

    RecordAudit(profile.account_id, "licence_verification", "profile", audit_metadata);
    return true;
  }

  bool UpdateProfile(const std::string &profile_id, const std::string &biography,
                     const std::vector<std::string> &services,
                     const std::vector<std::string> &specialties,
                     const std::string &suburb) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = profiles_.find(profile_id);
    if (it == profiles_.end()) {
      return false;
    }
    auto &profile = it->second;
    profile.biography = biography;
    profile.services = services;
    profile.specialties = specialties;
    profile.suburb = suburb;
    RecordAudit(profile.account_id, "profile_updated", "profile",
                json{{"profile_id", profile_id}, {"services", services}});
    return true;
  }

  std::optional<Account> Authenticate(const std::string &email, const std::string &password) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = account_by_email_.find(email);
    if (it == account_by_email_.end()) {
      return std::nullopt;
    }
    const auto &account = accounts_.at(it->second);
    if (!account.active || account.password != password) {
      return std::nullopt;
    }
    return account;
  }

  std::string IssueTwoFactorChallenge(const std::string &account_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    PendingTwoFactor pending;
    pending.token = GenerateId("2fa_");
    pending.account_id = account_id;
    pending.expires_at = std::chrono::system_clock::now() + std::chrono::minutes(5);
    pending_two_factor_[pending.token] = pending;
    return pending.token;
  }

  bool VerifyTwoFactor(const std::string &token, const std::string &code,
                       std::string *session_token, json *preview_metadata) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = pending_two_factor_.find(token);
    if (it == pending_two_factor_.end()) {
      return false;
    }
    if (std::chrono::system_clock::now() > it->second.expires_at) {
      pending_two_factor_.erase(it);
      return false;
    }
    auto account_it = accounts_.find(it->second.account_id);
    if (account_it == accounts_.end()) {
      pending_two_factor_.erase(it);
      return false;
    }
    auto &pending = it->second;
    if (pending.attempts >= 5) {
      pending_two_factor_.erase(it);
      return false;
    }
    pending.attempts += 1;

    if (!ValidateTwoFactorCode(account_it->second.two_factor_secret, code)) {
      if (preview_metadata) {
        *preview_metadata = json{{"remaining_attempts", 5 - pending.attempts}};
      }
      if (pending.attempts >= 5) {
        pending_two_factor_.erase(it);
      }
      return false;
    }

    if (session_token) {
      *session_token = GenerateId("sess_");
      active_sessions_.insert(*session_token);
    }
    pending_two_factor_.erase(it);
    return true;
  }

  std::string PreviewTwoFactorCode(const std::string &account_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = accounts_.find(account_id);
    if (it == accounts_.end()) {
      return "";
    }
    return GenerateTwoFactorCode(it->second.two_factor_secret, std::chrono::system_clock::now());
  }

  json BuildProfileJson(const Profile &profile) const {
    json payload{{"id", profile.id},
                 {"account_id", profile.account_id},
                 {"name", profile.name},
                 {"email", profile.email},
                 {"role", profile.role},
                 {"state", profile.state},
                 {"suburb", profile.suburb},
                 {"biography", profile.biography},
                 {"verified", profile.verified},
                 {"services", profile.services},
                 {"specialties", profile.specialties},
                 {"rating_average", profile.rating_average},
                 {"rating_count", profile.rating_count},
                 {"compliance",
                  json{{"kyc_verified", profile.compliance.kyc_verified},
                       {"kyc_reference", profile.compliance.kyc_reference},
                       {"licence_verified", profile.compliance.licence_verified},
                       {"licence_number", profile.compliance.licence_number},
                       {"insurance_provider", profile.compliance.insurance_provider},
                       {"insurance_expiry", profile.compliance.insurance_expiry},
                       {"last_verified_at", profile.compliance.last_verified_at}}},
                 {"verification_brand", "ConveySafe"}};
    payload["compliance_badges"] = json::array();
    for (const auto &badge : BuildComplianceBadges(profile)) {
      payload["compliance_badges"].push_back(badge);
    }
    return payload;
  }

  std::vector<std::string> BuildComplianceBadges(const Profile &profile) const {
    std::vector<std::string> badges;
    if (profile.compliance.licence_verified) {
      badges.push_back("ConveySafe licence verified");
    } else if (profile.compliance.kyc_verified) {
      badges.push_back("KYC clearance pending licence");
    }
    if (profile.compliance.kyc_verified) {
      badges.push_back("ConveySafe identity confirmed");
    }
    if (!profile.compliance.insurance_expiry.empty()) {
      const auto today = FormatDateOnly(std::chrono::system_clock::now());
      if (profile.compliance.insurance_expiry >= today) {
        badges.push_back("Professional indemnity current");
      } else {
        badges.push_back("Insurance renewal required");
      }
    }
    return badges;
  }

  json BuildReviewJson(const Review &review) const {
    return json{{"id", review.id},
                {"author_name", review.author_name},
                {"role", review.role},
                {"rating", review.rating},
                {"comment", review.comment},
                {"created_at", review.created_at}};
  }

  json ListAuditEvents() const {
    std::lock_guard<std::mutex> lock(mutex_);
    json events = json::array();
    for (const auto &event : audit_log_) {
      events.push_back(json{{"id", event.id},
                           {"actor_account_id", event.actor_account_id},
                           {"action", event.action},
                           {"entity", event.entity},
                           {"metadata", event.metadata},
                           {"created_at", event.created_at}});
    }
    return events;
  }

  json ListComplianceAlerts() const {
    std::lock_guard<std::mutex> lock(mutex_);
    json alerts = json::array();
    const auto threshold = FormatDateOnly(std::chrono::system_clock::now() + std::chrono::hours(24 * 30));
    for (const auto &[profile_id, profile] : profiles_) {
      json base{{"profile_id", profile_id},
                {"account_id", profile.account_id},
                {"name", profile.name},
                {"state", profile.state},
                {"email", profile.email}};
      if (!profile.compliance.kyc_verified) {
        json alert = base;
        alert["type"] = "kyc_pending";
        alert["severity"] = "high";
        alerts.push_back(std::move(alert));
      }
      if (profile.compliance.kyc_verified && !profile.compliance.licence_verified) {
        json alert = base;
        alert["type"] = "licence_unverified";
        alert["severity"] = "high";
        alerts.push_back(std::move(alert));
      }
      if (!profile.compliance.insurance_expiry.empty()) {
        if (!LooksLikeIsoDate(profile.compliance.insurance_expiry)) {
          json alert = base;
          alert["type"] = "insurance_date_invalid";
          alert["severity"] = "high";
          alert["insurance_expiry"] = profile.compliance.insurance_expiry;
          alerts.push_back(std::move(alert));
        } else if (profile.compliance.insurance_expiry <= threshold) {
          json alert = base;
          alert["type"] = "insurance_expiring";
          alert["severity"] = "medium";
          alert["insurance_expiry"] = profile.compliance.insurance_expiry;
          alerts.push_back(std::move(alert));
        }
      }
      if (profile.compliance.licence_verified) {
        auto registry_it = licence_registry_.find(profile.compliance.licence_number);
        if (registry_it != licence_registry_.end() && !registry_it->second.active) {
          json alert = base;
          alert["type"] = "licence_inactive";
          alert["severity"] = "high";
          alerts.push_back(std::move(alert));
        }
      }
    }
    return alerts;
  }

  json PurgeAuditLog(int retention_days) {
    if (retention_days < 1) {
      retention_days = 1;
    }
    std::lock_guard<std::mutex> lock(mutex_);
    const auto cutoff_point = std::chrono::system_clock::now() - std::chrono::hours(24 * retention_days);
    const auto cutoff_iso = FormatIso8601(cutoff_point);
    const auto before = audit_log_.size();
    audit_log_.erase(std::remove_if(audit_log_.begin(), audit_log_.end(),
                                    [&](const AuditEvent &event) { return event.created_at < cutoff_iso; }),
                     audit_log_.end());
    const auto removed = before - audit_log_.size();
    return json{{"retention_days", retention_days},
                {"removed", removed},
                {"remaining", audit_log_.size()},
                {"cutoff", cutoff_iso}};
  }

 private:
  static std::string ToLower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
      return static_cast<char>(std::tolower(c));
    });
    return value;
  }

  static bool CaseInsensitiveEquals(const std::string &lhs, const std::string &rhs) {
    return ToLower(lhs) == ToLower(rhs);
  }

  static bool RequiresSolicitor(const std::string &state) {
    static const std::unordered_set<std::string> restricted{"QLD", "ACT"};
    return restricted.count(state) > 0;
  }

  static std::string GenerateId(const std::string &prefix) {
    static std::mt19937 rng{std::random_device{}()};
    static std::uniform_int_distribution<int> dist(10000, 99999);
    return prefix + std::to_string(dist(rng));
  }

  static std::string GenerateSecret() {
    static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    static std::mt19937 rng{std::random_device{}()};
    static std::uniform_int_distribution<int> dist(0, 31);
    std::string secret;
    for (int i = 0; i < 16; ++i) {
      secret.push_back(alphabet[dist(rng)]);
    }
    return secret;
  }

  static std::string GenerateTwoFactorCode(const std::string &secret,
                                           std::chrono::system_clock::time_point now) {
    const auto epoch_seconds = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch());
    const auto timestep = epoch_seconds.count() / 30;
    const auto data = secret + std::to_string(timestep);
    std::hash<std::string> hasher;
    const auto hash = static_cast<uint64_t>(hasher(data));
    const auto code = static_cast<uint32_t>(hash % 1000000);
    std::ostringstream oss;
    oss << std::setw(6) << std::setfill('0') << code;
    return oss.str();
  }

  static bool ValidateTwoFactorCode(const std::string &secret, const std::string &code) {
    const auto now = std::chrono::system_clock::now();
    const auto window = {0, -30, 30};
    for (int offset : window) {
      auto candidate_time = now + std::chrono::seconds(offset);
      if (GenerateTwoFactorCode(secret, candidate_time) == code) {
        return true;
      }
    }
    return false;
  }

  static std::string FormatDate(std::chrono::system_clock::time_point point, const char *format) {
    const auto time = std::chrono::system_clock::to_time_t(point);
    std::tm tm;
#ifdef _WIN32
    gmtime_s(&tm, &time);
#else
    gmtime_r(&time, &tm);
#endif
    char buffer[32];
    std::strftime(buffer, sizeof(buffer), format, &tm);
    return buffer;
  }

  static std::string FormatIso8601(std::chrono::system_clock::time_point point) {
    return FormatDate(point, "%Y-%m-%dT%H:%M:%SZ");
  }

  static std::string FormatDateOnly(std::chrono::system_clock::time_point point) {
    return FormatDate(point, "%Y-%m-%d");
  }

  static std::string NowIso8601() { return FormatIso8601(std::chrono::system_clock::now()); }

  static bool LooksLikeIsoDate(const std::string &value) {
    if (value.size() != 10) {
      return false;
    }
    for (size_t i = 0; i < value.size(); ++i) {
      if (i == 4 || i == 7) {
        if (value[i] != '-') {
          return false;
        }
      } else if (!std::isdigit(static_cast<unsigned char>(value[i]))) {
        return false;
      }
    }
    return true;
  }

  void RecordAudit(const std::string &actor_account_id, const std::string &action,
                   const std::string &entity, const json &metadata) {
    AuditEvent event;
    event.id = GenerateId("audit_");
    event.actor_account_id = actor_account_id;
    event.action = action;
    event.entity = entity;
    event.metadata = metadata;
    event.created_at = NowIso8601();
    audit_log_.push_back(event);
  }

  bool ApplyLicenceVerification(Profile &profile, const std::string &licence_number,
                                const std::string &insurance_provider,
                                const std::string &insurance_expiry, bool manual_approved,
                                json *audit_metadata) {
    const auto today = FormatDateOnly(std::chrono::system_clock::now());
    const LicenceRegistryEntry *registry_entry = nullptr;
    if (auto it = licence_registry_.find(licence_number); it != licence_registry_.end()) {
      registry_entry = &it->second;
    }

    std::string provider = insurance_provider;
    std::string expiry = insurance_expiry;
    if (registry_entry) {
      if (provider.empty()) {
        provider = registry_entry->insurance_provider;
      }
      if (expiry.empty()) {
        expiry = registry_entry->insurance_expiry;
      }
    }

    profile.compliance.licence_number = licence_number;
    profile.compliance.insurance_provider = provider;
    profile.compliance.insurance_expiry = expiry;

    const bool registry_present = registry_entry != nullptr;
    const bool registry_active = registry_entry && registry_entry->active;
    const bool state_match = registry_entry && CaseInsensitiveEquals(registry_entry->state, profile.state);
    const bool holder_match = registry_entry && CaseInsensitiveEquals(registry_entry->holder_name, profile.name);
    const bool insurance_format_valid = !expiry.empty() && LooksLikeIsoDate(expiry);
    const bool insurance_current = insurance_format_valid && expiry >= today;
    const bool provider_match = registry_entry && !provider.empty() &&
                                CaseInsensitiveEquals(registry_entry->insurance_provider, provider);

    const bool final_verified = manual_approved && registry_present && registry_active && state_match &&
                                holder_match && insurance_current;

    profile.compliance.licence_verified = final_verified;
    profile.compliance.last_verified_at = final_verified ? NowIso8601() : std::string{};
    profile.verified = final_verified && profile.compliance.kyc_verified;

    if (audit_metadata) {
      *audit_metadata = json{{"licence_number", licence_number},
                             {"registry_present", registry_present},
                             {"registry_active", registry_active},
                             {"state_match", state_match},
                             {"holder_match", holder_match},
                             {"insurance_format_valid", insurance_format_valid},
                             {"insurance_current", insurance_current},
                             {"provider_match", provider_match},
                             {"manual_override", manual_approved},
                             {"verification_brand", "ConveySafe Assurance"},
                             {"status", final_verified ? "verified" : "rejected"}};
    }
    return final_verified;
  }

  void RegisterSeedAccount(const std::string &profile_id, const std::string &email,
                           const std::string &name, const std::string &role,
                           const std::string &state, const std::string &suburb, bool verified,
                           const std::string &licence_number, const std::string &insurance_provider,
                           const std::string &insurance_expiry) {
    Account account;
    account.id = GenerateId("acct_");
    account.email = email;
    account.password = "changeme";
    account.role = role;
    account.full_name = name;
    account.two_factor_secret = GenerateSecret();

    Profile profile;
    profile.id = profile_id;
    profile.account_id = account.id;
    profile.name = name;
    profile.email = email;
    profile.role = role;
    profile.state = state;
    profile.suburb = suburb;
    profile.biography = "Specialists in complex property settlements.";
    profile.compliance.kyc_verified = verified;
    profile.verified = false;
    if (!licence_number.empty()) {
      ApplyLicenceVerification(profile, licence_number, insurance_provider, insurance_expiry, verified,
                               nullptr);
    }
    profile.verified = profile.compliance.licence_verified && profile.compliance.kyc_verified;
    profile.services = {"Residential", "Commercial", "Off-the-plan"};
    profile.specialties = {"Title searches", "Contract reviews"};

    accounts_[account.id] = account;
    account_by_email_[email] = account.id;
    profiles_[profile.id] = profile;
    profile_by_account_[account.id] = profile.id;
  }

  mutable std::mutex mutex_;
  std::unordered_map<std::string, Account> accounts_;
  std::unordered_map<std::string, Profile> profiles_;
  std::unordered_map<std::string, std::string> account_by_email_;
  std::unordered_map<std::string, std::string> profile_by_account_;
  std::unordered_map<std::string, std::vector<Review>> reviews_;
  std::unordered_map<std::string, PendingTwoFactor> pending_two_factor_;
  std::unordered_set<std::string> active_sessions_;
  std::unordered_map<std::string, LicenceRegistryEntry> licence_registry_;
  std::vector<AuditEvent> audit_log_;
};

IdentityStore &Store() {
  static IdentityStore store;
  return store;
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

  security::AttachStandardHandlers(server, "identity");
  security::ExposeMetrics(server, "identity");

  server.Get("/healthz", [](const httplib::Request &, httplib::Response &res) {
    res.set_content("{\"ok\":true}", "application/json");
  });

  server.Get("/profiles", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "identity", "list_profiles")) {
      return;
    }
    json response = json::array();
    for (const auto &profile : Store().AllProfiles()) {
      response.push_back(Store().BuildProfileJson(profile));
    }
    res.set_content(response.dump(), "application/json");
  });

  server.Get("/profiles/search", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "identity",
                               "search_profiles")) {
      return;
    }
    std::optional<std::string> query;
    std::optional<std::string> state;
    bool verified_only = false;

    if (req.has_param("q")) {
      query = req.get_param_value("q");
    }
    if (req.has_param("state")) {
      state = req.get_param_value("state");
    }
    if (req.has_param("verified")) {
      verified_only = req.get_param_value("verified") == "true";
    }

    json response = json::array();
    for (const auto &profile : Store().SearchProfiles(query, state, verified_only)) {
      auto payload = Store().BuildProfileJson(profile);
      payload["reviews"] = json::array();
      for (const auto &review : Store().GetReviews(profile.id)) {
        payload["reviews"].push_back(Store().BuildReviewJson(review));
      }
      response.push_back(payload);
    }

    res.set_content(response.dump(), "application/json");
  });

  server.Get(R"(/profiles/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "conveyancer", "admin"}, "identity",
                               "profile_detail")) {
      return;
    }
    const auto profile_id = req.matches[1];
    if (auto profile = Store().GetProfile(profile_id)) {
      auto payload = Store().BuildProfileJson(*profile);
      payload["reviews"] = json::array();
      for (const auto &review : Store().GetReviews(profile_id)) {
        payload["reviews"].push_back(Store().BuildReviewJson(review));
      }
      res.set_content(payload.dump(), "application/json");
      return;
    }
    res.status = 404;
    res.set_content(R"({"error":"profile_not_found"})", "application/json");
  });

  server.Post(R"(/profiles/([\w_-]+)/kyc)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "identity", "update_kyc")) {
      return;
    }
    const auto profile_id = req.matches[1];
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"reference", "approved"})) {
      return;
    }
    const auto reference = payload["reference"].get<std::string>();
    const auto approved = payload["approved"].get<bool>();
    if (!Store().UpdateKycStatus(profile_id, reference, approved)) {
      res.status = 404;
      res.set_content(R"({"error":"profile_not_found"})", "application/json");
      return;
    }
    res.set_content(R"({"ok":true})", "application/json");
  });

  server.Post(R"(/profiles/([\w_-]+)/verification)",
              [](const httplib::Request &req, httplib::Response &res) {
                if (!security::Authorize(req, res, "identity")) {
                  return;
                }
                if (!security::RequireRole(req, res, {"admin"}, "identity", "verify_profile")) {
                  return;
                }
                const auto profile_id = req.matches[1];
                auto payload = ParseJson(req, res);
                if (res.status == 400 && !res.body.empty()) {
                  return;
                }
                if (!RequireFields(payload, res,
                                   {"licence_number", "insurance_provider", "insurance_expiry",
                                    "licence_verified"})) {
                  return;
                }
                const auto licence_number = payload["licence_number"].get<std::string>();
                const auto insurance_provider = payload["insurance_provider"].get<std::string>();
                const auto insurance_expiry = payload["insurance_expiry"].get<std::string>();
                const auto licence_verified = payload["licence_verified"].get<bool>();
                if (!Store().UpdateLicence(profile_id, licence_number, insurance_provider,
                                           insurance_expiry, licence_verified)) {
                  res.status = 404;
                  res.set_content(R"({"error":"profile_not_found"})", "application/json");
                  return;
                }
                res.set_content(R"({"ok":true})", "application/json");
              });

  server.Patch(R"(/profiles/([\w_-]+))", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"conveyancer", "admin"}, "identity",
                               "update_profile")) {
      return;
    }
    const auto profile_id = req.matches[1];
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!payload.contains("biography")) {
      res.status = 400;
      res.set_content(R"({"error":"missing_field","field":"biography"})", "application/json");
      return;
    }
    auto biography = payload.value("biography", std::string{});
    auto services = payload.value("services", std::vector<std::string>{});
    auto specialties = payload.value("specialties", std::vector<std::string>{});
    auto suburb = payload.value("suburb", std::string{});
    if (!Store().UpdateProfile(profile_id, biography, services, specialties, suburb)) {
      res.status = 404;
      res.set_content(R"({"error":"profile_not_found"})", "application/json");
      return;
    }
    res.set_content(R"({"ok":true})", "application/json");
  });

  server.Post(R"(/profiles/([\w_-]+)/reviews)", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"buyer", "seller", "admin"}, "identity",
                               "create_review")) {
      return;
    }
    const auto profile_id = req.matches[1];
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"author_name", "rating", "comment", "role"})) {
      return;
    }
    const auto rating = payload["rating"].get<int>();
    if (rating < 1 || rating > 5) {
      res.status = 400;
      res.set_content(R"({"error":"invalid_rating"})", "application/json");
      return;
    }
    if (!Store().AddReview(profile_id, payload["author_name"].get<std::string>(),
                           payload["role"].get<std::string>(), rating,
                           payload["comment"].get<std::string>())) {
      res.status = 404;
      res.set_content(R"({"error":"profile_not_found"})", "application/json");
      return;
    }
    res.set_content(R"({"ok":true})", "application/json");
  });

  server.Post("/auth/register", [](const httplib::Request &req, httplib::Response &res) {
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"email", "password", "role", "full_name", "state", "suburb"})) {
      return;
    }
    const auto role = payload["role"].get<std::string>();
    static const std::unordered_set<std::string> allowed_roles{"buyer", "seller", "conveyancer", "admin"};
    if (allowed_roles.count(role) == 0) {
      res.status = 400;
      res.set_content(R"({"error":"invalid_role"})", "application/json");
      return;
    }
    try {
      const auto account_id = Store().RegisterAccount(
          payload["email"].get<std::string>(), payload["password"].get<std::string>(), role,
          payload["full_name"].get<std::string>(), payload["state"].get<std::string>(),
          payload["suburb"].get<std::string>(),
          payload.value("services", std::vector<std::string>{}),
          payload.value("specialties", std::vector<std::string>{}),
          payload.value("biography", std::string{""}));

      const auto preview_code = Store().PreviewTwoFactorCode(account_id);
      res.set_content(json{{"account_id", account_id},
                           {"two_factor_preview", preview_code},
                           {"status", "pending_verification"}}
                          .dump(),
                      "application/json");
    } catch (const std::exception &ex) {
      if (std::string(ex.what()) == "account_exists") {
        res.status = 409;
        res.set_content(R"({"error":"account_exists"})", "application/json");
        return;
      }
      res.status = 500;
      res.set_content(R"({"error":"registration_failed"})", "application/json");
    }
  });

  server.Post("/auth/login", [](const httplib::Request &req, httplib::Response &res) {
    auto payload = ParseJson(req, res);
    if (res.status == 400 && !res.body.empty()) {
      return;
    }
    if (!RequireFields(payload, res, {"email", "password"})) {
      return;
    }
    const auto email = payload["email"].get<std::string>();
    const auto password = payload["password"].get<std::string>();
    const auto account = Store().Authenticate(email, password);
    if (!account) {
      res.status = 401;
      res.set_content(R"({"error":"invalid_credentials"})", "application/json");
      return;
    }
    const auto existing_token = payload.value("two_factor_token", std::string{});
    const auto code = payload.value("two_factor_code", std::string{});
    if (!existing_token.empty() && !code.empty()) {
      std::string session_token;
      json preview;
      if (Store().VerifyTwoFactor(existing_token, code, &session_token, &preview)) {
        res.set_content(json{{"status", "authenticated"}, {"session_token", session_token}}.dump(),
                        "application/json");
        return;
      }
      res.status = 401;
      res.set_content(json{{"error", "invalid_two_factor"}, {"metadata", preview}}.dump(),
                      "application/json");
      return;
    }

    const auto token = Store().IssueTwoFactorChallenge(account->id);
    const auto preview_code = Store().PreviewTwoFactorCode(account->id);
    res.status = 202;
    res.set_content(json{{"status", "requires_two_factor"},
                         {"two_factor_token", token},
                         {"preview_code", preview_code}}
                        .dump(),
                    "application/json");
  });

  server.Get("/admin/audit", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "identity", "view_audit")) {
      return;
    }
    res.set_content(Store().ListAuditEvents().dump(), "application/json");
  });

  server.Get("/admin/compliance/alerts", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "identity", "compliance_alerts")) {
      return;
    }
    res.set_content(Store().ListComplianceAlerts().dump(), "application/json");
  });

  server.Post("/admin/audit/purge", [](const httplib::Request &req, httplib::Response &res) {
    if (!security::Authorize(req, res, "identity")) {
      return;
    }
    if (!security::RequireRole(req, res, {"admin"}, "identity", "purge_audit")) {
      return;
    }
    json payload = json::object();
    if (!req.body.empty()) {
      payload = ParseJson(req, res);
      if (res.status == 400 && !res.body.empty()) {
        return;
      }
    }
    const auto retention_days = payload.value("retention_days", 365);
    res.set_content(Store().PurgeAuditLog(retention_days).dump(), "application/json");
  });

  constexpr auto kBindAddress = "0.0.0.0";
  constexpr int kPort = 7001;
  std::cout << "Identity service listening on " << kBindAddress << ":" << kPort << "\n";
  server.listen(kBindAddress, kPort);
  return 0;
}
