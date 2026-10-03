#include "ResourcePolicy.h"

#include <windows.h>
#include <bcrypt.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cwctype>
#include <filesystem>
#include <limits>
#include <string_view>

namespace mpp {
namespace {

constexpr std::wstring_view kDocumentPrefix = L"https://doc.local/resource/";
constexpr std::wstring_view kExactFilePrefix = L"https://doc.local/file/";

std::string LowerAscii(std::string value) {
  for (char& character : value) {
    if (character >= 'A' && character <= 'Z') character = static_cast<char>(character - 'A' + 'a');
  }
  return value;
}

bool SamePath(const std::wstring& left, const std::wstring& right) {
  if (left.size() != right.size()) return false;
  for (std::size_t index = 0; index < left.size(); ++index) {
    if (std::towlower(left[index]) != std::towlower(right[index])) return false;
  }
  return true;
}

}  // namespace

bool ResourcePolicy::SetDocumentDirectory(std::string token, std::wstring directory) {
  if (!IsSafeToken(token) || directory.empty()) return false;
  std::error_code error;
  const auto canonical = std::filesystem::weakly_canonical(directory, error);
  if (error || !std::filesystem::is_directory(canonical, error)) return false;
  directories_[std::move(token)] = canonical.wstring();
  return true;
}

std::optional<PreviewResource> ResourcePolicy::RegisterExactFile(long long bufferId, unsigned long long generation,
                                                                   const std::wstring& path, std::string mediaType,
                                                                   std::size_t size) {
  if (!IsAllowedMediaType(mediaType) || path.empty()) return std::nullopt;
  std::error_code error;
  const auto canonical = std::filesystem::weakly_canonical(path, error);
  if (error || !std::filesystem::is_regular_file(canonical, error)) return std::nullopt;
  std::size_t actualSize = 0;
  if (!IsRegularFile(canonical.wstring(), &actualSize) || actualSize != size) return std::nullopt;

  std::string token;
  bool unique = false;
  for (int attempt = 0; attempt < 3; ++attempt) {
    token = GenerateToken();
    if (!token.empty() && (!exactFile_ || exactFile_->token != token)) {
      unique = true;
      break;
    }
  }
  if (!unique) return std::nullopt;

  exactFile_ = ExactFileEntry{token, bufferId, generation, canonical.wstring(), std::move(mediaType), actualSize};
  return PreviewResource{token, "https://doc.local/file/" + token, actualSize, exactFile_->mediaType};
}

void ResourcePolicy::ActivateDocument(long long bufferId, unsigned long long generation) {
  activeBufferId_ = bufferId;
  activeGeneration_ = generation;
  directories_.clear();
  exactFile_.reset();
}

void ResourcePolicy::RevokeAll() {
  directories_.clear();
  exactFile_.reset();
  activeBufferId_ = 0;
  activeGeneration_ = 0;
}

bool ResourcePolicy::ResolveRelative(std::string_view token, std::string_view relative, std::wstring& absolute) const {
  if (!IsSafeToken(token) || !IsSafeRelative(relative)) return false;
  const auto directory = directories_.find(std::string(token));
  if (directory == directories_.end()) return false;
  const std::string decoded = PercentDecode(relative);
  if (decoded.empty() && !relative.empty()) return false;
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

bool ResourcePolicy::ResolveUri(std::wstring_view uri, ResolvedResource& resource) const {
  if (uri.rfind(kExactFilePrefix, 0) == 0) {
    const std::wstring_view tokenWide = uri.substr(kExactFilePrefix.size());
    if (tokenWide.empty() || tokenWide.find_first_of(L"/?#") != std::wstring_view::npos) return false;
    std::string token;
    token.reserve(tokenWide.size());
    for (const wchar_t character : tokenWide) {
      if (character > 0x7f) return false;
      token.push_back(static_cast<char>(character));
    }
    if (!IsSafeToken(token) || !exactFile_ || exactFile_->token != token ||
        exactFile_->bufferId != activeBufferId_ || exactFile_->generation != activeGeneration_) return false;
    std::size_t actualSize = 0;
    if (!IsRegularFile(exactFile_->path, &actualSize) || actualSize != exactFile_->size) return false;
    resource = {exactFile_->path, exactFile_->mediaType, actualSize, true};
    return true;
  }

  if (uri.rfind(kDocumentPrefix, 0) != 0) return false;
  const std::wstring_view rest = uri.substr(kDocumentPrefix.size());
  const std::size_t slash = rest.find(L'/');
  if (slash == std::wstring_view::npos || slash == 0 || slash + 1 >= rest.size()) return false;
  std::string encodedToken;
  encodedToken.reserve(slash);
  for (const wchar_t character : rest.substr(0, slash)) {
    if (character > 0x7f) return false;
    encodedToken.push_back(static_cast<char>(character));
  }
  std::string relative;
  relative.reserve(rest.size() - slash - 1);
  for (const wchar_t character : rest.substr(slash + 1)) {
    if (character > 0x7f) return false;
    relative.push_back(static_cast<char>(character));
  }
  const std::string token = PercentDecode(encodedToken);
  std::wstring path;
  if (!ResolveRelative(token, relative, path)) return false;
  std::size_t size = 0;
  if (!IsRegularFile(path, &size)) return false;
  const std::string mediaType = MediaTypeForPath(path);
  if (mediaType.empty()) return false;
  resource = {std::move(path), mediaType, size, false};
  return true;
}

bool ResourcePolicy::IsExactFileUri(std::wstring_view uri) const {
  ResolvedResource resource;
  return ResolveUri(uri, resource) && resource.exactFile;
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

std::string ResourcePolicy::GenerateToken() {
  std::array<unsigned char, 16> bytes{};
  if (BCryptGenRandom(nullptr, bytes.data(), static_cast<ULONG>(bytes.size()), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) return {};
  constexpr char hex[] = "0123456789abcdef";
  std::string token;
  token.reserve(bytes.size() * 2);
  for (const unsigned char byte : bytes) {
    token.push_back(hex[byte >> 4]);
    token.push_back(hex[byte & 0x0f]);
  }
  return token;
}

std::string ResourcePolicy::MediaTypeForPath(const std::wstring& path) {
  std::wstring extension = std::filesystem::path(path).extension().wstring();
  std::string value;
  value.reserve(extension.size());
  for (const wchar_t character : extension) {
    if (character > 0x7f) return {};
    value.push_back(static_cast<char>(character));
  }
  value = LowerAscii(std::move(value));
  if (value == ".png") return "image/png";
  if (value == ".jpg" || value == ".jpeg") return "image/jpeg";
  if (value == ".gif") return "image/gif";
  if (value == ".webp") return "image/webp";
  if (value == ".bmp") return "image/bmp";
  if (value == ".ico") return "image/x-icon";
  if (value == ".avif") return "image/avif";
  if (value == ".css") return "text/css";
  if (value == ".txt" || value == ".md") return "text/plain";
  return {};
}

bool ResourcePolicy::IsAllowedMediaType(std::string_view value) {
  return value == "application/pdf" || value == "image/avif" || value == "image/bmp" || value == "image/gif" ||
         value == "image/jpeg" || value == "image/png" || value == "image/webp" || value == "image/x-icon" ||
         value == "text/css" || value == "text/plain";
}

bool ResourcePolicy::IsSafeToken(std::string_view value) {
  if (value.empty() || value.size() > 256) return false;
  for (const unsigned char character : value) {
    if (!(std::isalnum(character) != 0 || character == '.' || character == '_' || character == '-' || character == '~')) return false;
  }
  return true;
}

bool ResourcePolicy::IsSafeRelative(std::string_view value) {
  if (value.empty() || value.front() == '/' || value.front() == '\\' || value.rfind("//", 0) == 0) return false;
  if (value.find(':') != std::string_view::npos || value.find('\0') != std::string_view::npos) return false;
  for (const unsigned char character : value) {
    if (character < 0x20 || character == 0x7f) return false;
  }
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
  for (std::size_t index = 0; index < directory.size(); ++index) {
    if (std::towlower(candidate[index]) != std::towlower(directory[index])) return false;
  }
  return candidate.size() == directory.size() || candidate[directory.size()] == L'\\' || candidate[directory.size()] == L'/';
}

bool ResourcePolicy::IsRegularFile(const std::wstring& path, std::size_t* size) {
  std::error_code error;
  const auto filePath = std::filesystem::path(path);
  if (!std::filesystem::is_regular_file(filePath, error)) return false;
  const auto fileSize = std::filesystem::file_size(filePath, error);
  if (error || fileSize > (std::numeric_limits<std::size_t>::max)()) return false;
  if (size) *size = static_cast<std::size_t>(fileSize);
  return true;
}

}  // namespace mpp
