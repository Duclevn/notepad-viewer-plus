#include "SettingsService.h"

#include <Notepad_plus_msgs.h>

#include <filesystem>
#include <iterator>
#include <vector>

namespace mpp {

SettingsService::SettingsService(HWND notepadWindow) : notepadWindow_(notepadWindow) {}

Settings SettingsService::Load() const {
  const std::wstring path = ConfigPath();
  Settings settings;
  settings.autoRefresh = ReadBool(path, L"autoRefresh", settings.autoRefresh);
  settings.debounceMilliseconds = ReadUnsigned(path, L"debounceMilliseconds", settings.debounceMilliseconds, 1000);
  settings.theme = [&] {
    const std::wstring value = ReadString(path, L"theme", L"system");
    if (value == L"light") return std::string{"light"};
    if (value == L"dark") return std::string{"dark"};
    return std::string{"system"};
  }();
  settings.showFrontMatter = ReadBool(path, L"showFrontMatter", settings.showFrontMatter);
  settings.showTableOfContents = ReadBool(path, L"showTableOfContents", settings.showTableOfContents);
  settings.rawHtml = ReadBool(path, L"rawHtml", settings.rawHtml);
  settings.remoteImages = ReadBool(path, L"remoteImages", settings.remoteImages);
  settings.mathAlternateDelimiters = ReadBool(path, L"mathAlternateDelimiters", settings.mathAlternateDelimiters);
  settings.codeWrapping = ReadBool(path, L"codeWrapping", settings.codeWrapping);
  settings.maximumDocumentMegabytes = ReadUnsigned(path, L"maximumDocumentMegabytes", settings.maximumDocumentMegabytes, 5);
  return settings;
}

bool SettingsService::Save(const Settings& settings) const {
  const std::wstring path = ConfigPath();
  const std::filesystem::path directory(path);
  std::error_code error;
  std::filesystem::create_directories(directory.parent_path(), error);
  if (error) return false;
  return WritePrivateProfileStringW(L"preview", L"autoRefresh", settings.autoRefresh ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"debounceMilliseconds", std::to_wstring(settings.debounceMilliseconds).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"theme", std::wstring(settings.theme.begin(), settings.theme.end()).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"showFrontMatter", settings.showFrontMatter ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"showTableOfContents", settings.showTableOfContents ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"rawHtml", settings.rawHtml ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"remoteImages", settings.remoteImages ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"mathAlternateDelimiters", settings.mathAlternateDelimiters ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"codeWrapping", settings.codeWrapping ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumDocumentMegabytes", std::to_wstring(settings.maximumDocumentMegabytes).c_str(), path.c_str()) != FALSE;
}

std::wstring SettingsService::ConfigPath() const {
  return PluginConfigDirectory() + L"\\MarkdownPreviewPlus.ini";
}

std::wstring SettingsService::PluginConfigDirectory() const {
  std::vector<wchar_t> buffer(1024);
  for (int attempt = 0; attempt < 6; ++attempt) {
    const LRESULT length = SendMessageW(notepadWindow_, NPPM_GETPLUGINSCONFIGDIR,
                                        static_cast<WPARAM>(buffer.size()), reinterpret_cast<LPARAM>(buffer.data()));
    if (length > 0 && static_cast<std::size_t>(length) < buffer.size() - 1) {
      return std::wstring(buffer.data(), static_cast<std::size_t>(length)) + L"\\MarkdownPreviewPlus";
    }
    buffer.resize(buffer.size() * 2);
  }

  std::vector<wchar_t> localAppData(1024);
  for (int attempt = 0; attempt < 6; ++attempt) {
    const DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData.data(), static_cast<DWORD>(localAppData.size()));
    if (length == 0) break;
    if (length < localAppData.size() - 1) return std::wstring(localAppData.data(), length) + L"\\MarkdownPreviewPlus";
    localAppData.resize(localAppData.size() * 2);
  }
  return L".";
}

bool SettingsService::ReadBool(const std::wstring& path, const wchar_t* key, bool fallback) {
  return GetPrivateProfileIntW(L"preview", key, fallback ? 1 : 0, path.c_str()) != 0;
}

unsigned SettingsService::ReadUnsigned(const std::wstring& path, const wchar_t* key, unsigned fallback, unsigned maximum) {
  const unsigned value = static_cast<unsigned>(GetPrivateProfileIntW(L"preview", key, fallback, path.c_str()));
  return value > maximum ? maximum : value;
}

std::wstring SettingsService::ReadString(const std::wstring& path, const wchar_t* key, const wchar_t* fallback) {
  wchar_t buffer[64]{};
  GetPrivateProfileStringW(L"preview", key, fallback, buffer, static_cast<DWORD>(std::size(buffer)), path.c_str());
  return buffer;
}

}  // namespace mpp
