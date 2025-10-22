#pragma once

#include_next <pqxx/internal/cxx-features.hxx>

#undef pqxx_have_source_location
#define pqxx_have_source_location 0

#undef __cpp_lib_source_location
#define __cpp_lib_source_location 0
