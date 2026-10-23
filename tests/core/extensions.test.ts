import { describe, expect, it } from "vitest";
import { arcPinnedExtensionIds, arcProfileKey, describeExtension, enabledArcExtensionIds, latestVersion, setPinned } from "../../src/core/extensions";

describe("extensions importées d’Arc", () => {
  it("relie un dossier de profil Arc au profil des Spaces", () => {
    expect(arcProfileKey("Default")).toBe("default");
    expect(arcProfileKey("Profile 2")).toBe("arc-Profile 2");
  });

  it("ne garde que les extensions installées par l’utilisateur et activées", () => {
    const prefs = {
      extensions: {
        settings: {
          on: { location: 1, disable_reasons: [] },
          legacy: { location: 1 },
          off: { location: 1, disable_reasons: [1] },
          mv2: { location: 1, disable_reasons: [8388608] },
          component: { location: 5 },
        },
      },
    };
    expect(enabledArcExtensionIds(prefs).sort()).toEqual(["legacy", "on"]);
    expect(enabledArcExtensionIds(null)).toEqual([]);
  });

  it("choisit la version la plus récente", () => {
    expect(latestVersion(["1.9.0_0", "1.10.2_0", "1.10.0_1"])).toBe("1.10.2_0");
    expect(latestVersion([])).toBeNull();
  });

  it("résout le nom traduit, la popup et l’icône", () => {
    const manifest = {
      manifest_version: 3,
      name: "__MSG_extName__",
      action: { default_popup: "popup/index.html", default_icon: { "16": "i16.png", "32": "i32.png", "128": "i128.png" } },
      icons: { "48": "big.png" },
    };
    expect(describeExtension(manifest, { extname: { message: "Mon extension" } })).toEqual({
      name: "Mon extension",
      popup: "popup/index.html",
      icon: "i32.png",
      manifestVersion: 3,
    });
  });

  it("se replie sur les icônes générales et le nom brut", () => {
    expect(describeExtension({ manifest_version: 2, name: "Plain", browser_action: {}, icons: { "16": "s.png", "128": "l.png" } }, null)).toEqual({
      name: "Plain",
      popup: null,
      icon: "l.png",
      manifestVersion: 2,
    });
    expect(describeExtension({ manifest_version: 3, name: "__MSG_x__", action: { default_icon: "one.png" } }, null).icon).toBe("one.png");
  });

  it("reprend l’ordre des extensions épinglées dans la barre d’Arc, limité aux extensions importées", () => {
    const prefs = { extensions: { pinned_extensions: ["b", "inconnue", "a", 3] } };
    expect(arcPinnedExtensionIds(prefs, ["a", "b", "c"])).toEqual(["b", "a"]);
    expect(arcPinnedExtensionIds({ extensions: { pinned_extensions: [] } }, ["a"])).toEqual([]);
    expect(arcPinnedExtensionIds(null, ["a"])).toEqual([]);
  });

  it("épingle à la fin, désépingle sans doublon", () => {
    expect(setPinned(["a"], "b", true)).toEqual(["a", "b"]);
    expect(setPinned(["a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(setPinned(["a", "b"], "a", false)).toEqual(["b"]);
    expect(setPinned([], "z", false)).toEqual([]);
  });
});
