cmake_minimum_required(VERSION 3.20)

include(FetchContent)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(repository_logic_test repository_logic_test.cpp)
set_target_properties(repository_logic_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED YES)
target_include_directories(repository_logic_test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../common
    ${CMAKE_CURRENT_SOURCE_DIR}/../third_party)
target_link_libraries(repository_logic_test PRIVATE GTest::gtest_main)

add_executable(gateway_http_test gateway_http_test.cpp)
set_target_properties(gateway_http_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED YES)
target_link_libraries(gateway_http_test PRIVATE GTest::gtest_main)
target_include_directories(gateway_http_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../gateway/src ${CMAKE_CURRENT_SOURCE_DIR}/../third_party)

include(GoogleTest)
gtest_discover_tests(repository_logic_test)
gtest_discover_tests(gateway_http_test)
