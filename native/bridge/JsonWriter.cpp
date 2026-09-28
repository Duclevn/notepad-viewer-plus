#include "JsonWriter.h"

#include <cstdio>
#include <utility>

namespace mpp {

void JsonWriter::BeginObject() {
  BeforeValue();
  json_.push_back('{');
  frames_.push_back({});
}

void JsonWriter::EndObject() {
  if (frames_.empty()) return;
  json_.push_back('}');
  frames_.pop_back();
  expectingValue_ = false;
}

void JsonWriter::Key(std::string_view key) {
  if (frames_.empty()) return;
  auto& frame = frames_.back();
  if (!frame.first) json_.push_back(',');
  frame.first = false;
  json_ += Escape(key);
  json_.push_back(':');
  expectingValue_ = true;
}

void JsonWriter::String(std::string_view value) {
  BeforeValue();
  json_ += Escape(value);
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
  if (!frames_.empty() || expectingValue_) return {};
  return std::move(json_);
}

std::string JsonWriter::Escape(std::string_view value) {
  std::string escaped;
  escaped.reserve(value.size() + 2);
  escaped.push_back('"');
  for (const unsigned char character : value) {
    switch (character) {
      case '"': escaped += "\\\""; break;
      case '\\': escaped += "\\\\"; break;
      case '\b': escaped += "\\b"; break;
      case '\f': escaped += "\\f"; break;
      case '\n': escaped += "\\n"; break;
      case '\r': escaped += "\\r"; break;
      case '\t': escaped += "\\t"; break;
      default:
        if (character < 0x20) {
          char buffer[7]{};
          std::snprintf(buffer, sizeof(buffer), "\\u%04x", character);
          escaped += buffer;
        } else {
          escaped.push_back(static_cast<char>(character));
        }
    }
  }
  escaped.push_back('"');
  return escaped;
}

void JsonWriter::BeforeValue() {
  if (expectingValue_) {
    expectingValue_ = false;
    return;
  }
  // The current protocol contains objects only. A missing key is a programmer
  // error; leave the JSON invalid rather than silently inserting a comma.
}

}  // namespace mpp
