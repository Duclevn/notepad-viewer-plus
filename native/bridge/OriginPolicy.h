#pragma once

#include <string_view>

namespace mpp {

// WebView2 reports the full URI of the document that posted a web message,
// rather than only its scheme/host origin. Accept only the packaged main page.
inline constexpr std::string_view kAllowedAppMessageSource = "https://app.local/index.html";

constexpr bool IsAllowedAppMessageSource(std::string_view source) noexcept {
  return source == kAllowedAppMessageSource;
}

}  // namespace mpp
