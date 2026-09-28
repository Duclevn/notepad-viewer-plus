#pragma once

#include "../bridge/MessageBroker.h"
#include "../settings/SettingsService.h"

#include <windows.h>
#include <Scintilla.h>

#include <functional>
#include <string>

namespace mpp {

class DocumentCoordinator final {
 public:
  using UpdateHandler = std::function<void(DocumentUpdate)>;
  using DirectoryTokenHandler = std::function<std::string(const std::wstring&)>;
  using TooLargeHandler = std::function<void(std::size_t)>;

  DocumentCoordinator(HWND notepadWindow, HWND mainEditor, HWND secondEditor);
  ~DocumentCoordinator();

  void SetUpdateHandler(UpdateHandler handler);
  void SetDirectoryTokenHandler(DirectoryTokenHandler handler);
  void SetTooLargeHandler(TooLargeHandler handler);
  void SetSettings(Settings settings);
  void OnNotification(const SCNotification* notification);
  void RefreshNow();
  void Stop();

 private:
  static void CALLBACK TimerProc(HWND window, UINT message, UINT_PTR timerId, DWORD time);
  void Schedule();
  void FireDebounced();
  HWND ActiveEditor() const;
  DocumentUpdate Snapshot() const;
  std::string ReadUtf8(HWND editor) const;
  std::wstring CurrentPath() const;
  static std::string ThemeName(const std::string& theme);
  static DocumentCoordinator* activeCoordinator_;

  HWND notepadWindow_{};
  HWND mainEditor_{};
  HWND secondEditor_{};
  Settings settings_{};
  UpdateHandler update_;
  DirectoryTokenHandler directoryToken_;
  TooLargeHandler tooLarge_;
  unsigned long long generation_{0};
  bool scheduled_{false};
  bool stopped_{false};
};

}  // namespace mpp
