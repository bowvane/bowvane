import { describe, expect, it } from "vitest";
import { mix, spaceTheme } from "../../src/core/theme";

describe("thème des Spaces", () => {
  it("mélange deux couleurs", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#0000ff", 0)).toBe("#ff0000");
  });
  it("sans couleur, suit le mode du système", () => {
    expect(spaceTheme({ color: null, appearance: "system" }, true).dark).toBe(true);
    expect(spaceTheme({ color: null, appearance: "system" }, false).dark).toBe(false);
  });
  it("un thème clair reste clair même si le système est sombre, avec un texte foncé", () => {
    const t = spaceTheme({ color: "#ff6b6b", appearance: "light" }, true);
    expect(t).toMatchObject({ dark: false, accent: "#ff6b6b", foreground: "#1d1b22" });
    expect(t.background).toBe(mix("#ff6b6b", "#ffffff", 0.5));
  });
  it("un thème sombre assombrit la couleur et éclaircit le texte", () => {
    const t = spaceTheme({ color: "#32ae33", appearance: "dark" }, false);
    expect(t.dark).toBe(true);
    expect(t.foreground).toBe("#f4f2f7");
    expect(parseInt(t.background.slice(1, 3), 16)).toBeLessThan(0x32);
  });
});
