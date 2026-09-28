#include "preview/ResourcePolicy.h"

#include <windows.h>

#include <filesystem>
#include <fstream>
#include <iostream>

bool RunResourcePolicyTests() {
  const std::filesystem::path directory = std::filesystem::temp_directory_path() / L"NotepadViewerPlus-resource-test";
  std::error_code error;
  std::filesystem::create_directories(directory, error);
  if (error) return false;
  const std::filesystem::path file = directory / L"sample.png";
  {
    std::ofstream output(file, std::ios::binary | std::ios::trunc);
    output << "png-test";
  }

  mpp::ResourcePolicy policy;
  policy.ActivateDocument(7, 3);
  if (!policy.SetDocumentDirectory("directory-token", directory.wstring())) {
    std::filesystem::remove_all(directory, error);
    return false;
  }
  mpp::ResolvedResource directoryResource;
  if (!policy.ResolveUri(L"https://doc.local/resource/directory-token/sample.png", directoryResource)) {
    std::cerr << "Directory resource did not resolve\n";
    std::filesystem::remove_all(directory, error);
    return false;
  }
  const auto resource = policy.RegisterExactFile(7, 3, file.wstring(), "image/png", 8);
  if (!resource) {
    std::filesystem::remove_all(directory, error);
    return false;
  }
  std::wstring token;
  for (const char character : resource->token) token.push_back(static_cast<wchar_t>(character));
  mpp::ResolvedResource resolved;
  if (!policy.ResolveUri(std::wstring(L"https://doc.local/file/") + token, resolved) ||
      !resolved.exactFile || resolved.size != 8) {
    std::cerr << "Exact resource did not resolve\n";
    std::filesystem::remove_all(directory, error);
    return false;
  }
  policy.ActivateDocument(7, 4);
  if (policy.ResolveUri(L"https://doc.local/resource/directory-token/sample.png", resolved)) {
    std::cerr << "Stale directory resource resolved after generation change\n";
    std::filesystem::remove_all(directory, error);
    return false;
  }
  if (policy.ResolveUri(std::wstring(L"https://doc.local/file/") + token, resolved)) {
    std::cerr << "Stale exact resource resolved after generation change\n";
    std::filesystem::remove_all(directory, error);
    return false;
  }
  std::filesystem::remove_all(directory, error);
  return true;
}
