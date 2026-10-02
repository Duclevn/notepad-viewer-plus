#pragma once

#include "DocumentCoordinator.h"
#include "PluginCommands.h"
#include "PluginConstants.h"
#include "../preview/PreviewPanel.h"
#include "../settings/SettingsService.h"

#include <PluginInterface.h>
#include <Docking.h>
#include <Notepad_plus_msgs.h>

#include <memory>
#include <string>

namespace mpp {

class PluginEntry final {
 public:
  void SetNppData(NppData data);
  void OnNotification(SCNotification* notification);
  LRESULT MessageProc(UINT message, WPARAM wParam, LPARAM lParam);
  FuncItem* Functions(int* count);
  void Shutdown();

 private:
  void OnReady();
  void RegisterToolbarIcon();
  void ShowAbout();
  void TogglePreview();
  void RefreshPreview();
  void ToggleAutoRefresh();
  void ToggleTableOfContents();
  void SetTheme(const char* theme);
  void UpdateMenuChecks();
  std::string DirectoryTokenForPath(const std::wstring& path);
  static std::wstring PluginDirectory();
  static bool LegacyInstallationConflict();
  static void TogglePreviewCommand();
  static void RefreshPreviewCommand();
  static void ToggleAutoRefreshCommand();
  static void ToggleTableOfContentsCommand();
  static void ThemeLightCommand();
  static void ThemeDarkCommand();
  static void ThemeSystemCommand();
  static void AboutCommand();

  NppData nppData_{};
  SettingsService* settingsService_{nullptr};
  Settings settings_{};
  std::shared_ptr<PreviewPanel> panel_;
  std::unique_ptr<DocumentCoordinator> coordinator_;
  std::unique_ptr<SettingsService> settingsOwner_;
  FuncItem functions_[CommandCount]{};
  ShortcutKey togglePreviewShortcut_{true, true, false, 'P'};
  toolbarIconsWithDarkMode toolbarIcons_{};
  std::string activeToken_;
  bool showPanelOnReady_{false};
  bool toolbarRegistered_{false};
  bool initialized_{false};
};

PluginEntry& Instance();

}  // namespace mpp
