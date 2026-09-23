import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { root, runEngine } from "./engine.mjs";
import {
  loadWeapons,
  newScenario,
  demoScenario,
  validateScenario,
  importLegacy,
  exportLegacy,
  blankAttack,
} from "./model.mjs";
const weapons = loadWeapons(path.join(root, "core/weapons.dat"));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
async function readBody(req) {
  let chunks = [],
    size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw Error("Request exceeds 8 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
export async function createServer(
  directory = process.env.WARCOM_DATA_DIR || path.join(root, "data"),
) {
  await fs.mkdir(directory, { recursive: true });
  const active = path.join(directory, "active.json");
  let state;
  try {
    state = JSON.parse(await fs.readFile(active, "utf8"));
    validateScenario(state, weapons);
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error(
        `Cannot load saved battle: ${e.message}. Back up and repair ${active}.`,
      );
    state = newScenario();
  }
  let busy = false;
  async function persist(next) {
    await fs.writeFile(active + ".tmp", JSON.stringify(next, null, 2));
    await fs.rename(active + ".tmp", active);
    state = next;
  }
  const server = http.createServer(async (req, res) => {
    const send = (code, data) => {
      res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const host = req.headers.host?.split(":")[0];
      if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
        return send(403, { error: "Localhost requests only" });
      if (
        req.headers.origin &&
        !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
      )
        return send(403, { error: "Untrusted origin" });
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "GET") {
          if (url.pathname === "/api/health")
            return send(200, { ok: true, pid: process.pid });
          if (url.pathname === "/api/weapons") return send(200, weapons);
          if (url.pathname === "/api/state") return send(200, state);
          if (url.pathname === "/api/saves")
            return send(
              200,
              (await fs.readdir(directory)).filter((n) =>
                /^battle-[a-f0-9-]+\.json$/.test(n),
              ),
            );
          if (url.pathname === "/api/export") {
            const kind = url.searchParams.get("kind");
            if (kind === "units" || kind === "attacks") {
              const content = exportLegacy(state[kind], kind);
              res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="battle.${kind === "units" ? "unt" : "btl"}"`,
              });
              return res.end(content);
            }
            if (kind === "log") {
              res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": 'attachment; filename="battle.log"',
              });
              return res.end(
                state.history
                  .map(
                    (h) =>
                      `${h.time} | seed ${h.seed} | ${h.mode}\n${h.results.map((r) => `Unit ${r.attacker} (${r.attackerName ?? ""}) → ${r.defender} (${r.defenderName ?? ""}): ${r.attacks ?? "unknown"} attacks; ${r.damage ?? "unknown"} aggregate hits damage; ${r.casualties} casualties; ${r.after} remaining; average hits ${r.hitsBefore} → ${r.hitsAfter}`).join("\n")}`,
                  )
                  .join("\n\n") +
                  "\n\nUNIT SUMMARY\n" +
                  state.units
                    .map(
                      (u, i) =>
                        `${i + 1}: ${u.name} | ${u.numberNow}/${u.numberStart} | hits ${u.hitsNow}/${u.hitsStart} | morale ${u.moraleNow} ${u.moraleFailure}`,
                    )
                    .join("\n"),
              );
            }
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Content-Disposition":
                'attachment; filename="battle.warcom.json"',
            });
            return res.end(JSON.stringify(state, null, 2));
          }
          return send(404, { error: "Unknown endpoint" });
        }
        if (req.method !== "POST")
          return send(405, { error: "Method not allowed" });
        if (busy)
          return send(409, {
            error: "Another change is in progress. Please retry.",
          });
        busy = true;
        try {
          const body = await readBody(req);
          let next = structuredClone(state);
          switch (url.pathname) {
            case "/api/state":
              validateScenario(body, weapons);
              next = { ...body, history: state.history, undo: undefined };
              break;
            case "/api/new":
              next = body.demo ? demoScenario() : newScenario();
              break;
            case "/api/save": {
              const filename = `battle-${crypto.randomUUID()}.json`;
              await fs.writeFile(
                path.join(directory, filename),
                JSON.stringify(state, null, 2),
              );
              return send(200, { filename });
            }
            case "/api/load": {
              if (!/^battle-[a-f0-9-]+\.json$/.test(body.filename))
                throw Error("Invalid saved battle");
              next = JSON.parse(
                await fs.readFile(path.join(directory, body.filename), "utf8"),
              );
              validateScenario(next, weapons);
              break;
            }
            case "/api/import": {
              if (body.kind === "scenario") {
                next = body.scenario;
                validateScenario(next, weapons);
                next.history = Array.isArray(next.history) ? next.history : [];
                next.undo = undefined;
              } else if (["units", "attacks"].includes(body.kind)) {
                const records = importLegacy(
                  Buffer.from(body.content, "base64"),
                  body.kind,
                );
                next[body.kind] = records;
                if (body.kind === "units") next.attacks = [];
                next.history = [];
                next.undo = undefined;
                validateScenario(next, weapons);
              } else throw Error("Unknown import type");
              break;
            }
            case "/api/resolve": {
              validateScenario(state, weapons, { resolve: true });
              const seed = body.seed ?? crypto.randomInt(1, 2147483647);
              if (!Number.isInteger(seed) || seed < 1 || seed > 2147483646)
                throw Error("Seed must be 1–2147483646");
              const single = body.index !== undefined;
              if (
                single &&
                (!Number.isInteger(body.index) || !state.attacks[body.index])
              )
                throw Error("Assignment does not exist");
              if (single && blankAttack(state.attacks[body.index]))
                throw Error("This assignment is empty");
              const indices = single
                ? [body.index]
                : state.attacks
                    .map((a, i) => (blankAttack(a) ? -1 : i))
                    .filter((i) => i >= 0);
              const input = {
                ...state,
                attacks: indices.map((i) => state.attacks[i]),
              };
              const result = await runEngine(input, seed, !single);
              result.results.forEach((r, i) => {
                r.assignment = indices[i] + 1;
                r.attackerName = state.units[r.attacker - 1].name;
                r.defenderName = state.units[r.defender - 1].name;
              });
              next.undo = { units: state.units, history: state.history };
              next.units = result.units;
              next.history = [
                ...state.history,
                {
                  time: new Date().toISOString(),
                  seed,
                  mode: single ? "Single assignment" : "Full round",
                  settings: state.settings,
                  results: result.results,
                },
              ].slice(-100);
              break;
            }
            case "/api/undo":
              if (!state.undo) throw Error("No resolution to undo");
              next.units = state.undo.units;
              next.history = state.undo.history;
              next.undo = undefined;
              break;
            default:
              return send(404, { error: "Unknown endpoint" });
          }
          await persist(next);
          return send(200, state);
        } finally {
          busy = false;
        }
      }
      if (req.method !== "GET")
        return send(405, { error: "Method not allowed" });
      const requested = decodeURIComponent(url.pathname),
        dist = path.join(root, "dist");
      let file = path.resolve(dist, "." + requested);
      if (!file.startsWith(dist + path.sep))
        file = path.join(dist, "index.html");
      let content;
      try {
        content = await fs.readFile(file);
      } catch {
        file = path.join(dist, "index.html");
        content = await fs.readFile(file);
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(content);
    } catch (e) {
      send(e.code === "ENOENT" ? 404 : 400, { error: e.message });
    }
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await createServer();
  const port = Number(process.env.PORT || 4173);
  server.listen(port, "127.0.0.1", () =>
    console.log(`WARCOM ready at http://127.0.0.1:${port}`),
  );
  server.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
