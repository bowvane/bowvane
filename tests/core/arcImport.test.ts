import { describe, expect, it } from "vitest";
import { importArcSidebar } from "../../src/core/arcImport";
import { arcSidebarFixture } from "./fixtures";
import { displayTitle, type Item } from "../../src/core/model";

const label = (i: Item) => (i.kind === "tab" ? displayTitle(i) : i.title);

const NOW = 1_800_000_000_000;

describe("importArcSidebar", () => {
  const result = importArcSidebar(arcSidebarFixture(), NOW);
  const { state, report } = result;

  it("recrée les Spaces dans l’ordre, avec nom, emoji, couleur et profil", () => {
    expect(state.spaces.map((s) => s.title)).toEqual(["Travail", "Space 2"]);
    expect(state.spaces[0]).toMatchObject({ icon: "💼", color: "#ff8000", appearance: "light", profile: "default" });
    expect(state.spaces[1]).toMatchObject({ icon: "", color: null, appearance: "system", profile: "arc-Profile 2" });
    expect(state.activeSpaceId).toBe(state.spaces[0]?.id);
  });

  it("garde l’arbre des onglets épinglés et des dossiers imbriqués", () => {
    const work = state.spaces[0]!.id;
    const pinnedRoots = state.items.filter((i) => i.spaceId === work && i.zone === "pinned" && i.parentId === null);
    expect(pinnedRoots.map(label)).toEqual(["Code", "Docs", "A", "B"]);
    const docs = pinnedRoots.find((i) => i.title === "Docs")!;
    expect(docs.kind).toBe("folder");
    const inDocs = state.items.filter((i) => i.parentId === docs.id).map((i) => i.title);
    expect(inDocs).toEqual(["Notion", "Design"]);
    const design = state.items.find((i) => i.title === "Design")!;
    expect(state.items.filter((i) => i.parentId === design.id).map((i) => i.title)).toEqual(["Figma"]);
  });

  it("conserve le titre personnalisé et l’URL épinglée", () => {
    const gh = state.items.find((i) => i.kind === "tab" && i.url === "https://github.com/");
    expect(gh).toMatchObject({ title: "GitHub", customTitle: "Code", pinnedUrl: "https://github.com/" });
  });

  it("importe les Favorites et les onglets Today sans les archiver tout de suite", () => {
    const favs = state.items.filter((i) => i.zone === "favorites").map((i) => i.title);
    expect(favs).toEqual(["Gmail", "Agenda"]);
    const today = state.items.filter((i) => i.zone === "today");
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ url: "https://news.ycombinator.com/", lastActiveAt: NOW });
  });

  it("compte ce qui n’est pas importable au lieu de le perdre en silence", () => {
    expect(report).toEqual({ spaces: 2, pinnedTabs: 5, folders: 2, todayTabs: 1, favorites: 2, splitViewsFlattened: 1, skipped: { easel: 1 } });
  });

  it("lit la couleur choisie et l’apparence sombre d’un thème Arc complet", () => {
    const json = arcSidebarFixture() as { sidebar: { containers: [unknown, { spaces: unknown[] }] } };
    const work = json.sidebar.containers[1].spaces[1] as { customInfo: { windowTheme: Record<string, unknown> } };
    work.customInfo.windowTheme.background = {
      single: { _0: { contentOverBackgroundAppearance: "dark", style: { color: { _0: { blendedSingleColor: { _0: { color: { red: 0, green: 0.5, blue: 1, alpha: 1 } } } } } } } },
    };
    expect(importArcSidebar(json, NOW).state.spaces[0]).toMatchObject({ color: "#0080ff", appearance: "dark" });
  });

  it("donne l’identifiant Arc de chaque onglet pour retrouver son icône en cache", () => {
    expect(result.faviconHints).toContainEqual({ url: "https://github.com/", arcId: "t-gh" });
    expect(result.faviconHints).toContainEqual({ url: "https://mail.google.com/", arcId: "fav-1" });
  });

  it("refuse un fichier qui n’a pas la forme d’Arc", () => {
    expect(() => importArcSidebar({ hello: "world" }, NOW)).toThrow(/StorableSidebar/);
    expect(() => importArcSidebar({ sidebar: { containers: [{ global: {} }] } }, NOW)).toThrow(/StorableSidebar/);
  });
});
