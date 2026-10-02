#include "PluginCommands.h"

#include <windows.h>

#include <iterator>

namespace mpp {

void PopulatePluginCommands(FuncItem (&functions)[CommandCount], ShortcutKey* togglePreviewShortcut,
                            const PluginCommandCallbacks& callbacks) {
  const auto setCommand = [&functions](CommandId id, const wchar_t* name, PFUNCPLUGINCMD callback,
                                       ShortcutKey* shortcut = nullptr) {
    FuncItem& item = functions[id];
    lstrcpynW(item._itemName, name, static_cast<int>(std::size(item._itemName)));
    item._pFunc = callback;
    item._cmdID = 0;
    item._init2Check = false;
    item._pShKey = shortcut;
  };

  setCommand(CommandId::TogglePreview, L"Toggle Preview", callbacks.togglePreview, togglePreviewShortcut);
  setCommand(CommandId::RefreshPreview, L"Refresh Preview", callbacks.refreshPreview);
  setCommand(CommandId::ToggleAutoRefresh, L"Toggle Auto-refresh", callbacks.toggleAutoRefresh);
  setCommand(CommandId::ToggleTableOfContents, L"Toggle Table of Contents", callbacks.toggleTableOfContents);
  setCommand(CommandId::ThemeLight, L"Theme: Light", callbacks.themeLight);
  setCommand(CommandId::ThemeDark, L"Theme: Dark", callbacks.themeDark);
  setCommand(CommandId::ThemeSystem, L"Theme: System", callbacks.themeSystem);
  setCommand(CommandId::About, L"About Notepad Viewer Plus", callbacks.about);
}

}  // namespace mpp
