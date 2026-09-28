#pragma once

#include <windows.h>
#include <objbase.h>
#include "../bridge/MessageBroker.h"
#include "ResourcePolicy.h"
#include "../settings/SettingsService.h"

#include <WebView2.h>
#include <wrl.h>

#include <cstddef>
#include <functional>
#include <memory>
#include <optional>
#include <string>

namespace mpp {

enum class PreviewState {
  Uninitialized,
  CreatingEnvironment,
  CreatingController,
  LoadingApplication,
  Ready,
  Failed,
  Disposed
};

class PreviewPanel final : public std::enable_shared_from_this<PreviewPanel> {
 public:
  using OpenExternalHandler = std::function<void(const std::string&)>;
  using OpenLocalHandler = std::function<void(const std::string&, const std::string&)>;
  using RendererErrorHandler = std::function<void(const std::string&)>;
  using VisibilityChangedHandler = std::function<void(bool)>;

  PreviewPanel(HWND notepadWindow, std::wstring assetsDirectory, std::wstring userDataDirectory);
  ~PreviewPanel();

  bool Create();
  void Dispose();
  void Resize();
  void QueueDocumentUpdate(DocumentUpdate update);
  bool SetDocumentDirectory(const std::string& token, const std::wstring& directory);
  std::optional<PreviewResource> RegisterExactFile(long long bufferId, unsigned long long generation,
                                                    const std::wstring& path, const std::string& mediaType,
                                                    std::size_t size);
  void ActivateDocument(long long bufferId, unsigned long long generation);
  void RevokeResources();
  bool ResolveLocalResource(const std::string& token, const std::string& href, std::wstring& absolute) const;
  void SetSettings(Settings settings);
  void SetOpenExternalHandler(OpenExternalHandler handler);
  void SetOpenLocalHandler(OpenLocalHandler handler);
  void SetRendererErrorHandler(RendererErrorHandler handler);
  void SetVisibilityChangedHandler(VisibilityChangedHandler handler);
  [[nodiscard]] bool IsVisible() const;
  [[nodiscard]] PreviewState State() const { return state_; }
  [[nodiscard]] HWND Window() const { return window_; }

 private:
  static LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam);
  LRESULT HandleMessage(UINT message, WPARAM wParam, LPARAM lParam);
  void StartWebView();
  void OnEnvironmentCreated(HRESULT result, ICoreWebView2Environment* environment);
  void OnControllerCreated(HRESULT result, ICoreWebView2Controller* controller);
  void OnRendererReady();
  void OnNavigationStarting(ICoreWebView2NavigationStartingEventArgs* args);
  void OnNavigationCompleted(ICoreWebView2NavigationCompletedEventArgs* args);
  void OnFrameNavigationStarting(ICoreWebView2NavigationStartingEventArgs* args);
  void OnWebResourceRequested(ICoreWebView2WebResourceRequestedEventArgs* args);
  bool CreateResourceResponse(ICoreWebView2WebResourceRequestedEventArgs* args, const ResolvedResource& resource);
  void Fail(const wchar_t* reason);
  void ShowFailureStatus(const wchar_t* reason);
  void SendPendingUpdate();

  HWND notepadWindow_{};
  HWND window_{};
  HWND statusWindow_{};
  std::wstring assetsDirectory_;
  std::wstring userDataDirectory_;
  bool visible_{false};
  PreviewState state_{PreviewState::Uninitialized};
  Settings settings_{};
  std::optional<DocumentUpdate> pendingUpdate_;
  ResourcePolicy resourcePolicy_;
  std::shared_ptr<MessageBroker> broker_{std::make_shared<MessageBroker>()};
  OpenExternalHandler openExternal_;
  OpenLocalHandler openLocal_;
  RendererErrorHandler rendererError_;
  VisibilityChangedHandler visibilityChanged_;
  Microsoft::WRL::ComPtr<ICoreWebView2Environment> environment_;
  Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
  Microsoft::WRL::ComPtr<ICoreWebView2> webview_;
  EventRegistrationToken navigationToken_{};
  EventRegistrationToken navigationCompletedToken_{};
  EventRegistrationToken frameNavigationToken_{};
  EventRegistrationToken resourceToken_{};
  std::optional<UINT64> allowedFrameNavigationId_;
};

}  // namespace mpp
