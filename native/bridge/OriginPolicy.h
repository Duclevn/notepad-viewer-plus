#pragma once

#include <string_view>

namespace mpp {

// WebView2 reports the full URI of the document that posted a web message,
// rather than only its scheme/host origin. Accept only the packaged main page.
inline constexpr std::string_view kAllowedAppMessageSource = "https://app.local/index.html";

constexpr bool IsAllowedAppMessageSource(std::string_view source) noexcept {
  return source == kAllowedAppMessageSource;
}

// Child iframes are restricted to packaged sandboxed frames, exact PDF files,
// and local sandboxed srcdoc documents. In Chromium, newly attached iframes
// navigate to "about:blank" initially before "about:srcdoc" is loaded.
constexpr bool IsAllowedFrameUri(std::wstring_view uri) noexcept {
  return uri == L"https://app.local/diagram-frame.html" ||
         uri == L"https://app.local/math-frame.html" ||
         uri == L"about:srcdoc" ||
         uri == L"about:blank";
}

}  // namespace mpp
