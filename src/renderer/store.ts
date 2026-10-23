import { create } from "zustand";
import type { CommandResult } from "../core/commandBar";
import type { ChromeCommand, BowvaneApi, LittleSnapshot, Snapshot } from "../shared/ipc";

declare global {
  interface Window {
    bowvane: BowvaneApi;
    bowvaneRename: (cb: (id: string) => void) => void;
  }
}

interface UiStore {
  snap: Snapshot | null;
  little: LittleSnapshot | null;
  results: CommandResult[];
  find: { active: number; total: number };
  renaming: string | null;
  setRenaming: (id: string | null) => void;
}

export const useUi = create<UiStore>((set) => ({
  snap: null,
  little: null,
  results: [],
  find: { active: 0, total: 0 },
  renaming: null,
  setRenaming: (renaming) => set({ renaming }),
}));

export const send = (c: ChromeCommand) => window.bowvane.send(c);

window.bowvane.onSnapshot((snap) => useUi.setState({ snap }));
window.bowvane.onLittle((little) => useUi.setState({ little }));
window.bowvane.onCommandResults((results) => useUi.setState({ results }));
window.bowvane.onFindResult((find) => useUi.setState({ find }));
window.bowvaneRename((id) => useUi.setState({ renaming: id }));

export function faviconFor(snap: Snapshot, url: string): string | null {
  try {
    return snap.favicons[new URL(url).hostname] ?? null;
  } catch {
    return null;
  }
}
