import type { CommandAction, CommandResult } from "../core/commandBar";
import type { Destination } from "../core/store";
import type { Boost, PastTab, Rule, Settings, Space, State, Visit } from "../core/model";

export type OverlayView =
  | { kind: "none" }
  | { kind: "command"; initial: string; replaceCurrent: boolean }
  | { kind: "history" }
  | { kind: "archive" }
  | { kind: "downloads" }
  | { kind: "settings" }
  | { kind: "boost"; host: string }
  | { kind: "peek"; url: string }
  | { kind: "space"; spaceId: string | null }
  | { kind: "find" };

export interface TabRuntime {
  loaded: boolean;
  loading: boolean;
  audible: boolean;
  muted: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface DownloadEntry {
  id: string;
  filename: string;
  path: string;
  receivedBytes: number;
  totalBytes: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
}

export interface Snapshot {
  state: Pick<State, "spaces" | "activeSpaceId" | "items" | "activeTabBySpace" | "rules" | "boosts" | "settings">;
  runtime: Record<string, TabRuntime>;
  favicons: Record<string, string>;
  split: { primary: string; secondary: string } | null;
  sidebarVisible: boolean;
  /** Sidebar masquée mais affichée en flottant au survol du bord gauche (comme Arc). */
  sidebarFloating: boolean;
  overlay: OverlayView;
  /** Incrémenté à chaque ouverture d’un panneau : les champs ne se réinitialisent qu’à ce moment-là. */
  overlaySeq: number;
  toast: { id: number; text: string } | null;
  arcAvailable: boolean;
  /** Extensions chargées dans le profil du Space actif. */
  extensions: { id: string; name: string; icon: string | null; hasPopup: boolean; pinned: boolean }[];
}

export interface LittleSnapshot {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  private: boolean;
  color: string;
}

export type ChromeCommand =
  | { type: "activateTab"; id: string }
  | { type: "closeTab"; id: string }
  | { type: "newTab"; url?: string }
  | { type: "navigate"; input: string; replaceCurrent: boolean }
  | { type: "back" } | { type: "forward" } | { type: "reload" }
  | { type: "togglePin"; id: string }
  | { type: "toggleFavorite"; id: string }
  | { type: "rename"; id: string; title: string }
  | { type: "move"; id: string; to: Destination }
  | { type: "toggleFolder"; id: string }
  | { type: "newFolder"; parentId: string | null }
  | { type: "toggleMute"; id: string }
  | { type: "contextMenu"; id: string }
  | { type: "spaceMenu"; spaceId: string }
  | { type: "switchSpace"; spaceId: string }
  | { type: "switchSpaceRelative"; delta: 1 | -1 }
  | { type: "saveSpace"; spaceId: string | null; changes: Pick<Space, "title" | "icon" | "color" | "appearance" | "profile"> }
  | { type: "floatSidebar"; show: boolean }
  | { type: "resizeSidebar"; phase: "start" | "move" | "end"; width: number }
  | { type: "clearToday" }
  | { type: "openOverlay"; view: OverlayView }
  | { type: "closeOverlay" }
  | { type: "commandQuery"; query: string }
  | { type: "commandRun"; result: CommandResult; replaceCurrent: boolean }
  | { type: "action"; action: CommandAction }
  | { type: "peekExpand" }
  | { type: "saveSettings"; settings: Partial<Settings> }
  | { type: "saveRules"; rules: Rule[] }
  | { type: "saveBoost"; boost: Boost }
  | { type: "deleteBoost"; id: string }
  | { type: "reopenArchived"; index: number }
  | { type: "openHistory"; url: string }
  | { type: "showDownload"; id: string }
  | { type: "importArc" }
  | { type: "openExtension"; id: string; x: number; y: number }
  | { type: "pinExtension"; id: string; pinned: boolean }
  | { type: "littleCommand"; command: "back" | "reload" | "promote" | "close" | "copy"; }
  | { type: "littleNavigate"; input: string }
  | { type: "find"; text: string; forward: boolean }
  | { type: "findStop" };

export interface PanelData {
  history: Visit[];
  archive: PastTab[];
  downloads: DownloadEntry[];
  boost: Boost | null;
}

export interface BowvaneApi {
  send(c: ChromeCommand): void;
  onSnapshot(cb: (s: Snapshot) => void): void;
  onLittle(cb: (s: LittleSnapshot) => void): void;
  onCommandResults(cb: (r: CommandResult[]) => void): void;
  onFindResult(cb: (r: { active: number; total: number }) => void): void;
  panelData(): Promise<PanelData>;
}
