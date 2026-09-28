#include "bridge/OriginPolicy.h"

#include <iostream>

bool RunProtocolTests();
bool RunResourcePolicyTests();

int main() {
  using mpp::IsAllowedAppMessageSource;

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

  if (!RunProtocolTests()) return 1;
  if (!RunResourcePolicyTests()) return 1;
  return 0;
}
