import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Unit, Attack, Scenario, Weapon, NumericField } from "./types";
import { newUnit } from "./defaults";
import "./style.css";

async function api<T>(endpoint: string, body?: unknown): Promise<T> {
  const r = await fetch(
    "/api/" + endpoint,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
const stats = [
  ["morale", "Morale"],
  ["ob", "Offensive bonus"],
  ["db", "Defensive bonus"],
  ["exhaustion", "Exhaustion"],
  ["movement", "Movement"],
  ["number", "Combatants"],
  ["hits", "Average hits"],
] as const;
const criticals = [
  ["n", "Normal"],
  ["d", "Double"],
  ["k", "Weapons kata"],
  ["m", "Magic"],
  ["h", "Holy"],
  ["s", "Slaying"],
];
const armors = [
  "Skin / cloth",
  "Robes",
  "Light hide",
  "Heavy hide",
  "Leather jerkin",
  "Leather coat",
  "Reinforced leather coat",
  "Reinforced full-length leather",
  "Rigid-leather breastplate",
  "Rigid leather + greaves",
  "Half-hide plate",
  "Full-hide plate",
  "Chain shirt",
  "Chain shirt + greaves",
  "Full chain",
  "Chain hauberk",
  "Metal breastplate",
  "Metal breastplate + greaves",
  "Half plate",
  "Full plate",
];
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function WeaponSelect({
  value,
  onChange,
  weapons,
  optional = false,
}: {
  value: string;
  onChange: (v: string) => void;
  weapons: Weapon[];
  optional?: boolean;
}) {
  return (
    <select
      aria-label={optional ? "Weapon override" : "Weapon"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {optional && <option value="">Use unit weapon</option>}
      {!weapons.some((w) => w.name === value) && value && (
        <option>{value}</option>
      )}
      {weapons.map((w) => (
        <option key={w.name}>{w.name}</option>
      ))}
    </select>
  );
}
function App() {
  const [state, setState] = useState<Scenario>();
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [page, setPage] = useState("Units");
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [weaponName, setWeaponName] = useState("broadsword");
  const [seed, setSeed] = useState("");
  const [saves, setSaves] = useState<string[]>([]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    Promise.all([api<Scenario>("state"), api<Weapon[]>("weapons")])
      .then(([s, w]) => {
        setState(s);
        setWeapons(w);
      })
      .catch((e) => setError(e.message));
  }, []);
  function edit(next: Scenario) {
    setState(next);
    setDirty(true);
    setNotice("");
  }
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!state) return;
    const next = await api<Scenario>("state", state);
    setState(next);
    setDirty(false);
    return next;
  }
  async function command(name: string, body: unknown = {}, saveFirst = false) {
    await act(async () => {
      if (saveFirst && dirty) await commit();
      setState(await api<Scenario>(name, body));
      setDirty(false);
      if (["new", "load", "import"].includes(name)) setSelected(0);
      setNotice(
        name === "resolve"
          ? "Resolution complete. Results saved locally."
          : name === "undo"
            ? "Previous resolution undone."
            : "Battle updated.",
      );
    });
  }
  function updateUnit(patch: Partial<Unit>) {
    if (!state) return;
    edit({
      ...state,
      units: state.units.map((u, i) =>
        i === selected ? { ...u, ...patch } : u,
      ),
    });
  }
  function resetUnit(all = false) {
    if (!state) return;
    const units = state.units.map((u, i) => {
      if (!all && i !== selected) return u;
      const next = { ...u };
      for (const [key] of stats)
        next[(key + "Now") as NumericField] =
          u[(key + "Start") as NumericField];
      return next;
    });
    edit({ ...state, units });
  }
  function addUnit(copy = false) {
    if (!state || state.units.length >= 200) return;
    const unit = copy
      ? { ...state.units[selected], name: state.units[selected].name + " copy" }
      : newUnit();
    edit({ ...state, units: [...state.units, unit as Unit] });
    setSelected(state.units.length);
    setSearch("");
  }
  function removeUnit() {
    if (!state) return;
    const id = selected + 1;
    edit({
      ...state,
      units: state.units.filter((_, i) => i !== selected),
      attacks: state.attacks
        .filter((a) => a.attacker !== id && a.defender !== id)
        .map((a) => ({
          ...a,
          attacker: a.attacker > id ? a.attacker - 1 : a.attacker,
          defender: a.defender > id ? a.defender - 1 : a.defender,
        })),
    });
    setSelected(Math.max(0, selected - 1));
  }
  function editAttack(i: number, patch: Partial<Attack>) {
    if (state)
      edit({
        ...state,
        attacks: state.attacks.map((a, j) =>
          j === i ? { ...a, ...patch } : a,
        ),
      });
  }
  async function importFile(file: File) {
    await act(async () => {
      const ext = file.name.toLowerCase();
      let body;
      if (ext.endsWith(".unt") || ext.endsWith(".btl")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        body = {
          kind: ext.endsWith(".unt") ? "units" : "attacks",
          content: btoa(binary),
        };
      } else
        body = { kind: "scenario", scenario: JSON.parse(await file.text()) };
      setState(await api<Scenario>("import", body));
      setDirty(false);
      setSelected(0);
      setNotice(
        "File imported. Unit imports clear assignments to avoid mismatched unit references.",
      );
    });
  }
  async function download(kind: string) {
    await act(async () => {
      if (dirty) await commit();
      const response = await fetch("/api/export?kind=" + kind);
      if (!response.ok) throw Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download =
        kind === "units"
          ? "battle.unt"
          : kind === "attacks"
            ? "battle.btl"
            : kind === "log"
              ? "battle.log"
              : "battle.warcom.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (!state)
    return (
      <main className="loading">
        <h1>WARCOM</h1>
        <p role="alert">{error || "Opening your local command desk…"}</p>
      </main>
    );
  const u = state.units[selected];
  const total = state.units.reduce((n, u) => n + u.numberNow, 0),
    starting = state.units.reduce((n, u) => n + u.numberStart, 0);
  const selectedWeapon = weapons.find((w) => w.name === weaponName);
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Units");
          }}
        >
          <span className="brand-mark">W</span>
          <span>
            WARCOM<small>WAR LAW COMPANION</small>
          </span>
        </a>
        <div className="nav-caption">BATTLE COMMAND</div>
        <nav>
          {[
            ["Units", "01"],
            ["Assignments", "02"],
            ["Battle log", "03"],
            ["Weapons", "04"],
            ["Files & settings", "05"],
          ].map(([name, n]) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => setPage(name)}
            >
              <span>{n}</span>
              {name}
              {name === "Units" && <em>{state.units.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" /> LOCAL WORKSPACE
          <p>
            All battles and calculations
            <br />
            stay on this computer.
          </p>
          <small>WARCOM 3 · C++ combat engine</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">COMMAND DESK / {page.toUpperCase()}</div>
            <h1>
              {page === "Units"
                ? "Order of battle"
                : page === "Assignments"
                  ? "Attack assignments"
                  : page === "Battle log"
                    ? "Battle record"
                    : page === "Weapons"
                      ? "Weapon reference"
                      : "Your workspace"}
            </h1>
            <p>
              {page === "Units"
                ? "Organize your forces. Keep every unit accounted for."
                : page === "Assignments"
                  ? "Set the engagements, then resolve a single attack or a full round."
                  : page === "Battle log"
                    ? "Review casualties and hit points, with a recorded seed for every resolution."
                    : page === "Weapons"
                      ? "The original WARCOM weapon tables, from armor type 1 through 20."
                      : "Save battles, exchange legacy files, and choose calculation settings."}
            </p>
          </div>
          <div className="header-actions">
            <span className={"save-state " + (dirty ? "dirty" : "")}>
              {dirty ? "Unsaved changes" : "Saved locally"}
            </span>
            <button
              className="primary"
              disabled={busy || !dirty}
              onClick={() =>
                act(async () => {
                  await commit();
                  setNotice("Changes saved.");
                })
              }
            >
              Save changes
            </button>
          </div>
        </header>
        <section className="battle-strip">
          <div>
            <span className="eyebrow">ACTIVE BATTLE</span>
            <strong>{state.name}</strong>
          </div>
          <div>
            <b>{state.units.length}</b>
            <span>Units</span>
          </div>
          <div>
            <b>{total.toLocaleString()}</b>
            <span>Combatants remaining</span>
          </div>
          <div>
            <b>{starting ? Math.round((total / starting) * 100) : 0}%</b>
            <span>Force strength</span>
          </div>
          <div>
            <b>{state.history.length}</b>
            <span>Resolutions</span>
          </div>
        </section>
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice}
          </div>
        )}
        <fieldset className="workspace" disabled={busy}>
          {page === "Units" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>
                    Unit roster <span>{state.units.length} / 200</span>
                  </h2>
                  <p>
                    Select a unit to edit its starting values, current state,
                    and modifiers.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={state.units.length >= 200}
                  onClick={() => addUnit()}
                >
                  ＋ Add unit
                </button>
              </div>
              {!state.units.length ? (
                <div className="empty">
                  <div className="empty-symbol">⚑</div>
                  <h2>Your battle starts here</h2>
                  <p>
                    Add your first unit or open an illustrative two-unit
                    engagement.
                  </p>
                  <button className="primary" onClick={() => addUnit()}>
                    Add first unit
                  </button>
                  <button onClick={() => command("new", { demo: true })}>
                    Load training engagement
                  </button>
                </div>
              ) : (
                <div className="roster-layout">
                  <section className="panel roster">
                    <div className="panel-top">
                      <input
                        aria-label="Search units"
                        placeholder="Search units…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <div className="unit-list">
                      {state.units.map(
                        (unit, i) =>
                          unit.name
                            .toLowerCase()
                            .includes(search.toLowerCase()) && (
                            <button
                              key={i}
                              className={
                                "unit-row " + (selected === i ? "selected" : "")
                              }
                              onClick={() => setSelected(i)}
                            >
                              <span className="unit-id">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="unit-info">
                                <strong>{unit.name || "Unnamed unit"}</strong>
                                <small>
                                  {unit.type || "Normal"} · AT {unit.armor} ·{" "}
                                  {unit.weapon}
                                </small>
                                <span className="strength-track">
                                  <span
                                    style={{
                                      width: `${unit.numberStart ? (unit.numberNow / unit.numberStart) * 100 : 0}%`,
                                    }}
                                  />
                                </span>
                              </span>
                              <span className="unit-count">
                                {unit.numberNow}
                                <small>/ {unit.numberStart}</small>
                              </span>
                            </button>
                          ),
                      )}
                    </div>
                    <div className="panel-foot">
                      {state.attacks.length} attack assignments prepared
                    </div>
                  </section>
                  {u && (
                    <section className="panel editor">
                      <div className="panel-top">
                        <div>
                          <span className="eyebrow">
                            UNIT {String(selected + 1).padStart(2, "0")}
                          </span>
                          <h2>{u.name || "Unnamed unit"}</h2>
                        </div>
                        <div className="toolbar">
                          <button
                            onClick={() => addUnit(true)}
                            disabled={state.units.length >= 200}
                          >
                            Duplicate
                          </button>
                          <button onClick={() => resetUnit()}>
                            Reset stats
                          </button>
                        </div>
                      </div>
                      <div className="editor-body">
                        <div className="form-grid">
                          <Field label="Unit name">
                            <input
                              value={u.name}
                              maxLength={60}
                              onChange={(e) =>
                                updateUnit({ name: e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Race / affiliation">
                            <input
                              value={u.race}
                              maxLength={60}
                              onChange={(e) =>
                                updateUnit({ race: e.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label="Target type"
                            hint="Other descriptions resolve as Normal."
                          >
                            <input
                              list="target-types"
                              value={u.type}
                              onChange={(e) =>
                                updateUnit({ type: e.target.value })
                              }
                            />
                            <datalist id="target-types">
                              {[
                                "Normal",
                                "Small",
                                "Type I",
                                "Type II",
                                "Large",
                                "Super-Large",
                                "No stun",
                              ].map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </datalist>
                          </Field>
                          <Field label="Weapon">
                            <WeaponSelect
                              value={u.weapon}
                              weapons={weapons}
                              onChange={(weapon) => updateUnit({ weapon })}
                            />
                          </Field>
                          <Field label="Armor type">
                            <select
                              value={u.armor}
                              onChange={(e) =>
                                updateUnit({ armor: +e.target.value })
                              }
                            >
                              {armors.map((a, i) => (
                                <option key={a} value={i + 1}>
                                  {i + 1} · {a}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Formation">
                            <input
                              value={u.formation}
                              maxLength={60}
                              onChange={(e) =>
                                updateUnit({ formation: e.target.value })
                              }
                            />
                          </Field>
                          <Field
                            label="Discipline modifier"
                            hint="Typical values: elite −5, regular −20, poor −60."
                          >
                            <input
                              type="number"
                              value={u.discipline}
                              onChange={(e) =>
                                updateUnit({ discipline: +e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Last morale failure">
                            <select
                              value={u.moraleFailure.trim()}
                              onChange={(e) =>
                                updateUnit({ moraleFailure: e.target.value })
                              }
                            >
                              <option value="">None</option>
                              {["A", "B", "C", "D", "E"].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <div className="table-wrap">
                          <table className="stats-table">
                            <thead>
                              <tr>
                                <th>Combat statistics</th>
                                <th>Start</th>
                                <th>Current</th>
                                <th>Modifier</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.map(([key, label]) => (
                                <tr key={key}>
                                  <th>{label}</th>
                                  {["Start", "Now", "Mod"].map((suffix) => (
                                    <td key={suffix}>
                                      {suffix === "Mod" &&
                                      ["number", "hits"].includes(key) ? (
                                        <span className="muted">—</span>
                                      ) : (
                                        <input
                                          aria-label={`${label} ${suffix === "Now" ? "current" : suffix.toLowerCase()}`}
                                          type="number"
                                          min={
                                            ["number", "hits"].includes(key)
                                              ? suffix === "Start"
                                                ? 1
                                                : 0
                                              : -9999
                                          }
                                          max={9999}
                                          value={
                                            u[(key + suffix) as NumericField]
                                          }
                                          onChange={(e) =>
                                            updateUnit({
                                              [key + suffix]: +e.target.value,
                                            })
                                          }
                                        />
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="hint">
                          Morale is recalculated when attacked. Exhaustion
                          modifier is retained for reference; the legacy engine
                          does not apply it.
                        </p>
                        <div className="editor-footer">
                          <button className="danger" onClick={removeUnit}>
                            Remove unit & linked assignments
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
          {page === "Assignments" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>
                    Engagement queue <span>{state.attacks.length} / 200</span>
                  </h2>
                  <p>
                    Blank or 0 size means all combatants. Use 25% for a
                    fraction, or 300% for three attacks each.
                  </p>
                </div>
                <button
                  disabled={!state.units.length || state.attacks.length >= 200}
                  onClick={() =>
                    edit({
                      ...state,
                      attacks: [
                        ...state.attacks,
                        {
                          attacker: 1,
                          defender: Math.min(2, state.units.length),
                          attackerSize: "25%",
                          defenderSize: "",
                          modifier: 0,
                          multiplier: 1,
                          critical: "n",
                          weapon: "",
                        },
                      ],
                    })
                  }
                >
                  ＋ Add assignment
                </button>
              </div>
              <div className="resolution-bar">
                <div>
                  <strong>Resolve battle</strong>
                  <p>
                    Full rounds use starting attacker stats; defenders
                    accumulate damage in queue order.
                  </p>
                </div>
                <Field label="Random seed (optional)">
                  <input
                    type="number"
                    min={1}
                    max={2147483646}
                    placeholder="Random each run"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                </Field>
                <button
                  disabled={!state.undo || dirty}
                  onClick={() => command("undo")}
                >
                  Undo last
                </button>
                <button
                  className="primary"
                  disabled={!state.attacks.length}
                  onClick={() =>
                    command("resolve", seed ? { seed: Number(seed) } : {}, true)
                  }
                >
                  Resolve full round →
                </button>
              </div>
              {!state.attacks.length && (
                <div className="empty">
                  <h2>No engagements assigned</h2>
                  <p>Add units, then choose who attacks whom.</p>
                </div>
              )}
              <div className="assignments">
                {state.attacks.map((a, i) => (
                  <section className="panel attack-card" key={i}>
                    <div className="panel-top">
                      <div>
                        <span className="eyebrow">
                          ASSIGNMENT {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3>
                          {state.units[a.attacker - 1]?.name || "?"}{" "}
                          <span className="muted">→</span>{" "}
                          {state.units[a.defender - 1]?.name || "?"}
                        </h3>
                      </div>
                      <button
                        aria-label={`Remove assignment ${i + 1}`}
                        onClick={() =>
                          edit({
                            ...state,
                            attacks: state.attacks.filter((_, j) => i !== j),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="attack-fields">
                      {(["attacker", "defender"] as const).map((side) => (
                        <React.Fragment key={side}>
                          <Field
                            label={
                              side === "attacker"
                                ? "Attacking unit"
                                : "Defending unit"
                            }
                          >
                            <select
                              value={a[side]}
                              onChange={(e) =>
                                editAttack(i, { [side]: +e.target.value })
                              }
                            >
                              {state.units.map((u, j) => (
                                <option key={j} value={j + 1}>
                                  {j + 1} · {u.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field
                            label={
                              side === "attacker"
                                ? "Number of attacks"
                                : "Targets exposed"
                            }
                          >
                            <input
                              value={
                                a[
                                  side === "attacker"
                                    ? "attackerSize"
                                    : "defenderSize"
                                ]
                              }
                              placeholder="All"
                              onChange={(e) =>
                                editAttack(i, {
                                  [side + "Size"]: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </React.Fragment>
                      ))}
                      <Field label="Attack modifier">
                        <input
                          type="number"
                          value={a.modifier}
                          onChange={(e) =>
                            editAttack(i, { modifier: +e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Concussion multiplier">
                        <select
                          value={a.multiplier}
                          onChange={(e) =>
                            editAttack(i, { multiplier: +e.target.value })
                          }
                        >
                          {Array.from({ length: 10 }, (_, n) => (
                            <option key={n} value={n}>
                              ×{n}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Critical mode">
                        <select
                          value={a.critical}
                          onChange={(e) =>
                            editAttack(i, { critical: e.target.value })
                          }
                        >
                          {criticals.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Weapon override">
                        <WeaponSelect
                          optional
                          value={a.weapon}
                          onChange={(weapon) => editAttack(i, { weapon })}
                          weapons={weapons}
                        />
                      </Field>
                    </div>
                    <div className="panel-foot">
                      <span>
                        Current strength:{" "}
                        {state.units[a.attacker - 1]?.numberNow} attackers ·{" "}
                        {state.units[a.defender - 1]?.numberNow} defenders
                      </span>
                      <button
                        onClick={() =>
                          command(
                            "resolve",
                            {
                              index: i,
                              ...(seed ? { seed: Number(seed) } : {}),
                            },
                            true,
                          )
                        }
                      >
                        Resolve this assignment
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          {page === "Battle log" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>Resolution history</h2>
                  <p>
                    Casualties are combatants no longer effective, not
                    necessarily deaths. Latest result first.
                  </p>
                </div>
                <div className="toolbar">
                  <button
                    disabled={!state.undo || dirty}
                    onClick={() => command("undo")}
                  >
                    Undo last resolution
                  </button>
                  <button onClick={() => download("log")}>
                    Export battle log
                  </button>
                </div>
              </div>
              {!state.history.length ? (
                <div className="empty">
                  <h2>No battle results yet</h2>
                  <p>Resolve an assignment to record its outcome here.</p>
                  <button onClick={() => setPage("Assignments")}>
                    Open assignments
                  </button>
                </div>
              ) : (
                state.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <section className="panel history" key={i}>
                      <div className="panel-top">
                        <div>
                          <span className="eyebrow">
                            RESOLUTION {state.history.length - i} · {h.mode}
                          </span>
                          <h3>
                            {h.results.reduce((n, r) => n + r.casualties, 0)}{" "}
                            casualties across {h.results.length} assignments
                          </h3>
                        </div>
                        <small>
                          {new Date(h.time).toLocaleString()}
                          <br />
                          Seed {h.seed}
                        </small>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Assignment</th>
                              <th>Attacker → defender</th>
                              <th>Casualties</th>
                              <th>Attacks / damage</th>
                              <th>Remaining</th>
                              <th>Average hits</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.results.map((r, j) => (
                              <tr key={j}>
                                <td>#{r.assignment}</td>
                                <td>
                                  {r.attackerName || `#${r.attacker}`} →{" "}
                                  {r.defenderName || `#${r.defender}`}
                                </td>
                                <td>
                                  <span
                                    className={
                                      r.casualties ? "casualty" : "muted"
                                    }
                                  >
                                    {r.casualties}
                                  </span>
                                </td>
                                <td>
                                  {r.attacks ?? "—"} / {r.damage ?? "—"}
                                </td>
                                <td>
                                  {r.before} → <b>{r.after}</b>
                                </td>
                                <td>
                                  {r.hitsBefore} → {r.hitsAfter}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))
              )}
            </>
          )}
          {page === "Weapons" && (
            <>
              <div className="section-heading">
                <div>
                  <h2>{weapons.length} original weapon tables</h2>
                  <p>
                    Damage is interpolated up to roll 150. A critical occurs
                    strictly above its threshold; 0 disables it.
                  </p>
                </div>
                <WeaponSelect
                  value={weaponName}
                  onChange={setWeaponName}
                  weapons={weapons}
                />
              </div>
              <section className="panel">
                <div className="panel-top">
                  <h2 className="capitalize">{weaponName}</h2>
                  <span className="badge">Original table values</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Armor type</th>
                        <th>First damage roll</th>
                        <th>Min hits</th>
                        <th>Max hits</th>
                        {["E", "D", "C", "B", "A"].map((c) => (
                          <th key={c}>{c} crit</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWeapon?.armor.map((a) => (
                        <tr key={a.armor}>
                          <th>
                            {a.armor} · {armors[a.armor - 1]}
                          </th>
                          <td>{a.start}</td>
                          <td>{a.min}</td>
                          <td>{a.max}</td>
                          {a.crit.map((c, i) => (
                            <td key={i}>{c || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="hint">
                Whip is unavailable: the original AT1 row is missing a critical
                threshold. The original data is preserved in legacy/WEAPONS.DAT.
              </p>
            </>
          )}
          {page === "Files & settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-top">
                  <h2>Battle settings</h2>
                </div>
                <div className="editor-body">
                  <Field label="Battle name">
                    <input
                      value={state.name}
                      maxLength={100}
                      onChange={(e) => edit({ ...state, name: e.target.value })}
                    />
                  </Field>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={state.settings.constantBonuses}
                      onChange={(e) =>
                        edit({
                          ...state,
                          settings: {
                            ...state.settings,
                            constantBonuses: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      <strong>Keep OB, DB, and movement constant</strong>
                      <small>
                        Legacy /C mode. Casualties, morale, and exhaustion still
                        update.
                      </small>
                    </span>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={state.settings.legacyArmor}
                      onChange={(e) =>
                        edit({
                          ...state,
                          settings: {
                            ...state.settings,
                            legacyArmor: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>
                      <strong>Legacy armor indexing</strong>
                      <small>
                        Reproduces the old indexing bug: AT1 uses table 2; AT20
                        uses table 1. Leave off for correct 1–20 mapping.
                      </small>
                    </span>
                  </label>
                  <div className="toolbar">
                    <button onClick={() => resetUnit(true)}>
                      Reset all unit stats
                    </button>
                    <button onClick={() => edit({ ...state, attacks: [] })}>
                      Clear assignments
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-top">
                  <h2>Save & exchange</h2>
                </div>
                <div className="editor-body">
                  <p>
                    Changes are saved to this PC with Save changes. A snapshot
                    keeps a separate copy you can restore later.
                  </p>
                  <div className="button-grid">
                    <button
                      onClick={() =>
                        act(async () => {
                          if (dirty) await commit();
                          const { filename } = await api<{ filename: string }>(
                            "save",
                            {},
                          );
                          setNotice("Snapshot saved: " + filename);
                          setSaves(await api<string[]>("saves"));
                        })
                      }
                    >
                      Save snapshot
                    </button>
                    <button
                      onClick={() =>
                        act(async () => setSaves(await api<string[]>("saves")))
                      }
                    >
                      List snapshots
                    </button>
                    <button onClick={() => download("scenario")}>
                      Export complete battle
                    </button>
                    <button onClick={() => download("units")}>
                      Export units (.UNT)
                    </button>
                    <button onClick={() => download("attacks")}>
                      Export assignments (.BTL)
                    </button>
                    <button onClick={() => download("log")}>Export log</button>
                  </div>
                  {saves.map((file) => (
                    <div className="saved-file" key={file}>
                      <small>{file}</small>
                      <button
                        onClick={() => command("load", { filename: file })}
                      >
                        Load
                      </button>
                    </div>
                  ))}
                  <Field
                    label="Import battle / legacy file"
                    hint="Imports replace the matching data. Import units before assignments. Save a snapshot first to retain your current battle."
                  >
                    <input
                      type="file"
                      accept=".json,.unt,.btl"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void importFile(f);
                        e.target.value = "";
                      }}
                    />
                  </Field>
                </div>
              </section>
              <section className="panel">
                <div className="panel-top">
                  <h2>Start a different battle</h2>
                </div>
                <div className="editor-body">
                  <p>
                    These replace the active battle. Save a snapshot to keep it.
                  </p>
                  <div className="toolbar">
                    <button onClick={() => command("new")}>
                      New empty battle
                    </button>
                    <button onClick={() => command("new", { demo: true })}>
                      Load training engagement
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-top">
                  <h2>Rules & scope</h2>
                </div>
                <div className="editor-body">
                  <p>
                    WARCOM approximates Rolemaster attacks for mass combat. You
                    decide movement, routing, and the consequences of morale
                    failures A–E.
                  </p>
                  <p>
                    Full rounds preserve attacker stats from the start, but
                    defender damage accumulates sequentially. Order can affect
                    results. Undo restores the most recent resolution until the
                    battle is edited.
                  </p>
                  <p>
                    The training engagement is illustrative; the original
                    repository did not include its tutorial battle files.
                  </p>
                </div>
              </section>
            </div>
          )}
        </fieldset>
        <footer>
          WARCOM · Based on the original work of David Eubanks and KILBOT ·
          Local, offline battle resolution
          <span>{busy ? "Working…" : "Engine ready"}</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
