#pragma once

#include <functional>
#include <string>

namespace mpp {

// The dispatcher is deliberately supplied by the caller so the security
// boundary can be tested without starting a shell or Notepad++ instance.
using LocalDocumentDispatcher = std::function<bool(const std::wstring&)>;

bool OpenLocalDocument(const std::wstring& path, const LocalDocumentDispatcher& dispatch);

}  // namespace mpp
