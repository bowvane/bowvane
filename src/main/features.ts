import { clipboard, ClipboardItem, type Session, type WebContents } from "electron";
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Boost } from "../core/model";

export function boostCss(b: Boost): string {
  const zap = b.zapped.length ? `${b.zapped.join(",\n")} { display: none !important; }` : "";
  return `${b.css}\n${zap}`;
}

/** Applique les Boosts du domaine (CSS + éléments zappés + JS) au chargement de la page. */
export async function applyBoosts(wc: WebContents, boosts: Boost[]): Promise<void> {
  let host = "";
  try {
    host = new URL(wc.getURL()).hostname;
  } catch {
    return;
  }
  for (const b of boosts) {
    if (!b.enabled || !(host === b.host || host.endsWith(`.${b.host}`))) continue;
    const css = boostCss(b).trim();
    if (css) await wc.insertCSS(css).catch(() => undefined);
    if (b.js.trim()) await wc.executeJavaScript(`try{${b.js}\n}catch(e){console.error("Boost",e)}`).catch(() => undefined);
  }
}

/** Zap : surligne l’élément survolé ; un clic renvoie son sélecteur CSS, Échap annule. */
export const ZAP_SCRIPT = `new Promise((resolve) => {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;background:rgba(255,60,60,.25);outline:2px solid #ff3c3c;border-radius:4px;transition:all .05s";
  document.documentElement.appendChild(box);
  let target = null;
  const sel = (el) => {
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 5) {
      let p = el.tagName.toLowerCase();
      const cls = [...el.classList].filter((c) => !/\\d{3,}/.test(c)).slice(0, 2);
      if (cls.length) p += "." + cls.map((c) => CSS.escape(c)).join(".");
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === el.tagName);
        if (same.length > 1) p += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      parts.unshift(p);
      if (el.id) break;
      el = parent;
    }
    return parts.join(" > ");
  };
  const move = (e) => { target = e.target; const r = target.getBoundingClientRect(); Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }); };
  const done = (value) => { removeEventListener("mousemove", move, true); removeEventListener("click", click, true); removeEventListener("keydown", key, true); box.remove(); resolve(value); };
  const click = (e) => { e.preventDefault(); e.stopPropagation(); const s = target && sel(target); if (target) target.style.setProperty("display", "none", "important"); done(s); };
  const key = (e) => { if (e.key === "Escape") done(null); };
  addEventListener("mousemove", move, true); addEventListener("click", click, true); addEventListener("keydown", key, true);
})`;

/** Picture-in-Picture automatique quand on quitte un onglet qui joue une vidéo. */
export const AUTO_PIP_SCRIPT = `(() => {
  const v = [...document.querySelectorAll("video")].find((x) => !x.paused && !x.ended && x.readyState > 2 && x.videoWidth > 0);
  if (v && document.pictureInPictureElement !== v && !v.disablePictureInPicture) v.requestPictureInPicture().catch(() => {});
})()`;

export const EXIT_PIP_SCRIPT = `document.pictureInPictureElement && document.exitPictureInPicture().catch(() => {})`;

export async function capturePage(wc: WebContents, dir: string): Promise<string> {
  const png = (await wc.capturePage()).toPNG();
  await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(png)], { type: "image/png" }) })]);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const path = join(dir, `Capture Bowvane ${stamp}.png`);
  await writeFile(path, png);
  return path;
}

let blocker: Promise<ElectronBlocker | null> | null = null;
const blocked = new WeakSet<Session>();

/** Bloqueur de pubs et traqueurs (listes Ghostery, mises en cache dans le profil). */
export function adblocker(cacheDir: string): Promise<ElectronBlocker | null> {
  blocker ??= ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
    path: join(cacheDir, "adblock-engine.bin"),
    read: readFile,
    write: writeFile,
  }).catch((e: unknown) => {
    console.error("Bloqueur de pubs indisponible :", e);
    return null;
  });
  return blocker;
}

export async function setAdblock(session: Session, on: boolean, cacheDir: string): Promise<void> {
  const b = await adblocker(cacheDir);
  if (!b) return;
  if (on && !blocked.has(session)) {
    b.enableBlockingInSession(session);
    blocked.add(session);
  } else if (!on && blocked.has(session)) {
    b.disableBlockingInSession(session);
    blocked.delete(session);
  }
}
