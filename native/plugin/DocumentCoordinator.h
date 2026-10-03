#pragma once

#include "../bridge/MessageBroker.h"
#include "../settings/SettingsService.h"

#include <windows.h>
#include <Scintilla.h>

#include <functional>
#include <optional>
#include <string>

namespace mpp {

class DocumentCoordinator final {
 public:
  using UpdateHandler = std::function<void(DocumentUpdate)>;
  using DirectoryTokenHandler = std::function<std::string(const std::wstring&)>;
  using ResourceRegistrationHandler = std::function<std::optional<PreviewResource>(long long, unsigned long long, const std::wstring&, const std::string&, std::size_t)>;
  using ResourceActivationHandler = std::function<void(long long, unsigned long long)>;
  using ResourceRevocationHandler = std::function<void()>;
  using TooLargeHandler = std::function<void(std::size_t)>;

  DocumentCoordinator(HWND notepadWindow, HWND mainEditor, HWND secondEditor);
  ~DocumentCoordinator();

  void SetUpdateHandler(UpdateHandler handler);
  void SetDirectoryTokenHandler(DirectoryTokenHandler handler);
  void SetResourceRegistrationHandler(ResourceRegistrationHandler handler);
  void SetResourceActivationHandler(ResourceActivationHandler handler);
  void SetResourceRevocationHandler(ResourceRevocationHandler handler);
  void SetTooLargeHandler(TooLargeHandler handler);
  void SetSettings(Settings settings);
  void SetVisible(bool visible);
  void OnNotification(const SCNotification* notification);
  void RefreshNow();
  void Stop();

 private:
  static void CALLBACK TimerProc(HWND window, UINT message, UINT_PTR timerId, DWORD time);
  void Schedule();
  void FireDebounced();
  HWND ActiveEditor() const;
  DocumentUpdate Snapshot();
  std::string ReadUtf8(HWND editor) const;
  std::wstring CurrentPath() const;
  static std::string ThemeName(const std::string& theme);
  static std::string Utf8FromWide(const std::wstring& value);
  static std::string ExtensionForPath(const std::wstring& path);
  static std::string FormatForExtension(const std::string& extension);
  static bool IsBinaryFormat(const std::string& format);
  static std::string MediaTypeForExtension(const std::string& extension);
  static DocumentCoordinator* activeCoordinator_;

  HWND notepadWindow_{};
  HWND mainEditor_{};
  HWND secondEditor_{};
  Settings settings_{};
  UpdateHandler update_;
  DirectoryTokenHandler directoryToken_;
  ResourceRegistrationHandler registerResource_;
  ResourceActivationHandler activateResource_;
  ResourceRevocationHandler revokeResources_;
  TooLargeHandler tooLarge_;
  unsigned long long generation_{0};
  bool scheduled_{false};
  bool visible_{false};
  bool stopped_{false};
};

}  // namespace mpp
