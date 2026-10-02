#include "bridge/OriginPolicy.h"

#include <iostream>

bool RunNotepadMessageTests();
bool RunPluginCommandTests();
bool RunProtocolTests();
bool RunResourcePolicyTests();

int main() {
  using mpp::IsAllowedAppMessageSource;
  using mpp::IsAllowedFrameUri;

  if (!IsAllowedAppMessageSource("https://app.local/index.html")) {
    std::cerr << "The packaged renderer document URI must be accepted\n";
    return 1;
  }

  constexpr const char* blocked[] = {
      "https://app.local",
      "https://app.local/",
      "https://app.local/other.html",
      "https://app.local.evil/index.html",
      "http://app.local/index.html",
      "https://doc.local/index.html",
  };
  for (const char* source : blocked) {
    if (IsAllowedAppMessageSource(source)) {
      std::cerr << "Unexpectedly accepted message source: " << source << '\n';
      return 1;
    }
  }

  constexpr const wchar_t* allowedFrames[] = {
      L"https://app.local/diagram-frame.html",
      L"https://app.local/math-frame.html",
      L"about:srcdoc",
      L"about:blank",
  };
  for (const wchar_t* uri : allowedFrames) {
    if (!IsAllowedFrameUri(uri)) {
      std::wcerr << L"Expected frame URI to be allowed: " << uri << L'\n';
      return 1;
    }
  }

  constexpr const wchar_t* blockedFrames[] = {
      L"https://app.local/index.html",
      L"https://app.local/other.html",
      L"https://doc.local/index.html",
      L"https://google.com",
      L"http://evil.com/page.html",
      L"javascript:void(0)",
      L"data:text/html,evil",
      L"",
  };
  for (const wchar_t* uri : blockedFrames) {
    if (IsAllowedFrameUri(uri)) {
      std::wcerr << L"Unexpectedly accepted frame URI: " << uri << L'\n';
      return 1;
    }
  }

  if (!RunProtocolTests()) return 1;
  if (!RunResourcePolicyTests()) return 1;
  if (!RunNotepadMessageTests()) return 1;
  if (!RunPluginCommandTests()) return 1;
  return 0;
}
