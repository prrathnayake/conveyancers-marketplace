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
#include <algorithm>
#include <cstddef>
#include <cstring>
#include <string>
#include <string_view>

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
  constexpr bool empty() const noexcept { return m_size == 0; }
  constexpr char const *begin() const noexcept { return m_data; }
  constexpr char const *end() const noexcept { return m_data + m_size; }

  std::size_t copy(char *dest, std::size_t count, std::size_t pos = 0) const noexcept
  {
    if (pos >= m_size || count == 0) return 0;
    auto const rcount = std::min(count, m_size - pos);
    std::memcpy(dest, m_data + pos, rcount);
    return rcount;
  }

private:
  char const *m_data;
  std::size_t m_size;
};

template<> struct string_traits<zview>
{
  static constexpr bool converts_to_string{true};
  static constexpr bool converts_from_string{false};

  static constexpr bool is_null(zview const &) noexcept { return false; }

  static constexpr std::size_t size_buffer(zview const &value) noexcept
  {
    return value.size() + 1;
  }

  static char *into_buf(char *begin, char *end, zview const &value)
  {
    auto const size = value.size();
    if (begin + size + 1 > end)
      throw conversion_error{"Not enough buffer space to store this zview."};
    value.copy(begin, size);
    begin[size] = '\0';
    return begin + size + 1;
  }

  static std::string_view to_buf(char *begin, char *end, zview const &value)
  {
    char *const stop = into_buf(begin, end, value);
    return {begin, static_cast<std::size_t>(stop - begin - 1)};
  }

  static zview from_string(std::string_view) = delete;
};

} // namespace pqxx

#endif
