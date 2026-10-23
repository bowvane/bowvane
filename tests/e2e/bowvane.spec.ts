import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});

test.afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function launch(): Promise<ElectronApplication> {
  return electron.launch({
    args: [".", "--no-sandbox"],
    env: { ...process.env, BOWVANE_USER_DATA: join(dir, "profile"), BOWVANE_ARC_SIDEBAR: join(dir, "StorableSidebar.json") },
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
