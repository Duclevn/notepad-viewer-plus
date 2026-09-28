#include "PluginEntry.h"

#include <PluginInterface.h>

extern "C" __declspec(dllexport) void setInfo(NppData notepadPlusData) {
  mpp::Instance().SetNppData(notepadPlusData);
}

extern "C" __declspec(dllexport) const TCHAR* getName() {
  return mpp::kPluginName;
}

extern "C" __declspec(dllexport) FuncItem* getFuncsArray(int* numberOfFuncItems) {
  return mpp::Instance().Functions(numberOfFuncItems);
}

extern "C" __declspec(dllexport) void beNotified(SCNotification* notification) {
  mpp::Instance().OnNotification(notification);
}

extern "C" __declspec(dllexport) LRESULT messageProc(UINT message, WPARAM wParam, LPARAM lParam) {
  return mpp::Instance().MessageProc(message, wParam, lParam);
}

extern "C" __declspec(dllexport) BOOL isUnicode() {
  return TRUE;
}
