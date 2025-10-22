#pragma once

#if defined(__cpp_lib_source_location)
#undef __cpp_lib_source_location
#endif
#define __cpp_lib_source_location 0

#ifndef pqxx_have_source_location
#define pqxx_have_source_location 0
#endif

#include <pqxx/pqxx>
#include <pqxx/zview>
