#!/usr/bin/env node
// CI lint: walks `*.ts` files under `src/pack-system/` and `tests/pack-system/`,
// extracts string literals matching the in-repo anchor convention, and
// verifies each anchor resolves in the target file.
//
// Authored as `.js` (CJS) so no TS toolchain is needed at lint time and the
// script runs under the repo's pinned Node `>=18` engine without extra deps.
// (The plan §4 WU1 file scope says "scripts/lint-docs-anchors.ts (or .js)";
// `.js` is the no-extra-tooling path.)
//
// Anchor convention (plan §4 WU1):
//   - `<path-to-md>#invariant-NN` — derived from `**N. <text>**` blocks in
//     `docs/principles.md`. The anchor is `invariant-N` (lower-case, no zero
//     padding).
//   - `<path-to-md>#section-X` — derived from `## N. <Title>` markdown
//     headings via standard slug rules (lowercase, hyphenate, strip
//     punctuation).
//
// Resolution rules:
//   - For `invariant-NN`, scan the target file for a `**N. ` prefix at the
//     start of a line (Markdown bold-as-heading shape used in
//     `docs/principles.md`).
//   - For `section-X`, scan for `## N. <Title>` markdown headings (heading
//     levels 2–4) and slug-match the title.
//   - Any explicit `<a id="...">` anchor in the file also resolves.
//
// Exit code:
//   0 — all anchors resolve.
//   1 — at least one anchor failed to resolve (a report is printed).

"use strict";

const { readdirSync, readFileSync, statSync } = require("node:fs");
const { resolve, join, relative, isAbsolute } = require("node:path");

const repoRoot = resolve(__dirname, "..");

const SCAN_DIRS = [
  resolve(repoRoot, "src", "pack-system"),
  resolve(repoRoot, "tests", "pack-system"),
];

const ANCHOR_REGEX =
  /["'`]((?:[A-Za-z0-9._/-]+\.md)#(invariant-\d+|section-[a-z0-9-]+))["'`]/g;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, out);
    } else if (st.isFile()) {
      if (full.endsWith(".ts") || full.endsWith(".tsx")) {
        out.push(full);
      }
    }
  }
}

function collectAnchorRefs() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  const refs = [];
  for (const file of files) {
    const text = readFileSync(file, "utf-8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matches = line.matchAll(ANCHOR_REGEX);
      for (const m of matches) {
        const full = m[1];
        const hashIdx = full.indexOf("#");
        const pathPart = full.slice(0, hashIdx);
        const anchor = full.slice(hashIdx + 1);
        const resolved = isAbsolute(pathPart)
          ? pathPart
          : resolve(repoRoot, pathPart);
        refs.push({
          source: file,
          line: i + 1,
          full,
          filePath: resolved,
          anchor,
        });
      }
    }
  }
  return refs;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const indexCache = new Map();

function buildIndex(filePath) {
  if (indexCache.has(filePath)) return indexCache.get(filePath);
  let text;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    indexCache.set(filePath, "missing");
    return "missing";
  }
  const invariants = new Set();
  const sections = new Set();
  const named = new Set();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const inv = /^\s*\*\*(\d+)\.\s/.exec(raw);
    if (inv) invariants.add(Number.parseInt(inv[1], 10));
    const h = /^\s*#{2,4}\s+(.+?)\s*$/.exec(raw);
    if (h) {
      const heading = h[1];
      const numbered = /^(\d+)\.\s+(.+)$/.exec(heading);
      if (numbered) {
        sections.add(`section-${numbered[1]}`);
        sections.add(`section-${numbered[1]}-${slugify(numbered[2])}`);
      }
      sections.add(`section-${slugify(heading)}`);
    }
    const a = /<a\s+(?:id|name)=["']([^"']+)["']/g;
    let am;
    while ((am = a.exec(raw)) !== null) {
      named.add(am[1]);
    }
  }
  const idx = { invariants, sections, named };
  indexCache.set(filePath, idx);
  return idx;
}

function resolveAnchor(ref) {
  const idx = buildIndex(ref.filePath);
  if (idx === "missing") {
    return `target file does not exist: ${ref.filePath}`;
  }
  if (ref.anchor.startsWith("invariant-")) {
    const n = Number.parseInt(ref.anchor.slice("invariant-".length), 10);
    if (!Number.isFinite(n)) return `malformed invariant anchor: ${ref.anchor}`;
    if (idx.invariants.has(n)) return null;
    if (idx.named.has(ref.anchor)) return null;
    return `invariant ${n} not found in ${relative(repoRoot, ref.filePath)}`;
  }
  if (ref.anchor.startsWith("section-")) {
    if (idx.sections.has(ref.anchor)) return null;
    if (idx.named.has(ref.anchor)) return null;
    return `section anchor '${ref.anchor}' not found in ${relative(repoRoot, ref.filePath)}`;
  }
  if (idx.named.has(ref.anchor)) return null;
  return `unknown anchor scheme: ${ref.anchor}`;
}

function main() {
  const refs = collectAnchorRefs();
  const failures = [];
  for (const ref of refs) {
    const reason = resolveAnchor(ref);
    if (reason) failures.push({ ref, reason });
  }
  if (failures.length === 0) {
    process.stdout.write(
      `lint-docs-anchors: OK (${refs.length} anchor reference${refs.length === 1 ? "" : "s"} resolved)\n`,
    );
    process.exit(0);
  }
  process.stderr.write(
    `lint-docs-anchors: FAIL (${failures.length} unresolved anchor${failures.length === 1 ? "" : "s"})\n`,
  );
  for (const f of failures) {
    process.stderr.write(
      `  ${relative(repoRoot, f.ref.source)}:${f.ref.line}: ${f.ref.full} — ${f.reason}\n`,
    );
  }
  process.exit(1);
}

main();
