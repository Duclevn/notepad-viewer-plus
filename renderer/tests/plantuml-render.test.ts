import { describe, expect, it, vi } from "vitest";
import { renderPlantUmlToString, type PlantUmlApi } from "../src/diagrams/plantuml-render";

describe("PlantUML rendering", () => {
  it("uses the runtime's native dark mode and returns its SVG", async () => {
    const render = vi.fn((lines: string[], targetId: string, options?: { dark?: boolean }) => {
      const target = document.getElementById(targetId);
      if (!target) throw new Error("missing target");
      target.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text fill="#f0f6fc">Dark</text></svg>';
      expect(lines).toEqual(["@startuml", "Alice -> Bob", "@enduml"]);
      expect(options).toEqual({ dark: true });
    });
    const api: PlantUmlApi = { render };

    const svg = await renderPlantUmlToString(api, "@startuml\nAlice -> Bob\n@enduml", "dark-test", true, 100);

    expect(render).toHaveBeenCalledOnce();
    expect(svg).toContain('fill="#f0f6fc"');
    expect(document.querySelector('[id^="mpp-plantuml-"]')).toBeNull();
  });

  it("rejects when the runtime produces no SVG", async () => {
    const api: PlantUmlApi = { render: () => { /* simulate a silent runtime failure */ } };

    await expect(renderPlantUmlToString(api, "@startuml\n@enduml", "timeout-test", true, 5)).rejects.toThrow("timed out");
    expect(document.querySelector('[id^="mpp-plantuml-"]')).toBeNull();
  });

  it("forwards light mode without enabling dark output", async () => {
    const api: PlantUmlApi = {
      render: (_lines, targetId, options) => {
        expect(options).toEqual({ dark: false });
        const target = document.getElementById(targetId);
        if (target) target.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />';
      }
    };

    await expect(renderPlantUmlToString(api, "@startuml\n@enduml", "light-test", false, 100)).resolves.toContain("<svg");
  });
});
