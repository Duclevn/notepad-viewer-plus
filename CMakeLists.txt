cmake_minimum_required(VERSION 3.25)
set(MPP_VERSION "0.1.5" CACHE STRING "Markdown Preview Plus release version")
project(MarkdownPreviewPlus VERSION ${MPP_VERSION} LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "Markdown Preview Plus native plugin requires Windows")
endif()

set(NPP_SDK_DIR "" CACHE PATH "Directory containing the Notepad++ plugin SDK headers")
set(WEBVIEW2_SDK_DIR "" CACHE PATH "Directory containing WebView2.h and WebView2Loader.lib")

if(NOT EXISTS "${NPP_SDK_DIR}")
  message(FATAL_ERROR "Set NPP_SDK_DIR to the official Notepad++ plugin template SDK")
endif()
if(NOT EXISTS "${WEBVIEW2_SDK_DIR}/build/native/include/WebView2.h")
  message(FATAL_ERROR "Set WEBVIEW2_SDK_DIR to the WebView2 SDK root")
endif()

set(RENDERER_DIST_DIR "${CMAKE_CURRENT_SOURCE_DIR}/renderer/dist")
if(NOT EXISTS "${RENDERER_DIST_DIR}/index.html")
  message(FATAL_ERROR "Build renderer/dist with npm run build before configuring the native package")
endif()
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/packaging/THIRD-PARTY-LICENSES.txt")
  message(FATAL_ERROR "Generate packaging/THIRD-PARTY-LICENSES.txt before configuring the native package")
endif()

set(NATIVE_SOURCES
  native/plugin/PluginMain.cpp
  native/plugin/PluginEntry.cpp
  native/plugin/DocumentCoordinator.cpp
  native/plugin/DocumentCoordinator.h
  native/preview/PreviewPanel.cpp
  native/preview/ResourcePolicy.cpp
  native/bridge/MessageBroker.cpp
  native/bridge/OriginPolicy.h
  native/settings/SettingsService.cpp
  native/settings/SettingsService.h
  native/bridge/MessageBroker.h
  native/preview/PreviewPanel.h
  native/preview/ResourcePolicy.h
  native/plugin/PluginEntry.h
  native/plugin/PluginConstants.h
  native/resources/MarkdownPreviewPlus.rc
)

add_library(MarkdownPreviewPlus SHARED ${NATIVE_SOURCES})
target_compile_features(MarkdownPreviewPlus PRIVATE cxx_std_17)
target_compile_definitions(MarkdownPreviewPlus PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_include_directories(MarkdownPreviewPlus PRIVATE
  "${NPP_SDK_DIR}/src"
  "${NPP_SDK_DIR}/src/DockingFeature"
  "${NPP_SDK_DIR}/PowerEditor/src"
  "${WEBVIEW2_SDK_DIR}/build/native/include"
  "${CMAKE_CURRENT_SOURCE_DIR}/native"
)
if(CMAKE_GENERATOR_PLATFORM STREQUAL "Win32")
  set(WEBVIEW2_ARCH "x86")
elseif(CMAKE_GENERATOR_PLATFORM STREQUAL "x64")
  set(WEBVIEW2_ARCH "x64")
else()
  message(FATAL_ERROR "Configure with -A x64 or -A Win32 so the WebView2 architecture can be mapped explicitly")
endif()
set(WEBVIEW2_LOADER_LIB "${WEBVIEW2_SDK_DIR}/build/native/${WEBVIEW2_ARCH}/WebView2LoaderStatic.lib")
if(NOT EXISTS "${WEBVIEW2_LOADER_LIB}")
  message(FATAL_ERROR "Missing WebView2 loader library: ${WEBVIEW2_LOADER_LIB}")
endif()

target_link_libraries(MarkdownPreviewPlus PRIVATE
  "${WEBVIEW2_LOADER_LIB}"
  user32 shell32 shlwapi ole32 oleaut32
)
set_target_properties(MarkdownPreviewPlus PROPERTIES OUTPUT_NAME "MarkdownPreviewPlus")

include(CTest)
if(BUILD_TESTING)
  add_executable(MarkdownPreviewPlusNativeTests tests/native/OriginPolicyTests.cpp)
  target_compile_features(MarkdownPreviewPlusNativeTests PRIVATE cxx_std_17)
  target_include_directories(MarkdownPreviewPlusNativeTests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/native")
  add_test(NAME MarkdownPreviewPlusNativeTests COMMAND MarkdownPreviewPlusNativeTests)
endif()

include(GNUInstallDirs)
install(TARGETS MarkdownPreviewPlus RUNTIME DESTINATION .)
install(DIRECTORY "${RENDERER_DIST_DIR}/" DESTINATION assets)
install(FILES packaging/THIRD-PARTY-LICENSES.txt DESTINATION .)

# Notepad++ Plugin Admin accepts a ZIP whose DLL is at the archive root. CPack
# therefore packages the install tree without adding a top-level directory.
set(CPACK_GENERATOR "ZIP")
set(CPACK_PACKAGE_NAME "MarkdownPreviewPlus")
set(CPACK_PACKAGE_VERSION "${MPP_VERSION}")
set(CPACK_PACKAGE_FILE_NAME "MarkdownPreviewPlus-${MPP_VERSION}-${WEBVIEW2_ARCH}")
set(CPACK_INCLUDE_TOPLEVEL_DIRECTORY OFF)
include(CPack)
