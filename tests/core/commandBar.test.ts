import { describe, expect, it } from "vitest";
import { searchCommandBar } from "../../src/core/commandBar";

const tabs = [
  { id: "t1", title: "GitHub — acme", url: "https://github.com/acme", spaceTitle: "Travail" },
  { id: "t2", title: "Gmail", url: "https://mail.google.com/", spaceTitle: "Perso" },
];
const history = [{ url: "https://news.ycombinator.com/", title: "Hacker News", visitedAt: 1 }];
const engine = "https://www.google.com/search?q=%s";

describe("Command Bar", () => {
  it("propose d’abord de basculer vers un onglet ouvert qui correspond", () => {
    const r = searchCommandBar("git", { tabs, history, engine });
    expect(r[0]).toMatchObject({ kind: "switch", tabId: "t1" });
  });
  it("trouve l’historique et termine par une recherche web", () => {
    const r = searchCommandBar("hacker", { tabs, history, engine });
    expect(r[0]).toMatchObject({ kind: "open", url: "https://news.ycombinator.com/" });
    expect(r.at(-1)).toMatchObject({ kind: "open", url: "https://www.google.com/search?q=hacker" });
  });
  it("propose d’ouvrir directement un domaine tapé", () => {
    const r = searchCommandBar("arc.net", { tabs, history, engine });
    expect(r[0]).toMatchObject({ kind: "open", url: "https://arc.net" });
  });
  it("trouve les actions par leur nom", () => {
    const r = searchCommandBar("split", { tabs, history, engine });
    expect(r.some((x) => x.kind === "action" && x.action === "split")).toBe(true);
  });
  it("sans saisie, liste les onglets ouverts", () => {
    expect(searchCommandBar("", { tabs, history, engine }).map((x) => x.kind)).toEqual(["switch", "switch"]);
  });
});
