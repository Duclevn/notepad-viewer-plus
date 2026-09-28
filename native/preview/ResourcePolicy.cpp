#include "ResourcePolicy.h"

#include <windows.h>

#include <algorithm>
#include <cctype>
#include <cwctype>
#include <filesystem>
#include <string_view>

namespace mpp {

bool ResourcePolicy::SetDocumentDirectory(std::string token, std::wstring directory) {
  if (token.empty() || token.size() > 256 || directory.empty()) return false;
  std::error_code error;
  const auto canonical = std::filesystem::weakly_canonical(directory, error);
  if (error || !std::filesystem::is_directory(canonical, error)) return false;
  directories_[std::move(token)] = canonical.wstring();
  return true;
}

bool ResourcePolicy::ResolveRelative(std::string_view token, std::string_view relative, std::wstring& absolute) const {
  if (!IsSafeRelative(relative)) return false;
  const auto directory = directories_.find(std::string(token));
  if (directory == directories_.end()) return false;
  const std::string decoded = PercentDecode(relative);
  const std::size_t suffix = decoded.find_first_of("?#");
  const std::string pathOnly = decoded.substr(0, suffix == std::string::npos ? decoded.size() : suffix);
  if (!IsSafeRelative(pathOnly)) return false;
  const std::wstring wideRelative = Utf8ToWide(pathOnly);
  if (wideRelative.empty()) return false;
  std::error_code error;
  const auto candidate = std::filesystem::weakly_canonical(std::filesystem::path(directory->second) / wideRelative, error);
  if (error || !IsWithinDirectory(candidate.wstring(), directory->second)) return false;
  absolute = candidate.wstring();
  return true;
}

bool ResourcePolicy::ResolveDocumentUri(std::wstring_view uri, std::wstring& absolute) const {
  constexpr std::wstring_view prefix = L"https://doc.local/resource/";
  if (uri.rfind(prefix, 0) != 0) return false;
  const std::wstring_view rest = uri.substr(prefix.size());
  const std::size_t slash = rest.find(L'/');
  if (slash == std::wstring_view::npos || slash == 0 || slash + 1 >= rest.size()) return false;
  std::string token;
  std::string relative;
  token.reserve(slash);
  relative.reserve(rest.size() - slash - 1);
  for (std::size_t index = 0; index < rest.size(); ++index) {
    const wchar_t character = rest[index];
    if (character > 0x7f) return false;
    if (index < slash) token.push_back(static_cast<char>(character));
    else if (index > slash) relative.push_back(static_cast<char>(character));
  }
  return ResolveRelative(token, relative, absolute);
}

std::wstring ResourcePolicy::Utf8ToWide(std::string_view value) {
  if (value.empty()) return {};
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) return {};
  std::wstring result(static_cast<std::size_t>(size), L'\0');
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size) <= 0) return {};
  return result;
}

std::string ResourcePolicy::PercentDecode(std::string_view value) {
  std::string decoded;
  decoded.reserve(value.size());
  for (std::size_t index = 0; index < value.size(); ++index) {
    if (value[index] != '%' || index + 2 >= value.size()) {
      decoded.push_back(value[index]);
      continue;
    }
    const auto hex = [](char character) -> int {
      if (character >= '0' && character <= '9') return character - '0';
      if (character >= 'a' && character <= 'f') return character - 'a' + 10;
      if (character >= 'A' && character <= 'F') return character - 'A' + 10;
      return -1;
    };
    const int high = hex(value[index + 1]);
    const int low = hex(value[index + 2]);
    if (high < 0 || low < 0) return {};
    decoded.push_back(static_cast<char>((high << 4) | low));
    index += 2;
  }
  return decoded;
}

bool ResourcePolicy::IsSafeRelative(std::string_view value) {
  if (value.empty() || value.front() == '/' || value.front() == '\\' || value.rfind("//", 0) == 0) return false;
  if (value.find(':') != std::string_view::npos || value.find('\0') != std::string_view::npos) return false;
  std::size_t start = 0;
  while (start < value.size()) {
    const std::size_t slash = value.find_first_of("/\\?#", start);
    const auto segment = value.substr(start, slash == std::string_view::npos ? value.size() - start : slash - start);
    if (segment == "..") return false;
    if (slash == std::string_view::npos || value[slash] == '?' || value[slash] == '#') break;
    start = slash + 1;
  }
  return true;
}

bool ResourcePolicy::IsWithinDirectory(const std::wstring& candidate, const std::wstring& directory) {
  if (candidate.size() < directory.size()) return false;
  auto lower = [](wchar_t character) { return static_cast<wchar_t>(std::towlower(character)); };
  for (std::size_t index = 0; index < directory.size(); ++index) {
    if (lower(candidate[index]) != lower(directory[index])) return false;
  }
  return candidate.size() == directory.size() || candidate[directory.size()] == L'\\' || candidate[directory.size()] == L'/';
}

}  // namespace mpp
