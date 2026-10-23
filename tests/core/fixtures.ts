// Fichier StorableSidebar.json synthétique qui reproduit la forme observée dans Arc 1.170 :
// tableaux Swift aplatis [id, objet, …], conteneurs [genre, id, …], arbre parentID/childrenIds.
const color = (red: number, green: number, blue: number) => ({ red, green, blue, alpha: 1, colorSpace: "extendedSRGB" });

export function arcSidebarFixture(): unknown {
  const items: unknown[] = [];
  const add = (id: string, parentID: string | null, childrenIds: string[], data: unknown, title: string | null = null) =>
    items.push(id, { id, parentID, childrenIds, data, title, createdAt: 700000000, isUnread: false });

  add("fav-root", null, ["fav-1", "fav-2"], { itemContainer: { containerType: { topApps: {} } } });
  add("fav-1", "fav-root", [], { tab: { savedURL: "https://mail.google.com/", savedTitle: "Gmail" } });
  add("fav-2", "fav-root", [], { tab: { savedURL: "https://calendar.google.com/", savedTitle: "Agenda" } });

  add("pin-work", null, ["t-gh", "folder-docs", "sv-1", "easel-1"], { itemContainer: { containerType: { spaceItems: {} } } });
  add("t-gh", "pin-work", [], { tab: { savedURL: "https://github.com/", savedTitle: "GitHub" } }, "Code");
  add("folder-docs", "pin-work", ["t-notion", "folder-sub"], { list: {} }, "Docs");
  add("t-notion", "folder-docs", [], { tab: { savedURL: "https://notion.so/", savedTitle: "Notion" } });
  add("folder-sub", "folder-docs", ["t-figma"], { list: {} }, "Design");
  add("t-figma", "folder-sub", [], { tab: { savedURL: "https://figma.com/", savedTitle: "Figma" } });
  add("sv-1", "pin-work", ["t-a", "t-b"], { splitView: { layoutOrientation: "horizontal", itemWidthFactors: [0.5, 0.5] } });
  add("t-a", "sv-1", [], { tab: { savedURL: "https://a.example/", savedTitle: "A" } });
  add("t-b", "sv-1", [], { tab: { savedURL: "https://b.example/", savedTitle: "B" } });
  add("easel-1", "pin-work", [], { easel: { title: "Board" } }, "Board");

  add("today-work", null, ["t-today"], { itemContainer: { containerType: { spaceItems: {} } } });
  add("t-today", "today-work", [], { tab: { savedURL: "https://news.ycombinator.com/", savedTitle: "HN" } });

  add("pin-perso", null, [], { itemContainer: { containerType: { spaceItems: {} } } });
  add("today-perso", null, [], { itemContainer: { containerType: { spaceItems: {} } } });

  const spaces: unknown[] = [
    "space-work",
    {
      id: "space-work",
      title: "Travail",
      profile: { default: true },
      newContainerIDs: [{ pinned: {} }, "pin-work", { unpinned: { _0: { shared: {} } } }, "today-work"],
      containerIDs: ["pinned", "pin-work", "unpinned", "today-work"],
      customInfo: {
        iconType: { emoji_v2: "💼", emoji: 128188 },
        windowTheme: { primaryColorPalette: { midTone: color(1, 0.5, 0) } },
      },
    },
    "space-perso",
    {
      id: "space-perso",
      profile: { custom: { _0: { directoryBasename: "Profile 2", machineID: "m" } } },
      newContainerIDs: [{ pinned: {} }, "pin-perso", { unpinned: { _0: { shared: {} } } }, "today-perso"],
      containerIDs: ["pinned", "pin-perso", "unpinned", "today-perso"],
      customInfo: { iconType: { icon: "planet" } },
    },
  ];

  return {
    sidebar: {
      containers: [
        { global: {} },
        { items, spaces, topAppsContainerIDs: [{ default: true }, "fav-root"] },
      ],
    },
    version: 1,
  };
}
