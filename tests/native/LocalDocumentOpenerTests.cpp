#include "plugin/LocalDocumentOpener.h"

#include <windows.h>

#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

bool RunLocalDocumentOpenerTests() {
  const std::filesystem::path directory =
      std::filesystem::temp_directory_path() /
      (L"NotepadViewerPlus-local-open-test-" + std::to_wstring(GetCurrentProcessId()));
  std::error_code error;
  std::filesystem::remove_all(directory, error);
  std::filesystem::create_directories(directory, error);
  if (error) return false;

  const std::vector<std::filesystem::path> regularFiles = {
      directory / L"notes.md",
      directory / L"script.cmd",
      directory / L"payload.exe",
      directory / L"shortcut.lnk",
  };
  for (const auto& path : regularFiles) {
    std::ofstream output(path, std::ios::binary);
    output << "test";
  }

  std::vector<std::wstring> opened;
  const mpp::LocalDocumentDispatcher nppDocumentOpen = [&opened](const std::wstring& path) {
    opened.push_back(path);
    return true;
  };
  bool passed = true;
  for (const auto& path : regularFiles) {
    if (!mpp::OpenLocalDocument(path.wstring(), nppDocumentOpen)) {
      std::wcerr << L"Regular local document was rejected: " << path << L'\n';
      passed = false;
    }
  }
  if (opened.size() != regularFiles.size()) {
    std::cerr << "Regular local targets did not use the document-open dispatcher\n";
    passed = false;
  }

  if (mpp::OpenLocalDocument(directory.wstring(), nppDocumentOpen) ||
      mpp::OpenLocalDocument((directory / L"missing.md").wstring(), nppDocumentOpen) ||
      mpp::OpenLocalDocument({}, nppDocumentOpen)) {
    std::cerr << "Directory, missing, or empty local target reached the document opener\n";
    passed = false;
  }
  if (opened.size() != regularFiles.size()) {
    std::cerr << "Rejected local targets reached the document opener\n";
    passed = false;
  }

  std::filesystem::remove_all(directory, error);
  return passed;
}
