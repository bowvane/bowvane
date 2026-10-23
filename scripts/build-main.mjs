import { build } from "esbuild";

// Des dépendances ESM (bloqueur Ghostery) lisent import.meta.url : on le recrée dans le bundle CommonJS.
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  define: { "import.meta.url": "__importMetaUrl" },
  banner: { js: "const __importMetaUrl = require(\"node:url\").pathToFileURL(__filename).href;" },
};
await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist/main/index.cjs" });
// Le preload tourne dans un bac à sable : seul le module electron y est disponible.
await build({ ...common, define: {}, banner: {}, entryPoints: ["src/preload/chrome.ts"], outfile: "dist/preload/chrome.cjs" });
