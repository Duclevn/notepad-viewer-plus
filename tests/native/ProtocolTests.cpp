#include "bridge/JsonWriter.h"
#include "bridge/MessageBroker.h"

#include <iostream>
#include <string>

bool RunProtocolTests() {
  mpp::JsonWriter writer;
  writer.BeginObject();
  writer.Key("message");
  writer.String("quote \" slash \\ newline\n");
  writer.Key("nested");
  writer.BeginObject();
  writer.Key("ok");
  writer.Boolean(true);
  writer.EndObject();
  writer.EndObject();
  const std::string json = std::move(writer).Finish();
  const std::string expected = R"({"message":"quote \" slash \\ newline\n","nested":{"ok":true}})";
  if (json != expected) {
    std::cerr << "JsonWriter output mismatch: " << json << '\n';
    return false;
  }

  mpp::DocumentUpdate update;
  update.generation = 7;
  update.bufferId = 42;
  update.formatHint = "markdown";
  update.file.name = "protocol.md";
  update.file.extension = ".md";
  update.source.kind = mpp::PreviewSourceKind::Text;
  update.source.text = "# protocol\n\"quoted\"";
  update.theme = "light";
  std::string serializationError;
  const std::string message = mpp::SerializeDocumentUpdate(update, &serializationError);
  if (!serializationError.empty() || message.empty() || message.front() != '{' || message.back() != '}' ||
      message.find("\"type\":\"preview.update\"") == std::string::npos ||
      message.find("\"settings\":{") == std::string::npos ||
      message.find("# protocol\\n\\\"quoted\\\"") == std::string::npos) {
    std::cerr << "Document update serialization failed: " << serializationError << " / " << message << '\n';
    return false;
  }
  return true;
}
