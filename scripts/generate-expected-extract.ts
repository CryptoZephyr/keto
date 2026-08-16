import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../src/extract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtureRoot = join(root, "fixtures", "monorepo");

function readTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (abs: string, rel: string) => {
    for (const entry of readdirSync(abs)) {
      const childAbs = join(abs, entry);
      const childRel = rel ? `${rel}/${entry}` : entry;
      if (statSync(childAbs).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(childAbs, childRel);
      } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry)) {
        files[childRel] = readFileSync(childAbs, "utf8");
      }
    }
  };
  walk(dir, "");
  return files;
}

const extracted = buildGraph({
  repository: "keto-fixture",
  files: readTree(fixtureRoot),
  aliases: { "@lib/*": ["src/lib/*"] },
});

const expected = {
  repository: extracted.repository,
  identity_version: extracted.identity_version,
  entities: extracted.entities.map((entity) => ({
    id: entity.id,
    stable_key: entity.stable_key,
    path: entity.path,
    kind: entity.kind,
  })),
  relationships: extracted.relationships.map((rel) => ({
    id: rel.id,
    stable_key: rel.stable_key,
    source_path: rel.source_path,
    destination_path: rel.destination_path,
    kind: rel.kind,
    specifier: rel.specifier,
  })),
  warnings: extracted.warnings,
};

const outDir = join(root, "fixtures", "expected");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "extract.json"), `${JSON.stringify(expected, null, 2)}\n`);
process.stdout.write(
  `wrote extract.json vertices=${expected.entities.length} relationships=${expected.relationships.length} warnings=${expected.warnings.length}\n`,
);
