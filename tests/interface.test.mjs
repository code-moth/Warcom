import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { protocol, root } from "../backend/engine.mjs";
import { demoScenario } from "../backend/model.mjs";
test("C++ process boundary rejects malformed messages and missing weapons", () => {
  const engine =
    process.env.WARCOM_ENGINE ||
    path.join(
      root,
      "build",
      `warcom-engine${process.platform === "win32" ? ".exe" : ""}`,
    );
  const invalid = demoScenario();
  invalid.units[0].weapon = "no such weapon";
  for (const input of ["BAD\n", "WARCOM/1\n", protocol(invalid, 444, true)]) {
    const result = spawnSync(engine, [], {
      cwd: path.join(root, "core"),
      input,
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.length > 0);
  }
});
test("all original source files remain unchanged", () => {
  const manifest = JSON.parse(
    fs.readFileSync("legacy-provenance.json", "utf8"),
  );
  assert.equal(Object.keys(manifest.files).length, 20);
  for (const [file, hash] of Object.entries(manifest.files))
    assert.equal(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join("legacy", file)))
        .digest("hex"),
      hash,
      file,
    );
});
