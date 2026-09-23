import test from "node:test";
import assert from "node:assert/strict";
import {
  demoScenario,
  unitFields,
  textFields,
  exportLegacy,
  importLegacy,
  validateScenario,
  loadWeapons,
} from "../backend/model.mjs";
test("interior empty unit and assignment slots retain numeric references", () => {
  const s = demoScenario();
  const empty = Object.fromEntries(
    unitFields.map((k) => [k, textFields.has(k) ? "" : 0]),
  );
  s.units.splice(1, 0, empty);
  s.attacks = [
    {
      attacker: 0,
      defender: 0,
      attackerSize: "",
      defenderSize: "",
      modifier: 0,
      multiplier: 1,
      critical: "n",
      weapon: "",
    },
    { ...s.attacks[0], defender: 3 },
  ];
  const units = importLegacy(exportLegacy(s.units, "units"), "units"),
    attacks = importLegacy(exportLegacy(s.attacks, "attacks"), "attacks");
  assert.equal(units.length, 3);
  assert.equal(attacks[1].defender, 3);
  assert.doesNotThrow(() =>
    validateScenario({ ...s, units, attacks }, loadWeapons("core/weapons.dat")),
  );
});
