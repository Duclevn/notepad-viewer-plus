#include "bridge/JsonWriter.h"

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
  return true;
}
