#include "plugin/PluginCommands.h"

#include <iostream>
#include <string_view>

namespace {

void TestTogglePreview() {}
void TestRefreshPreview() {}
void TestToggleAutoRefresh() {}
void TestToggleTableOfContents() {}
void TestThemeLight() {}
void TestThemeDark() {}
void TestThemeSystem() {}
void TestAbout() {}

}  // namespace

bool RunPluginCommandTests() {
  using namespace mpp;

  if (CommandId::TogglePreview != 0 || CommandId::About != CommandCount - 1 || CommandCount != 8) {
    std::cerr << "Plugin command indexes changed unexpectedly\n";
    return false;
  }

  FuncItem functions[CommandCount]{};
  ShortcutKey shortcut{true, true, false, 'P'};
  const PluginCommandCallbacks callbacks{
      &TestTogglePreview, &TestRefreshPreview, &TestToggleAutoRefresh, &TestToggleTableOfContents,
      &TestThemeLight, &TestThemeDark, &TestThemeSystem, &TestAbout,
  };
  PopulatePluginCommands(functions, &shortcut, callbacks);

  constexpr std::wstring_view expected[] = {
      L"Toggle Preview",
      L"Refresh Preview",
      L"Toggle Auto-refresh",
      L"Toggle Table of Contents",
      L"Theme: Light",
      L"Theme: Dark",
      L"Theme: System",
      L"About Notepad Viewer Plus",
  };
  for (int index = 0; index < CommandCount; ++index) {
    if (std::wstring_view(functions[index]._itemName) != expected[index]) {
      std::cerr << "Unexpected plugin command label at index " << index << '\n';
      return false;
    }
    if (std::wstring_view(functions[index]._itemName) == L"Open Settings") {
      std::cerr << "Open Settings must not remain in the plugin command table\n";
      return false;
    }
    if (functions[index]._cmdID != 0 || functions[index]._init2Check) {
      std::cerr << "Plugin command initialization changed unexpectedly at index " << index << '\n';
      return false;
    }
  }

  if (functions[CommandId::TogglePreview]._pFunc != &TestTogglePreview ||
      functions[CommandId::TogglePreview]._pShKey != &shortcut ||
      functions[CommandId::About]._pFunc != &TestAbout ||
      functions[CommandId::About]._pShKey != nullptr) {
    std::cerr << "Plugin command callbacks or shortcut changed unexpectedly\n";
    return false;
  }

  return true;
}
