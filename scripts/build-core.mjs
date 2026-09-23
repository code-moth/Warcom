import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const out = process.env.WARCOM_BUILD_DIR || "build";
fs.mkdirSync(out, { recursive: true });
const zig = path.resolve(".tools/zig-windows-x86_64-0.13.0/zig.exe");
const compiler = process.env.CXX || (fs.existsSync(zig) ? zig : "c++");
for (const [name, source] of [
  ["engine", "resolver"],
  ["reference", "reference"],
]) {
  const args = [
    ...(compiler.endsWith("zig.exe") ? ["c++"] : []),
    "-std=c++17",
    "-O2",
    "core/main.cpp",
    `core/${source}.cpp`,
    "-o",
    path.join(
      out,
      `warcom-${name}${process.platform === "win32" ? ".exe" : ""}`,
    ),
  ];
  const result = spawnSync(compiler, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ZIG_GLOBAL_CACHE_DIR: path.resolve(".tools/cache"),
      ZIG_LOCAL_CACHE_DIR: path.resolve(".tools/local-cache"),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
