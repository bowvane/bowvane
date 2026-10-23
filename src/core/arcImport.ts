import type { Item, Space, State, TabItem } from "./model";
import { emptyState } from "./store";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export interface ArcImportReport {
  spaces: number;
  pinnedTabs: number;
  folders: number;
  todayTabs: number;
  favorites: number;
  splitViewsFlattened: number;
  skipped: Record<string, number>;
}

class ArcFormatError extends Error {
  constructor(detail: string) {
    super(`Ce fichier ne ressemble pas à StorableSidebar.json d’Arc (${detail}).`);
  }
}

/** Les dictionnaires Swift sont sérialisés à plat : [clé, valeur, clé, valeur…]. */
function pairs(list: unknown): [unknown, unknown][] {
  if (!Array.isArray(list)) return [];
  const out: [unknown, unknown][] = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]);
  return out;
}

const channel = (v: unknown) => Math.round(Math.min(1, Math.max(0, typeof v === "number" ? v : 0)) * 255).toString(16).padStart(2, "0");

const hex = (c: Obj) => `#${channel(c.red)}${channel(c.green)}${channel(c.blue)}`;

/** Chemin a.b.c dans un objet JSON inconnu. */
function dig(o: unknown, ...path: string[]): unknown {
  let cur = o;
  for (const k of path) cur = isObj(cur) ? cur[k] : undefined;
  return cur;
}

/** Thème d’un Space Arc : couleur choisie et apparence du contenu ; sans thème, Arc suit le système. */
function theme(customInfo: Obj | undefined): Pick<Space, "color" | "appearance"> {
  const wt = customInfo?.windowTheme;
  if (!isObj(wt)) return { color: null, appearance: "system" };
  const single = dig(wt, "background", "single", "_0");
  const base = dig(single, "style", "color", "_0", "blendedSingleColor", "_0", "color");
  const mid = dig(wt, "primaryColorPalette", "midTone");
  const appearance = dig(single, "contentOverBackgroundAppearance") === "dark" ? "dark" : "light";
  const color = isObj(base) ? hex(base) : isObj(mid) ? hex(mid) : null;
  return { color, appearance: color ? appearance : "system" };
}

function profileKey(profile: unknown): string {
  if (isObj(profile) && isObj(profile.custom) && isObj(profile.custom._0)) {
    const dir = str(profile.custom._0.directoryBasename);
    if (dir) return `arc-${dir}`;
  }
  return "default";
}

function containerId(newContainerIDs: unknown, kind: "pinned" | "unpinned"): string | null {
  for (const [k, id] of pairs(newContainerIDs)) if (isObj(k) && kind in k) return str(id);
  return null;
}

/** Convertit le StorableSidebar.json d’Arc en état Bowvane (onglets épinglés, dossiers, Favorites, Today). */
export interface ArcImport {
  state: State;
  report: ArcImportReport;
  /** Arc garde l’icône de chaque élément dans SidebarItemsFaviconCache/<md5(id)>. */
  faviconHints: { url: string; arcId: string }[];
}

export function importArcSidebar(json: unknown, now: number, ids: () => string = () => crypto.randomUUID()): ArcImport {
  if (!isObj(json) || !isObj(json.sidebar) || !Array.isArray(json.sidebar.containers)) throw new ArcFormatError("pas de sidebar.containers");
  const container = json.sidebar.containers.find((c): c is Obj => isObj(c) && Array.isArray(c.spaces) && Array.isArray(c.items));
  if (!container) throw new ArcFormatError("aucun conteneur avec spaces et items");

  const arcItems = new Map<string, Obj>();
  for (const [id, v] of pairs(container.items)) if (typeof id === "string" && isObj(v)) arcItems.set(id, v);

  const report: ArcImportReport = { spaces: 0, pinnedTabs: 0, folders: 0, todayTabs: 0, favorites: 0, splitViewsFlattened: 0, skipped: {} };
  const items: Item[] = [];
  const seenFavorite = new Set<string>();

  const children = (id: string): Obj[] => {
    const node = arcItems.get(id);
    const list = Array.isArray(node?.childrenIds) ? node.childrenIds : [];
    return list.map((c) => (typeof c === "string" ? arcItems.get(c) : undefined)).filter((c): c is Obj => !!c);
  };

  const faviconHints: { url: string; arcId: string }[] = [];
  const makeTab = (node: Obj, spaceId: string | null, parentId: string | null, zone: TabItem["zone"]): TabItem | null => {
    const tab = isObj(node.data) && isObj(node.data.tab) ? node.data.tab : null;
    const url = tab ? str(tab.savedURL) : null;
    if (!tab || !url) return null;
    const pageTitle = str(tab.savedTitle) ?? "";
    const custom = str(node.title);
    const t: TabItem = { kind: "tab", id: ids(), spaceId, parentId, zone, title: pageTitle || custom || url, url, lastActiveAt: now };
    if (zone !== "today") t.pinnedUrl = url;
    if (custom && custom !== pageTitle) t.customTitle = custom;
    const arcId = str(node.id);
    if (arcId) faviconHints.push({ url, arcId });
    return t;
  };

  const walk = (parentArcId: string, spaceId: string, parentId: string | null, zone: "pinned" | "today") => {
    for (const node of children(parentArcId)) {
      const data = isObj(node.data) ? node.data : {};
      const kind = Object.keys(data)[0] ?? "inconnu";
      const nodeId = str(node.id);
      if (kind === "tab") {
        const t = makeTab(node, spaceId, zone === "pinned" ? parentId : null, zone);
        if (t) {
          items.push(t);
          if (zone === "pinned") report.pinnedTabs++;
          else report.todayTabs++;
        }
      } else if ((kind === "list" || kind === "itemContainer") && nodeId) {
        if (zone === "pinned") {
          const folder: Item = { kind: "folder", id: ids(), spaceId, parentId, zone: "pinned", title: str(node.title) || "Dossier", open: false };
          items.push(folder);
          report.folders++;
          walk(nodeId, spaceId, folder.id, zone);
        } else walk(nodeId, spaceId, null, zone);
      } else if (kind === "splitView" && nodeId) {
        report.splitViewsFlattened++;
        walk(nodeId, spaceId, parentId, zone);
      } else report.skipped[kind] = (report.skipped[kind] ?? 0) + 1;
    }
  };

  const spaces: Space[] = [];
  pairs(container.spaces).forEach(([, raw], index) => {
    if (!isObj(raw)) return;
    const customInfo = isObj(raw.customInfo) ? raw.customInfo : undefined;
    const icon = isObj(customInfo?.iconType) ? (str(customInfo.iconType.emoji_v2) ?? "") : "";
    const space: Space = { id: ids(), title: str(raw.title) || `Space ${index + 1}`, icon, ...theme(customInfo), profile: profileKey(raw.profile) };
    spaces.push(space);
    const pinned = containerId(raw.newContainerIDs, "pinned");
    const today = containerId(raw.newContainerIDs, "unpinned");
    if (pinned) walk(pinned, space.id, null, "pinned");
    if (today) walk(today, space.id, null, "today");
  });
  if (spaces.length === 0) throw new ArcFormatError("aucun Space");
  report.spaces = spaces.length;

  for (const [, id] of pairs(container.topAppsContainerIDs)) {
    if (typeof id !== "string") continue;
    for (const node of children(id)) {
      const t = makeTab(node, null, null, "favorites");
      if (t && !seenFavorite.has(t.url)) {
        seenFavorite.add(t.url);
        items.push(t);
        report.favorites++;
      }
    }
  }

  const base = emptyState(ids);
  return { state: { ...base, spaces, activeSpaceId: spaces[0]!.id, items }, report, faviconHints };
}
