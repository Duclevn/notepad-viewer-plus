#include "LocalDocumentOpener.h"

#include <filesystem>

namespace mpp {

bool OpenLocalDocument(const std::wstring& path, const LocalDocumentDispatcher& dispatch) {
  if (path.empty() || !dispatch) return false;
  std::error_code error;
  const std::filesystem::path filePath(path);
  if (!filePath.is_absolute() || !std::filesystem::is_regular_file(filePath, error) || error) return false;
  return dispatch(path);
}

}  // namespace mpp
