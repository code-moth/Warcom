import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../backend/server.mjs";
test("API persistence, validation, resolution, undo, snapshots and file exchange", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "warcom-test-"));
  let server;
  try {
    server = await createServer(dir);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let base = `http://127.0.0.1:${server.address().port}/api/`;
    const request = async (route, body) => {
      const r = await fetch(
        base + route,
        body === undefined
          ? undefined
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
      );
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await request("state")).data.units.length, 0);
    const original = (await request("new", { demo: true })).data;
    assert.equal((await request("weapons")).data.length, 49);
    const result = await request("resolve", { seed: 444 });
    assert.equal(result.status, 200);
    assert.equal(result.data.history.length, 1);
    assert.equal(result.data.units[0].numberNow, 90);
    const restored = (await request("undo", {})).data;
    assert.deepEqual(restored.units, original.units);
    assert.equal(restored.history.length, 0);
    const { filename } = (await request("save", {})).data;
    assert.ok((await request("saves")).data.includes(filename));
    assert.equal(
      (await request("load", { filename: "../active.json" })).status,
      400,
    );
    const invalid = structuredClone(original);
    invalid.units[0].hitsStart = 0;
    assert.equal((await request("state", invalid)).status, 400);
    assert.deepEqual((await request("state")).data.units, original.units);
    const single = await request("resolve", { seed: 444, index: 0 });
    assert.equal(single.data.history[0].results.length, 1);
    assert.equal(single.data.units[0].numberNow, 100);
    assert.equal((await request("resolve", { seed: -1 })).status, 400);
    assert.equal((await request("resolve", { index: 999 })).status, 400);
    const exported = await fetch(base + "export?kind=units");
    assert.equal((await exported.arrayBuffer()).byteLength, 50427);
    assert.equal(
      (
        await fetch(base + "state", {
          method: "POST",
          headers: {
            Origin: "https://example.com",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    await new Promise((resolve) => server.close(resolve));
    server = await createServer(dir);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}/api/`;
    assert.equal((await request("state")).data.history.length, 1);
    assert.equal((await request("load", { filename })).data.history.length, 0);
  } finally {
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
