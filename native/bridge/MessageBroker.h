#pragma once

#include <windows.h>
#include <objbase.h>
#include <WebView2.h>
#include <wrl.h>

#include "PreviewResource.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <string_view>

namespace mpp {

enum class PreviewSourceKind { Text, Resource, Unavailable };

struct RendererSettings {
  bool showFrontMatter{true};
  bool showTableOfContents{false};
  bool rawHtml{true};
  bool remoteImages{false};
  bool mathAlternateDelimiters{false};
  bool codeWrapping{true};
  std::string formatOverride{"auto"};
  std::size_t maximumTextBytes{5u * 1024u * 1024u};
  std::size_t maximumStructuredBytes{5u * 1024u * 1024u};
  unsigned maximumCsvRows{10000};
  unsigned maximumCsvColumns{100};
  std::size_t maximumCsvCellBytes{64u * 1024u};
  std::size_t maximumResourceBytes{512u * 1024u * 1024u};
};

struct PreviewFile {
  std::string name{"untitled"};
  std::string extension;
  bool saved{false};
};

struct PreviewSource {
  PreviewSourceKind kind{PreviewSourceKind::Text};
  std::string text;
  std::string token;
  std::string url;
  std::size_t size{0};
  std::string mediaType;
  std::string reason;
};

struct DocumentUpdate {
  unsigned long long generation{0};
  long long bufferId{0};
  std::string formatHint{"plain-text"};
  PreviewFile file;
  std::string directoryToken;
  PreviewSource source;
  std::string theme{"system"};
  RendererSettings settings;
};

using PreviewUpdate = DocumentUpdate;

class MessageBroker final : public std::enable_shared_from_this<MessageBroker> {
 public:
  using ReadyHandler = std::function<void()>;
  using LinkHandler = std::function<void(const std::string&)>;
  using LocalResourceHandler = std::function<void(const std::string&, const std::string&)>;
  using CompleteHandler = std::function<void(unsigned long long)>;
  using ErrorHandler = std::function<void(unsigned long long, const std::string&)>;
  using ProtocolMismatchHandler = std::function<void()>;

  void Attach(Microsoft::WRL::ComPtr<ICoreWebView2> webview);
  void Detach();
  void SetHandlers(ReadyHandler ready, LinkHandler link, LocalResourceHandler localResource,
                   CompleteHandler complete, ErrorHandler error, ProtocolMismatchHandler mismatch = {});
  bool PostDocumentUpdate(const DocumentUpdate& update) const;

 private:
  void OnWebMessage(ICoreWebView2WebMessageReceivedEventArgs* args);
  static bool IsAllowedOrigin(ICoreWebView2WebMessageReceivedEventArgs* args);
  static bool ReadStringField(std::string_view json, std::string_view key, std::string& value);
  static bool ReadUnsignedField(std::string_view json, std::string_view key, unsigned long long& value);
  static bool IsSafeExternalUrl(std::string_view value);
  static bool IsSafeRelativeResource(std::string_view value);
  static std::wstring Utf8ToWide(std::string_view value);
  static std::string WideToUtf8(const wchar_t* value);

  Microsoft::WRL::ComPtr<ICoreWebView2> webview_;
  EventRegistrationToken messageToken_{};
  ReadyHandler ready_;
  LinkHandler link_;
  LocalResourceHandler localResource_;
  CompleteHandler complete_;
  ErrorHandler error_;
  ProtocolMismatchHandler mismatch_;
};

}  // namespace mpp
