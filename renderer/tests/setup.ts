import { afterEach } from "vitest";

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  value: () => "blob:https://app.local/test"
});
Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  value: () => undefined
});

afterEach(() => {
  document.body.innerHTML = "";
});
