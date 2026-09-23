import fs from "node:fs";
export const unitFields = [
  "name",
  "race",
  "type",
  "weapon",
  "armor",
  "discipline",
  "moraleFailure",
  "formation",
  "moraleStart",
  "moraleNow",
  "moraleMod",
  "obStart",
  "obNow",
  "obMod",
  "dbStart",
  "dbNow",
  "dbMod",
  "exhaustionStart",
  "exhaustionNow",
  "exhaustionMod",
  "movementStart",
  "movementNow",
  "movementMod",
  "numberStart",
  "numberNow",
  "hitsStart",
  "hitsNow",
];
export const attackFields = [
  "attacker",
  "attackerSize",
  "defender",
  "defenderSize",
  "modifier",
  "multiplier",
  "critical",
  "weapon",
];
export const unitWidths = [31, 31, 31, 29, 3, 4, 2, 26, ...Array(19).fill(5)];
export const attackWidths = [4, 5, 4, 5, 5, 2, 2, 31];
export const textFields = new Set([
  "name",
  "race",
  "type",
  "weapon",
  "moraleFailure",
  "formation",
]);
export function loadWeapons(filename) {
  const lines = fs.readFileSync(filename, "utf8").trim().split(/\r?\n/);
  const weapons = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].startsWith("%")) throw Error("Invalid weapons file");
    const name = lines[i++].slice(1),
      armor = [];
    for (let at = 20; at > 0; at--) {
      const values = (lines[i++] ?? "")
        .replace(/^%/, "")
        .split(",")
        .map(Number);
      if (
        values.length !== 8 ||
        values.some((v) => !Number.isInteger(v) || v < 0 || v > 255) ||
        values[1] >= 150 ||
        values[0] < values[2]
      )
        throw Error(`Invalid weapon table: ${name}`);
      armor.unshift({
        armor: at,
        max: values[0],
        start: values[1],
        min: values[2],
        crit: values.slice(3),
      });
    }
    weapons.push({ name, armor });
  }
  return weapons;
}
export const normalize = (value) =>
  String(value).toLowerCase().replaceAll(" ", "");
export const blankUnit = (u) =>
  unitFields.every((k) => (textFields.has(k) ? u[k] === "" : u[k] === 0));
export const blankAttack = (a) =>
  a.attacker === 0 && a.defender === 0 && a.weapon === "";
export function newUnit(name = "New unit") {
  const u = Object.fromEntries(
    unitFields.map((k) => [k, textFields.has(k) ? "" : 0]),
  );
  return {
    ...u,
    name,
    type: "Normal",
    weapon: "broadsword",
    armor: 1,
    discipline: -20,
    moraleStart: 100,
    moraleNow: 100,
    obStart: 60,
    obNow: 60,
    dbStart: 20,
    dbNow: 20,
    exhaustionStart: 100,
    exhaustionNow: 100,
    movementStart: 100,
    movementNow: 100,
    numberStart: 100,
    numberNow: 100,
    hitsStart: 50,
    hitsNow: 50,
  };
}
export function newScenario() {
  return {
    version: 1,
    name: "Untitled battle",
    units: [],
    attacks: [],
    settings: { constantBonuses: false, legacyArmor: false },
    history: [],
  };
}
export function demoScenario() {
  return {
    ...newScenario(),
    name: "Training engagement (illustrative)",
    units: [
      newUnit("Westwatch infantry"),
      {
        ...newUnit("Ashwood raiders"),
        weapon: "battle ax",
        armor: 9,
        discipline: -30,
      },
    ],
    attacks: [
      {
        attacker: 1,
        attackerSize: "25%",
        defender: 2,
        defenderSize: "25%",
        modifier: 0,
        multiplier: 1,
        critical: "n",
        weapon: "",
      },
      {
        attacker: 2,
        attackerSize: "25%",
        defender: 1,
        defenderSize: "25%",
        modifier: 0,
        multiplier: 1,
        critical: "n",
        weapon: "",
      },
    ],
  };
}
function requireValue(condition, message) {
  if (!condition) throw Error(message);
}
export function validateScenario(s, weapons, { resolve = false } = {}) {
  requireValue(s && s.version === 1, "Unsupported scenario version");
  requireValue(
    typeof s.name === "string" &&
      s.name.trim().length > 0 &&
      s.name.length <= 100,
    "Battle name must be 1–100 characters",
  );
  requireValue(
    Array.isArray(s.units) && s.units.length <= 200,
    "Maximum 200 units",
  );
  requireValue(
    Array.isArray(s.attacks) && s.attacks.length <= 200,
    "Maximum 200 assignments",
  );
  requireValue(
    s.settings &&
      typeof s.settings.constantBonuses === "boolean" &&
      typeof s.settings.legacyArmor === "boolean",
    "Invalid battle settings",
  );
  const known = new Set(weapons.map((w) => normalize(w.name)));
  s.units.forEach((u, i) => {
    if (blankUnit(u)) return;
    for (const field of unitFields) {
      const v = u[field];
      if (textFields.has(field))
        requireValue(
          typeof v === "string" &&
            v.length <= 60 &&
            Buffer.byteLength(v, "utf8") <= 63 &&
            !/[\x00-\x1f]/.test(v),
          `Unit ${i + 1}: invalid ${field} (maximum 60 characters / 63 UTF-8 bytes)`,
        );
      else
        requireValue(
          Number.isInteger(v) && v >= -9999 && v <= 9999,
          `Unit ${i + 1}: ${field} must be an integer between -9999 and 9999`,
        );
    }
    requireValue(
      u.armor >= 1 && u.armor <= 20,
      `Unit ${i + 1}: armor must be 1–20`,
    );
    for (const prefix of ["number", "hits"])
      requireValue(
        u[prefix + "Start"] > 0 &&
          u[prefix + "Now"] >= 0 &&
          u[prefix + "Now"] <= u[prefix + "Start"],
        `Unit ${i + 1}: ${prefix} needs positive starting value and current value between zero and start`,
      );
    requireValue(
      u.exhaustionStart >= 0 && u.exhaustionNow >= 0,
      `Unit ${i + 1}: exhaustion cannot be negative`,
    );
    requireValue(
      known.has(normalize(u.weapon)),
      `Unit ${i + 1}: unknown weapon '${u.weapon}'`,
    );
  });
  s.attacks.forEach((a, i) => {
    if (blankAttack(a)) return;
    for (const field of ["attacker", "defender"])
      requireValue(
        Number.isInteger(a[field]) &&
          a[field] > 0 &&
          a[field] <= s.units.length,
        `Assignment ${i + 1}: select a valid ${field}`,
      );
    requireValue(
      !blankUnit(s.units[a.attacker - 1]) &&
        !blankUnit(s.units[a.defender - 1]),
      `Assignment ${i + 1}: references an empty unit slot`,
    );
    for (const field of ["attackerSize", "defenderSize"])
      requireValue(
        typeof a[field] === "string" &&
          /^\d{0,4}%?$/.test(a[field]) &&
          a[field] !== "%",
        `Assignment ${i + 1}: use a number or percentage for ${field}`,
      );
    requireValue(
      Number.isInteger(a.modifier) && Math.abs(a.modifier) <= 9999,
      `Assignment ${i + 1}: invalid modifier`,
    );
    requireValue(
      Number.isInteger(a.multiplier) && a.multiplier >= 0 && a.multiplier <= 9,
      `Assignment ${i + 1}: multiplier must be 0–9`,
    );
    requireValue(
      ["n", "d", "k", "m", "h", "s"].includes(a.critical),
      `Assignment ${i + 1}: invalid critical mode`,
    );
    requireValue(
      typeof a.weapon === "string" &&
        (a.weapon === "" || known.has(normalize(a.weapon))),
      `Assignment ${i + 1}: unknown weapon override`,
    );
  });
  requireValue(
    Array.isArray(s.history) && s.history.length <= 100,
    "Invalid history (maximum 100 resolutions)",
  );
  for (const h of s.history) {
    requireValue(
      h &&
        typeof h.time === "string" &&
        Number.isFinite(Date.parse(h.time)) &&
        typeof h.mode === "string" &&
        Number.isInteger(h.seed) &&
        Array.isArray(h.results) &&
        h.results.length <= 200,
      "Invalid resolution history",
    );
    for (const r of h.results)
      requireValue(
        r &&
          [
            "assignment",
            "attacker",
            "defender",
            "before",
            "after",
            "hitsBefore",
            "hitsAfter",
            "casualties",
          ].every((k) => Number.isFinite(r[k])),
        "Invalid history result",
      );
  }
  if (resolve)
    requireValue(
      s.units.length > 0 && s.attacks.some((a) => !blankAttack(a)),
      "Add units and assignments before resolving",
    );
  return s;
}
export function exportLegacy(records, kind) {
  const fields = kind === "units" ? unitFields : attackFields,
    widths = kind === "units" ? unitWidths : attackWidths;
  const stride = widths.reduce((a, b) => a + b, 0),
    result = Buffer.alloc(200 * stride + fields.length);
  records.forEach((record, i) => {
    let offset = i * stride;
    fields.forEach((field, j) => {
      const text = String(record[field] ?? "");
      if (text.length >= widths[j] || /[^\x20-\x7e]/.test(text))
        throw Error(
          `${field} '${text}' does not fit the legacy ASCII field (${widths[j] - 1} characters)`,
        );
      result.write(text, offset, "ascii");
      offset += widths[j];
    });
  });
  return result;
}
export function importLegacy(buffer, kind) {
  const fields = kind === "units" ? unitFields : attackFields,
    widths = kind === "units" ? unitWidths : attackWidths,
    stride = widths.reduce((a, b) => a + b, 0);
  // Support 50-record early rosters as well as 200-record 2.3 files. BTL layout must be 2.1+.
  const count = [50, 200].find(
    (n) =>
      buffer.length === n * stride ||
      buffer.length === n * stride + fields.length,
  );
  if (!count)
    throw Error(
      `Unrecognized ${kind === "units" ? "UNT" : "BTL"} file size. Expected WARCOM fixed-width records.`,
    );
  const records = [];
  for (let i = 0; i < count; i++) {
    let offset = i * stride;
    const record = {};
    for (let j = 0; j < fields.length; j++) {
      const value = buffer
        .subarray(offset, offset + widths[j])
        .toString("latin1")
        .split("\0")[0]
        .trim();
      record[fields[j]] = value;
      offset += widths[j];
    }
    records.push(record);
  }
  while (records.length && Object.values(records.at(-1)).every((v) => v === ""))
    records.pop();
  return records.map((record) => {
    if (kind === "units")
      for (const field of unitFields) {
        if (!textFields.has(field))
          record[field] = parseInt(record[field], 10) || 0;
      }
    else {
      for (const field of ["attacker", "defender", "modifier"])
        record[field] = parseInt(record[field], 10) || 0;
      record.multiplier =
        record.multiplier === "" ? 1 : Number(record.multiplier);
      record.critical = record.critical.toLowerCase() || "n";
    }
    return record;
  });
}
