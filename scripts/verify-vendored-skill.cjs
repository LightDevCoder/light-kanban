#!/usr/bin/env node
// verify-vendored-skill.cjs — integrity guard for the vendored
// light-kanban-worker Skill snapshot (skills/light-kanban-worker/).
//
// Reads skills/manifest.json and verifies that the actual recursive file
// set of the package directory equals the manifest file set exactly: every
// listed file present and byte-identical (SHA-256), and no unlisted file on
// disk. Wired into `make check` so the vendored copy can never drift from
// the upstream tag without the gate failing.
//
// Usage:
//   node scripts/verify-vendored-skill.cjs           # verify the snapshot
//   node scripts/verify-vendored-skill.cjs --self-test
//     # positive + negative assertions: a pristine temp copy passes; a
//     # tampered, deleted, or extra-file temp copy fails (non-zero
//     # assertion count, exit 0 only when the guard itself behaves
//     # correctly)

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const REPO_ROOT = path.resolve(__dirname, "..");
const SKILL_DIR = path.join(REPO_ROOT, "skills", "light-kanban-worker");
const MANIFEST_PATH = path.join(REPO_ROOT, "skills", "manifest.json");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// walkFiles(dir, baseDir) -> sorted relative POSIX paths of every file under
// dir. Paths are normalized with "/" separators so the exact file set is
// platform-independent (the manifest always uses POSIX relative paths).
function walkFiles(dir, baseDir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkFiles(full, baseDir));
    else if (stat.isFile()) out.push(path.relative(baseDir, full).split(path.sep).join("/"));
  }
  return out.sort();
}

// verifyManifest(rootDir, manifestPath) -> { manifestEntryCount, failures }
// rootDir is the directory that contains manifest.json and the package dir.
// Verifies that the actual recursive file set of the package directory equals
// the manifest file set exactly: every manifest file present and
// byte-identical, and no file present that the manifest does not list.
function verifyManifest(rootDir, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { manifestEntryCount: 0, failures: [`manifest unreadable: ${err.message}`] };
  }
  const failures = [];
  const pkg = manifest.vendor && manifest.vendor.package;
  if (!pkg) failures.push("manifest is missing vendor.package");
  if (!manifest.files || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    failures.push("manifest has no file list");
    return { manifestEntryCount: 0, failures };
  }
  const pkgDir = path.join(rootDir, "skills", pkg);

  // Manifest file set (relative POSIX paths -> pinned SHA-256).
  const manifestSet = new Map();
  for (const entry of manifest.files) {
    if (manifestSet.has(entry.path)) failures.push(`duplicate manifest entry: ${entry.path}`);
    manifestSet.set(entry.path, entry.sha256);
  }

  // Actual recursive file set of the package directory.
  const actualSet = new Set();
  if (fs.existsSync(pkgDir)) {
    for (const rel of walkFiles(pkgDir, pkgDir)) actualSet.add(rel);
  } else {
    failures.push(`package directory missing: ${pkg}`);
  }

  // Missing files and hash drift for every manifest-listed file.
  for (const [rel, sha] of manifestSet) {
    const file = path.join(pkgDir, rel);
    if (!fs.existsSync(file)) {
      failures.push(`missing file: ${rel}`);
      continue;
    }
    const actual = sha256(file);
    if (actual !== sha) failures.push(`hash mismatch: ${rel}`);
  }

  // Unexpected files present on disk but absent from the manifest.
  for (const rel of [...actualSet].sort()) {
    if (!manifestSet.has(rel)) failures.push(`unexpected file: ${rel}`);
  }

  return { manifestEntryCount: manifest.files.length, failures };
}

function main() {
  if (process.argv.includes("--self-test")) {
    let assertions = 0;
    const failures = [];
    const assert = (cond, label) => {
      assertions += 1;
      if (!cond) failures.push(label);
    };

    // Positive fixture: a pristine temp copy of the vendored snapshot passes,
    // and the guard verifies exactly the manifest's file set — the actual
    // recursive package file set must equal the manifest file set.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lk-vendor-"));
    fs.cpSync(path.join(REPO_ROOT, "skills"), path.join(tmp, "skills"), { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "skills", "manifest.json"), "utf8"));
    const pkgDir = path.join(tmp, "skills", "light-kanban-worker");
    const actualCount = walkFiles(pkgDir, pkgDir).length;
    assert(actualCount > 0, `pristine copy must contain package files (got ${actualCount})`);
    const ok = verifyManifest(tmp, path.join(tmp, "skills", "manifest.json"));
    assert(ok.manifestEntryCount === manifest.files.length, `pristine copy must verify every manifest file (${ok.manifestEntryCount} vs ${manifest.files.length})`);
    assert(ok.manifestEntryCount === actualCount, `pristine copy file count must equal the actual package file set (${ok.manifestEntryCount} vs ${actualCount})`);
    assert(ok.failures.length === 0, `pristine copy must pass (got: ${ok.failures.join("; ")})`);

    // Negative fixture 1: a tampered copy fails with a hash mismatch.
    const tampered = path.join(pkgDir, "SKILL.md");
    fs.appendFileSync(tampered, "\n# tampered\n");
    const bad = verifyManifest(tmp, path.join(tmp, "skills", "manifest.json"));
    assert(bad.failures.some((f) => f.includes("hash mismatch: SKILL.md")), "tampered copy must fail with a SKILL.md hash mismatch");

    // Negative fixture 2: a deleted file fails with a missing-file error.
    fs.rmSync(tampered);
    const missing = verifyManifest(tmp, path.join(tmp, "skills", "manifest.json"));
    assert(missing.failures.some((f) => f.includes("missing file: SKILL.md")), "deleted file must fail with a missing-file error");

    fs.rmSync(tmp, { recursive: true, force: true });

    // Negative fixture 3 (isolated): on a fresh pristine copy, an unexpected
    // extra file fails even though every manifest-listed file is intact —
    // the unexpected-file branch is exercised on its own, with no
    // missing-file or hash-drift failure present.
    const extraTmp = fs.mkdtempSync(path.join(os.tmpdir(), "lk-vendor-"));
    fs.cpSync(path.join(REPO_ROOT, "skills"), path.join(extraTmp, "skills"), { recursive: true });
    fs.writeFileSync(path.join(extraTmp, "skills", "light-kanban-worker", "unexpected-extra.md"), "# not part of the vendored snapshot\n");
    const extra = verifyManifest(extraTmp, path.join(extraTmp, "skills", "manifest.json"));
    assert(extra.failures.some((f) => f.includes("unexpected file: unexpected-extra.md")), "unexpected extra file must fail with an unexpected-file error");
    assert(
      !extra.failures.some((f) => f.includes("missing file") || f.includes("hash mismatch")),
      `extra-file negative must exercise the unexpected-file branch in isolation (got: ${extra.failures.join("; ")})`
    );
    fs.rmSync(extraTmp, { recursive: true, force: true });

    if (failures.length > 0) {
      console.error(`VENDOR_SELF_TEST=FAIL (${failures.length} failures, ${assertions} assertions)`);
      for (const f of failures) console.error(`FAIL: ${f}`);
      process.exit(1);
    }
    console.log(`VENDOR_SELF_TEST=PASS (${assertions} assertions)`);
    return;
  }

  const { manifestEntryCount, failures } = verifyManifest(REPO_ROOT, MANIFEST_PATH);
  if (failures.length > 0) {
    console.error(`VENDOR_SKILL=FAIL (${failures.length} failures, ${manifestEntryCount} files checked)`);
    for (const f of failures) console.error(`FAIL: ${f}`);
    console.error("Re-vendor from the upstream LightDevCoder/skills tag and regenerate skills/manifest.json — do not edit the snapshot in place.");
    process.exit(1);
  }
  console.log(`VENDOR_SKILL=PASS (${manifestEntryCount} files match skills/manifest.json)`);
}

main();
