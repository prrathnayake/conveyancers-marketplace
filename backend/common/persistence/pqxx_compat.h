#pragma once

#if defined(__cpp_lib_source_location)
#undef __cpp_lib_source_location
#endif
#define __cpp_lib_source_location 0

#ifndef pqxx_have_source_location
#define pqxx_have_source_location 0
#endif

#include <pqxx/pqxx>

#if __has_include(<pqxx/zview>)
#include <pqxx/zview>
#else
#include <cstddef>
#include <cstring>
#include <string>

namespace pqxx {

class zview {
public:
  constexpr zview() noexcept : m_data{""}, m_size{0} {}
  constexpr explicit zview(char const *text) noexcept
      : m_data{text ? text : ""},
        m_size{text ? std::char_traits<char>::length(text) : std::size_t{0}} {}
  zview(std::string const &text) noexcept
      : m_data{text.c_str()}, m_size{text.size()} {}

  constexpr char const *data() const noexcept { return m_data; }
  constexpr char const *c_str() const noexcept { return m_data; }
  constexpr std::size_t size() const noexcept { return m_size; }

private:
  char const *m_data;
  std::size_t m_size;
};

} // namespace pqxx

#endif
