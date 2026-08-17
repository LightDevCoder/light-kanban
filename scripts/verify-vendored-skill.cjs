#!/usr/bin/env node
// verify-vendored-skill.cjs — integrity guard for the vendored
// light-kanban-worker Skill snapshot (skills/light-kanban-worker/).
//
// Reads skills/manifest.json and verifies every listed file is present and
// byte-identical (SHA-256) to the pinned upstream snapshot. Wired into
// `make check` so the vendored copy can never drift from the upstream tag
// without the gate failing.
//
// Usage:
//   node scripts/verify-vendored-skill.cjs           # verify the snapshot
//   node scripts/verify-vendored-skill.cjs --self-test
//     # positive + negative assertions: a temp copy passes; a tampered
//     # temp copy fails (non-zero assertion count, exit 0 only when the
//     # guard itself behaves correctly)

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

// verifyManifest(rootDir, manifestPath) -> { files, failures }
// rootDir is the directory that contains manifest.json and the package dir.
function verifyManifest(rootDir, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { files: 0, failures: [`manifest unreadable: ${err.message}`] };
  }
  const failures = [];
  const pkg = manifest.vendor && manifest.vendor.package;
  if (!pkg) failures.push("manifest is missing vendor.package");
  if (!manifest.files || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    failures.push("manifest has no file list");
    return { files: 0, failures };
  }
  const pkgDir = path.join(rootDir, "skills", pkg);
  for (const entry of manifest.files) {
    const file = path.join(pkgDir, entry.path);
    if (!fs.existsSync(file)) {
      failures.push(`missing file: ${entry.path}`);
      continue;
    }
    const actual = sha256(file);
    if (actual !== entry.sha256) failures.push(`hash mismatch: ${entry.path}`);
  }
  return { files: manifest.files.length, failures };
}

function main() {
  if (process.argv.includes("--self-test")) {
    let assertions = 0;
    const failures = [];
    const assert = (cond, label) => {
      assertions += 1;
      if (!cond) failures.push(label);
    };

    // Positive fixture: a pristine temp copy of the vendored snapshot passes.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lk-vendor-"));
    fs.cpSync(path.join(REPO_ROOT, "skills"), path.join(tmp, "skills"), { recursive: true });
    const ok = verifyManifest(tmp, path.join(tmp, "skills", "manifest.json"));
    assert(ok.files === 10, `pristine copy must verify 10 files (got ${ok.files})`);
    assert(ok.failures.length === 0, `pristine copy must pass (got: ${ok.failures.join("; ")})`);

    // Negative fixture: a tampered copy fails with a hash mismatch.
    const tampered = path.join(tmp, "skills", "light-kanban-worker", "SKILL.md");
    fs.appendFileSync(tampered, "\n# tampered\n");
    const bad = verifyManifest(tmp, path.join(tmp, "skills", "manifest.json"));
    assert(bad.failures.some((f) => f.includes("hash mismatch: SKILL.md")), "tampered copy must fail with a SKILL.md hash mismatch");

    // Negative fixture: a deleted file fails with a missing-file error.
    fs.rmSync(tampered);
    const missing = verifyManifest(tmp, path.join(tmp, "skills", "manifest.json"));
    assert(missing.failures.some((f) => f.includes("missing file: SKILL.md")), "deleted file must fail with a missing-file error");

    fs.rmSync(tmp, { recursive: true, force: true });
    if (failures.length > 0) {
      console.error(`VENDOR_SELF_TEST=FAIL (${failures.length} failures, ${assertions} assertions)`);
      for (const f of failures) console.error(`FAIL: ${f}`);
      process.exit(1);
    }
    console.log(`VENDOR_SELF_TEST=PASS (${assertions} assertions)`);
    return;
  }

  const { files, failures } = verifyManifest(REPO_ROOT, MANIFEST_PATH);
  if (failures.length > 0) {
    console.error(`VENDOR_SKILL=FAIL (${failures.length} failures, ${files} files checked)`);
    for (const f of failures) console.error(`FAIL: ${f}`);
    console.error("Re-vendor from the upstream LightDevCoder/skills tag and regenerate skills/manifest.json — do not edit the snapshot in place.");
    process.exit(1);
  }
  console.log(`VENDOR_SKILL=PASS (${files} files match skills/manifest.json)`);
}

main();
