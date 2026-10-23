import type { IdGen, Item, PastTab, Space, State, TabItem, Zone } from "./model";
import { isTab } from "./model";

const HOUR = 3_600_000;
export const SIDEBAR_DEFAULT = 300;
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;
const HISTORY_CAP = 5000;
const ARCHIVE_CAP = 2000;
export const SPACE_COLORS = ["#7c6cf2", "#f27c6c", "#3fb68b", "#f2b84b", "#4ba3f2", "#d36cf2", "#8a8f98"];

export function emptyState(ids: IdGen): State {
  const space: Space = { id: ids(), title: "Perso", icon: "🏠", color: null, appearance: "system", profile: "default" };
  return {
    version: 1,
    spaces: [space],
    activeSpaceId: space.id,
    items: [],
    activeTabBySpace: {},
    archive: [],
    closed: [],
    history: [],
    rules: [{ id: ids(), match: "meet.google.com", target: { kind: "little" } }],
    boosts: [],
    settings: { archiveAfterMs: 12 * HOUR, searchEngine: "https://www.google.com/search?q=%s", adblock: true, externalLinksInLittle: true, sidebarWidth: SIDEBAR_DEFAULT },
  };
}

const patch = (s: State, id: string, f: (i: Item) => Item): State => ({ ...s, items: s.items.map((i) => (i.id === id ? f(i) : i)) });
const past = (t: TabItem, now: number): PastTab => ({ url: t.url, title: t.customTitle ?? t.title, spaceId: t.spaceId, archivedAt: now });
const activeIds = (s: State) => new Set(Object.values(s.activeTabBySpace).filter((x): x is string => !!x));

function withoutItems(s: State, removed: Set<string>): State {
  const activeTabBySpace = Object.fromEntries(
    Object.entries(s.activeTabBySpace).map(([k, v]) => [k, v && removed.has(v) ? null : v]),
  );
  return { ...s, items: s.items.filter((i) => !removed.has(i.id)), activeTabBySpace };
}

function toArchive(s: State, tabs: TabItem[], now: number): State {
  if (tabs.length === 0) return s;
  const next = withoutItems(s, new Set(tabs.map((t) => t.id)));
  return { ...next, archive: [...tabs.map((t) => past(t, now)), ...s.archive].slice(0, ARCHIVE_CAP) };
}

export function createSpace(s: State, ids: IdGen, title: string, extra: Partial<Omit<Space, "id">> = {}): State {
  const space: Space = { id: ids(), title, icon: "", color: SPACE_COLORS[s.spaces.length % SPACE_COLORS.length]!, appearance: "light", profile: "default", ...extra };
  return { ...s, spaces: [...s.spaces, space] };
}

/** Anciens états (avant les thèmes clair/sombre) : complète les champs manquants. */
export function migrate(s: State): State {
  return {
    ...s,
    spaces: s.spaces.map((sp) => ({ ...sp, appearance: sp.appearance ?? "light", color: sp.color === undefined ? null : sp.color })),
    settings: { ...s.settings, sidebarWidth: s.settings.sidebarWidth ?? SIDEBAR_DEFAULT },
  };
}

/** Profil créé avant les thèmes : reprend couleur et apparence du Space Arc de même titre. */
export function adoptArcThemes(s: State, arc: Pick<Space, "title" | "color" | "appearance">[]): State {
  const byTitle = new Map(arc.map((a) => [a.title, a]));
  return {
    ...s,
    spaces: s.spaces.map((sp) => {
      const a = sp.appearance === undefined ? byTitle.get(sp.title) : undefined;
      return a ? { ...sp, color: a.color, appearance: a.appearance } : sp;
    }),
  };
}

export function updateSpace(s: State, spaceId: string, changes: Partial<Omit<Space, "id">>): State {
  return { ...s, spaces: s.spaces.map((sp) => (sp.id === spaceId ? { ...sp, ...changes } : sp)) };
}

export function deleteSpace(s: State, spaceId: string, now: number): State {
  if (s.spaces.length <= 1 || !s.spaces.some((sp) => sp.id === spaceId)) return s;
  const tabs = s.items.filter((i): i is TabItem => isTab(i) && i.spaceId === spaceId);
  const archived = toArchive(s, tabs, now);
  const spaces = s.spaces.filter((sp) => sp.id !== spaceId);
  const { [spaceId]: _gone, ...activeTabBySpace } = archived.activeTabBySpace;
  return {
    ...archived,
    spaces,
    items: archived.items.filter((i) => i.spaceId !== spaceId),
    activeTabBySpace,
    activeSpaceId: s.activeSpaceId === spaceId ? spaces[0]!.id : s.activeSpaceId,
  };
}

export function setActiveSpace(s: State, spaceId: string): State {
  return s.spaces.some((sp) => sp.id === spaceId) ? { ...s, activeSpaceId: spaceId } : s;
}

export function newTab(s: State, ids: IdGen, spaceId: string, url: string, now: number, title = ""): State {
  const tab: TabItem = { kind: "tab", id: ids(), spaceId, parentId: null, zone: "today", title, url, lastActiveAt: now };
  return { ...s, items: [...s.items, tab] };
}

export function setActiveTab(s: State, id: string | null, now: number): State {
  if (id === null) return { ...s, activeTabBySpace: { ...s.activeTabBySpace, [s.activeSpaceId]: null } };
  const t = s.items.find((i) => i.id === id);
  if (!isTab(t)) return s;
  const spaceId = t.spaceId ?? s.activeSpaceId;
  return {
    ...patch(s, id, (i) => ({ ...i, lastActiveAt: now })),
    activeSpaceId: spaceId,
    activeTabBySpace: { ...s.activeTabBySpace, [spaceId]: id },
  };
}

export function recordVisit(s: State, id: string, url: string, title: string, now: number): State {
  const next = patch(s, id, (i) => (isTab(i) ? { ...i, url, title: title || i.title, lastActiveAt: now } : i));
  const last = s.history[0];
  if (!/^https?:/.test(url) || last?.url === url) return next;
  return { ...next, history: [{ url, title, visitedAt: now }, ...s.history].slice(0, HISTORY_CAP) };
}

export function updateTitle(s: State, id: string, title: string): State {
  const next = patch(s, id, (i) => (isTab(i) ? { ...i, title } : i));
  const first = next.history[0];
  const t = next.items.find((i) => i.id === id);
  if (first && isTab(t) && first.url === t.url) next.history = [{ ...first, title }, ...next.history.slice(1)];
  return next;
}

/** ⌘D : Today → épinglé (mémorise l’URL) ; épinglé ou favori → Today. */
export function togglePin(s: State, id: string): State {
  return patch(s, id, (i) => {
    if (!isTab(i)) return i;
    if (i.zone === "today") return { ...i, zone: "pinned", parentId: null, pinnedUrl: i.url };
    const { pinnedUrl: _p, ...rest } = i;
    return { ...rest, zone: "today", parentId: null, spaceId: i.spaceId ?? s.activeSpaceId };
  });
}

export function toggleFavorite(s: State, id: string): State {
  return patch(s, id, (i) => {
    if (!isTab(i)) return i;
    if (i.zone !== "favorites") return { ...i, zone: "favorites", spaceId: null, parentId: null, pinnedUrl: i.pinnedUrl ?? i.url };
    const { pinnedUrl: _p, ...rest } = i;
    return { ...rest, zone: "today", spaceId: s.activeSpaceId };
  });
}

export function resetToPinnedUrl(s: State, id: string): State {
  return patch(s, id, (i) => (isTab(i) && i.pinnedUrl ? { ...i, url: i.pinnedUrl } : i));
}

export function replacePinnedUrl(s: State, id: string): State {
  return patch(s, id, (i) => (isTab(i) && i.zone !== "today" ? { ...i, pinnedUrl: i.url } : i));
}

/** Fermer : un onglet Today disparaît (restaurable par ⇧⌘T), un épinglé reste et se décharge. */
export function closeTab(s: State, id: string, now: number): { state: State; unloadOnly: boolean } {
  const t = s.items.find((i) => i.id === id);
  if (!isTab(t)) return { state: s, unloadOnly: false };
  if (t.zone !== "today") {
    const state = { ...resetToPinnedUrl(s, id), activeTabBySpace: Object.fromEntries(Object.entries(s.activeTabBySpace).map(([k, v]) => [k, v === id ? null : v])) };
    return { state, unloadOnly: true };
  }
  const next = withoutItems(s, new Set([id]));
  return { state: { ...next, closed: [...s.closed, past(t, now)].slice(-50) }, unloadOnly: false };
}

export function restoreClosed(s: State, ids: IdGen, now: number): { state: State; restoredId: string | null } {
  const last = s.closed.at(-1);
  if (!last) return { state: s, restoredId: null };
  const spaceId = last.spaceId && s.spaces.some((sp) => sp.id === last.spaceId) ? last.spaceId : s.activeSpaceId;
  const state = newTab({ ...s, closed: s.closed.slice(0, -1) }, ids, spaceId, last.url, now, last.title);
  return { state, restoredId: state.items.at(-1)!.id };
}

export function reopenArchived(s: State, ids: IdGen, index: number, now: number): { state: State; tabId: string | null } {
  const entry = s.archive[index];
  if (!entry) return { state: s, tabId: null };
  const spaceId = entry.spaceId && s.spaces.some((sp) => sp.id === entry.spaceId) ? entry.spaceId : s.activeSpaceId;
  const state = newTab({ ...s, archive: s.archive.filter((_, i) => i !== index) }, ids, spaceId, entry.url, now, entry.title);
  return { state, tabId: state.items.at(-1)!.id };
}

/** Auto-archive : onglets Today inactifs au-delà du seuil, hors onglets actifs. */
export function archiveStale(s: State, now: number): State {
  const active = activeIds(s);
  const stale = s.items.filter(
    (i): i is TabItem => isTab(i) && i.zone === "today" && !active.has(i.id) && now - i.lastActiveAt > s.settings.archiveAfterMs,
  );
  return toArchive(s, stale, now);
}

/** ⇧⌘K : archive les onglets Today du Space, sauf celui affiché. */
export function clearToday(s: State, spaceId: string, now: number): State {
  const active = s.activeTabBySpace[spaceId];
  const tabs = s.items.filter((i): i is TabItem => isTab(i) && i.zone === "today" && i.spaceId === spaceId && i.id !== active);
  return toArchive(s, tabs, now);
}

/** « Reset all tabs in this Space » : vide Today et ramène les épinglés à leur URL. */
export function resetSpace(s: State, spaceId: string, now: number): State {
  const cleared = clearToday({ ...s, activeTabBySpace: { ...s.activeTabBySpace, [spaceId]: null } }, spaceId, now);
  return { ...cleared, items: cleared.items.map((i) => (isTab(i) && i.spaceId === spaceId && i.pinnedUrl ? { ...i, url: i.pinnedUrl } : i)) };
}

export function duplicateTab(s: State, ids: IdGen, id: string, now: number): State {
  const t = s.items.find((i) => i.id === id);
  return isTab(t) ? newTab(s, ids, t.spaceId ?? s.activeSpaceId, t.url, now, t.title) : s;
}

export function renameTab(s: State, id: string, title: string): State {
  const text = title.trim();
  return patch(s, id, (i) => {
    if (i.kind === "folder") return text ? { ...i, title: text } : i;
    if (text) return { ...i, customTitle: text };
    const { customTitle: _c, ...rest } = i;
    return rest;
  });
}

export function createFolder(s: State, ids: IdGen, spaceId: string, parentId: string | null, title: string): State {
  const folder: Item = { kind: "folder", id: ids(), spaceId, parentId, zone: "pinned", title, open: true };
  return { ...s, items: [...s.items, folder] };
}

export function toggleFolder(s: State, id: string): State {
  return patch(s, id, (i) => (i.kind === "folder" ? { ...i, open: !i.open } : i));
}

/** Supprime un dossier : ses enfants remontent d’un niveau. */
export function deleteFolder(s: State, id: string): State {
  const f = s.items.find((i) => i.id === id);
  if (!f || f.kind !== "folder") return s;
  return { ...s, items: s.items.filter((i) => i.id !== id).map((i) => (i.parentId === id ? { ...i, parentId: f.parentId } : i)) };
}

function isDescendant(s: State, maybeChild: string | null, ancestor: string): boolean {
  let cur = maybeChild;
  while (cur) {
    if (cur === ancestor) return true;
    cur = s.items.find((i) => i.id === cur)?.parentId ?? null;
  }
  return false;
}

export interface Destination {
  zone: Zone;
  parentId: string | null;
  index: number;
  spaceId?: string;
}

/** Glisser-déposer : change de zone, de dossier, de Space et d’ordre. */
export function moveItem(s: State, id: string, to: Destination): State {
  const item = s.items.find((i) => i.id === id);
  if (!item) return s;
  if (item.kind === "folder" && to.zone !== "pinned") return s;
  if (to.parentId && isDescendant(s, to.parentId, id)) return s;
  const spaceId = to.zone === "favorites" ? null : (to.spaceId ?? item.spaceId ?? s.activeSpaceId);
  let moved: Item = { ...item, zone: to.zone, parentId: to.zone === "pinned" ? to.parentId : null, spaceId };
  if (isTab(moved)) {
    if (to.zone === "today") {
      const { pinnedUrl: _p, ...rest } = moved;
      moved = rest;
    } else if (!moved.pinnedUrl) moved = { ...moved, pinnedUrl: moved.url };
  }
  const rest = s.items.filter((i) => i.id !== id);
  const siblings = rest.filter((i) => i.zone === moved.zone && i.spaceId === moved.spaceId && i.parentId === moved.parentId);
  const anchor = siblings[to.index];
  const at = anchor ? rest.indexOf(anchor) : siblings.length ? rest.indexOf(siblings.at(-1)!) + 1 : rest.length;
  const items = [...rest.slice(0, at), moved, ...rest.slice(at)];
  if (moved.kind === "folder" && moved.spaceId !== item.spaceId) {
    const desc = new Set(items.filter((i) => isDescendant(s, i.parentId, id)).map((i) => i.id));
    return { ...s, items: items.map((i) => (desc.has(i.id) ? { ...i, spaceId: moved.spaceId } : i)) };
  }
  return { ...s, items };
}

export function childrenOf(s: State, spaceId: string | null, zone: Zone, parentId: string | null): Item[] {
  return s.items.filter((i) => i.zone === zone && i.parentId === parentId && (zone === "favorites" || i.spaceId === spaceId));
}
