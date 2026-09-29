#include "SettingsService.h"

#include <Notepad_plus_msgs.h>

#include <algorithm>
#include <filesystem>
#include <iterator>
#include <string_view>
#include <vector>

namespace mpp {

SettingsService::SettingsService(HWND notepadWindow) : notepadWindow_(notepadWindow) {}

Settings SettingsService::Load() const {
  const std::wstring path = ConfigPath();
  std::wstring readPath = path;
  if (GetFileAttributesW(readPath.c_str()) == INVALID_FILE_ATTRIBUTES) {
    readPath = LegacyConfigPath();
    if (GetFileAttributesW(readPath.c_str()) == INVALID_FILE_ATTRIBUTES) readPath = LegacyFlatConfigPath();
  }
  Settings settings;
  settings.autoRefresh = ReadBool(readPath, L"autoRefresh", settings.autoRefresh);
  settings.debounceMilliseconds = std::max(100u, ReadUnsigned(readPath, L"debounceMilliseconds", settings.debounceMilliseconds, 1000));
  settings.theme = [&] {
    const std::wstring value = ReadString(readPath, L"theme", L"system");
    if (value == L"light") return std::string{"light"};
    if (value == L"dark") return std::string{"dark"};
    return std::string{"system"};
  }();
  const std::wstring overrideValue = ReadString(readPath, L"formatOverride", L"auto");
  if (overrideValue == L"markdown" || overrideValue == L"mermaid" || overrideValue == L"plantuml" || overrideValue == L"html" ||
      overrideValue == L"svg" || overrideValue == L"json" || overrideValue == L"yaml" || overrideValue == L"xml" ||
      overrideValue == L"csv" || overrideValue == L"tsv" || overrideValue == L"openapi" || overrideValue == L"pdf" ||
      overrideValue == L"image" || overrideValue == L"plain-text") {
    settings.formatOverride.clear();
    for (const wchar_t character : overrideValue) settings.formatOverride.push_back(static_cast<char>(character));
  }
  settings.showFrontMatter = ReadBool(readPath, L"showFrontMatter", settings.showFrontMatter);
  settings.showTableOfContents = ReadBool(readPath, L"showTableOfContents", settings.showTableOfContents);
  settings.rawHtml = ReadBool(readPath, L"rawHtml", settings.rawHtml);
  settings.remoteImages = ReadBool(readPath, L"remoteImages", settings.remoteImages);
  settings.mathAlternateDelimiters = ReadBool(readPath, L"mathAlternateDelimiters", settings.mathAlternateDelimiters);
  settings.codeWrapping = ReadBool(readPath, L"codeWrapping", settings.codeWrapping);
  settings.maximumDocumentMegabytes = std::max(1u, ReadUnsigned(readPath, L"maximumDocumentMegabytes", settings.maximumDocumentMegabytes, 5));
  settings.maximumStructuredMegabytes = std::max(1u, ReadUnsigned(readPath, L"maximumStructuredMegabytes", settings.maximumStructuredMegabytes, 5));
  settings.maximumCsvRows = std::max(1u, ReadUnsigned(readPath, L"maximumCsvRows", settings.maximumCsvRows, 100000));
  settings.maximumCsvColumns = std::max(1u, ReadUnsigned(readPath, L"maximumCsvColumns", settings.maximumCsvColumns, 1000));
  settings.maximumCsvCellKilobytes = std::max(1u, ReadUnsigned(readPath, L"maximumCsvCellKilobytes", settings.maximumCsvCellKilobytes, 4096));
  settings.maximumResourceMegabytes = std::max(1u, ReadUnsigned(readPath, L"maximumResourceMegabytes", settings.maximumResourceMegabytes, 512));
  return settings;
}

bool SettingsService::Save(const Settings& settings) const {
  const std::wstring path = ConfigPath();
  const std::filesystem::path directory(path);
  std::error_code error;
  std::filesystem::create_directories(directory.parent_path(), error);
  if (error) return false;
  const std::wstring theme(settings.theme.begin(), settings.theme.end());
  return WritePrivateProfileStringW(L"preview", L"autoRefresh", settings.autoRefresh ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"debounceMilliseconds", std::to_wstring(settings.debounceMilliseconds).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"theme", theme.c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"formatOverride", std::wstring(settings.formatOverride.begin(), settings.formatOverride.end()).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"showFrontMatter", settings.showFrontMatter ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"showTableOfContents", settings.showTableOfContents ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"rawHtml", settings.rawHtml ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"remoteImages", settings.remoteImages ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"mathAlternateDelimiters", settings.mathAlternateDelimiters ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"codeWrapping", settings.codeWrapping ? L"1" : L"0", path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumDocumentMegabytes", std::to_wstring(settings.maximumDocumentMegabytes).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumStructuredMegabytes", std::to_wstring(settings.maximumStructuredMegabytes).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumCsvRows", std::to_wstring(settings.maximumCsvRows).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumCsvColumns", std::to_wstring(settings.maximumCsvColumns).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumCsvCellKilobytes", std::to_wstring(settings.maximumCsvCellKilobytes).c_str(), path.c_str()) != FALSE &&
         WritePrivateProfileStringW(L"preview", L"maximumResourceMegabytes", std::to_wstring(settings.maximumResourceMegabytes).c_str(), path.c_str()) != FALSE;
}

std::wstring SettingsService::ConfigPath() const {
  return PluginConfigDirectory() + L"\\NotepadViewerPlus.ini";
}

std::wstring SettingsService::LegacyConfigPath() const {
  return LegacyPluginConfigDirectory() + L"\\MarkdownPreviewPlus\\MarkdownPreviewPlus.ini";
}

std::wstring SettingsService::LegacyFlatConfigPath() const {
  return LegacyPluginConfigDirectory() + L"\\MarkdownPreviewPlus.ini";
}

std::wstring SettingsService::PluginConfigDirectory() const {
  // NPPM_GETPLUGINSCONFIGDIR returns the required character count only when
  // queried with a null output buffer; the subsequent copy call returns BOOL.
  const LRESULT required = SendMessageW(notepadWindow_, NPPM_GETPLUGINSCONFIGDIR, 0, 0);
  if (required > 0 && required < 32768) {
    std::vector<wchar_t> buffer(static_cast<std::size_t>(required) + 1u, L'\0');
    if (SendMessageW(notepadWindow_, NPPM_GETPLUGINSCONFIGDIR,
                     static_cast<WPARAM>(buffer.size()), reinterpret_cast<LPARAM>(buffer.data())) != FALSE) {
      const auto terminator = std::find(buffer.cbegin(), buffer.cend(), L'\0');
      if (terminator != buffer.cend()) return std::wstring(buffer.cbegin(), terminator) + L"\\NotepadViewerPlus";
    }
  }

  std::vector<wchar_t> localAppData(1024);
  for (int attempt = 0; attempt < 6; ++attempt) {
    const DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData.data(), static_cast<DWORD>(localAppData.size()));
    if (length == 0) break;
    if (length < localAppData.size() - 1) return std::wstring(localAppData.data(), length) + L"\\NotepadViewerPlus";
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

std::wstring SettingsService::LegacyPluginConfigDirectory() const {
  const std::wstring current = PluginConfigDirectory();
  constexpr std::wstring_view suffix = L"\\NotepadViewerPlus";
  if (current.size() >= suffix.size() && current.compare(current.size() - suffix.size(), suffix.size(), suffix) == 0) {
    return current.substr(0, current.size() - suffix.size());
  }
  return current;
}

std::wstring SettingsService::ReadString(const std::wstring& path, const wchar_t* key, const wchar_t* fallback) {
  wchar_t buffer[64]{};
  GetPrivateProfileStringW(L"preview", key, fallback, buffer, static_cast<DWORD>(std::size(buffer)), path.c_str());
  return buffer;
}

}  // namespace mpp
