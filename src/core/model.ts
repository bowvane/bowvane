export type Zone = "favorites" | "pinned" | "today";

interface ItemBase {
  id: string;
  /** null pour les Favorites, partagés par tous les Spaces. */
  spaceId: string | null;
  parentId: string | null;
  zone: Zone;
  title: string;
}

export interface TabItem extends ItemBase {
  kind: "tab";
  url: string;
  /** URL d’origine d’un onglet épinglé ou favori, pour « Back to Pinned URL ». */
  pinnedUrl?: string;
  customTitle?: string;
  lastActiveAt: number;
}

export interface FolderItem extends ItemBase {
  kind: "folder";
  open: boolean;
}

export type Item = TabItem | FolderItem;

export type Appearance = "system" | "light" | "dark";

export interface Space {
  id: string;
  title: string;
  icon: string;
  /** Couleur du thème ; null = thème neutre d’Arc, qui suit le mode clair/sombre du système. */
  color: string | null;
  appearance: Appearance;
  /** Clé de partition Electron : cookies et stockage séparés par profil. */
  profile: string;
}

export type RouteTarget = { kind: "little" } | { kind: "space"; spaceId: string };

export interface Rule {
  id: string;
  /** Domaine (sous-domaines compris) ou préfixe domaine/chemin. */
  match: string;
  target: RouteTarget;
}

export interface Boost {
  id: string;
  host: string;
  css: string;
  js: string;
  /** Sélecteurs CSS masqués par Zap. */
  zapped: string[];
  enabled: boolean;
}

export interface PastTab {
  url: string;
  title: string;
  spaceId: string | null;
  archivedAt: number;
}

export interface Visit {
  url: string;
  title: string;
  visitedAt: number;
}

export interface Settings {
  archiveAfterMs: number;
  searchEngine: string;
  adblock: boolean;
  /** Liens venus d’autres apps ouverts dans Little Arc. */
  externalLinksInLittle: boolean;
  sidebarWidth: number;
}

export interface State {
  version: 1;
  spaces: Space[];
  activeSpaceId: string;
  items: Item[];
  activeTabBySpace: Record<string, string | null>;
  archive: PastTab[];
  closed: PastTab[];
  history: Visit[];
  rules: Rule[];
  boosts: Boost[];
  settings: Settings;
}

export type IdGen = () => string;

export const isTab = (i: Item | undefined): i is TabItem => i?.kind === "tab";

export const displayTitle = (t: TabItem): string => t.customTitle ?? (t.title || t.url);
