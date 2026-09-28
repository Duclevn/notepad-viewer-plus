#pragma once

#include <windows.h>

#include <string>

namespace mpp {

struct Settings {
  bool autoRefresh{true};
  unsigned debounceMilliseconds{250};
  std::string theme{"system"};
  bool showFrontMatter{true};
  bool showTableOfContents{false};
  bool rawHtml{true};
  bool remoteImages{false};
  bool mathAlternateDelimiters{false};
  bool codeWrapping{true};
  unsigned maximumDocumentMegabytes{5};
};

class SettingsService final {
 public:
  explicit SettingsService(HWND notepadWindow);

  Settings Load() const;
  bool Save(const Settings& settings) const;

 private:
  std::wstring ConfigPath() const;
  std::wstring PluginConfigDirectory() const;
  static bool ReadBool(const std::wstring& path, const wchar_t* key, bool fallback);
  static unsigned ReadUnsigned(const std::wstring& path, const wchar_t* key, unsigned fallback, unsigned maximum);
  static std::wstring ReadString(const std::wstring& path, const wchar_t* key, const wchar_t* fallback);

  HWND notepadWindow_{};
};

}  // namespace mpp
