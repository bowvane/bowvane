import { describe, expect, it } from "vitest";
import { routeUrl } from "../../src/core/atc";
import { shouldPeek, toNavigableUrl } from "../../src/core/url";
import type { Rule } from "../../src/core/model";

const rules: Rule[] = [
  { id: "r1", match: "meet.google.com", target: { kind: "little" } },
  { id: "r2", match: "github.com/acme", target: { kind: "space", spaceId: "work" } },
  { id: "r3", match: "notion.so", target: { kind: "space", spaceId: "perso" } },
];

describe("Air Traffic Control", () => {
  it("route par domaine, sous-domaine compris", () => {
    expect(routeUrl("https://meet.google.com/abc", rules)).toEqual({ kind: "little" });
    expect(routeUrl("https://www.notion.so/page", rules)).toEqual({ kind: "space", spaceId: "perso" });
  });
  it("route par préfixe de chemin, sans confondre un domaine voisin", () => {
    expect(routeUrl("https://github.com/acme/repo", rules)).toEqual({ kind: "space", spaceId: "work" });
    expect(routeUrl("https://github.com/autre/repo", rules)).toBeNull();
    expect(routeUrl("https://evilnotion.so/", rules)).toBeNull();
  });
  it("ignore une URL invalide", () => {
    expect(routeUrl("pas une url", rules)).toBeNull();
  });
});

describe("saisie de la barre d’adresse", () => {
  const engine = "https://www.google.com/search?q=%s";
  it("garde une URL complète", () => expect(toNavigableUrl("https://a.b/c?d=1", engine)).toBe("https://a.b/c?d=1"));
  it("complète un domaine", () => expect(toNavigableUrl("arc.net", engine)).toBe("https://arc.net"));
  it("passe localhost en http", () => expect(toNavigableUrl("localhost:3000/x", engine)).toBe("http://localhost:3000/x"));
  it("cherche une phrase", () => expect(toNavigableUrl("prix du cacao", engine)).toBe("https://www.google.com/search?q=prix%20du%20cacao"));
  it("cherche un mot sans point", () => expect(toNavigableUrl("electron", engine)).toBe("https://www.google.com/search?q=electron"));
  it("refuse les schémas dangereux en les cherchant", () => expect(toNavigableUrl("javascript:alert(1)", engine)).toBe("https://www.google.com/search?q=javascript%3Aalert(1)"));
});

describe("Peek depuis un favori", () => {
  const gmail = "https://mail.google.com/";
  it("ouvre en aperçu un lien vers un autre site", () => expect(shouldPeek(gmail, "https://www.lemonde.fr/article")).toBe(true));
  it("reste dans l’onglet pour le même site", () => expect(shouldPeek(gmail, "https://calendar.google.com/")).toBe(false));
  it("ne détourne pas une page de connexion", () => {
    expect(shouldPeek("https://notion.so/", "https://accounts.google.com/o/oauth2/auth")).toBe(false);
    expect(shouldPeek("https://notion.so/", "https://example.okta.com/login")).toBe(false);
  });
});
