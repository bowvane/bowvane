import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arcSidebarFixture } from "../core/fixtures";

let server: Server;
let base = "";
let dir = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const name = (req.url ?? "/").slice(1) || "home";
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>Page ${name}</title><h1 id="h">${name}</h1><a id="next" href="/${name}-suite">suite</a>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  dir = mkdtempSync(join(tmpdir(), "bowvane-e2e-"));
  writeFileSync(join(dir, "StorableSidebar.json"), JSON.stringify(arcSidebarFixture()));
  writeArcExtensionFixture(join(dir, "User Data"));
});

test.afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";

/** Une extension activée et une désactivée, rangées comme Arc les installe (dossier par version, `_metadata`). */
function writeArcExtensionFixture(userData: string) {
  const profile = join(userData, "Default");
  mkdirSync(profile, { recursive: true });
  const settings = { [EXT_ID]: { location: 1, disable_reasons: [] }, ponmlkjihgfedcbaponmlkjihgfedcba: { location: 1, disable_reasons: [1] } };
  writeFileSync(join(profile, "Secure Preferences"), JSON.stringify({ extensions: { settings } }));
  // Cas courant : rien d’épinglé dans la barre d’Arc.
  writeFileSync(join(profile, "Preferences"), JSON.stringify({ extensions: { pinned_extensions: [] } }));
  for (const id of Object.keys(settings)) {
    const ext = join(profile, "Extensions", id, "1.0.0_0");
    mkdirSync(join(ext, "_locales", "en"), { recursive: true });
    mkdirSync(join(ext, "_metadata"), { recursive: true });
    writeFileSync(join(ext, "_metadata", "verified_contents.json"), "[]");
    writeFileSync(join(ext, "_locales", "en", "messages.json"), JSON.stringify({ name: { message: "Test Extension" } }));
    writeFileSync(
      join(ext, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "__MSG_name__",
        default_locale: "en",
        version: "1.0.0",
        action: { default_popup: "popup.html", default_icon: { "16": "icon.png" } },
        background: { service_worker: "sw.js" },
        content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["content.js"] }],
      }),
    );
    writeFileSync(join(ext, "popup.html"), `<html><body style="margin:0;width:220px;height:120px"><p id="hello">Bonjour</p></body></html>`);
    writeFileSync(join(ext, "content.js"), `document.documentElement.setAttribute("data-bowvane-ext", "1");`);
    writeFileSync(join(ext, "sw.js"), `chrome.runtime.onInstalled.addListener(() => {});`);
    writeFileSync(join(ext, "icon.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  }
}

async function launch(profile = "profile"): Promise<ElectronApplication> {
  return electron.launch({
    args: [".", "--no-sandbox"],
    env: { ...process.env, BOWVANE_USER_DATA: join(dir, profile), BOWVANE_ARC_SIDEBAR: join(dir, "StorableSidebar.json") },
  });
}

async function view(app: ElectronApplication, hash: string): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const p = app.windows().find((w) => w.url().endsWith(`#${hash}`));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`vue #${hash} introuvable`);
}

async function page(app: ElectronApplication, prefix: string): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const p = app.windows().find((w) => w.url().startsWith(prefix));
    if (p) return p;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`page ${prefix} introuvable`);
}

/** Clique un élément du menu de l’application par son libellé (raccourcis clavier inclus). */
async function menu(app: ElectronApplication, label: string): Promise<void> {
  const found = await app.evaluate(({ Menu }, l) => {
    const walk = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const it of items) {
        if (it.label === l) return it;
        const sub = it.submenu ? walk(it.submenu.items) : undefined;
        if (sub) return sub;
      }
      return undefined;
    };
    const item = walk(Menu.getApplicationMenu()?.items ?? []);
    item?.click();
    return !!item;
  }, label);
  expect(found, `menu « ${label} »`).toBe(true);
}

async function openViaCommandBar(app: ElectronApplication, sidebar: Page, url: string) {
  await sidebar.getByTestId("new-tab").click();
  const overlay = await view(app, "overlay");
  const input = overlay.locator(".command-input");
  await expect(input).toBeVisible();
  await input.fill(url);
  await expect(overlay.getByTestId("command-result").first()).toContainText(url);
  await input.press("Enter");
  return overlay;
}

test("parcours principal : import Arc, Command Bar, épingler, Spaces, Split, archive, persistance", async () => {
  let app = await launch();
  let sidebar = await view(app, "sidebar");

  // 1. Premier lancement : import automatique de la barre latérale d’Arc.
  await expect(sidebar.getByTestId("toast")).toContainText("Arc importé : 2 Spaces, 5 onglets épinglés, 2 favoris");
  await expect(sidebar.getByTestId("space-title")).toHaveText("Travail");
  await expect(sidebar.locator(".fav")).toHaveCount(2);
  // Les dossiers arrivent fermés : seul « Docs » est visible, « Design » apparaît en l’ouvrant.
  await expect(sidebar.getByTestId("pinned").locator(".row.folder")).toHaveCount(1);
  await sidebar.getByTestId("pinned").getByText("Docs").click();
  await expect(sidebar.getByTestId("pinned").locator(".row.folder")).toHaveCount(2);
  await expect(sidebar.getByTestId("pinned")).toContainText("Code");
  await expect(sidebar.getByTestId("today").locator(".row")).toHaveCount(1);

  // 2. Command Bar : ouvrir une page locale dans un nouvel onglet Today.
  await openViaCommandBar(app, sidebar, `${base}/alpha`);
  const alpha = await page(app, `${base}/alpha`);
  await expect(alpha.locator("#h")).toHaveText("alpha");
  await expect(sidebar.getByTestId("today")).toContainText("Page alpha");
  await expect(sidebar.getByTestId("today").locator(".row.active")).toContainText("Page alpha");

  // 3. ⌘D : l’onglet actif passe dans les épinglés.
  await menu(app, "Épingler / désépingler");
  await expect(sidebar.getByTestId("pinned")).toContainText("Page alpha");
  await expect(sidebar.getByTestId("today")).not.toContainText("Page alpha");

  // 4. La Command Bar retrouve l’onglet ouvert (basculer) avant l’historique.
  await sidebar.getByTestId("new-tab").click();
  const overlay = await view(app, "overlay");
  await overlay.locator(".command-input").fill("alpha");
  await expect(overlay.getByTestId("command-result").first()).toContainText("Basculer");
  await overlay.locator(".command-input").press("Escape");
  await expect(overlay.getByTestId("command-bar")).toHaveCount(0);

  // 5. Split View : un second onglet partage la fenêtre.
  await openViaCommandBar(app, sidebar, `${base}/beta`);
  await page(app, `${base}/beta`);
  await sidebar.getByTestId("pinned").getByText("Page alpha").click();
  await menu(app, "Ajouter un Split View");
  const ov2 = await view(app, "overlay");
  await ov2.locator(".command-input").fill(`${base}/gamma`);
  await ov2.locator(".command-input").press("Enter");
  await page(app, `${base}/gamma`);
  await expect(sidebar.locator(".badge")).toHaveCount(2);
  await menu(app, "Fermer le volet du Split View");
  await expect(sidebar.locator(".badge")).toHaveCount(0);

  // 6. Vider Today (⇧⌘K) archive les onglets Today sauf l’actif ; l’archive les rouvre.
  await sidebar.getByTestId("today").getByText("Page beta").click();
  await sidebar.getByTestId("clear-today").click();
  await expect(sidebar.getByTestId("today").locator(".row")).toHaveCount(1);
  await menu(app, "Onglets archivés");
  const ov3 = await view(app, "overlay");
  await expect(ov3.getByTestId("archive-row").first()).toBeVisible();
  const archived = await ov3.getByTestId("archive-row").count();
  expect(archived).toBeGreaterThanOrEqual(2);
  await ov3.getByTestId("archive-row").filter({ hasText: "HN" }).click();
  await expect(sidebar.getByTestId("today")).toContainText("HN");

  // 7. Nouveau Space, bascule par la barre du bas, et par ⌃1.
  await sidebar.locator(".dot.add").click();
  const ov4 = await view(app, "overlay");
  await ov4.getByTestId("space-name").fill("Recherche");
  await ov4.getByTestId("space-save").click();
  await expect(sidebar.getByTestId("space-title")).toHaveText("Recherche");
  await expect(sidebar.getByTestId("pinned").locator(".row")).toHaveCount(0);
  await menu(app, "💼 Travail");
  await expect(sidebar.getByTestId("space-title")).toHaveText("Travail");

  // 7 bis. Sidebar masquée : elle revient en flottant au bord gauche, puis par le menu.
  await menu(app, "Afficher / masquer la sidebar");
  await expect(sidebar.getByTestId("sidebar")).toHaveCount(0);
  await sidebar.getByTestId("edge-hotzone").hover();
  await expect(sidebar.locator(".sidebar.floating")).toBeVisible();
  await menu(app, "Afficher / masquer la sidebar");
  await expect(sidebar.locator(".sidebar:not(.floating)")).toBeVisible();
  await expect(sidebar.getByTestId("edge-hotzone")).toHaveCount(0);

  // 8. Air Traffic Control : un lien Meet venu d’une autre app s’ouvre dans Little Bowvane.
  await app.evaluate(({ app: a }) => a.emit("open-url", { preventDefault() {} }, "https://meet.google.com/abc-defg-hij"));
  const little = await view(app, "little");
  await expect(little.locator(".promote")).toBeVisible();

  // 9. Boost : CSS appliqué à la page du site.
  await sidebar.getByTestId("pinned").getByText("Page alpha").click();
  await sidebar.evaluate((host) => window.bowvane.send({ type: "saveBoost", boost: { id: "b1", host, css: "#h { color: rgb(255, 0, 0) !important; }", js: "", zapped: [], enabled: true } }), "127.0.0.1");
  await expect.poll(() => alpha.locator("#h").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 0, 0)");

  await app.close();

  // 10. Relance : l’état est restauré, sans réimport.
  app = await launch();
  sidebar = await view(app, "sidebar");
  await expect(sidebar.getByTestId("space-title")).toHaveText("Travail");
  await expect(sidebar.getByTestId("pinned")).toContainText("Page alpha");
  await expect(sidebar.getByTestId("space-dots").locator(".dot:not(.add)")).toHaveCount(3);
  await expect(sidebar.getByTestId("toast")).toHaveCount(0);
  await app.close();
});

test("extensions d’Arc : import, menu puzzle, épinglage, script de contenu, popup", async () => {
  const app = await launch("profile-ext");
  const sidebar = await view(app, "sidebar");

  // Comme dans Arc : rien d’épinglé, donc aucune icône dans la barre ; tout est derrière le puzzle.
  // Sans `key` dans le manifeste, Electron dérive l’identifiant du chemin : on cible donc par rôle, pas par identifiant.
  const pinned = sidebar.locator(".topbar .ext");
  await expect(pinned).toHaveCount(0);
  await sidebar.getByTestId("ext-menu-button").click();
  // Seule l’extension activée dans Arc est reprise, sans son dossier `_metadata` que Chrome réserve.
  const rows = sidebar.locator("[data-testid^=ext-open-]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Test Extension");
  // Un clic hors du menu le referme.
  await sidebar.locator(".ext-menu-backdrop").click();
  await expect(sidebar.getByTestId("ext-menu")).toHaveCount(0);
  const copied = join(dir, "profile-ext", "Extensions", "default", EXT_ID);
  expect(existsSync(join(copied, "manifest.json"))).toBe(true);
  expect(existsSync(join(copied, "_metadata"))).toBe(false);

  // Le script de contenu agit sur une page ouverte ensuite.
  await openViaCommandBar(app, sidebar, `${base}/alpha`);
  const tab = await page(app, `${base}/alpha`);
  await expect(tab.locator("html")).toHaveAttribute("data-bowvane-ext", "1");

  // Épinglée depuis le menu, elle rejoint la barre du haut et le reste après redémarrage (pinned.json).
  await sidebar.getByTestId("ext-menu-button").click();
  await sidebar.locator("[data-testid^=ext-pin-]").click();
  await expect(pinned).toHaveCount(1);
  await expect(pinned).toHaveAttribute("title", "Test Extension");
  expect(JSON.parse(readFileSync(join(dir, "profile-ext", "Extensions", "default", "pinned.json"), "utf8"))).toEqual([EXT_ID]);
  await sidebar.locator(".ext-menu-backdrop").click();
  await expect(sidebar.getByTestId("ext-menu")).toHaveCount(0);

  // L’icône épinglée ouvre la popup de l’extension ; Échap la ferme.
  await pinned.click();
  const popup = await page(app, "chrome-extension://");
  await expect(popup.locator("#hello")).toHaveText("Bonjour");
  // Échap envoyé comme une vraie frappe (sendInputEvent) : les touches simulées par DevTools contournent before-input-event.
  await app.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith("chrome-extension://"));
    wc?.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  });
  await expect.poll(() => app.windows().some((w) => w.url().startsWith("chrome-extension://"))).toBe(false);

  await app.close();
});
