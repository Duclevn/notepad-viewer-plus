#pragma once

#include <string>
#include <string_view>
#include <unordered_map>

namespace mpp {

class ResourcePolicy final {
 public:
  bool SetDocumentDirectory(std::string token, std::wstring directory);
  bool ResolveRelative(std::string_view token, std::string_view relative, std::wstring& absolute) const;
  bool ResolveDocumentUri(std::wstring_view uri, std::wstring& absolute) const;

 private:
  static std::wstring Utf8ToWide(std::string_view value);
  static std::string PercentDecode(std::string_view value);
  static bool IsSafeRelative(std::string_view value);
  static bool IsWithinDirectory(const std::wstring& candidate, const std::wstring& directory);

  std::unordered_map<std::string, std::wstring> directories_;
};

}  // namespace mpp
