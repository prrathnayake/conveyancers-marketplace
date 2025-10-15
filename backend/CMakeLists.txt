cmake_minimum_required(VERSION 3.20)
project(conveyancers_backend CXX)

set(CMAKE_CXX_STANDARD 20)
add_subdirectory(gateway)
add_subdirectory(services/identity)
add_subdirectory(services/jobs)
add_subdirectory(services/payments)
