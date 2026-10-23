import { app, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";
import { cpSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChromeCommand } from "../shared/ipc";
import { Bowvane } from "./browser";

if (process.env.BOWVANE_USER_DATA) app.setPath("userData", process.env.BOWVANE_USER_DATA);
app.setName("Bowvane");
// Profil créé quand le projet s’appelait « Courbe » : repris une fois (Spaces, onglets, réglages).
// Les connexions ne suivent pas : le trousseau macOS chiffre les cookies avec une clé liée au nom de l’app.
{
  const userData = app.getPath("userData");
  const legacy = join(dirname(userData), "Courbe");
  if (!process.env.BOWVANE_USER_DATA && !existsSync(userData) && existsSync(legacy)) {
    cpSync(legacy, userData, { recursive: true });
    const partition = join(userData, "Partitions", "courbe");
    if (existsSync(partition)) renameSync(partition, join(userData, "Partitions", "bowvane"));
  }
}
// Sans les mentions Electron et Bowvane, certains sites (Google) acceptent mieux la connexion.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|bowvane|Bowvane)\/\S+/g, "");

const pending: string[] = [];
let bowvane: Bowvane | null = null;

const rendererUrl = (view: string) => {
  const dev = process.env.BOWVANE_RENDERER_URL;
  return dev ? `${dev}#${view}` : `${pathToFileURL(join(__dirname, "../renderer/index.html")).href}#${view}`;
};

const openUrl = (url: string) => (bowvane ? bowvane.openExternal(url) : pending.push(url));
app.on("open-url", (e, url) => {
  e.preventDefault();
  openUrl(url);
});
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_e, argv) => argv.filter((a) => /^https?:\/\//.test(a)).forEach(openUrl));

function buildMenu(c: Bowvane): void {
  const a = (action: Parameters<Bowvane["action"]>[0]) => () => c.action(action);
  const spaces: MenuItemConstructorOptions[] = c.state.spaces.slice(0, 9).map((sp, i) => ({
    label: `${sp.icon} ${sp.title}`.trim(),
    accelerator: `Ctrl+${i + 1}`,
    click: () => c.switchSpaceIndex(i),
  }));
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Bowvane",
      submenu: [
        { role: "about", label: "À propos de Bowvane" },
        { label: "Réglages…", accelerator: "CmdOrCtrl+,", click: a("settings") },
        { label: "Importer depuis Arc…", click: a("importArc") },
        { label: "Définir comme navigateur par défaut", click: () => app.setAsDefaultProtocolClient("http") && app.setAsDefaultProtocolClient("https") },
        { type: "separator" },
        { role: "hide", label: "Masquer Bowvane" },
        { role: "hideOthers", label: "Masquer les autres" },
        { type: "separator" },
        { role: "quit", label: "Quitter Bowvane" },
      ],
    },
    {
      label: "Fichier",
      submenu: [
        { label: "Nouvel onglet…", accelerator: "CmdOrCtrl+T", click: () => c.openOverlay({ kind: "command", initial: "", replaceCurrent: false }) },
        { label: "Ouvrir la Command Bar", accelerator: "CmdOrCtrl+L", click: () => c.openOverlay({ kind: "command", initial: c.activeTab()?.url ?? "", replaceCurrent: true }) },
        { label: "Nouvelle fenêtre Little Bowvane", accelerator: "Alt+CmdOrCtrl+N", click: a("littleArc") },
        { label: "Nouvelle fenêtre privée", accelerator: "Shift+CmdOrCtrl+N", click: a("private") },
        { label: "Rouvrir l’onglet fermé", accelerator: "Shift+CmdOrCtrl+T", click: () => c.restoreClosed() },
        { type: "separator" },
        { label: "Capturer la page", accelerator: "Shift+CmdOrCtrl+2", click: a("capture") },
        { label: "Fermer l’onglet", accelerator: "CmdOrCtrl+W", click: () => c.closeActive() },
        { label: "Fermer la fenêtre", accelerator: "Shift+CmdOrCtrl+W", role: "close" },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { label: "Copier l’URL", accelerator: "Shift+CmdOrCtrl+C", click: a("copyUrl") },
        { label: "Copier l’URL en Markdown", accelerator: "Alt+Shift+CmdOrCtrl+C", click: a("copyMarkdown") },
        { role: "paste", label: "Coller" },
        { role: "pasteAndMatchStyle", label: "Coller sans mise en forme" },
        { role: "selectAll", label: "Tout sélectionner" },
        { type: "separator" },
        { label: "Rechercher dans la page", accelerator: "CmdOrCtrl+F", click: () => c.openOverlay({ kind: "find" }) },
      ],
    },
    {
      label: "Présentation",
      submenu: [
        { label: "Afficher / masquer la sidebar", accelerator: "CmdOrCtrl+S", click: a("toggleSidebar") },
        { label: "Recharger", accelerator: "CmdOrCtrl+R", click: () => c.activeTab() && c.handle({ type: "reload" }, null as never) },
        { label: "Recharger sans cache", accelerator: "Shift+CmdOrCtrl+R", click: a("reloadHard") },
        { type: "separator" },
        { label: "Ajouter un Split View", accelerator: "Ctrl+Shift+=", click: a("split") },
        { label: "Fermer le volet du Split View", accelerator: "Ctrl+Shift+-", click: a("closeSplit") },
        { type: "separator" },
        { label: "Taille réelle", accelerator: "CmdOrCtrl+0", click: () => c.zoom(0) },
        { label: "Zoom avant", accelerator: "CmdOrCtrl+=", click: () => c.zoom(1) },
        { label: "Zoom arrière", accelerator: "CmdOrCtrl+-", click: () => c.zoom(-1) },
        { type: "separator" },
        { label: "Outils de développement", accelerator: "Alt+CmdOrCtrl+I", click: a("devtools") },
        { role: "togglefullscreen", label: "Plein écran" },
      ],
    },
    {
      label: "Spaces",
      submenu: [
        { label: "Nouveau Space…", click: a("newSpace") },
        { label: "Space suivant", accelerator: "Alt+CmdOrCtrl+Right", click: () => c.switchSpaceRelative(1) },
        { label: "Space précédent", accelerator: "Alt+CmdOrCtrl+Left", click: () => c.switchSpaceRelative(-1) },
        { type: "separator" },
        ...spaces,
      ],
    },
    {
      label: "Onglets",
      submenu: [
        { label: "Épingler / désépingler", accelerator: "CmdOrCtrl+D", click: a("pin") },
        { label: "Dupliquer l’onglet", click: a("duplicate") },
        { label: "Onglet suivant", accelerator: "Alt+CmdOrCtrl+Down", click: () => c.cycleTab(1) },
        { label: "Onglet précédent", accelerator: "Alt+CmdOrCtrl+Up", click: () => c.cycleTab(-1) },
        { label: "Onglet suivant", accelerator: "Ctrl+Tab", visible: false, click: () => c.cycleTab(1) },
        { label: "Onglet précédent", accelerator: "Ctrl+Shift+Tab", visible: false, click: () => c.cycleTab(-1) },
        { type: "separator" },
        { label: "Vider Today", accelerator: "Shift+CmdOrCtrl+K", click: () => c.clearToday() },
        { label: "Couper le son de tous les onglets", click: a("muteAll") },
        { type: "separator" },
        { label: "Booster ce site…", click: a("boost") },
        { label: "Zap : masquer un élément", click: a("zap") },
      ],
    },
    {
      label: "Archive",
      submenu: [
        { label: "Précédent", accelerator: "CmdOrCtrl+[", click: () => c.handle({ type: "back" }, null as never) },
        { label: "Suivant", accelerator: "CmdOrCtrl+]", click: () => c.handle({ type: "forward" }, null as never) },
        { label: "Historique", accelerator: "CmdOrCtrl+Y", click: a("history") },
        { label: "Onglets archivés", click: a("archive") },
        { label: "Téléchargements", accelerator: "Shift+CmdOrCtrl+J", click: a("downloads") },
      ],
    },
    { role: "windowMenu", label: "Fenêtre" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  bowvane = new Bowvane(rendererUrl);
  const c = bowvane;
  buildMenu(c);
  let spaceSignature = "";
  setInterval(() => {
    const sig = c.state.spaces.map((s) => s.icon + s.title).join("|");
    if (sig !== spaceSignature) {
      spaceSignature = sig;
      buildMenu(c);
    }
  }, 1000);
  ipcMain.on("cmd", (e, cmd: ChromeCommand) => c.handle(cmd, e.sender));
  ipcMain.handle("panelData", () => c.panelData());
  pending.splice(0).forEach((u) => c.openExternal(u));
  process.argv.slice(1).filter((a) => /^https?:\/\//.test(a)).forEach((u) => c.openExternal(u));
});

app.on("before-quit", () => bowvane?.flush());
app.on("window-all-closed", () => app.quit());
