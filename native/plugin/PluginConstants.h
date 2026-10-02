#pragma once

#include <windows.h>
#include <cstddef>

namespace mpp {

inline constexpr wchar_t kPluginName[] = L"Notepad Viewer Plus";
inline constexpr wchar_t kAppHost[] = L"app.local";
inline constexpr wchar_t kDocumentHost[] = L"doc.local";
inline constexpr wchar_t kAppUrl[] = L"https://app.local/index.html";
inline constexpr unsigned kProtocolVersion = 2;
inline constexpr std::size_t kMaximumDocumentBytes = 5u * 1024u * 1024u;
inline constexpr std::size_t kMaximumResourceBytes = 512u * 1024u * 1024u;
inline constexpr UINT_PTR kDebounceTimerId = 0x4D505044;
inline constexpr UINT kDebounceMilliseconds = 250;

enum CommandId : int {
  TogglePreview = 0,
  RefreshPreview,
  ToggleAutoRefresh,
  ToggleTableOfContents,
  ThemeLight,
  ThemeDark,
  ThemeSystem,
  About,
  CommandCount
};

}  // namespace mpp
