export type NumericField =
  | "armor"
  | "discipline"
  | "moraleStart"
  | "moraleNow"
  | "moraleMod"
  | "obStart"
  | "obNow"
  | "obMod"
  | "dbStart"
  | "dbNow"
  | "dbMod"
  | "exhaustionStart"
  | "exhaustionNow"
  | "exhaustionMod"
  | "movementStart"
  | "movementNow"
  | "movementMod"
  | "numberStart"
  | "numberNow"
  | "hitsStart"
  | "hitsNow";
export type Unit = Record<NumericField, number> & {
  name: string;
  race: string;
  type: string;
  weapon: string;
  moraleFailure: string;
  formation: string;
};
export type Attack = {
  attacker: number;
  defender: number;
  attackerSize: string;
  defenderSize: string;
  modifier: number;
  multiplier: number;
  critical: string;
  weapon: string;
};
export type Result = {
  assignment: number;
  attacker: number;
  defender: number;
  attackerName?: string;
  defenderName?: string;
  before: number;
  after: number;
  hitsBefore: number;
  hitsAfter: number;
  attacks?: number;
  damage?: number;
  casualties: number;
};
export type History = {
  time: string;
  seed: number;
  mode: string;
  results: Result[];
};
export type Scenario = {
  version: number;
  name: string;
  units: Unit[];
  attacks: Attack[];
  settings: { constantBonuses: boolean; legacyArmor: boolean };
  history: History[];
  undo?: unknown;
};
export type Weapon = {
  name: string;
  armor: {
    armor: number;
    max: number;
    min: number;
    start: number;
    crit: number[];
  }[];
};
