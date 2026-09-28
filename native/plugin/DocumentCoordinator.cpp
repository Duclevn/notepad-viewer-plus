#include "DocumentCoordinator.h"

#include "PluginConstants.h"

#include <Notepad_plus_msgs.h>

#include <algorithm>
#include <filesystem>
#include <utility>
#include <vector>

namespace mpp {

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
void DocumentCoordinator::SetTooLargeHandler(TooLargeHandler handler) { tooLarge_ = std::move(handler); }
void DocumentCoordinator::SetSettings(Settings settings) { settings_ = std::move(settings); }

void DocumentCoordinator::OnNotification(const SCNotification* notification) {
  if (stopped_ || !notification) return;
  switch (notification->nmhdr.code) {
    case SCN_MODIFIED:
      if ((notification->modificationType & (SC_MOD_INSERTTEXT | SC_MOD_DELETETEXT | SC_PERFORMED_UNDO | SC_PERFORMED_REDO)) != 0) Schedule();
      break;
    case NPPN_BUFFERACTIVATED:
    case NPPN_FILESAVED:
    case NPPN_FILEOPENED:
    case NPPN_FILECLOSED:
      Schedule();
      break;
    default:
      break;
  }
}

void DocumentCoordinator::RefreshNow() {
  if (stopped_ || !update_) return;
  KillTimer(notepadWindow_, kDebounceTimerId);
  scheduled_ = false;
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
  if (stopped_ || !settings_.autoRefresh || !update_) return;
  scheduled_ = true;
  KillTimer(notepadWindow_, kDebounceTimerId);
  SetTimer(notepadWindow_, kDebounceTimerId, std::clamp(settings_.debounceMilliseconds, 100u, 1000u), &TimerProc);
}

void DocumentCoordinator::FireDebounced() {
  if (!scheduled_ || stopped_) return;
  KillTimer(notepadWindow_, kDebounceTimerId);
  scheduled_ = false;
  ++generation_;
  if (update_) update_(Snapshot());
}

HWND DocumentCoordinator::ActiveEditor() const {
  int which = 0;
  SendMessageW(notepadWindow_, NPPM_GETCURRENTSCINTILLA, 0, reinterpret_cast<LPARAM>(&which));
  return which == 0 ? mainEditor_ : secondEditor_;
}

DocumentUpdate DocumentCoordinator::Snapshot() const {
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
  const std::wstring path = CurrentPath();
  if (directoryToken_) update.documentDirectoryToken = directoryToken_(path);

  const HWND editor = ActiveEditor();
  const LRESULT length = editor ? SendMessageW(editor, SCI_GETTEXTLENGTH, 0, 0) : 0;
  const std::size_t maximumBytes = static_cast<std::size_t>(settings_.maximumDocumentMegabytes) * 1024u * 1024u;
  if (length < 0 || static_cast<std::size_t>(length) > maximumBytes) {
    const std::size_t actualBytes = length < 0 ? 0 : static_cast<std::size_t>(length);
    if (tooLarge_) tooLarge_(actualBytes);
    update.text = "# Preview unavailable\n\nThe document is too large for live preview (limit: " +
                  std::to_string(maximumBytes / (1024u * 1024u)) +
                  " MiB; received at least " + std::to_string(actualBytes) + " bytes).\n";
    return update;
  }
  update.text = ReadUtf8(editor);
  return update;
}

std::string DocumentCoordinator::ReadUtf8(HWND editor) const {
  if (!editor) return {};
  const LRESULT length = SendMessageW(editor, SCI_GETTEXTLENGTH, 0, 0);
  if (length <= 0) return {};
  std::vector<char> buffer(static_cast<std::size_t>(length) + 1, '\0');
  SendMessageW(editor, SCI_GETTEXT, static_cast<WPARAM>(buffer.size()), reinterpret_cast<LPARAM>(buffer.data()));
  return std::string(buffer.data(), static_cast<std::size_t>(length));
}

std::wstring DocumentCoordinator::CurrentPath() const {
  std::vector<wchar_t> path(1024);
  for (int attempt = 0; attempt < 6; ++attempt) {
    const LRESULT length = SendMessageW(notepadWindow_, NPPM_GETFULLCURRENTPATH,
                                        static_cast<WPARAM>(path.size()), reinterpret_cast<LPARAM>(path.data()));
    if (length <= 0) return {};
    if (static_cast<std::size_t>(length) < path.size() - 1) return std::wstring(path.data(), static_cast<std::size_t>(length));
    path.resize(path.size() * 2);
  }
  return {};
}

std::string DocumentCoordinator::ThemeName(const std::string& theme) {
  return theme == "light" || theme == "dark" ? theme : "system";
}

}  // namespace mpp
