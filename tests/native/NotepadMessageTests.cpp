#include "plugin/DocumentCoordinator.h"
#include "settings/SettingsService.h"
#include "preview/PreviewPanel.h"

#include <Notepad_plus_msgs.h>

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <string>
#include <utility>

namespace {

constexpr wchar_t kWindowClass[] = L"NotepadViewerPlusMessageTest";
const std::wstring kDocumentPath = L"C:\\fixtures\\syntax-showcase.md";
std::wstring g_configDirectory;
std::string g_editorText = "hidden\n";
unsigned g_editorTextReads = 0;

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

LRESULT CALLBACK TestEditorProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  if (message == SCI_GETTEXTLENGTH) return static_cast<LRESULT>(g_editorText.size());
  if (message == SCI_GETCODEPAGE) return 65001;
  if (message == SCI_GETTEXT) {
    ++g_editorTextReads;
    if (lParam == 0 || wParam == 0) return 0;
    const std::size_t capacity = static_cast<std::size_t>(wParam);
    const std::size_t length = std::min(g_editorText.size(), capacity - 1);
    std::memcpy(reinterpret_cast<char*>(lParam), g_editorText.data(), length);
    reinterpret_cast<char*>(lParam)[length] = '\0';
    return static_cast<LRESULT>(length);
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
  const HWND hiddenParent = CreateWindowExW(0, kWindowClass, L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr,
                                            windowClass.hInstance, nullptr);
  const HWND visibleChild = CreateWindowExW(0, kWindowClass, L"", WS_CHILD, 0, 0, 10, 10, hiddenParent,
                                            nullptr, windowClass.hInstance, nullptr);
  if (!hiddenParent || !visibleChild) {
    std::cerr << "Could not create the dock visibility regression windows\n";
    if (visibleChild) DestroyWindow(visibleChild);
    if (hiddenParent) DestroyWindow(hiddenParent);
    DestroyWindow(window);
    UnregisterClassW(kWindowClass, windowClass.hInstance);
    return false;
  }
  ShowWindow(visibleChild, SW_SHOW);
  if (IsWindowVisible(visibleChild) != FALSE || !mpp::IsOwnWindowVisible(visibleChild)) {
    std::cerr << "Dock visibility helper incorrectly depended on a hidden ancestor\n";
    passed = false;
  }
  DestroyWindow(visibleChild);
  DestroyWindow(hiddenParent);

  mpp::DocumentUpdate captured;
  mpp::DocumentCoordinator coordinator(window, nullptr, nullptr);
  coordinator.SetUpdateHandler([&captured](mpp::DocumentUpdate update) { captured = std::move(update); });
  coordinator.SetVisible(true);
  coordinator.RefreshNow();
  if (captured.file.name != "syntax-showcase.md" || captured.file.extension != ".md" ||
      captured.formatHint != "markdown") {
    std::cerr << "Notepad BOOL string message was interpreted as a character count\n";
    passed = false;
  }

  WNDCLASSW editorClass{};
  editorClass.lpfnWndProc = &TestEditorProc;
  editorClass.hInstance = windowClass.hInstance;
  editorClass.lpszClassName = L"NotepadViewerPlusEditorMessageTest";
  if (RegisterClassW(&editorClass) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
    std::cerr << "Could not register the editor message test window\n";
    passed = false;
  }
  const HWND editor = CreateWindowExW(0, editorClass.lpszClassName, L"", 0, 0, 0, 0, 0,
                                      HWND_MESSAGE, nullptr, editorClass.hInstance, nullptr);
  if (!editor) {
    std::cerr << "Could not create the editor message test window\n";
    passed = false;
  } else {
    unsigned updates = 0;
    unsigned readsBefore = 0;
    unsigned revocations = 0;
    mpp::DocumentCoordinator hiddenCoordinator(window, editor, nullptr);
    hiddenCoordinator.SetUpdateHandler([&updates](mpp::DocumentUpdate) { ++updates; });
    hiddenCoordinator.SetResourceRevocationHandler([&revocations] { ++revocations; });
    hiddenCoordinator.SetSettings(mpp::Settings{});
    hiddenCoordinator.SetVisible(false);
    SCNotification modified{};
    modified.nmhdr.code = SCN_MODIFIED;
    modified.modificationType = SC_MOD_INSERTTEXT;
    g_editorTextReads = 0;
    hiddenCoordinator.OnNotification(&modified);
    hiddenCoordinator.RefreshNow();
    if (g_editorTextReads != 0 || updates != 0) {
      std::cerr << "Hidden edits performed a text snapshot or update\n";
      passed = false;
    }

    hiddenCoordinator.SetVisible(true);
    if (g_editorTextReads != 1 || updates != 1) {
      std::cerr << "Showing the preview did not send exactly one current update\n";
      passed = false;
    }
    hiddenCoordinator.SetVisible(true);
    if (updates != 1) {
      std::cerr << "Repeated visible notifications duplicated the update\n";
      passed = false;
    }

    hiddenCoordinator.SetVisible(false);
    g_editorText = "latest\n";
    readsBefore = g_editorTextReads;
    hiddenCoordinator.OnNotification(&modified);
    if (g_editorTextReads != readsBefore || updates != 1) {
      std::cerr << "A hidden edit performed work after an earlier visible refresh\n";
      passed = false;
    }
    if (revocations != 1) {
      std::cerr << "Hiding the preview did not revoke active resources\n";
      passed = false;
    }
    mpp::Settings manualSettings{};
    manualSettings.autoRefresh = false;
    hiddenCoordinator.SetSettings(manualSettings);
    hiddenCoordinator.SetVisible(true);
    if (g_editorTextReads != readsBefore + 1 || updates != 2) {
      std::cerr << "Showing with auto-refresh disabled did not refresh once\n";
      passed = false;
    }
    hiddenCoordinator.Stop();
    DestroyWindow(editor);
    UnregisterClassW(editorClass.lpszClassName, editorClass.hInstance);
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
