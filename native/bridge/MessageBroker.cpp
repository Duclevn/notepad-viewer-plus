#include "MessageBroker.h"

#include "JsonWriter.h"
#include "../plugin/PluginConstants.h"
#include "OriginPolicy.h"

#include <windows.h>

#include <charconv>
#include <cctype>
#include <limits>
#include <utility>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace mpp {
namespace {

std::size_t SkipWhitespace(std::string_view value, std::size_t position) {
  while (position < value.size() && std::isspace(static_cast<unsigned char>(value[position])) != 0) ++position;
  return position;
}

bool ReadJsonStringAt(std::string_view json, std::size_t position, std::string& value) {
  if (position >= json.size() || json[position] != '"') return false;
  value.clear();
  for (std::size_t i = position + 1; i < json.size(); ++i) {
    const char character = json[i];
    if (character == '"') return true;
    if (static_cast<unsigned char>(character) < 0x20) return false;
    if (character != '\\') {
      value.push_back(character);
      continue;
    }
    if (++i >= json.size()) return false;
    switch (json[i]) {
      case '"': value.push_back('"'); break;
      case '\\': value.push_back('\\'); break;
      case '/': value.push_back('/'); break;
      case 'b': value.push_back('\b'); break;
      case 'f': value.push_back('\f'); break;
      case 'n': value.push_back('\n'); break;
      case 'r': value.push_back('\r'); break;
      case 't': value.push_back('\t'); break;
      default: return false;
    }
  }
  return false;
}

bool HasExactField(std::string_view json, std::string_view key, std::size_t& valueStart) {
  const std::string needle = "\"" + std::string(key) + "\"";
  for (std::size_t field = json.find(needle); field != std::string_view::npos; field = json.find(needle, field + needle.size())) {
    std::size_t delimiter = field;
    while (delimiter > 0 && std::isspace(static_cast<unsigned char>(json[delimiter - 1])) != 0) --delimiter;
    if (delimiter == 0 || (json[delimiter - 1] != '{' && json[delimiter - 1] != ',')) continue;
    std::size_t colon = field + needle.size();
    while (colon < json.size() && std::isspace(static_cast<unsigned char>(json[colon])) != 0) ++colon;
    if (colon >= json.size() || json[colon] != ':') continue;
    valueStart = SkipWhitespace(json, colon + 1);
    return valueStart < json.size();
  }
  return false;
}

bool IsSafeToken(std::string_view value) {
  if (value.empty() || value.size() > 256) return false;
  for (const unsigned char character : value) {
    if (!(std::isalnum(character) != 0 || character == '.' || character == '_' || character == '-' || character == '~')) return false;
  }
  return true;
}

bool IsAllowedFormat(std::string_view value) {
  return value == "markdown" || value == "mermaid" || value == "plantuml" || value == "html" || value == "svg" ||
         value == "json" || value == "yaml" || value == "xml" || value == "csv" || value == "tsv" || value == "openapi" ||
         value == "pdf" || value == "image" || value == "plain-text";
}

bool IsAllowedMediaType(std::string_view value) {
  return value == "application/pdf" || value == "image/avif" || value == "image/bmp" || value == "image/gif" ||
         value == "image/jpeg" || value == "image/png" || value == "image/webp" || value == "image/x-icon";
}

bool IsCompatibleResource(std::string_view format, std::string_view mediaType) {
  return (format == "pdf" && mediaType == "application/pdf") ||
         (format == "image" && mediaType.rfind("image/", 0) == 0);
}

void WriteSettings(JsonWriter& writer, const RendererSettings& settings) {
  writer.Key("settings");
  writer.BeginObject();
  writer.Key("showFrontMatter"); writer.Boolean(settings.showFrontMatter);
  writer.Key("showTableOfContents"); writer.Boolean(settings.showTableOfContents);
  writer.Key("rawHtml"); writer.Boolean(settings.rawHtml);
  writer.Key("remoteImages"); writer.Boolean(settings.remoteImages);
  writer.Key("mathAlternateDelimiters"); writer.Boolean(settings.mathAlternateDelimiters);
  writer.Key("codeWrapping"); writer.Boolean(settings.codeWrapping);
  writer.Key("formatOverride"); writer.String(settings.formatOverride);
  writer.Key("maximumTextBytes"); writer.Unsigned(settings.maximumTextBytes);
  writer.Key("maximumStructuredBytes"); writer.Unsigned(settings.maximumStructuredBytes);
  writer.Key("maximumCsvRows"); writer.Unsigned(settings.maximumCsvRows);
  writer.Key("maximumCsvColumns"); writer.Unsigned(settings.maximumCsvColumns);
  writer.Key("maximumCsvCellBytes"); writer.Unsigned(settings.maximumCsvCellBytes);
  writer.Key("maximumResourceBytes"); writer.Unsigned(settings.maximumResourceBytes);
  writer.EndObject();
}

}  // namespace

void MessageBroker::Attach(ComPtr<ICoreWebView2> webview) {
  Detach();
  webview_ = std::move(webview);
  if (!webview_) return;
  const std::weak_ptr<MessageBroker> weakSelf = weak_from_this();
  webview_->add_WebMessageReceived(
      Callback<ICoreWebView2WebMessageReceivedEventHandler>(
          [weakSelf](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) {
            if (const auto self = weakSelf.lock()) self->OnWebMessage(args);
            return S_OK;
          })
          .Get(),
      &messageToken_);
}

void MessageBroker::Detach() {
  if (webview_ && messageToken_.value != 0) webview_->remove_WebMessageReceived(messageToken_);
  messageToken_ = {};
  webview_.Reset();
}

void MessageBroker::SetHandlers(ReadyHandler ready, LinkHandler link, LocalResourceHandler localResource,
                                 CompleteHandler complete, ErrorHandler error, ProtocolMismatchHandler mismatch) {
  ready_ = std::move(ready);
  link_ = std::move(link);
  localResource_ = std::move(localResource);
  complete_ = std::move(complete);
  error_ = std::move(error);
  mismatch_ = std::move(mismatch);
}

bool MessageBroker::PostDocumentUpdate(const DocumentUpdate& update) const {
  if (!webview_ || (update.source.kind == PreviewSourceKind::Text && update.source.text.size() > kMaximumDocumentBytes) ||
      !IsAllowedFormat(update.formatHint) ||
      (!update.directoryToken.empty() && !IsSafeToken(update.directoryToken)) ||
      (update.source.kind == PreviewSourceKind::Resource &&
       (!IsSafeToken(update.source.token) || update.source.url != "https://doc.local/file/" + update.source.token ||
        !IsAllowedMediaType(update.source.mediaType) || !IsCompatibleResource(update.formatHint, update.source.mediaType) ||
        update.source.size > kMaximumResourceBytes ||
        update.source.size > update.settings.maximumResourceBytes)) ||
      (update.source.kind == PreviewSourceKind::Text && update.source.text.size() > update.settings.maximumTextBytes)) return false;

  JsonWriter writer;
  writer.BeginObject();
  writer.Key("type"); writer.String("preview.update");
  writer.Key("protocolVersion"); writer.Unsigned(kProtocolVersion);
  writer.Key("generation"); writer.Unsigned(update.generation);
  writer.Key("bufferId"); writer.Signed(update.bufferId);
  writer.Key("formatHint"); writer.String(update.formatHint);

  writer.Key("file");
  writer.BeginObject();
  writer.Key("name"); writer.String(update.file.name);
  writer.Key("extension"); writer.String(update.file.extension);
  writer.Key("saved"); writer.Boolean(update.file.saved);
  writer.EndObject();
  if (!update.directoryToken.empty()) {
    writer.Key("directoryToken"); writer.String(update.directoryToken);
  }

  writer.Key("source");
  writer.BeginObject();
  if (update.source.kind == PreviewSourceKind::Text) {
    writer.Key("kind"); writer.String("text");
    writer.Key("text"); writer.String(update.source.text);
  } else if (update.source.kind == PreviewSourceKind::Resource) {
    writer.Key("kind"); writer.String("resource");
    writer.Key("token"); writer.String(update.source.token);
    writer.Key("url"); writer.String(update.source.url);
    writer.Key("size"); writer.Unsigned(update.source.size);
    writer.Key("mediaType"); writer.String(update.source.mediaType);
  } else {
    writer.Key("kind"); writer.String("unavailable");
    writer.Key("reason"); writer.String(update.source.reason);
  }
  writer.EndObject();

  writer.Key("theme"); writer.String(update.theme);
  WriteSettings(writer, update.settings);
  const std::string json = std::move(writer).Finish();
  if (json.empty()) return false;
  const std::wstring message = Utf8ToWide(json);
  return !message.empty() && SUCCEEDED(webview_->PostWebMessageAsJson(message.c_str()));
}

void MessageBroker::OnWebMessage(ICoreWebView2WebMessageReceivedEventArgs* args) {
  if (!args || !IsAllowedOrigin(args)) return;
  PWSTR rawJson = nullptr;
  if (FAILED(args->get_WebMessageAsJson(&rawJson)) || rawJson == nullptr) return;
  const std::string json = WideToUtf8(rawJson);
  CoTaskMemFree(rawJson);
  if (json.size() > 64 * 1024 || json.empty() || json.front() != '{' || json.back() != '}') return;

  std::string type;
  unsigned long long protocol = 0;
  if (!ReadStringField(json, "type", type) || !ReadUnsignedField(json, "protocolVersion", protocol)) return;
  if (protocol != kProtocolVersion) {
    if (mismatch_) mismatch_();
    return;
  }
  if (type == "renderer.ready") {
    if (ready_) ready_();
    return;
  }

  if (type == "link.open") {
    std::string href;
    if (ReadStringField(json, "href", href) && IsSafeExternalUrl(href) && link_) link_(href);
    return;
  }

  if (type == "localResource.open") {
    std::string href;
    std::string token;
    if (ReadStringField(json, "href", href) && ReadStringField(json, "documentDirectoryToken", token) &&
        token.size() <= 256 && IsSafeRelativeResource(href) && localResource_) {
      localResource_(href, token);
    }
    return;
  }

  unsigned long long generation = 0;
  if (!ReadUnsignedField(json, "generation", generation)) return;
  if (type == "render.complete") {
    if (complete_) complete_(generation);
    return;
  }
  if (type == "render.error") {
    std::string message;
    if (ReadStringField(json, "message", message) && error_) error_(generation, message.substr(0, 1000));
    return;
  }
}

bool MessageBroker::IsAllowedOrigin(ICoreWebView2WebMessageReceivedEventArgs* args) {
  PWSTR source = nullptr;
  if (FAILED(args->get_Source(&source)) || source == nullptr) return false;
  const bool allowed = IsAllowedAppMessageSource(WideToUtf8(source));
  CoTaskMemFree(source);
  return allowed;
}

bool MessageBroker::ReadStringField(std::string_view json, std::string_view key, std::string& value) {
  std::size_t start = 0;
  if (!HasExactField(json, key, start)) return false;
  return ReadJsonStringAt(json, start, value) && value.size() <= 4096;
}

bool MessageBroker::ReadUnsignedField(std::string_view json, std::string_view key, unsigned long long& value) {
  std::size_t start = 0;
  if (!HasExactField(json, key, start)) return false;
  const char* begin = json.data() + start;
  const char* end = json.data() + json.size();
  auto [parsedEnd, status] = std::from_chars(begin, end, value);
  return status == std::errc{} && parsedEnd != begin &&
         (parsedEnd == end || std::isspace(static_cast<unsigned char>(*parsedEnd)) != 0 || *parsedEnd == ',' || *parsedEnd == '}');
}

bool MessageBroker::IsSafeExternalUrl(std::string_view value) {
  if (value.empty() || value.size() > 4096 || value.find_first_of("\r\n\\") != std::string_view::npos || value.find('\0') != std::string_view::npos) return false;
  const std::size_t hostStart = value.rfind("https://", 0) == 0 ? 8 : (value.rfind("http://", 0) == 0 ? 7 : 0);
  if (hostStart == 0 || hostStart >= value.size()) return false;
  const std::size_t hostEnd = value.find_first_of("/?#", hostStart);
  const std::string_view host = value.substr(hostStart, hostEnd == std::string_view::npos ? value.size() - hostStart : hostEnd - hostStart);
  return !host.empty() && host.find_first_of(" \t") == std::string_view::npos;
}

bool MessageBroker::IsSafeRelativeResource(std::string_view value) {
  if (value.empty() || value.front() == '/' || value.front() == '\\' || value.rfind("//", 0) == 0) return false;
  for (const unsigned char character : value) {
    if (character < 0x20 || character == 0x7f) return false;
  }
  if (value.find(':') != std::string_view::npos) return false;
  std::size_t start = 0;
  while (start < value.size()) {
    const std::size_t slash = value.find_first_of("/\\?#", start);
    const std::string_view segment = value.substr(start, slash == std::string_view::npos ? value.size() - start : slash - start);
    if (segment == "..") return false;
    if (slash == std::string_view::npos || value[slash] == '?' || value[slash] == '#') break;
    start = slash + 1;
  }
  return true;
}

std::wstring MessageBroker::Utf8ToWide(std::string_view value) {
  if (value.empty()) return {};
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) return {};
  std::wstring result(static_cast<std::size_t>(size), L'\0');
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size) <= 0) return {};
  return result;
}

std::string MessageBroker::WideToUtf8(const wchar_t* value) {
  if (!value) return {};
  const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, -1, nullptr, 0, nullptr, nullptr);
  if (size <= 1) return {};
  std::string result(static_cast<std::size_t>(size), '\0');
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, -1, result.data(), size, nullptr, nullptr) <= 0) return {};
  result.pop_back();
  return result;
}

}  // namespace mpp
