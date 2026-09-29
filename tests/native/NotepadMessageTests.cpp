#include "plugin/DocumentCoordinator.h"
#include "settings/SettingsService.h"

#include <Notepad_plus_msgs.h>

#include <algorithm>
#include <filesystem>
#include <iostream>
#include <string>
#include <utility>

namespace {

constexpr wchar_t kWindowClass[] = L"NotepadViewerPlusMessageTest";
const std::wstring kDocumentPath = L"C:\\fixtures\\syntax-showcase.md";
std::wstring g_configDirectory;

LRESULT CALLBACK TestWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  if (message == NPPM_GETFULLCURRENTPATH) {
    if (lParam == 0 || wParam <= kDocumentPath.size()) return FALSE;
    std::copy(kDocumentPath.cbegin(), kDocumentPath.cend(), reinterpret_cast<wchar_t*>(lParam));
    reinterpret_cast<wchar_t*>(lParam)[kDocumentPath.size()] = L'\0';
    return TRUE;
  }
  if (message == NPPM_GETPLUGINSCONFIGDIR) {
    if (lParam == 0) return static_cast<LRESULT>(g_configDirectory.size());
    if (wParam <= g_configDirectory.size()) return FALSE;
    std::copy(g_configDirectory.cbegin(), g_configDirectory.cend(), reinterpret_cast<wchar_t*>(lParam));
    reinterpret_cast<wchar_t*>(lParam)[g_configDirectory.size()] = L'\0';
    return TRUE;
  }
  if (message == NPPM_GETCURRENTBUFFERID) return 42;
  if (message == NPPM_GETCURRENTSCINTILLA) {
    if (lParam != 0) *reinterpret_cast<int*>(lParam) = 0;
    return TRUE;
  }
  return DefWindowProcW(window, message, wParam, lParam);
}

}  // namespace

bool RunNotepadMessageTests() {
  wchar_t temporaryPath[MAX_PATH]{};
  if (GetTempPathW(MAX_PATH, temporaryPath) == 0) {
    std::cerr << "Could not resolve the temporary directory\n";
    return false;
  }
  g_configDirectory = std::wstring(temporaryPath) + L"NotepadViewerPlusMessageTest-" + std::to_wstring(GetCurrentProcessId());
  std::error_code filesystemError;
  std::filesystem::remove_all(g_configDirectory, filesystemError);
  std::filesystem::create_directories(g_configDirectory, filesystemError);
  if (filesystemError) {
    std::cerr << "Could not create the settings test directory\n";
    return false;
  }

  WNDCLASSW windowClass{};
  windowClass.lpfnWndProc = &TestWindowProc;
  windowClass.hInstance = GetModuleHandleW(nullptr);
  windowClass.lpszClassName = kWindowClass;
  if (RegisterClassW(&windowClass) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
    std::cerr << "Could not register the Notepad message test window\n";
    return false;
  }
  const HWND window = CreateWindowExW(0, kWindowClass, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr,
                                      windowClass.hInstance, nullptr);
  if (!window) {
    std::cerr << "Could not create the Notepad message test window\n";
    return false;
  }

  bool passed = true;
  mpp::DocumentUpdate captured;
  mpp::DocumentCoordinator coordinator(window, nullptr, nullptr);
  coordinator.SetUpdateHandler([&captured](mpp::DocumentUpdate update) { captured = std::move(update); });
  coordinator.RefreshNow();
  if (captured.file.name != "syntax-showcase.md" || captured.file.extension != ".md" ||
      captured.formatHint != "markdown") {
    std::cerr << "Notepad BOOL string message was interpreted as a character count\n";
    passed = false;
  }

  mpp::SettingsService settingsService(window);
  if (!settingsService.Save(mpp::Settings{})) {
    std::cerr << "Could not save settings through the Notepad config-directory message\n";
    passed = false;
  } else {
    const std::filesystem::path expected = std::filesystem::path(g_configDirectory) /
                                           L"NotepadViewerPlus" / L"NotepadViewerPlus.ini";
    if (!std::filesystem::is_regular_file(expected)) {
      std::cerr << "Settings were not written under the complete Notepad plugin config path\n";
      passed = false;
    }
  }

  coordinator.Stop();
  DestroyWindow(window);
  UnregisterClassW(kWindowClass, windowClass.hInstance);
  std::filesystem::remove_all(g_configDirectory, filesystemError);
  return passed;
}
