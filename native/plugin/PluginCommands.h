#pragma once

#include "PluginConstants.h"

#include <PluginInterface.h>

namespace mpp {

struct PluginCommandCallbacks {
  PFUNCPLUGINCMD togglePreview;
  PFUNCPLUGINCMD refreshPreview;
  PFUNCPLUGINCMD toggleAutoRefresh;
  PFUNCPLUGINCMD toggleTableOfContents;
  PFUNCPLUGINCMD themeLight;
  PFUNCPLUGINCMD themeDark;
  PFUNCPLUGINCMD themeSystem;
  PFUNCPLUGINCMD about;
};

void PopulatePluginCommands(FuncItem (&functions)[CommandCount], ShortcutKey* togglePreviewShortcut,
                            const PluginCommandCallbacks& callbacks);

}  // namespace mpp
