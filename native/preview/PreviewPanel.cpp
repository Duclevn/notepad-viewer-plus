#include "PreviewPanel.h"

#include "../bridge/OriginPolicy.h"
#include "../plugin/PluginConstants.h"

#include <WebView2.h>
#include <shlwapi.h>
#include <windows.h>
#include <wrl.h>

#include <algorithm>
#include <charconv>
#include <filesystem>
#include <limits>
#include <string>
#include <utility>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace mpp {
namespace {

constexpr wchar_t kWindowClass[] = L"NotepadViewerPlus.PreviewPanel";

std::wstring UriToString(PWSTR value) {
  if (!value) return {};
  std::wstring result(value);
  CoTaskMemFree(value);
  return result;
}

std::wstring HeaderToString(PWSTR value) {
  return UriToString(value);
}

void PutErrorResponse(ICoreWebView2Environment* environment, ICoreWebView2WebResourceRequestedEventArgs* args,
                      int status = 403, const wchar_t* reason = L"Blocked", const std::wstring& headers = L"Content-Type: text/plain\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n") {
  if (!environment || !args) return;
  ComPtr<ICoreWebView2WebResourceResponse> response;
  if (SUCCEEDED(environment->CreateWebResourceResponse(nullptr, status, reason, headers.c_str(), &response))) {
    args->put_Response(response.Get());
  }
}

struct ByteRange {
  bool requested{false};
  bool valid{false};
  std::size_t start{0};
  std::size_t end{0};
};

bool ParseSize(std::string_view value, std::size_t& result) {
  if (value.empty()) return false;
  unsigned long long parsed = 0;
  const char* begin = value.data();
  const char* end = value.data() + value.size();
  const auto [next, status] = std::from_chars(begin, end, parsed);
  if (status != std::errc{} || next != end || parsed > std::numeric_limits<std::size_t>::max()) return false;
  result = static_cast<std::size_t>(parsed);
  return true;
}

ByteRange ReadRange(ICoreWebView2WebResourceRequest* request, std::size_t size) {
  ByteRange range;
  if (!request) return range;
  ComPtr<ICoreWebView2HttpRequestHeaders> headers;
  if (FAILED(request->get_Headers(&headers)) || !headers) return range;
  PWSTR raw = nullptr;
  if (FAILED(headers->GetHeader(L"Range", &raw)) || !raw) return range;
  const std::wstring wide = HeaderToString(raw);
  if (wide.empty()) return range;
  std::string value;
  value.reserve(wide.size());
  for (const wchar_t character : wide) {
    if (character > 0x7f) return ByteRange{true, false, 0, 0};
    value.push_back(static_cast<char>(character));
  }
  range.requested = true;
  if (size == 0 || value.rfind("bytes=", 0) != 0 || value.find(',') != std::string::npos) return range;
  const std::string_view spec(value.data() + 6, value.size() - 6);
  const std::size_t dash = spec.find('-');
  if (dash == std::string_view::npos) return range;
  const std::string_view first = spec.substr(0, dash);
  const std::string_view last = spec.substr(dash + 1);
  std::size_t start = 0;
  std::size_t end = size - 1;
  if (first.empty()) {
    std::size_t suffix = 0;
    if (!ParseSize(last, suffix) || suffix == 0) return range;
    suffix = std::min(suffix, size);
    start = size - suffix;
  } else {
    if (!ParseSize(first, start) || start >= size) return range;
    if (!last.empty() && (!ParseSize(last, end) || end < start)) return range;
    end = std::min(end, size - 1);
  }
  range.valid = true;
  range.start = start;
  range.end = end;
  return range;
}

std::wstring MediaTypeHeader(const std::string& mediaType) {
  return std::wstring(mediaType.begin(), mediaType.end());
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
  return true;
}

void PreviewPanel::CompleteDockRegistration(bool visible) {
  if (state_ == PreviewState::Disposed || dockRegistrationComplete_) return;
  visible_ = visible;
  dockRegistrationComplete_ = true;
  if (visible_ && state_ == PreviewState::Uninitialized) StartWebView();
  if (visibilityChanged_) visibilityChanged_(visible_);
}

void PreviewPanel::Dispose() {
  if (state_ == PreviewState::Disposed) return;
  state_ = PreviewState::Disposed;
  resourcePolicy_.RevokeAll();
  broker_->Detach();
  if (webview_ && resourceToken_.value != 0) webview_->remove_WebResourceRequested(resourceToken_);
  if (webview_ && navigationToken_.value != 0) webview_->remove_NavigationStarting(navigationToken_);
  if (webview_ && navigationCompletedToken_.value != 0) webview_->remove_NavigationCompleted(navigationCompletedToken_);
  if (webview_ && frameNavigationToken_.value != 0) webview_->remove_FrameNavigationStarting(frameNavigationToken_);
  resourceToken_ = {};
  navigationToken_ = {};
  navigationCompletedToken_ = {};
  frameNavigationToken_ = {};
  allowedFrameNavigationId_.reset();
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
  return IsOwnWindowVisible(window_);
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

std::optional<PreviewResource> PreviewPanel::RegisterExactFile(long long bufferId, unsigned long long generation,
                                                                const std::wstring& path, const std::string& mediaType,
                                                                std::size_t size) {
  return resourcePolicy_.RegisterExactFile(bufferId, generation, path, mediaType, size);
}

void PreviewPanel::ActivateDocument(long long bufferId, unsigned long long generation) {
  resourcePolicy_.ActivateDocument(bufferId, generation);
}

void PreviewPanel::RevokeResources() {
  pendingUpdate_.reset();
  resourcePolicy_.RevokeAll();
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
      {
        const bool nextVisible = wParam != FALSE;
        if (visible_ == nextVisible) break;
        visible_ = nextVisible;
        if (!dockRegistrationComplete_) break;
        if (controller_ && FAILED(controller_->put_IsVisible(visible_ ? TRUE : FALSE))) {
          Fail(L"WebView2 preview visibility could not be updated");
        }
        if (visible_ && state_ == PreviewState::Uninitialized) StartWebView();
        if (visibilityChanged_) visibilityChanged_(visible_);
      }
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
  const HRESULT result = CreateCoreWebView2EnvironmentWithOptions(
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
  if (state_ == PreviewState::Disposed || state_ == PreviewState::Failed || FAILED(result) || !environment) {
    Fail(L"Microsoft Edge WebView2 Evergreen Runtime is unavailable");
    return;
  }
  environment_ = environment;
  state_ = PreviewState::CreatingController;
  const std::weak_ptr<PreviewPanel> weakSelf = weak_from_this();
  const HRESULT controllerResult = environment_->CreateCoreWebView2Controller(
      window_,
      Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
          [weakSelf](HRESULT status, ICoreWebView2Controller* controller) {
            if (const auto self = weakSelf.lock()) self->OnControllerCreated(status, controller);
            return S_OK;
          })
          .Get());
  if (FAILED(controllerResult)) Fail(L"WebView2 preview controller creation could not be started");
}

void PreviewPanel::OnControllerCreated(HRESULT result, ICoreWebView2Controller* controller) {
  if (state_ == PreviewState::Disposed || state_ == PreviewState::Failed || FAILED(result) || !controller) {
    Fail(L"WebView2 preview controller creation failed");
    return;
  }
  controller_ = controller;
  if (statusWindow_) ShowWindow(statusWindow_, SW_HIDE);
  if (FAILED(controller_->get_CoreWebView2(&webview_)) || !webview_) {
    Fail(L"WebView2 core object is unavailable");
    return;
  }
  ComPtr<ICoreWebView2_3> webview3;
  if (FAILED(webview_.As(&webview3)) || !webview3 ||
      FAILED(webview3->SetVirtualHostNameToFolderMapping(kAppHost, assetsDirectory_.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW))) {
    Fail(L"Preview assets could not be mapped to WebView2");
    return;
  }
  if (FAILED(controller_->put_IsVisible(visible_ ? TRUE : FALSE))) {
    Fail(L"WebView2 preview visibility could not be configured");
    return;
  }
  RECT bounds{};
  GetClientRect(window_, &bounds);
  if (FAILED(controller_->put_Bounds(bounds))) {
    Fail(L"WebView2 preview bounds could not be configured");
    return;
  }
  if (FAILED(webview_->AddWebResourceRequestedFilter(L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL))) {
    Fail(L"WebView2 resource policy could not be installed");
    return;
  }
  const std::weak_ptr<PreviewPanel> weakSelf = weak_from_this();
  if (FAILED(webview_->add_NavigationStarting(
      Callback<ICoreWebView2NavigationStartingEventHandler>(
          [weakSelf](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) {
            if (const auto self = weakSelf.lock()) self->OnNavigationStarting(args);
            return S_OK;
          })
          .Get(),
      &navigationToken_))) {
    Fail(L"WebView2 navigation policy could not be installed");
    return;
  }
  if (FAILED(webview_->add_NavigationCompleted(
          Callback<ICoreWebView2NavigationCompletedEventHandler>(
              [weakSelf](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) {
                if (const auto self = weakSelf.lock()) self->OnNavigationCompleted(args);
                return S_OK;
              })
              .Get(),
          &navigationCompletedToken_))) {
    Fail(L"WebView2 navigation completion handler could not be installed");
    return;
  }
  if (FAILED(webview_->add_FrameNavigationStarting(
          Callback<ICoreWebView2NavigationStartingEventHandler>(
              [weakSelf](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) {
                if (const auto self = weakSelf.lock()) self->OnFrameNavigationStarting(args);
                return S_OK;
              })
              .Get(),
          &frameNavigationToken_))) {
    Fail(L"WebView2 frame navigation policy could not be installed");
    return;
  }
  if (FAILED(webview_->add_WebResourceRequested(
      Callback<ICoreWebView2WebResourceRequestedEventHandler>(
          [weakSelf](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) {
            if (const auto self = weakSelf.lock()) self->OnWebResourceRequested(args);
            return S_OK;
          })
          .Get(),
      &resourceToken_))) {
    Fail(L"WebView2 resource request handler could not be installed");
    return;
  }
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
      },
      [weakSelf] {
        if (const auto self = weakSelf.lock()) self->Fail(L"Preview protocol mismatch; reinstall the plugin assets");
      });
  if (!broker_->Attach(webview_)) {
    Fail(L"WebView2 renderer message handler could not be installed");
    return;
  }
  state_ = PreviewState::LoadingApplication;
  if (FAILED(webview_->Navigate(kAppUrl))) {
    Fail(L"Preview application navigation could not be started");
  }
}

void PreviewPanel::OnRendererReady() {
  if (state_ != PreviewState::LoadingApplication && state_ != PreviewState::Ready) return;
  state_ = PreviewState::Ready;
  SendPendingUpdate();
}

void PreviewPanel::OnNavigationStarting(ICoreWebView2NavigationStartingEventArgs* args) {
  if (!args) return;
  UINT64 navigationId = 0;
  if (FAILED(args->get_NavigationId(&navigationId))) {
    args->put_Cancel(TRUE);
    return;
  }
  // Retain allowedFrameNavigationId_ check for WebView2 runtime versions where
  // child-frame navigations also dispatch to the top-level NavigationStarting event.
  if (allowedFrameNavigationId_ && *allowedFrameNavigationId_ == navigationId) {
    allowedFrameNavigationId_.reset();
    return;
  }
  allowedFrameNavigationId_.reset();
  PWSTR uri = nullptr;
  if (FAILED(args->get_Uri(&uri))) {
    args->put_Cancel(TRUE);
    return;
  }
  const std::wstring value = UriToString(uri);
  // The top-level document may only be the packaged app. Exact PDF files are
  // admitted only through the child-frame event below.
  if (value != kAppUrl) args->put_Cancel(TRUE);
}

void PreviewPanel::OnNavigationCompleted(ICoreWebView2NavigationCompletedEventArgs* args) {
  if (!args || state_ == PreviewState::Disposed || state_ == PreviewState::Failed) return;
  BOOL succeeded = FALSE;
  COREWEBVIEW2_WEB_ERROR_STATUS error{};
  if (FAILED(args->get_IsSuccess(&succeeded)) || FAILED(args->get_WebErrorStatus(&error)) || succeeded == FALSE) {
    Fail(L"Preview application navigation failed");
    return;
  }
  // renderer.ready remains the primary handshake. NavigationCompleted is an
  // idempotent fallback for hosts where an early WebMessage is missed; module
  // scripts have completed by this point and the renderer listener is ready.
  OnRendererReady();
}

void PreviewPanel::OnFrameNavigationStarting(ICoreWebView2NavigationStartingEventArgs* args) {
  if (!args) return;
  UINT64 navigationId = 0;
  PWSTR uri = nullptr;
  if (FAILED(args->get_NavigationId(&navigationId)) || FAILED(args->get_Uri(&uri))) {
    args->put_Cancel(TRUE);
    return;
  }
  const std::wstring value = UriToString(uri);
  if (IsAllowedFrameUri(value) || resourcePolicy_.IsExactFileUri(value)) {
    allowedFrameNavigationId_ = navigationId;
    return;
  }
  args->put_Cancel(TRUE);
}

void PreviewPanel::OnWebResourceRequested(ICoreWebView2WebResourceRequestedEventArgs* args) {
  if (!args) return;
  ComPtr<ICoreWebView2WebResourceRequest> request;
  if (FAILED(args->get_Request(&request)) || !request) return;
  PWSTR method = nullptr;
  if (FAILED(request->get_Method(&method)) || !method) {
    PutErrorResponse(environment_.Get(), args, 405, L"Method Not Allowed");
    return;
  }
  const std::wstring methodValue = UriToString(method);
  if (methodValue != L"GET" && methodValue != L"HEAD") {
    PutErrorResponse(environment_.Get(), args, 405, L"Method Not Allowed");
    return;
  }
  PWSTR uri = nullptr;
  if (FAILED(request->get_Uri(&uri))) {
    PutErrorResponse(environment_.Get(), args);
    return;
  }
  const std::wstring value = UriToString(uri);
  if (value.rfind(L"https://app.local/", 0) == 0) return;

  ResolvedResource resource;
  if (resourcePolicy_.ResolveUri(value, resource)) {
    if (resource.size > settings_.maximumResourceMegabytes * 1024u * 1024u) {
      PutErrorResponse(environment_.Get(), args, 413, L"Payload Too Large");
      return;
    }
    if (!CreateResourceResponse(args, resource)) PutErrorResponse(environment_.Get(), args);
    return;
  }

  COREWEBVIEW2_WEB_RESOURCE_CONTEXT context{};
  if (SUCCEEDED(args->get_ResourceContext(&context)) &&
      context == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE && settings_.remoteImages && value.rfind(L"https://", 0) == 0) {
    return;
  }
  PutErrorResponse(environment_.Get(), args);
}

bool PreviewPanel::CreateResourceResponse(ICoreWebView2WebResourceRequestedEventArgs* args, const ResolvedResource& resource) {
  if (!environment_ || !args || resource.absolutePath.empty()) return false;
  ComPtr<ICoreWebView2WebResourceRequest> request;
  if (FAILED(args->get_Request(&request)) || !request) return false;
  const ByteRange range = ReadRange(request.Get(), resource.size);
  if (range.requested && !range.valid) {
    PutErrorResponse(environment_.Get(), args, 416, L"Range Not Satisfiable",
                     L"Content-Range: bytes */" + std::to_wstring(resource.size) + L"\r\nCache-Control: no-store\r\n");
    return true;
  }

  std::size_t start = range.valid ? range.start : 0;
  const std::size_t end = range.valid ? range.end : (resource.size == 0 ? 0 : resource.size - 1);
  const std::size_t contentLength = resource.size == 0 ? 0 : end - start + 1;
  ComPtr<IStream> stream;
  if (resource.size > 0 && FAILED(SHCreateStreamOnFileEx(resource.absolutePath.c_str(), STGM_READ | STGM_SHARE_DENY_NONE,
                                                          FILE_ATTRIBUTE_NORMAL, FALSE, nullptr, &stream))) return false;
  if (stream && start > 0) {
    LARGE_INTEGER offset{};
    offset.QuadPart = static_cast<LONGLONG>(start);
    if (FAILED(stream->Seek(offset, STREAM_SEEK_SET, nullptr))) return false;
  }

  std::wstring headers = L"Content-Type: " + MediaTypeHeader(resource.mediaType) +
                         L"\r\nContent-Length: " + std::to_wstring(contentLength) +
                         L"\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nAccept-Ranges: bytes\r\n";
  int status = 200;
  const wchar_t* reason = L"OK";
  if (range.valid) {
    status = 206;
    reason = L"Partial Content";
    headers += L"Content-Range: bytes " + std::to_wstring(start) + L"-" + std::to_wstring(end) + L"/" + std::to_wstring(resource.size) + L"\r\n";
  }
  ComPtr<ICoreWebView2WebResourceResponse> response;
  if (FAILED(environment_->CreateWebResourceResponse(stream.Get(), status, reason, headers.c_str(), &response))) return false;
  return SUCCEEDED(args->put_Response(response.Get()));
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
  if (!visible_ || state_ != PreviewState::Ready || !pendingUpdate_) return;
  if (broker_->PostDocumentUpdate(*pendingUpdate_)) {
    pendingUpdate_.reset();
    return;
  }
  Fail(L"Preview document update could not be delivered");
}

}  // namespace mpp
