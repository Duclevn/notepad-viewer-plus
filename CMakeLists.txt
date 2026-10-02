cmake_minimum_required(VERSION 3.25)

set(NVP_VERSION_FILE "${CMAKE_CURRENT_SOURCE_DIR}/version.json")
file(READ "${NVP_VERSION_FILE}" NVP_VERSION_JSON)
string(JSON NVP_VERSION GET "${NVP_VERSION_JSON}" version)
if(NOT NVP_VERSION MATCHES "^[0-9]+\\.[0-9]+\\.[0-9]+$")
  message(FATAL_ERROR "version.json must contain a three-part numeric version")
endif()
string(REPLACE "." ";" NVP_VERSION_PARTS "${NVP_VERSION}")
list(GET NVP_VERSION_PARTS 0 NVP_VERSION_MAJOR)
list(GET NVP_VERSION_PARTS 1 NVP_VERSION_MINOR)
list(GET NVP_VERSION_PARTS 2 NVP_VERSION_PATCH)
set(NVP_VERSION_COMMA "${NVP_VERSION_MAJOR},${NVP_VERSION_MINOR},${NVP_VERSION_PATCH},0")
set(NVP_VERSION_FOUR_PART "${NVP_VERSION}.0")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${NVP_VERSION_FILE}")

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

set(NVP_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${NVP_GENERATED_DIR}")
set(NVP_RESOURCE_DIR_NATIVE "${CMAKE_CURRENT_SOURCE_DIR}/native/resources")
set(NVP_RESOURCE_IDS "${NVP_RESOURCE_DIR_NATIVE}/ResourceIds.h")
configure_file(native/resources/Version.h.in "${NVP_GENERATED_DIR}/Version.h" @ONLY)
configure_file(native/resources/NotepadViewerPlus.rc.in "${NVP_GENERATED_DIR}/NotepadViewerPlus.rc" @ONLY)

set(NATIVE_SOURCES
  native/plugin/PluginMain.cpp
  native/plugin/PluginEntry.cpp
  native/plugin/PluginCommands.cpp
  native/plugin/PluginCommands.h
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
  native/resources/ResourceIds.h
  "${NVP_GENERATED_DIR}/NotepadViewerPlus.rc"
)

add_library(NotepadViewerPlus SHARED ${NATIVE_SOURCES})
target_compile_features(NotepadViewerPlus PRIVATE cxx_std_17)
target_compile_definitions(NotepadViewerPlus PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX _WIN32_WINNT=0x0600)
target_include_directories(NotepadViewerPlus PRIVATE
  "${NPP_SDK_DIR}/src"
  "${NPP_SDK_DIR}/src/DockingFeature"
  "${NPP_SDK_DIR}/PowerEditor/src"
  "${WEBVIEW2_SDK_DIR}/build/native/include"
  "${CMAKE_CURRENT_SOURCE_DIR}/native"
  "${NVP_GENERATED_DIR}"
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
  user32 shell32 shlwapi ole32 oleaut32 bcrypt comctl32
)
set_target_properties(NotepadViewerPlus PROPERTIES OUTPUT_NAME "NotepadViewerPlus")

include(CTest)
if(BUILD_TESTING)
  add_executable(NotepadViewerPlusNativeTests
    tests/native/OriginPolicyTests.cpp
    tests/native/NotepadMessageTests.cpp
    tests/native/PluginCommandTests.cpp
    tests/native/ProtocolTests.cpp
    tests/native/ResourcePolicyTests.cpp
    native/bridge/JsonWriter.cpp
    native/bridge/MessageBroker.cpp
    native/plugin/PluginCommands.cpp
    native/plugin/DocumentCoordinator.cpp
    native/preview/ResourcePolicy.cpp
    native/settings/SettingsService.cpp
  )
  target_compile_features(NotepadViewerPlusNativeTests PRIVATE cxx_std_17)
  target_compile_definitions(NotepadViewerPlusNativeTests PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX _WIN32_WINNT=0x0600)
  target_include_directories(NotepadViewerPlusNativeTests PRIVATE
    "${NPP_SDK_DIR}/src"
    "${NPP_SDK_DIR}/src/DockingFeature"
    "${NPP_SDK_DIR}/PowerEditor/src"
    "${CMAKE_CURRENT_SOURCE_DIR}/native"
    "${WEBVIEW2_SDK_DIR}/build/native/include"
  )
  target_link_libraries(NotepadViewerPlusNativeTests PRIVATE user32 bcrypt ole32 oleaut32)
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
