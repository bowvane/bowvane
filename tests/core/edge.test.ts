import { describe, expect, it } from "vitest";
import { sidebarEdge } from "../../src/core/edge";

const win = { x: 200, y: 100, width: 1200, height: 800 };
const at = (x: number, y = 400) => ({ x, y });

describe("sidebarEdge", () => {
  it("ouvre quand le pointeur touche le bord gauche, même juste hors de la fenêtre", () => {
    expect(sidebarEdge(at(200), win, 300, false)).toBe("open");
    expect(sidebarEdge(at(196), win, 300, false)).toBe("open");
    expect(sidebarEdge(at(215), win, 300, false)).toBe("open");
  });
  it("n’ouvre pas depuis la page ni hors de la hauteur de la fenêtre", () => {
    expect(sidebarEdge(at(240), win, 300, false)).toBe("keep");
    expect(sidebarEdge(at(190), win, 300, false)).toBe("keep");
    expect(sidebarEdge(at(200, 950), win, 300, false)).toBe("keep");
  });
  it("garde le panneau ouvert dans sa largeur et une petite marge", () => {
    expect(sidebarEdge(at(450), win, 300, true)).toBe("keep");
    expect(sidebarEdge(at(530), win, 300, true)).toBe("keep");
    expect(sidebarEdge(at(195), win, 300, true)).toBe("keep");
  });
  it("referme quand le pointeur part vers la page ou quitte la fenêtre", () => {
    expect(sidebarEdge(at(560), win, 300, true)).toBe("close");
    expect(sidebarEdge(at(150), win, 300, true)).toBe("close");
    expect(sidebarEdge(at(300, 50), win, 300, true)).toBe("close");
  });
});
