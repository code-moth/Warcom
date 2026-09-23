import { spawn } from "node:child_process";
import path from "node:path";
import { unitFields, attackFields, textFields } from "./model.mjs";
export const root = path.resolve(import.meta.dirname, "..");
export function protocol(s, seed, round) {
  return (
    [
      "WARCOM/1",
      seed,
      +s.settings.constantBonuses,
      +s.settings.legacyArmor,
      +round,
      s.units.length,
      ...s.units.flatMap((u) => unitFields.map((k) => u[k])),
      s.attacks.length,
      ...s.attacks.flatMap((a) => attackFields.map((k) => a[k])),
    ].join("\n") + "\n"
  );
}
export async function runEngine(
  s,
  seed,
  round = true,
  executable = process.env.WARCOM_ENGINE ||
    path.join(
      root,
      "build",
      `warcom-engine${process.platform === "win32" ? ".exe" : ""}`,
    ),
) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      cwd: path.join(
        root,
        path.basename(executable).includes("reference") ? "legacy" : "core",
      ),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        Error(
          "Engine exceeded the 30 second time limit. Reduce attack counts.",
        ),
      );
    }, 30000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(Error(`Engine could not start. Run setup.ps1. ${e.message}`));
    });
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(out)
        : reject(Error(err.trim() || `Engine exited with code ${code}`));
    });
    child.stdin.end(protocol(s, seed, round));
  });
  const lines = output.split(/\r?\n/);
  let p = 0;
  if (lines[p++] !== "WARCOM/1") throw Error("Invalid engine output");
  const count = Number(lines[p++]),
    results = [];
  for (let i = 0; i < count; i++) {
    const [defender, before, after, hitsBefore, hitsAfter, attacks, damage] =
      lines.slice(p, p + 7).map(Number);
    p += 7;
    results.push({
      assignment: i + 1,
      attacker: s.attacks[i].attacker,
      defender: defender + 1,
      before,
      after,
      hitsBefore,
      hitsAfter,
      attacks,
      damage,
      casualties: before - after,
    });
  }
  const n = Number(lines[p++]),
    units = [];
  for (let i = 0; i < n; i++)
    units.push(
      Object.fromEntries(
        unitFields.map((k) => {
          const value = lines[p++];
          return [k, textFields.has(k) ? value.trimEnd() : Number(value)];
        }),
      ),
    );
  if (
    n !== s.units.length ||
    units.some((u) =>
      unitFields.some(
        (k) =>
          u[k] === undefined || (!textFields.has(k) && !Number.isFinite(u[k])),
      ),
    )
  )
    throw Error("Incomplete engine output");
  return { units, results };
}
