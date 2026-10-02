#include "PluginEntry.h"
#include "../resources/ResourceIds.h"
#include "Version.h"

#include <commctrl.h>
#include <windows.h>
#include <shellapi.h>

#include <cstdint>
#include <filesystem>
#include <functional>
#include <sstream>
#include <utility>
#include <vector>

namespace mpp {
namespace {

PluginEntry g_instance;

std::wstring Utf8ToWide(const std::string& value) {
  if (value.empty()) return {};
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) return {};
  std::wstring result(static_cast<std::size_t>(size), L'\0');
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size) <= 0) return {};
  return result;
}

std::wstring EnvironmentValue(const wchar_t* name) {
  std::vector<wchar_t> value(1024);
  for (int attempt = 0; attempt < 6; ++attempt) {
    const DWORD length = GetEnvironmentVariableW(name, value.data(), static_cast<DWORD>(value.size()));
    if (length == 0) return {};
    if (length < value.size() - 1) return std::wstring(value.data(), length);
    value.resize(value.size() * 2);
  }
  return {};
}

std::string TokenFor(const std::wstring& value) {
  // FNV-1a gives a stable opaque token without exposing the document path to JavaScript.
  std::uint64_t hash = 1469598103934665603ull;
  for (wchar_t character : value) {
    hash ^= static_cast<std::uint64_t>(character);
    hash *= 1099511628211ull;
  }
  std::ostringstream stream;
  stream << "dir-" << std::hex << hash;
  return stream.str();
}

HRESULT CALLBACK AboutDialogCallback(HWND, UINT notification, WPARAM, LPARAM data, LONG_PTR) {
  if (notification != TDN_HYPERLINK_CLICKED || data == 0) return S_OK;
  const auto* target = reinterpret_cast<const wchar_t*>(data);
  if (wcscmp(target, L"https://ducle.uk") == 0) {
    ShellExecuteW(nullptr, L"open", target, nullptr, nullptr, SW_SHOWNORMAL);
  }
  return S_OK;
}

}  // namespace

PluginEntry& Instance() { return g_instance; }

void PluginEntry::SetNppData(NppData data) {
  nppData_ = data;
  const PluginCommandCallbacks callbacks{
      &TogglePreviewCommand,
      &RefreshPreviewCommand,
      &ToggleAutoRefreshCommand,
      &ToggleTableOfContentsCommand,
      &ThemeLightCommand,
      &ThemeDarkCommand,
      &ThemeSystemCommand,
      &AboutCommand,
  };
  PopulatePluginCommands(functions_, &togglePreviewShortcut_, callbacks);
}

void PluginEntry::OnNotification(SCNotification* notification) {
  if (!notification) return;
  if (notification->nmhdr.code == NPPN_TBMODIFICATION) {
    RegisterToolbarIcon();
    return;
  }
  if (notification->nmhdr.code == NPPN_READY) {
    OnReady();
    return;
  }
  if (notification->nmhdr.code == NPPN_SHUTDOWN) {
    Shutdown();
    return;
  }
  if (coordinator_) coordinator_->OnNotification(notification);
}

LRESULT PluginEntry::MessageProc(UINT, WPARAM, LPARAM) { return 1; }

FuncItem* PluginEntry::Functions(int* count) {
  if (count) *count = CommandCount;
  return functions_;
}

void PluginEntry::Shutdown() {
  if (coordinator_) coordinator_->Stop();
  panel_.reset();
  coordinator_.reset();
  settingsOwner_.reset();
  settingsService_ = nullptr;
  if (toolbarIcons_.hToolbarBmp) {
    DeleteObject(toolbarIcons_.hToolbarBmp);
  }
  toolbarIcons_ = {};
  showPanelOnReady_ = false;
  toolbarRegistered_ = false;
  initialized_ = false;
}

void PluginEntry::RegisterToolbarIcon() {
  if (toolbarRegistered_ || !nppData_._nppHandle) return;
  const int commandId = functions_[CommandId::TogglePreview]._cmdID;
  if (commandId <= 0) return;

  HMODULE module = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(&PluginEntry::PluginDirectory), &module)) {
    return;
  }

  toolbarIcons_.hToolbarIcon = LoadIconW(module, MAKEINTRESOURCEW(IDI_TOGGLE_PREVIEW_LIGHT));
  toolbarIcons_.hToolbarIconDarkMode = LoadIconW(module, MAKEINTRESOURCEW(IDI_TOGGLE_PREVIEW_DARK));
  toolbarIcons_.hToolbarBmp = LoadBitmapW(module, MAKEINTRESOURCEW(IDB_TOGGLE_PREVIEW_LEGACY));
  if (!toolbarIcons_.hToolbarIcon || !toolbarIcons_.hToolbarIconDarkMode || !toolbarIcons_.hToolbarBmp) {
    if (toolbarIcons_.hToolbarBmp) DeleteObject(toolbarIcons_.hToolbarBmp);
    toolbarIcons_ = {};
    OutputDebugStringW(L"Notepad Viewer Plus: toolbar resources could not be loaded.\n");
    return;
  }

  toolbarRegistered_ = SendMessageW(nppData_._nppHandle, NPPM_ADDTOOLBARICON_FORDARKMODE,
                                    static_cast<WPARAM>(commandId),
                                    reinterpret_cast<LPARAM>(&toolbarIcons_)) == TRUE;
  if (!toolbarRegistered_) {
    DeleteObject(toolbarIcons_.hToolbarBmp);
    toolbarIcons_ = {};
    OutputDebugStringW(L"Notepad Viewer Plus: Notepad++ rejected toolbar registration.\n");
  }
}

void PluginEntry::ShowAbout() {
  const wchar_t content[] =
      L"Offline, docked preview with live refresh, themes, table of contents, and security-focused handling "
      L"of untrusted content.\n\n"
      L"Supported files:\n"
      L"\u2022 Markdown \u2014 embedded Mermaid, PlantUML, syntax-highlighted code blocks, math, and admonitions\n"
      L"\u2022 Mermaid and PlantUML \u2014 standalone diagram files\n"
      L"\u2022 HTML and SVG\n"
      L"\u2022 JSON, YAML, and XML\n"
      L"\u2022 CSV and TSV\n"
      L"\u2022 OpenAPI and Swagger\n"
      L"\u2022 Images \u2014 PNG, JPEG, GIF, WebP, BMP, and ICO\n"
      L"\u2022 PDF\n\n"
      L"Created by Duc Le \u2014 <a href=\"https://ducle.uk\">ducle.uk</a>";
  TASKDIALOGCONFIG config{};
  config.cbSize = sizeof(config);
  config.hwndParent = nppData_._nppHandle;
  config.dwFlags = TDF_ENABLE_HYPERLINKS | TDF_POSITION_RELATIVE_TO_WINDOW | TDF_SIZE_TO_CONTENT;
  config.dwCommonButtons = TDCBF_OK_BUTTON;
  config.pszWindowTitle = L"About Notepad Viewer Plus";
  config.pszMainInstruction = L"Notepad Viewer Plus " NVP_RELEASE_VERSION_WIDE;
  config.pszContent = content;
  config.pfCallback = &AboutDialogCallback;

  if (FAILED(TaskDialogIndirect(&config, nullptr, nullptr, nullptr))) {
    MessageBoxW(
        nppData_._nppHandle,
        L"Notepad Viewer Plus " NVP_RELEASE_VERSION_WIDE L"\n\n"
        L"Supported files:\n"
        L"\u2022 Markdown \u2014 embedded Mermaid, PlantUML, syntax-highlighted code blocks, math, and admonitions\n"
        L"\u2022 Mermaid and PlantUML diagram files\n"
        L"\u2022 HTML, SVG, JSON, YAML, XML, CSV, TSV, OpenAPI, Swagger, images, and PDF\n\n"
        L"Created by Duc Le \u2014 https://ducle.uk",
        L"About Notepad Viewer Plus", MB_OK | MB_ICONINFORMATION);
  }
}

void PluginEntry::OnReady() {
  if (initialized_) return;
  initialized_ = true;
  if (LegacyInstallationConflict()) {
    MessageBoxW(nppData_._nppHandle,
                L"Notepad Viewer Plus detected the legacy Markdown Preview Plus plugin. Remove the old plugin before enabling the renamed panel.",
                kPluginName, MB_OK | MB_ICONWARNING);
    return;
  }
  const int toggleCommandId = functions_[CommandId::TogglePreview]._cmdID;
  if (toggleCommandId <= 0) {
    OutputDebugStringW(L"Notepad Viewer Plus: Notepad++ did not assign the toggle command ID; docking registration was skipped.\n");
    return;
  }
  settingsOwner_ = std::make_unique<SettingsService>(nppData_._nppHandle);
  settingsService_ = settingsOwner_.get();
  settings_ = settingsService_->Load();
  // Load() transparently reads the legacy INI when needed; immediately persist
  // the normalized values under the new public identity.
  settingsService_->Save(settings_);

  const std::wstring assets = PluginDirectory() + L"\\assets";
  const std::wstring localAppData = EnvironmentValue(L"LOCALAPPDATA");
  const std::wstring webviewData = (localAppData.empty() ? L"." : localAppData) + L"\\NotepadViewerPlus\\WebView2";
  panel_ = std::make_shared<PreviewPanel>(nppData_._nppHandle, assets, webviewData);
  panel_->SetSettings(settings_);
  panel_->SetOpenExternalHandler([](const std::string& href) {
    const std::wstring wide = Utf8ToWide(href);
    if (!wide.empty()) ShellExecuteW(nullptr, L"open", wide.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  });
  panel_->SetOpenLocalHandler([this](const std::string& href, const std::string& token) {
    std::wstring absolute;
    if (!panel_ || !panel_->ResolveLocalResource(token, href, absolute)) return;
    ShellExecuteW(nullptr, L"open", absolute.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  });
  panel_->SetRendererErrorHandler([](const std::string&) {
    // PreviewPanel displays initialization failures in its non-modal status child;
    // renderer errors remain non-modal to avoid blocking Notepad++.
  });
  panel_->SetVisibilityChangedHandler([this](bool visible) {
    if (functions_[CommandId::TogglePreview]._cmdID > 0) {
      SendMessage(nppData_._nppHandle, NPPM_SETMENUITEMCHECK,
                  static_cast<WPARAM>(functions_[CommandId::TogglePreview]._cmdID), visible ? TRUE : FALSE);
    }
    if (visible && coordinator_) coordinator_->RefreshNow();
  });
  panel_->Create();

  coordinator_ = std::make_unique<DocumentCoordinator>(nppData_._nppHandle, nppData_._scintillaMainHandle, nppData_._scintillaSecondHandle);
  coordinator_->SetSettings(settings_);
  coordinator_->SetUpdateHandler([this](DocumentUpdate update) {
    if (panel_) panel_->QueueDocumentUpdate(std::move(update));
  });
  coordinator_->SetDirectoryTokenHandler([this](const std::wstring& path) { return DirectoryTokenForPath(path); });
  coordinator_->SetResourceActivationHandler([this](long long bufferId, unsigned long long generation) {
    if (panel_) panel_->ActivateDocument(bufferId, generation);
  });
  coordinator_->SetResourceRevocationHandler([this] {
    if (panel_) panel_->RevokeResources();
  });
  coordinator_->SetResourceRegistrationHandler([this](long long bufferId, unsigned long long generation,
                                                       const std::wstring& path, const std::string& mediaType,
                                                       std::size_t size) -> std::optional<PreviewResource> {
    return panel_ ? panel_->RegisterExactFile(bufferId, generation, path, mediaType, size) : std::nullopt;
  });
  coordinator_->SetTooLargeHandler([](std::size_t) {
    // Snapshot() sends a bounded, actionable status document instead of an empty update.
  });

  tTbData docking{};
  docking.hClient = panel_->Window();
  docking.pszName = kPluginName;
  docking.dlgID = toggleCommandId;
  docking.uMask = DWS_DF_CONT_RIGHT;
  docking.hIconTab = nullptr;
  docking.pszModuleName = L"NotepadViewerPlus.dll";
  SendMessage(nppData_._nppHandle, NPPM_DMMREGASDCKDLG, 0, reinterpret_cast<LPARAM>(&docking));
  if (showPanelOnReady_) {
    showPanelOnReady_ = false;
    SendMessage(nppData_._nppHandle, NPPM_DMMSHOW, 0, reinterpret_cast<LPARAM>(panel_->Window()));
  } else {
    SendMessage(nppData_._nppHandle, NPPM_DMMHIDE, 0, reinterpret_cast<LPARAM>(panel_->Window()));
  }
  UpdateMenuChecks();
}

void PluginEntry::TogglePreview() {
  if (!panel_) {
    // Notepad++ invokes the registered docking command before NPPN_READY when
    // config.xml says this panel was visible at the previous clean shutdown.
    showPanelOnReady_ = !showPanelOnReady_;
    return;
  }
  const bool show = !panel_->IsVisible();
  SendMessage(nppData_._nppHandle, show ? NPPM_DMMSHOW : NPPM_DMMHIDE,
              0, reinterpret_cast<LPARAM>(panel_->Window()));
}

void PluginEntry::RefreshPreview() {
  if (coordinator_) coordinator_->RefreshNow();
}

void PluginEntry::ToggleAutoRefresh() {
  settings_.autoRefresh = !settings_.autoRefresh;
  if (settingsService_) settingsService_->Save(settings_);
  if (coordinator_) coordinator_->SetSettings(settings_);
  if (panel_) panel_->SetSettings(settings_);
  UpdateMenuChecks();
}

void PluginEntry::ToggleTableOfContents() {
  settings_.showTableOfContents = !settings_.showTableOfContents;
  if (settingsService_) settingsService_->Save(settings_);
  if (coordinator_) coordinator_->SetSettings(settings_);
  if (panel_) panel_->SetSettings(settings_);
  UpdateMenuChecks();
  RefreshPreview();
}

void PluginEntry::SetTheme(const char* theme) {
  settings_.theme = theme;
  if (settingsService_) settingsService_->Save(settings_);
  if (coordinator_) coordinator_->SetSettings(settings_);
  if (panel_) panel_->SetSettings(settings_);
  UpdateMenuChecks();
  RefreshPreview();
}

void PluginEntry::UpdateMenuChecks() {
  if (!nppData_._nppHandle) return;
  const auto setChecked = [this](CommandId id, bool checked) {
    const int commandId = functions_[id]._cmdID;
    if (commandId > 0) {
      SendMessage(nppData_._nppHandle, NPPM_SETMENUITEMCHECK,
                  static_cast<WPARAM>(commandId), checked ? TRUE : FALSE);
    }
  };
  setChecked(CommandId::TogglePreview, panel_ && panel_->IsVisible());
  setChecked(CommandId::ToggleAutoRefresh, settings_.autoRefresh);
  setChecked(CommandId::ToggleTableOfContents, settings_.showTableOfContents);
  setChecked(CommandId::ThemeLight, settings_.theme == "light");
  setChecked(CommandId::ThemeDark, settings_.theme == "dark");
  setChecked(CommandId::ThemeSystem, settings_.theme != "light" && settings_.theme != "dark");
}

std::string PluginEntry::DirectoryTokenForPath(const std::wstring& path) {
  if (path.empty()) {
    activeToken_.clear();
    return {};
  }
  const std::filesystem::path file(path);
  const std::wstring directory = file.parent_path().wstring();
  if (directory.empty()) {
    activeToken_.clear();
    return {};
  }
  activeToken_ = TokenFor(directory);
  if (panel_) panel_->SetDocumentDirectory(activeToken_, directory);
  return activeToken_;
}

bool PluginEntry::LegacyInstallationConflict() {
  if (GetModuleHandleW(L"MarkdownPreviewPlus.dll") != nullptr) return true;
  const std::filesystem::path current = PluginDirectory();
  const std::filesystem::path sameDirectory = current / L"MarkdownPreviewPlus.dll";
  const std::filesystem::path siblingDirectory = current.parent_path() / L"MarkdownPreviewPlus" / L"MarkdownPreviewPlus.dll";
  return GetFileAttributesW(sameDirectory.c_str()) != INVALID_FILE_ATTRIBUTES ||
         GetFileAttributesW(siblingDirectory.c_str()) != INVALID_FILE_ATTRIBUTES;
}

std::wstring PluginEntry::PluginDirectory() {
  HMODULE module = nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                     reinterpret_cast<LPCWSTR>(&PluginDirectory), &module);
  std::vector<wchar_t> path(1024);
  for (int attempt = 0; attempt < 6; ++attempt) {
    const DWORD size = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
    if (size == 0) return L".";
    if (size < path.size() - 1) return std::filesystem::path(std::wstring(path.data(), size)).parent_path().wstring();
    path.resize(path.size() * 2);
  }
  return L".";
}

void PluginEntry::TogglePreviewCommand() { Instance().TogglePreview(); }
void PluginEntry::RefreshPreviewCommand() { Instance().RefreshPreview(); }
void PluginEntry::ToggleAutoRefreshCommand() { Instance().ToggleAutoRefresh(); }
void PluginEntry::ToggleTableOfContentsCommand() { Instance().ToggleTableOfContents(); }
void PluginEntry::ThemeLightCommand() { Instance().SetTheme("light"); }
void PluginEntry::ThemeDarkCommand() { Instance().SetTheme("dark"); }
void PluginEntry::ThemeSystemCommand() { Instance().SetTheme("system"); }
void PluginEntry::AboutCommand() { Instance().ShowAbout(); }

}  // namespace mpp
