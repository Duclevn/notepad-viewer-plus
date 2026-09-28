cmake_minimum_required(VERSION 3.25)
set(NVP_VERSION "0.2.0" CACHE STRING "Notepad Viewer Plus release version")
project(NotepadViewerPlus VERSION ${NVP_VERSION} LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "Notepad Viewer Plus native plugin requires Windows")
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
  native/bridge/JsonWriter.cpp
  native/bridge/JsonWriter.h
  native/bridge/PreviewResource.h
  native/bridge/OriginPolicy.h
  native/settings/SettingsService.cpp
  native/settings/SettingsService.h
  native/bridge/MessageBroker.h
  native/preview/PreviewPanel.h
  native/preview/ResourcePolicy.h
  native/plugin/PluginEntry.h
  native/plugin/PluginConstants.h
  native/resources/NotepadViewerPlus.rc
)

add_library(NotepadViewerPlus SHARED ${NATIVE_SOURCES})
target_compile_features(NotepadViewerPlus PRIVATE cxx_std_17)
target_compile_definitions(NotepadViewerPlus PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_include_directories(NotepadViewerPlus PRIVATE
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

target_link_libraries(NotepadViewerPlus PRIVATE
  "${WEBVIEW2_LOADER_LIB}"
  user32 shell32 shlwapi ole32 oleaut32 bcrypt
)
set_target_properties(NotepadViewerPlus PROPERTIES OUTPUT_NAME "NotepadViewerPlus")

include(CTest)
if(BUILD_TESTING)
  add_executable(NotepadViewerPlusNativeTests tests/native/OriginPolicyTests.cpp tests/native/ProtocolTests.cpp tests/native/ResourcePolicyTests.cpp native/bridge/JsonWriter.cpp native/preview/ResourcePolicy.cpp)
  target_compile_features(NotepadViewerPlusNativeTests PRIVATE cxx_std_17)
  target_include_directories(NotepadViewerPlusNativeTests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/native")
  target_link_libraries(NotepadViewerPlusNativeTests PRIVATE bcrypt)
  add_test(NAME NotepadViewerPlusNativeTests COMMAND NotepadViewerPlusNativeTests)
endif()

include(GNUInstallDirs)
install(TARGETS NotepadViewerPlus RUNTIME DESTINATION .)
install(DIRECTORY "${RENDERER_DIST_DIR}/" DESTINATION assets)
install(FILES packaging/THIRD-PARTY-LICENSES.txt DESTINATION .)

# Notepad++ Plugin Admin accepts a ZIP whose DLL is at the archive root. CPack
# therefore packages the install tree without adding a top-level directory.
set(CPACK_GENERATOR "ZIP")
set(CPACK_PACKAGE_NAME "NotepadViewerPlus")
set(CPACK_PACKAGE_VERSION "${NVP_VERSION}")
set(CPACK_PACKAGE_FILE_NAME "NotepadViewerPlus-${NVP_VERSION}-${WEBVIEW2_ARCH}")
set(CPACK_INCLUDE_TOPLEVEL_DIRECTORY OFF)
include(CPack)
