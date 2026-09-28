#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace mpp {

// Small, deterministic JSON object writer used for the native/renderer bridge.
// It intentionally exposes only the value types required by protocol v2 so new
// fields cannot accidentally be interpolated into JSON source.
class JsonWriter final {
 public:
  void BeginObject();
  void EndObject();
  void Key(std::string_view key);
  void String(std::string_view value);
  void Unsigned(std::uint64_t value);
  void Signed(std::int64_t value);
  void Boolean(bool value);
  [[nodiscard]] std::string Finish() &&;

  static std::string Escape(std::string_view value);

 private:
  struct Frame {
    bool first{true};
  };

  void BeforeValue();

  std::string json_;
  std::vector<Frame> frames_;
  bool expectingValue_{false};
};

}  // namespace mpp
