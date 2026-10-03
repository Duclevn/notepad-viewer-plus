#include "JsonWriter.h"

#include <utility>

namespace mpp {
namespace {

void AppendEscaped(std::string& output, std::string_view value) {
  output.reserve(output.size() + value.size() + 2);
  output.push_back('"');
  constexpr char hex[] = "0123456789abcdef";
  for (const unsigned char character : value) {
    switch (character) {
      case '"': output += "\\\""; break;
      case '\\': output += "\\\\"; break;
      case '\b': output += "\\b"; break;
      case '\f': output += "\\f"; break;
      case '\n': output += "\\n"; break;
      case '\r': output += "\\r"; break;
      case '\t': output += "\\t"; break;
      default:
        if (character < 0x20) {
          output += "\\u00";
          output.push_back(hex[character >> 4]);
          output.push_back(hex[character & 0x0f]);
        } else {
          output.push_back(static_cast<char>(character));
        }
    }
  }
  output.push_back('"');
}

}  // namespace

void JsonWriter::BeginObject() {
  BeforeValue();
  json_.push_back('{');
  frames_.push_back({});
}

void JsonWriter::EndObject() {
  if (frames_.empty()) {
    invalid_ = true;
    return;
  }
  if (frames_.back().expectingValue) invalid_ = true;
  json_.push_back('}');
  frames_.pop_back();
}

void JsonWriter::Key(std::string_view key) {
  if (frames_.empty() || frames_.back().expectingValue) {
    invalid_ = true;
    return;
  }
  auto& frame = frames_.back();
  if (!frame.first) json_.push_back(',');
  frame.first = false;
  AppendEscaped(json_, key);
  json_.push_back(':');
  frame.expectingValue = true;
}

void JsonWriter::String(std::string_view value) {
  BeforeValue();
  AppendEscaped(json_, value);
}

void JsonWriter::Unsigned(std::uint64_t value) {
  BeforeValue();
  json_ += std::to_string(value);
}

void JsonWriter::Signed(std::int64_t value) {
  BeforeValue();
  json_ += std::to_string(value);
}

void JsonWriter::Boolean(bool value) {
  BeforeValue();
  json_ += value ? "true" : "false";
}

std::string JsonWriter::Finish() && {
  if (!Error().empty()) return {};
  return std::move(json_);
}

std::string_view JsonWriter::Error() const noexcept {
  if (invalid_) return "invalid write sequence";
  if (!rootWritten_) return "missing root value";
  if (!frames_.empty()) return frames_.back().expectingValue ? "missing object value" : "unclosed object";
  return {};
}

std::string JsonWriter::Escape(std::string_view value) {
  std::string escaped;
  AppendEscaped(escaped, value);
  return escaped;
}

void JsonWriter::BeforeValue() {
  if (frames_.empty()) {
    if (rootWritten_) invalid_ = true;
    rootWritten_ = true;
    return;
  }
  auto& frame = frames_.back();
  if (!frame.expectingValue) {
    invalid_ = true;
    return;
  }
  frame.expectingValue = false;
}

}  // namespace mpp
