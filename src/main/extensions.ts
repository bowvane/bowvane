import { app, session } from "electron";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { arcPinnedExtensionIds, arcProfileKey, describeExtension, enabledArcExtensionIds, latestVersion, setPinned, type ExtensionInfo } from "../core/extensions";

export interface LoadedExtension extends ExtensionInfo {
  id: string;
  /** Dossier de la copie = identifiant dans Arc ; stable même quand Electron dérive `id` du chemin (manifeste sans `key`). */
  folder: string;
  /** Icône prête à afficher (data URL). */
  iconData: string | null;
}

const loaded = new Map<string, LoadedExtension[]>();
const loadedPaths = new Set<string>();
const watched = new WeakSet<Electron.Session>();

export const partitionFor = (profile: string) => (profile === "default" ? "persist:bowvane" : `persist:${profile}`);
const root = () => join(app.getPath("userData"), "Extensions");

export function extensionsFor(profile: string): LoadedExtension[] {
  return loaded.get(profile) ?? [];
}

const pinnedFile = (profile: string) => join(root(), profile, "pinned.json");

/** Extensions affichées dans la barre du haut, dans l’ordre ; les autres restent dans le menu puzzle. */
export function pinnedFor(profile: string): string[] {
  const v = readJsonFile(pinnedFile(profile));
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function pinExtension(profile: string, id: string, pin: boolean): void {
  mkdirSync(join(root(), profile), { recursive: true });
  writeFileSync(pinnedFile(profile), JSON.stringify(setPinned(pinnedFor(profile), id, pin)));
}

function readJsonFile(p: string): unknown {
  try {
    return JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

/**
 * Copie les extensions activées dans Arc (une copie, pas un lien : Arc disparaît le 22/12).
 * `_metadata` est exclu : Electron refuse de charger un dossier dont un nom commence par « _ » hors `_locales`.
 */
export function importArcExtensions(arcSidebar: string): number {
  const arcData = join(dirname(arcSidebar), "User Data");
  if (!existsSync(arcData)) return 0;
  let copied = 0;
  for (const dir of readdirSync(arcData)) {
    if (dir !== "Default" && !/^Profile \d+$/.test(dir)) continue;
    const ids = enabledArcExtensionIds(readJsonFile(join(arcData, dir, "Secure Preferences")));
    // L’épinglage d’Arc n’est repris qu’une fois : ensuite il appartient à Bowvane.
    const pinned = pinnedFile(arcProfileKey(dir));
    if (ids.length && !existsSync(pinned)) {
      mkdirSync(dirname(pinned), { recursive: true });
      writeFileSync(pinned, JSON.stringify(arcPinnedExtensionIds(readJsonFile(join(arcData, dir, "Preferences")), ids)));
    }
    for (const id of ids) {
      const src = join(arcData, dir, "Extensions", id);
      const version = existsSync(src) ? latestVersion(readdirSync(src)) : null;
      if (!version || !existsSync(join(src, version, "manifest.json"))) continue;
      const target = join(root(), arcProfileKey(dir), id);
      const stamp = `${target}.version`;
      if (existsSync(target) && existsSync(stamp) && readFileSync(stamp, "utf8") === version) continue;
      const tmp = `${target}.tmp`;
      try {
        rmSync(tmp, { recursive: true, force: true });
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(src, version), tmp, { recursive: true, filter: (p) => basename(p) !== "_metadata" });
        rmSync(target, { recursive: true, force: true });
        renameSync(tmp, target);
        writeFileSync(stamp, version);
        copied++;
      } catch (e) {
        rmSync(tmp, { recursive: true, force: true });
        console.error(`[extensions] copie impossible de ${id}`, e);
      }
    }
  }
  return copied;
}

export const hasImportedExtensions = () => existsSync(root());

function messagesOf(dir: string, defaultLocale: unknown): Record<string, { message?: string }> | null {
  const locales = [app.getLocale().replace("-", "_"), app.getLocale().split("-")[0], defaultLocale, "en"].filter((l): l is string => typeof l === "string");
  for (const l of locales) {
    const m = readJsonFile(join(dir, "_locales", l, "messages.json"));
    if (m && typeof m === "object") return m as Record<string, { message?: string }>;
  }
  return null;
}

function iconData(dir: string, icon: string | null): string | null {
  if (!icon) return null;
  try {
    const type = extname(icon).toLowerCase() === ".svg" ? "image/svg+xml" : "image/png";
    return `data:${type};base64,${readFileSync(join(dir, icon.replace(/^\//, ""))).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Charge les extensions copiées de chaque profil dans sa session. À appeler avant de créer les onglets. */
export async function loadAllExtensions(): Promise<void> {
  if (!existsSync(root())) return;
  for (const profile of readdirSync(root())) {
    const dir = join(root(), profile);
    if (profile.endsWith(".tmp") || !existsSync(dir)) continue;
    const ses = session.fromPartition(partitionFor(profile));
    if (!watched.has(ses)) {
      watched.add(ses);
      // Une extension peut se charger sans erreur puis mourir dans son service worker (API absente d’Electron).
      ses.serviceWorkers.on("console-message", (_e, d) => {
        if (d.level >= 3 && d.sourceUrl.startsWith("chrome-extension://")) console.error(`[extensions] ${d.sourceUrl} : ${d.message}`);
      });
    }
    const list = loaded.get(profile) ?? [];
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name.endsWith(".version") || name.endsWith(".tmp") || loadedPaths.has(path) || !existsSync(join(path, "manifest.json"))) continue;
      try {
        const ext = await ses.extensions.loadExtension(path, { allowFileAccess: false });
        loadedPaths.add(path);
        const manifest = readJsonFile(join(path, "manifest.json"));
        const info = describeExtension(manifest, messagesOf(path, (manifest as { default_locale?: unknown } | null)?.default_locale));
        list.push({ ...info, id: ext.id, folder: name, iconData: iconData(path, info.icon) });
      } catch (e) {
        console.error(`[extensions] ${profile}/${name} non chargée :`, e instanceof Error ? e.message : e);
      }
    }
    loaded.set(profile, list);
  }
}
