#include "DocumentCoordinator.h"

#include "PluginConstants.h"

#include <Notepad_plus_msgs.h>

#include <algorithm>
#include <filesystem>
#include <limits>
#include <utility>
#include <vector>

namespace mpp {
namespace {

constexpr unsigned kUtf8CodePage = 65001;

std::string LowerAscii(std::string value) {
  for (char& character : value) {
    if (character >= 'A' && character <= 'Z') character = static_cast<char>(character - 'A' + 'a');
  }
  return value;
}

}  // namespace

DocumentCoordinator* DocumentCoordinator::activeCoordinator_ = nullptr;

DocumentCoordinator::DocumentCoordinator(HWND notepadWindow, HWND mainEditor, HWND secondEditor)
    : notepadWindow_(notepadWindow), mainEditor_(mainEditor), secondEditor_(secondEditor) {
  activeCoordinator_ = this;
}

DocumentCoordinator::~DocumentCoordinator() {
  Stop();
  if (activeCoordinator_ == this) activeCoordinator_ = nullptr;
}

void DocumentCoordinator::SetUpdateHandler(UpdateHandler handler) { update_ = std::move(handler); }
void DocumentCoordinator::SetDirectoryTokenHandler(DirectoryTokenHandler handler) { directoryToken_ = std::move(handler); }
void DocumentCoordinator::SetResourceRegistrationHandler(ResourceRegistrationHandler handler) { registerResource_ = std::move(handler); }
void DocumentCoordinator::SetResourceActivationHandler(ResourceActivationHandler handler) { activateResource_ = std::move(handler); }
void DocumentCoordinator::SetResourceRevocationHandler(ResourceRevocationHandler handler) { revokeResources_ = std::move(handler); }
void DocumentCoordinator::SetTooLargeHandler(TooLargeHandler handler) { tooLarge_ = std::move(handler); }
void DocumentCoordinator::SetSettings(Settings settings) { settings_ = std::move(settings); }
void DocumentCoordinator::SetVisible(bool visible) {
  if (stopped_ || visible_ == visible) return;
  visible_ = visible;
  if (!visible_) {
    KillTimer(notepadWindow_, kDebounceTimerId);
    scheduled_ = false;
    if (revokeResources_) revokeResources_();
    ++generation_;
    return;
  }

  // Showing the dock always gets one current snapshot, including when
  // automatic refresh is disabled.  This is the only hidden-to-visible work
  // trigger, so repeated show notifications cannot duplicate the refresh.
  RefreshNow();
}

void DocumentCoordinator::OnNotification(const SCNotification* notification) {
  if (stopped_ || !notification) return;
  switch (notification->nmhdr.code) {
    case SCN_MODIFIED:
      if ((notification->modificationType & (SC_MOD_INSERTTEXT | SC_MOD_DELETETEXT | SC_PERFORMED_UNDO | SC_PERFORMED_REDO)) != 0) Schedule();
      break;
    case NPPN_BUFFERACTIVATED:
    case NPPN_FILEBEFORECLOSE:
    case NPPN_FILEBEFOREOPEN:
    case NPPN_FILEBEFORELOAD:
    case NPPN_FILEBEFORESAVE:
    case NPPN_FILEBEFORERENAME:
    case NPPN_FILEBEFOREDELETE:
      if (revokeResources_) revokeResources_();
      Schedule();
      break;
    case NPPN_FILESAVED:
    case NPPN_FILERENAMED:
    case NPPN_FILEOPENED:
    case NPPN_FILECLOSED:
      Schedule();
      break;
    default:
      break;
  }
}

void DocumentCoordinator::RefreshNow() {
  if (stopped_) return;
  KillTimer(notepadWindow_, kDebounceTimerId);
  scheduled_ = false;
  if (!visible_ || !update_) {
    ++generation_;
    return;
  }
  ++generation_;
  update_(Snapshot());
}

void DocumentCoordinator::Stop() {
  stopped_ = true;
  scheduled_ = false;
  KillTimer(notepadWindow_, kDebounceTimerId);
  if (activeCoordinator_ == this) activeCoordinator_ = nullptr;
}

void CALLBACK DocumentCoordinator::TimerProc(HWND, UINT, UINT_PTR timerId, DWORD) {
  if (timerId == kDebounceTimerId && activeCoordinator_) activeCoordinator_->FireDebounced();
}

void DocumentCoordinator::Schedule() {
  if (stopped_ || !update_) return;
  if (!visible_ || !settings_.autoRefresh) return;
  scheduled_ = true;
  KillTimer(notepadWindow_, kDebounceTimerId);
  SetTimer(notepadWindow_, kDebounceTimerId, std::clamp(settings_.debounceMilliseconds, 100u, 1000u), &TimerProc);
}

void DocumentCoordinator::FireDebounced() {
  if (!scheduled_ || stopped_) return;
  KillTimer(notepadWindow_, kDebounceTimerId);
  scheduled_ = false;
  if (!visible_) {
    ++generation_;
    return;
  }
  ++generation_;
  if (update_) update_(Snapshot());
}

HWND DocumentCoordinator::ActiveEditor() const {
  int which = 0;
  SendMessageW(notepadWindow_, NPPM_GETCURRENTSCINTILLA, 0, reinterpret_cast<LPARAM>(&which));
  return which == 0 ? mainEditor_ : secondEditor_;
}

DocumentUpdate DocumentCoordinator::Snapshot() {
  DocumentUpdate update;
  update.generation = generation_;
  update.bufferId = static_cast<long long>(SendMessageW(notepadWindow_, NPPM_GETCURRENTBUFFERID, 0, 0));
  update.theme = ThemeName(settings_.theme);
  update.settings.showFrontMatter = settings_.showFrontMatter;
  update.settings.showTableOfContents = settings_.showTableOfContents;
  update.settings.rawHtml = settings_.rawHtml;
  update.settings.remoteImages = settings_.remoteImages;
  update.settings.mathAlternateDelimiters = settings_.mathAlternateDelimiters;
  update.settings.codeWrapping = settings_.codeWrapping;
  update.settings.formatOverride = settings_.formatOverride;
  update.settings.maximumTextBytes = std::min<std::size_t>(settings_.maximumDocumentMegabytes * 1024u * 1024u, kMaximumDocumentBytes);
  update.settings.maximumStructuredBytes = std::min<std::size_t>(settings_.maximumStructuredMegabytes * 1024u * 1024u, kMaximumDocumentBytes);
  update.settings.maximumCsvRows = settings_.maximumCsvRows;
  update.settings.maximumCsvColumns = settings_.maximumCsvColumns;
  update.settings.maximumCsvCellBytes = settings_.maximumCsvCellKilobytes * 1024u;
  update.settings.maximumResourceBytes = std::min<std::size_t>(settings_.maximumResourceMegabytes * 1024u * 1024u, kMaximumResourceBytes);

  const std::wstring path = CurrentPath();
  update.file.saved = !path.empty();
  update.file.name = path.empty() ? "untitled" : Utf8FromWide(std::filesystem::path(path).filename().wstring());
  if (update.file.name.empty()) update.file.name = "untitled";
  update.file.extension = ExtensionForPath(path);
  update.formatHint = FormatForExtension(update.file.extension);
  if (!settings_.formatOverride.empty() && settings_.formatOverride != "auto" &&
      (!IsBinaryFormat(settings_.formatOverride) || settings_.formatOverride == update.formatHint)) {
    update.formatHint = settings_.formatOverride;
  }
  if (activateResource_) activateResource_(update.bufferId, update.generation);

  const HWND editor = ActiveEditor();
  if (IsBinaryFormat(update.formatHint)) {
    // The Scintilla buffer is deliberately never read for binary viewers.
    if (path.empty()) {
      update.source.kind = PreviewSourceKind::Unavailable;
      update.source.reason = "Save the file before previewing this binary format.";
      return update;
    }

    std::error_code error;
    const auto canonical = std::filesystem::weakly_canonical(path, error);
    const auto size = error || !std::filesystem::is_regular_file(canonical, error) ? 0u : std::filesystem::file_size(canonical, error);
    if (error || size > update.settings.maximumResourceBytes || size > kMaximumResourceBytes || !registerResource_) {
      update.source.kind = PreviewSourceKind::Unavailable;
      update.source.reason = error ? "The saved file could not be opened for preview." :
        "The file is too large for the configured binary preview limit.";
      return update;
    }
    const std::string mediaType = MediaTypeForExtension(update.file.extension);
    const auto resource = registerResource_(update.bufferId, update.generation, canonical.wstring(), mediaType, static_cast<std::size_t>(size));
    if (!resource) {
      update.source.kind = PreviewSourceKind::Unavailable;
      update.source.reason = "The saved file could not be registered as a safe preview resource.";
      return update;
    }
    update.source.kind = PreviewSourceKind::Resource;
    update.source.token = resource->token;
    update.source.url = resource->url;
    update.source.size = resource->size;
    update.source.mediaType = resource->mediaType;
    return update;
  }

  if (directoryToken_ && !path.empty()) update.directoryToken = directoryToken_(path);

  const LRESULT length = editor ? SendMessageW(editor, SCI_GETTEXTLENGTH, 0, 0) : 0;
  const std::size_t maximumBytes = update.settings.maximumTextBytes;
  if (length < 0 || static_cast<std::size_t>(length) > maximumBytes) {
    const std::size_t actualBytes = length < 0 ? 0 : static_cast<std::size_t>(length);
    if (tooLarge_) tooLarge_(actualBytes);
    update.source.kind = PreviewSourceKind::Unavailable;
    update.source.reason = "The document is too large for live preview (limit: " +
                           std::to_string(maximumBytes / (1024u * 1024u)) +
                           " MiB; received at least " + std::to_string(actualBytes) + " bytes).";
    return update;
  }
  update.source.kind = PreviewSourceKind::Text;
  update.source.text = ReadUtf8(editor);
  if (update.source.text.size() > maximumBytes) {
    if (tooLarge_) tooLarge_(update.source.text.size());
    update.source.kind = PreviewSourceKind::Unavailable;
    update.source.text.clear();
    update.source.reason = "The UTF-8 document exceeds the live preview limit.";
  }
  return update;
}

std::string DocumentCoordinator::ReadUtf8(HWND editor) const {
  if (!editor) return {};
  const LRESULT length = SendMessageW(editor, SCI_GETTEXTLENGTH, 0, 0);
  if (length <= 0) return {};
  std::string buffer(static_cast<std::size_t>(length) + 1, '\0');
  SendMessageW(editor, SCI_GETTEXT, static_cast<WPARAM>(buffer.size()), reinterpret_cast<LPARAM>(buffer.data()));
  const unsigned codePage = static_cast<unsigned>(SendMessageW(editor, SCI_GETCODEPAGE, 0, 0));
  if (codePage == kUtf8CodePage || codePage == 0) {
    buffer.resize(static_cast<std::size_t>(length));
    return buffer;
  }

  const int wideLength = MultiByteToWideChar(codePage, MB_ERR_INVALID_CHARS, buffer.data(), static_cast<int>(length), nullptr, 0);
  if (wideLength <= 0) {
    buffer.resize(static_cast<std::size_t>(length));
    return buffer;
  }
  std::wstring wide(static_cast<std::size_t>(wideLength), L'\0');
  if (MultiByteToWideChar(codePage, MB_ERR_INVALID_CHARS, buffer.data(), static_cast<int>(length), wide.data(), wideLength) <= 0) return {};
  const int utf8Length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide.data(), wideLength, nullptr, 0, nullptr, nullptr);
  if (utf8Length <= 0) return {};
  std::string result(static_cast<std::size_t>(utf8Length), '\0');
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide.data(), wideLength, result.data(), utf8Length, nullptr, nullptr) <= 0) return {};
  return result;
}

std::wstring DocumentCoordinator::CurrentPath() const {
  // Unlike newer sized-string NPP messages, RUNCOMMAND_USER string messages
  // return BOOL on the copy call, not the copied character count.
  std::vector<wchar_t> path(1024, L'\0');
  for (int attempt = 0; attempt < 6; ++attempt) {
    const LRESULT succeeded = SendMessageW(notepadWindow_, NPPM_GETFULLCURRENTPATH,
                                           static_cast<WPARAM>(path.size()), reinterpret_cast<LPARAM>(path.data()));
    if (succeeded != FALSE) {
      const auto terminator = std::find(path.cbegin(), path.cend(), L'\0');
      return terminator == path.cend() ? std::wstring{} : std::wstring(path.cbegin(), terminator);
    }
    path.assign(path.size() * 2, L'\0');
  }
  return {};
}

std::string DocumentCoordinator::ThemeName(const std::string& theme) {
  return theme == "light" || theme == "dark" ? theme : "system";
}

std::string DocumentCoordinator::Utf8FromWide(const std::wstring& value) {
  if (value.empty()) return {};
  const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (size <= 0) return {};
  std::string result(static_cast<std::size_t>(size), '\0');
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr) <= 0) return {};
  return result;
}

std::string DocumentCoordinator::ExtensionForPath(const std::wstring& path) {
  if (path.empty()) return {};
  return LowerAscii(Utf8FromWide(std::filesystem::path(path).extension().wstring()));
}

std::string DocumentCoordinator::FormatForExtension(const std::string& extension) {
  if (extension == ".md" || extension == ".markdown" || extension == ".mdown" || extension == ".mkd") return "markdown";
  if (extension == ".mmd" || extension == ".mermaid") return "mermaid";
  if (extension == ".puml" || extension == ".plantuml" || extension == ".pu" || extension == ".iuml" || extension == ".wsd") return "plantuml";
  if (extension == ".html" || extension == ".htm") return "html";
  if (extension == ".svg") return "svg";
  if (extension == ".json" || extension == ".openapi.json" || extension == ".swagger.json") return "json";
  if (extension == ".yaml" || extension == ".yml" || extension == ".openapi.yaml" || extension == ".swagger.yaml") return "yaml";
  if (extension == ".xml") return "xml";
  if (extension == ".csv") return "csv";
  if (extension == ".tsv" || extension == ".tab") return "tsv";
  if (extension == ".pdf") return "pdf";
  if (extension == ".png" || extension == ".jpg" || extension == ".jpeg" || extension == ".gif" ||
      extension == ".webp" || extension == ".bmp" || extension == ".ico" || extension == ".avif") return "image";
  return "plain-text";
}

bool DocumentCoordinator::IsBinaryFormat(const std::string& format) {
  return format == "pdf" || format == "image";
}

std::string DocumentCoordinator::MediaTypeForExtension(const std::string& extension) {
  if (extension == ".pdf") return "application/pdf";
  if (extension == ".png") return "image/png";
  if (extension == ".jpg" || extension == ".jpeg") return "image/jpeg";
  if (extension == ".gif") return "image/gif";
  if (extension == ".webp") return "image/webp";
  if (extension == ".bmp") return "image/bmp";
  if (extension == ".ico") return "image/x-icon";
  if (extension == ".avif") return "image/avif";
  return {};
}

}  // namespace mpp
