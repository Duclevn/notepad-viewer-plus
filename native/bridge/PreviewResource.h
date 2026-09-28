#pragma once

#include <cstddef>
#include <string>

namespace mpp {

struct PreviewResource {
  std::string token;
  std::string url;
  std::size_t size{0};
  std::string mediaType;
};

}  // namespace mpp
