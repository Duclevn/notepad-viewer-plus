#pragma once

#include "../bridge/PreviewResource.h"

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>

namespace mpp {

struct ResolvedResource {
  std::wstring absolutePath;
  std::string mediaType;
  std::size_t size{0};
  bool exactFile{false};
};

class ResourcePolicy final {
 public:
  bool SetDocumentDirectory(std::string token, std::wstring directory);
  std::optional<PreviewResource> RegisterExactFile(long long bufferId, unsigned long long generation,
                                                    const std::wstring& path, std::string mediaType,
                                                    std::size_t size);
  void ActivateDocument(long long bufferId, unsigned long long generation);
  void RevokeAll();

  bool ResolveRelative(std::string_view token, std::string_view relative, std::wstring& absolute) const;
  bool ResolveUri(std::wstring_view uri, ResolvedResource& resource) const;
  bool IsExactFileUri(std::wstring_view uri) const;

 private:
  struct ExactFileEntry {
    std::string token;
    long long bufferId{0};
    unsigned long long generation{0};
    std::wstring path;
    std::string mediaType;
    std::size_t size{0};
  };

  static std::wstring Utf8ToWide(std::string_view value);
  static std::string PercentDecode(std::string_view value);
  static std::string GenerateToken();
  static std::string MediaTypeForPath(const std::wstring& path);
  static bool IsAllowedMediaType(std::string_view value);
  static bool IsSafeToken(std::string_view value);
  static bool IsSafeRelative(std::string_view value);
  static bool IsWithinDirectory(const std::wstring& candidate, const std::wstring& directory);
  static bool IsRegularFile(const std::wstring& path, std::size_t* size = nullptr);

  std::unordered_map<std::string, std::wstring> directories_;
  std::optional<ExactFileEntry> exactFile_;
  long long activeBufferId_{0};
  unsigned long long activeGeneration_{0};
};

}  // namespace mpp
