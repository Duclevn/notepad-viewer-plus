#pragma once

#include <windows.h>
#include <objbase.h>
#include <WebView2.h>
#include <wrl.h>

#include <functional>
#include <memory>
#include <string>
#include <string_view>

namespace mpp {

struct RendererSettings {
  bool showFrontMatter{true};
  bool showTableOfContents{false};
  bool rawHtml{true};
  bool remoteImages{false};
  bool mathAlternateDelimiters{false};
  bool codeWrapping{true};
};

struct DocumentUpdate {
  unsigned long long generation{0};
  long long bufferId{0};
  std::string text;
  std::string theme{"system"};
  std::string documentDirectoryToken;
  RendererSettings settings;
};

class MessageBroker final : public std::enable_shared_from_this<MessageBroker> {
 public:
  using ReadyHandler = std::function<void()>;
  using LinkHandler = std::function<void(const std::string&)>;
  using LocalResourceHandler = std::function<void(const std::string&, const std::string&)>;
  using CompleteHandler = std::function<void(unsigned long long)>;
  using ErrorHandler = std::function<void(unsigned long long, const std::string&)>;

  void Attach(Microsoft::WRL::ComPtr<ICoreWebView2> webview);
  void Detach();
  void SetHandlers(ReadyHandler ready, LinkHandler link, LocalResourceHandler localResource,
                   CompleteHandler complete, ErrorHandler error);
  bool PostDocumentUpdate(const DocumentUpdate& update) const;

 private:
  void OnWebMessage(ICoreWebView2WebMessageReceivedEventArgs* args);
  static bool IsAllowedOrigin(ICoreWebView2WebMessageReceivedEventArgs* args);
  static bool ReadStringField(std::string_view json, std::string_view key, std::string& value);
  static bool ReadUnsignedField(std::string_view json, std::string_view key, unsigned long long& value);
  static bool IsSafeExternalUrl(std::string_view value);
  static bool IsSafeRelativeResource(std::string_view value);
  static std::string EscapeJson(std::string_view value);
  static std::wstring Utf8ToWide(std::string_view value);
  static std::string WideToUtf8(const wchar_t* value);

  Microsoft::WRL::ComPtr<ICoreWebView2> webview_;
  EventRegistrationToken messageToken_{};
  ReadyHandler ready_;
  LinkHandler link_;
  LocalResourceHandler localResource_;
  CompleteHandler complete_;
  ErrorHandler error_;
};

}  // namespace mpp
