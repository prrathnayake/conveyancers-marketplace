cmake_minimum_required(VERSION 3.20)

add_library(common_persistence
    persistence/postgres.cpp
    persistence/accounts_repository.cpp
    persistence/audit_repository.cpp
    persistence/jobs_repository.cpp
    persistence/escrow_repository.cpp)

find_package(PkgConfig REQUIRED)
pkg_check_modules(PQXX REQUIRED libpqxx)

find_package(OpenSSL REQUIRED)

set_target_properties(common_persistence PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED YES)

target_include_directories(common_persistence
    PUBLIC
      ${CMAKE_CURRENT_SOURCE_DIR}
      ${CMAKE_CURRENT_SOURCE_DIR}/../third_party
      ${PQXX_INCLUDE_DIRS})

target_link_libraries(common_persistence
    PUBLIC
      OpenSSL::Crypto
      ${PQXX_LIBRARIES})

