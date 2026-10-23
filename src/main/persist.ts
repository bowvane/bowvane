import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { State } from "../core/model";

export const ARC_SIDEBAR = join(homedir(), "Library", "Application Support", "Arc", "StorableSidebar.json");

const file = (name: string) => join(app.getPath("userData"), name);

export function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(file(name), "utf8")) as T;
  } catch {
    return null;
  }
}

/** Écriture atomique : un crash pendant la sauvegarde ne corrompt pas l’état. */
export function writeJson(name: string, value: unknown): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  const tmp = file(`${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file(name));
}

export function loadState(): State | null {
  const s = readJson<State>("state.json");
  return s && s.version === 1 && Array.isArray(s.spaces) && s.spaces.length > 0 ? s : null;
}

export function arcSidebarPath(): string | null {
  const p = process.env.BOWVANE_ARC_SIDEBAR ?? ARC_SIDEBAR;
  return existsSync(p) ? p : null;
}

export function debounce(fn: () => void, ms: number): () => void {
  let t: NodeJS.Timeout | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
}
