#include "PreviewPanel.h"

#include "../plugin/PluginConstants.h"

#include <WebView2.h>
#include <shlwapi.h>
#include <windows.h>
#include <wrl.h>

#include <algorithm>
#include <filesystem>
#include <utility>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace mpp {
namespace {

constexpr wchar_t kWindowClass[] = L"MarkdownPreviewPlus.PreviewPanel";

std::wstring UriToString(PWSTR value) {
  if (!value) return {};
  std::wstring result(value);
  CoTaskMemFree(value);
  return result;
}

void PutErrorResponse(ICoreWebView2Environment* environment, ICoreWebView2WebResourceRequestedEventArgs* args) {
  if (!environment || !args) return;
  ComPtr<ICoreWebView2WebResourceResponse> response;
  if (SUCCEEDED(environment->CreateWebResourceResponse(nullptr, 403, L"Blocked", L"Content-Type: text/plain\r\n", &response))) {
    args->put_Response(response.Get());
  }
}

}  // namespace

PreviewPanel::PreviewPanel(HWND notepadWindow, std::wstring assetsDirectory, std::wstring userDataDirectory)
    : notepadWindow_(notepadWindow),
      assetsDirectory_(std::move(assetsDirectory)),
      userDataDirectory_(std::move(userDataDirectory)) {}

PreviewPanel::~PreviewPanel() { Dispose(); }

bool PreviewPanel::Create() {
  if (window_) return true;
  WNDCLASSW windowClass{};
  windowClass.lpfnWndProc = &PreviewPanel::WindowProc;
  windowClass.hInstance = GetModuleHandleW(nullptr);
  windowClass.lpszClassName = kWindowClass;
  windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  RegisterClassW(&windowClass);

  window_ = CreateWindowExW(0, kWindowClass, kPluginName, WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
                            0, 0, 0, 0, notepadWindow_, nullptr, windowClass.hInstance, this);
  if (!window_) {
    state_ = PreviewState::Failed;
    return false;
  }
  state_ = PreviewState::Uninitialized;
  StartWebView();
  return true;
}

void PreviewPanel::Dispose() {
  if (state_ == PreviewState::Disposed) return;
  state_ = PreviewState::Disposed;
  broker_->Detach();
  if (webview_ && resourceToken_.value != 0) webview_->remove_WebResourceRequested(resourceToken_);
  if (webview_ && navigationToken_.value != 0) webview_->remove_NavigationStarting(navigationToken_);
  resourceToken_ = {};
  navigationToken_ = {};
  if (controller_) controller_->Close();
  controller_.Reset();
  webview_.Reset();
  environment_.Reset();
  if (statusWindow_) DestroyWindow(statusWindow_);
  statusWindow_ = nullptr;
  if (window_) DestroyWindow(window_);
  window_ = nullptr;
}

bool PreviewPanel::IsVisible() const {
  return window_ && IsWindowVisible(window_) != FALSE;
}

void PreviewPanel::Resize() {
  if (!window_) return;
  RECT bounds{};
  GetClientRect(window_, &bounds);
  if (controller_) controller_->put_Bounds(bounds);
  if (statusWindow_) MoveWindow(statusWindow_, 16, 16, std::max(0L, bounds.right - 32), std::max(0L, bounds.bottom - 32), TRUE);
}

void PreviewPanel::QueueDocumentUpdate(DocumentUpdate update) {
  pendingUpdate_ = std::move(update);
  SendPendingUpdate();
}

bool PreviewPanel::SetDocumentDirectory(const std::string& token, const std::wstring& directory) {
  return resourcePolicy_.SetDocumentDirectory(token, directory);
}

bool PreviewPanel::ResolveLocalResource(const std::string& token, const std::string& href, std::wstring& absolute) const {
  return resourcePolicy_.ResolveRelative(token, href, absolute);
}

void PreviewPanel::SetSettings(Settings settings) { settings_ = std::move(settings); }

void PreviewPanel::SetOpenExternalHandler(OpenExternalHandler handler) { openExternal_ = std::move(handler); }
void PreviewPanel::SetOpenLocalHandler(OpenLocalHandler handler) { openLocal_ = std::move(handler); }
void PreviewPanel::SetRendererErrorHandler(RendererErrorHandler handler) { rendererError_ = std::move(handler); }
void PreviewPanel::SetVisibilityChangedHandler(VisibilityChangedHandler handler) { visibilityChanged_ = std::move(handler); }

LRESULT CALLBACK PreviewPanel::WindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  auto* panel = reinterpret_cast<PreviewPanel*>(GetWindowLongPtrW(window, GWLP_USERDATA));
  if (message == WM_NCCREATE) {
    const auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
    panel = static_cast<PreviewPanel*>(create->lpCreateParams);
    SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(panel));
    panel->window_ = window;
  }
  return panel ? panel->HandleMessage(message, wParam, lParam) : DefWindowProcW(window, message, wParam, lParam);
}

LRESULT PreviewPanel::HandleMessage(UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
    case WM_SIZE:
      Resize();
      return 0;
    case WM_SHOWWINDOW:
      visible_ = wParam != FALSE;
      if (controller_) controller_->put_IsVisible(visible_ ? TRUE : FALSE);
      if (visibilityChanged_) visibilityChanged_(visible_);
      break;
    case WM_ERASEBKGND:
      return 1;
    case WM_NCDESTROY: {
      const HWND current = window_;
      window_ = nullptr;
      return DefWindowProcW(current, message, wParam, lParam);
    }
    default:
      return DefWindowProcW(window_, message, wParam, lParam);
  }
  return DefWindowProcW(window_, message, wParam, lParam);
}

void PreviewPanel::StartWebView() {
  if (state_ == PreviewState::Disposed) return;
  state_ = PreviewState::CreatingEnvironment;
  std::error_code error;
  std::filesystem::create_directories(userDataDirectory_, error);
  const std::wstring userDataPath = userDataDirectory_;
  const std::weak_ptr<PreviewPanel> weakSelf = weak_from_this();
  HRESULT result = CreateCoreWebView2EnvironmentWithOptions(
      nullptr, userDataPath.c_str(), nullptr,
      Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
          [weakSelf](HRESULT status, ICoreWebView2Environment* environment) {
            if (const auto self = weakSelf.lock()) self->OnEnvironmentCreated(status, environment);
            return S_OK;
          })
          .Get());
  if (FAILED(result)) Fail(L"WebView2 environment creation failed");
}

void PreviewPanel::OnEnvironmentCreated(HRESULT result, ICoreWebView2Environment* environment) {
  if (state_ == PreviewState::Disposed || FAILED(result) || !environment) {
    Fail(L"Microsoft Edge WebView2 Evergreen Runtime is unavailable");
    return;
  }
  environment_ = environment;
  state_ = PreviewState::CreatingController;
  const std::weak_ptr<PreviewPanel> weakSelf = weak_from_this();
  environment_->CreateCoreWebView2Controller(
      window_,
      Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
          [weakSelf](HRESULT status, ICoreWebView2Controller* controller) {
            if (const auto self = weakSelf.lock()) self->OnControllerCreated(status, controller);
            return S_OK;
          })
          .Get());
}

void PreviewPanel::OnControllerCreated(HRESULT result, ICoreWebView2Controller* controller) {
  if (state_ == PreviewState::Disposed || FAILED(result) || !controller) {
    Fail(L"WebView2 preview controller creation failed");
    return;
  }
  controller_ = controller;
  if (statusWindow_) ShowWindow(statusWindow_, SW_HIDE);
  if (FAILED(controller_->get_CoreWebView2(&webview_)) || !webview_) {
    Fail(L"WebView2 core object is unavailable");
    return;
  }
  controller_->put_IsVisible(visible_ ? TRUE : FALSE);
  Resize();
  // The diagram iframe is sandboxed without allow-same-origin, so its opaque origin needs
  // CORS access to packaged app.local scripts. Document images use the separately intercepted
  // doc.local path below; navigation and all other non-packaged requests remain blocked.
  ComPtr<ICoreWebView2_3> webview3;
  if (FAILED(webview_.As(&webview3)) || !webview3 ||
      FAILED(webview3->SetVirtualHostNameToFolderMapping(kAppHost, assetsDirectory_.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW))) {
    Fail(L"Preview assets could not be mapped into WebView2");
    return;
  }
  if (FAILED(webview_->AddWebResourceRequestedFilter(L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL))) {
    Fail(L"WebView2 resource policy could not be installed");
    return;
  }
  const std::weak_ptr<PreviewPanel> weakSelf = weak_from_this();
  webview_->add_NavigationStarting(
      Callback<ICoreWebView2NavigationStartingEventHandler>(
          [weakSelf](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) {
            if (const auto self = weakSelf.lock()) self->OnNavigationStarting(args);
            return S_OK;
          })
          .Get(),
      &navigationToken_);
  webview_->add_WebResourceRequested(
      Callback<ICoreWebView2WebResourceRequestedEventHandler>(
          [weakSelf](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) {
            if (const auto self = weakSelf.lock()) self->OnWebResourceRequested(args);
            return S_OK;
          })
          .Get(),
      &resourceToken_);
  broker_->SetHandlers(
      [weakSelf] {
        if (const auto self = weakSelf.lock()) self->OnRendererReady();
      },
      [weakSelf](const std::string& href) {
        if (const auto self = weakSelf.lock(); self && self->openExternal_) self->openExternal_(href);
      },
      [weakSelf](const std::string& href, const std::string& token) {
        if (const auto self = weakSelf.lock(); self && self->openLocal_) self->openLocal_(href, token);
      },
      [](unsigned long long) {},
      [weakSelf](unsigned long long, const std::string& message) {
        if (const auto self = weakSelf.lock(); self && self->rendererError_) self->rendererError_(message);
      });
  broker_->Attach(webview_);
  state_ = PreviewState::LoadingApplication;
  webview_->Navigate(kAppUrl);
}

void PreviewPanel::OnRendererReady() {
  if (state_ == PreviewState::Disposed) return;
  state_ = PreviewState::Ready;
  SendPendingUpdate();
}

void PreviewPanel::OnNavigationStarting(ICoreWebView2NavigationStartingEventArgs* args) {
  if (!args) return;
  PWSTR uri = nullptr;
  if (SUCCEEDED(args->get_Uri(&uri))) {
    const std::wstring value = UriToString(uri);
    if (value != kAppUrl) args->put_Cancel(TRUE);
  } else {
    args->put_Cancel(TRUE);
  }
}

void PreviewPanel::OnWebResourceRequested(ICoreWebView2WebResourceRequestedEventArgs* args) {
  if (!args) return;
  ComPtr<ICoreWebView2WebResourceRequest> request;
  if (FAILED(args->get_Request(&request)) || !request) return;
  PWSTR uri = nullptr;
  if (FAILED(request->get_Uri(&uri))) {
    PutErrorResponse(environment_.Get(), args);
    return;
  }
  const std::wstring value = UriToString(uri);
  if (value.rfind(L"https://app.local/", 0) == 0) return;
  if (value.rfind(L"https://doc.local/resource/", 0) == 0) {
    std::wstring path;
    if (!resourcePolicy_.ResolveDocumentUri(value, path)) {
      PutErrorResponse(environment_.Get(), args);
      return;
    }
    ComPtr<IStream> stream;
    if (FAILED(SHCreateStreamOnFileEx(path.c_str(), STGM_READ | STGM_SHARE_DENY_NONE, FILE_ATTRIBUTE_NORMAL, FALSE, nullptr, &stream))) {
      PutErrorResponse(environment_.Get(), args);
      return;
    }
    ComPtr<ICoreWebView2WebResourceResponse> response;
    if (SUCCEEDED(environment_->CreateWebResourceResponse(stream.Get(), 200, L"OK", L"Cache-Control: no-store\r\n", &response))) {
      args->put_Response(response.Get());
      return;
    }
  }
  COREWEBVIEW2_WEB_RESOURCE_CONTEXT context{};
  if (SUCCEEDED(args->get_ResourceContext(&context)) &&
      context == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE &&
      settings_.remoteImages && value.rfind(L"https://", 0) == 0) {
    return;
  }
  PutErrorResponse(environment_.Get(), args);
}

void PreviewPanel::Fail(const wchar_t* reason) {
  if (state_ == PreviewState::Disposed) return;
  state_ = PreviewState::Failed;
  ShowFailureStatus(reason);
  if (rendererError_) {
    const int size = WideCharToMultiByte(CP_UTF8, 0, reason, -1, nullptr, 0, nullptr, nullptr);
    std::string message(size > 0 ? static_cast<std::size_t>(size) : 0, '\0');
    if (size > 0) {
      WideCharToMultiByte(CP_UTF8, 0, reason, -1, message.data(), size, nullptr, nullptr);
      if (!message.empty() && message.back() == '\0') message.pop_back();
    }
    rendererError_(message);
  }
}

void PreviewPanel::ShowFailureStatus(const wchar_t* reason) {
  if (!window_) return;
  if (!statusWindow_) {
    statusWindow_ = CreateWindowExW(0, L"STATIC", reason, WS_CHILD | WS_VISIBLE | SS_LEFT | SS_NOPREFIX,
                                    16, 16, 640, 120, window_, nullptr, GetModuleHandleW(nullptr), nullptr);
    SendMessageW(statusWindow_, WM_SETFONT, reinterpret_cast<WPARAM>(GetStockObject(DEFAULT_GUI_FONT)), TRUE);
  } else {
    SetWindowTextW(statusWindow_, reason);
    ShowWindow(statusWindow_, SW_SHOW);
  }
  Resize();
}

void PreviewPanel::SendPendingUpdate() {
  if (state_ != PreviewState::Ready || !pendingUpdate_) return;
  if (pendingUpdate_->documentDirectoryToken.empty()) {
    // An unsaved document has no filesystem directory; local resources remain blocked.
  }
  if (broker_->PostDocumentUpdate(*pendingUpdate_)) pendingUpdate_.reset();
}

}  // namespace mpp
