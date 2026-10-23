import { describe, expect, it } from "vitest";
import {
  archiveStale, clearToday, closeTab, createFolder, createSpace, emptyState, newTab, renameTab,
  restoreClosed, setActiveTab, togglePin, toggleFavorite, resetToPinnedUrl, recordVisit, moveItem, deleteSpace, adoptArcThemes,
} from "../../src/core/store";
import type { State, TabItem } from "../../src/core/model";

const HOUR = 3_600_000;
let n = 0;
const ids = () => `id${++n}`;

function base(): { s: State; space: string } {
  n = 0;
  const s0 = emptyState(ids);
  return { s: s0, space: s0.spaces[0]!.id };
}
const tab = (s: State, id: string) => s.items.find((i): i is TabItem => i.kind === "tab" && i.id === id)!;

describe("état initial", () => {
  it("contient un Space actif et l’archivage à 12 h", () => {
    const { s } = base();
    expect(s.spaces).toHaveLength(1);
    expect(s.activeSpaceId).toBe(s.spaces[0]!.id);
    expect(s.settings.archiveAfterMs).toBe(12 * HOUR);
  });
});

describe("onglets Today et archivage", () => {
  it("archive un onglet Today inactif depuis plus que le seuil, jamais l’onglet actif ni un épinglé", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://old.example/", 0);
    const old = st.items.at(-1)!.id;
    st = newTab(st, ids, space, "https://pinned.example/", 0);
    const pinned = st.items.at(-1)!.id;
    st = togglePin(st, pinned);
    st = newTab(st, ids, space, "https://active.example/", 0);
    const active = st.items.at(-1)!.id;
    st = setActiveTab(st, active, 0);
    const after = archiveStale(st, 13 * HOUR);
    expect(after.items.map((i) => i.id)).not.toContain(old);
    expect(after.items.map((i) => i.id)).toContain(pinned);
    expect(after.items.map((i) => i.id)).toContain(active);
    expect(after.archive[0]).toMatchObject({ url: "https://old.example/", spaceId: space, archivedAt: 13 * HOUR });
  });

  it("n’archive pas un onglet Today encore récent", () => {
    const { s, space } = base();
    const st = newTab(s, ids, space, "https://fresh.example/", 2 * HOUR);
    expect(archiveStale(st, 13 * HOUR).items).toHaveLength(1);
  });

  it("Clear Today archive les onglets Today du Space sauf l’actif, sans toucher aux autres Spaces", () => {
    const { s, space } = base();
    let st = createSpace(s, ids, "Perso");
    const other = st.spaces[1]!.id;
    st = newTab(st, ids, space, "https://a.example/", 0);
    st = newTab(st, ids, space, "https://b.example/", 0);
    const b = st.items.at(-1)!.id;
    st = setActiveTab(st, b, 0);
    st = newTab(st, ids, other, "https://c.example/", 0);
    const cleared = clearToday(st, space, 5);
    expect(cleared.items.map((i) => (i.kind === "tab" ? i.url : ""))).toEqual(["https://b.example/", "https://c.example/"]);
    expect(cleared.archive).toHaveLength(1);
  });
});

describe("épingler, fermer, restaurer", () => {
  it("⌘D épingle un onglet Today (et mémorise son URL), puis le remet dans Today", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://x.example/", 0);
    const id = st.items[0]!.id;
    st = togglePin(st, id);
    expect(tab(st, id)).toMatchObject({ zone: "pinned", pinnedUrl: "https://x.example/" });
    st = togglePin(st, id);
    expect(tab(st, id).zone).toBe("today");
    expect(tab(st, id).pinnedUrl).toBeUndefined();
  });

  it("fermer un onglet Today le supprime et le rend restaurable ; fermer un épinglé le garde", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://x.example/", 0);
    const today = st.items[0]!.id;
    st = newTab(st, ids, space, "https://p.example/", 0);
    const pinned = st.items[1]!.id;
    st = togglePin(st, pinned);
    const r1 = closeTab(st, today, 7);
    expect(r1.unloadOnly).toBe(false);
    expect(r1.state.items.map((i) => i.id)).toEqual([pinned]);
    const r2 = closeTab(r1.state, pinned, 8);
    expect(r2.unloadOnly).toBe(true);
    expect(r2.state.items.map((i) => i.id)).toEqual([pinned]);
    const restored = restoreClosed(r2.state, ids, 9);
    expect(restored.restoredId).not.toBeNull();
    expect(tab(restored.state, restored.restoredId!)).toMatchObject({ url: "https://x.example/", zone: "today", spaceId: space });
  });

  it("restaurer sans onglet fermé ne change rien", () => {
    const { s } = base();
    expect(restoreClosed(s, ids, 1)).toEqual({ state: s, restoredId: null });
  });

  it("revenir à l’URL épinglée après avoir navigué ailleurs", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://home.example/", 0);
    const id = st.items[0]!.id;
    st = togglePin(st, id);
    st = recordVisit(st, id, "https://home.example/deep/page", "Deep", 1);
    expect(tab(st, id).url).toBe("https://home.example/deep/page");
    st = resetToPinnedUrl(st, id);
    expect(tab(st, id).url).toBe("https://home.example/");
  });
});

describe("Favorites, dossiers, renommage, déplacement", () => {
  it("les Favorites sont globaux (sans Space)", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://mail.example/", 0);
    const id = st.items[0]!.id;
    st = toggleFavorite(st, id);
    expect(tab(st, id)).toMatchObject({ zone: "favorites", spaceId: null });
  });

  it("un dossier contient des onglets épinglés et se renomme", () => {
    const { s, space } = base();
    let st = createFolder(s, ids, space, null, "Docs");
    const folder = st.items[0]!.id;
    st = newTab(st, ids, space, "https://d.example/", 0);
    const t = st.items[1]!.id;
    st = moveItem(st, t, { zone: "pinned", parentId: folder, index: 0 });
    expect(tab(st, t)).toMatchObject({ zone: "pinned", parentId: folder, pinnedUrl: "https://d.example/" });
    st = renameTab(st, folder, "Documentation");
    expect(st.items[0]!.title).toBe("Documentation");
  });

  it("renommer avec un texte vide rend le titre de la page", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://d.example/", 0);
    const t = st.items[0]!.id;
    st = renameTab(st, t, "Mon titre");
    expect(tab(st, t).customTitle).toBe("Mon titre");
    st = renameTab(st, t, "   ");
    expect(tab(st, t).customTitle).toBeUndefined();
  });

  it("supprimer un Space archive ses onglets et garde au moins un Space", () => {
    const { s, space } = base();
    let st = newTab(s, ids, space, "https://d.example/", 0);
    expect(deleteSpace(st, space, 1)).toBe(st);
    st = createSpace(st, ids, "B");
    const after = deleteSpace(st, space, 1);
    expect(after.spaces.map((x) => x.title)).toEqual(["B"]);
    expect(after.items).toHaveLength(0);
    expect(after.archive).toHaveLength(1);
    expect(after.activeSpaceId).toBe(after.spaces[0]!.id);
  });
});

describe("reprise des thèmes Arc pour un profil antérieur", () => {
  it("ne remplace que les Spaces sans apparence, par titre", () => {
    const base = emptyState(() => "x");
    const old = { ...base, spaces: [{ ...base.spaces[0]!, title: "Perso", color: "#7c6cf2", appearance: undefined as never }, { ...base.spaces[0]!, id: "y", title: "Mien", color: "#123456", appearance: "dark" as const }] };
    const next = adoptArcThemes(old, [{ title: "Perso", color: null, appearance: "system" }, { title: "Mien", color: "#ffffff", appearance: "light" }]);
    expect(next.spaces[0]).toMatchObject({ title: "Perso", color: null, appearance: "system" });
    expect(next.spaces[1]).toMatchObject({ title: "Mien", color: "#123456", appearance: "dark" });
  });
});
