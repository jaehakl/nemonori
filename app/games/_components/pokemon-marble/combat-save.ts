import { movesById, speciesById } from "./pokemon-data";
import {
  createCombatant,
  type BattleActionResult,
  type CombatState,
} from "./combat-types";
import { getStats } from "./battle";

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min = 0, max = 1000000) =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const finite = (v: unknown, min = 0, max = 1000000) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const side = (v: unknown) => v === "attacker" || v === "defender";
const moveId = (v: unknown) => integer(v, 1) && !!movesById[v as number];
const statKeys = Object.keys(createCombatant().stages);

function validCombatant(v: unknown): boolean {
  if (
    !record(v) ||
    !record(v.stages) ||
    statKeys.some(
      (key) => !integer((v.stages as Record<string, unknown>)[key], -6, 6),
    )
  )
    return false;
  if (
    v.status !== null &&
    !["brn", "psn", "tox", "par", "slp", "frz"].includes(v.status as string)
  )
    return false;
  for (const key of [
    "statusTurns",
    "toxicCounter",
    "confusion",
    "binding",
    "syrup",
    "throatChop",
    "consecutive",
    "actions",
    "timesHit",
    "receivedDamage",
    "damagedRound",
  ])
    if (!integer(v[key])) return false;
  if (
    (v.statusTurns as number) > 3 ||
    (v.toxicCounter as number) > 15 ||
    (v.confusion as number) > 5 ||
    (v.binding as number) > 5 ||
    (v.syrup as number) > 3 ||
    (v.throatChop as number) > 2
  )
    return false;
  if (v.status !== "slp" && v.statusTurns !== 0) return false;
  if (v.status !== "tox" && v.toxicCounter !== 0) return false;
  for (const key of [
    "flinch",
    "saltCure",
    "grounded",
    "exposed",
    "recharge",
    "lastFailed",
    "receivedPhysical",
  ])
    if (typeof v[key] !== "boolean") return false;
  if (
    v.types !== null &&
    (!Array.isArray(v.types) ||
      v.types.length > 2 ||
      v.types.some((n) => !integer(n, 1, 18)) ||
      new Set(v.types).size !== v.types.length)
  )
    return false;
  if (v.lastMove !== null && !moveId(v.lastMove)) return false;
  if (
    v.charging !== null &&
    (!moveId(v.charging) || !movesById[v.charging as number].effects.charge)
  )
    return false;
  if (
    v.recharge &&
    (!moveId(v.lastMove) || !movesById[v.lastMove as number].effects.recharge)
  )
    return false;
  if (
    v.locked !== null &&
    (!record(v.locked) ||
      !moveId(v.locked.moveId) ||
      !movesById[v.locked.moveId as number].effects.lock ||
      !integer(v.locked.remaining, 1, 5))
  )
    return false;
  return (
    Array.isArray(v.usedMoves) &&
    v.usedMoves.length <= 4 &&
    v.usedMoves.every(moveId) &&
    new Set(v.usedMoves).size === v.usedMoves.length
  );
}

/** Learned slots exclude Struggle, which remains a contextual battle fallback. */
export function validateMoveIds(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 3 &&
    new Set(value).size === value.length && value.every((id) =>
      moveId(id) && id !== 165 && movesById[id].effects.support !== "excluded",
    );
}

export function validateCombat(v: unknown, legacy = false): v is CombatState {
  if (
    !record(v) ||
    !integer(v.round, 1) ||
    typeof v.plasma !== "boolean" ||
    !validCombatant(v.attacker) ||
    !validCombatant(v.defender) ||
    !Array.isArray(v.delayed) ||
    v.delayed.length > 2
  )
    return false;
  const sides = new Set();
  return v.delayed.every((entry) => {
    if (
      !record(entry) ||
      !side(entry.side) ||
      sides.has(entry.side) ||
      !moveId(entry.moveId) ||
      movesById[entry.moveId as number].effects.rule !== "delayed" ||
      !integer(entry.dueRound, v.round as number, (v.round as number) + 2) ||
      !validCombatant(entry.combatant) ||
      !record(entry.pokemon)
    )
      return false;
    sides.add(entry.side);
    const p = entry.pokemon;
    return (
      typeof p.id === "string" &&
      /^p[1-9]\d*$/.test(p.id) &&
      integer(p.speciesId, 1, 1025) &&
      !!speciesById[p.speciesId as number] &&
      integer(p.level, 1, 100) &&
      integer(p.xp, 0, legacy ? 999 : p.level === 100 ? 0 : 999) &&
      (legacy || validateMoveIds(p.moveIds)) &&
      integer(p.hp, 1, getStats(p as never).hp)
    );
  });
}

export function validateBattleAction(v: unknown): v is BattleActionResult {
  if (
    !record(v) ||
    !side(v.side) ||
    !moveId(v.moveId) ||
    typeof v.moveName !== "string" ||
    v.moveName.length > 80 ||
    typeof v.message !== "string" ||
    v.message.length > 300
  )
    return false;
  if (v.moveType !== null && !integer(v.moveType, 1, 18)) return false;
  if (
    !["physical", "special"].includes(v.category as string) ||
    !["hit", "miss", "charge", "recharge", "blocked", "delayed"].includes(
      v.outcome as string,
    ) ||
    typeof v.critical !== "boolean"
  )
    return false;
  for (const key of [
    "damage",
    "calculatedDamage",
    "beforeHp",
    "afterHp",
    "sourceBeforeHp",
    "sourceAfterHp",
    "healing",
    "recoil",
  ])
    if (!integer(v[key])) return false;
  if (
    !finite(v.effectiveness, 0, 16) ||
    (v.afterHp as number) > (v.beforeHp as number) ||
    v.damage !== (v.beforeHp as number) - (v.afterHp as number)
  )
    return false;
  if (
    v.sourceAfterHp !==
    (v.sourceBeforeHp as number) + (v.healing as number) - (v.recoil as number)
  )
    return false;
  if (
    !Array.isArray(v.hits) ||
    v.hits.length > 10 ||
    !Array.isArray(v.changes) ||
    v.changes.length > 100
  )
    return false;
  let expectedHp = v.beforeHp as number,
    calculated = 0;
  for (const hit of v.hits) {
    if (
      !record(hit) ||
      !record(hit.breakdown) ||
      hit.beforeHp !== expectedHp ||
      !integer(hit.afterHp, 0, expectedHp)
    )
      return false;
    const b = hit.breakdown;
    for (const key of [
      "level",
      "levelFactor",
      "originalPower",
      "power",
      "offense",
      "defense",
      "baseDamage",
      "damage",
    ])
      if (!integer(b[key])) return false;
    for (const key of [
      "stab",
      "effectiveness",
      "criticalMultiplier",
      "modifier",
    ])
      if (!finite(b[key], 0, 16)) return false;
    if (
      !integer(b.offenseStage, -6, 6) ||
      !integer(b.defenseStage, -6, 6) ||
      !statKeys.includes(b.offenseStat as string) ||
      !statKeys.includes(b.defenseStat as string)
    )
      return false;
    if (
      typeof b.critical !== "boolean" ||
      typeof b.fixed !== "boolean" ||
      typeof b.powerLabel !== "string" ||
      b.powerLabel.length > 80 ||
      !["physical", "special"].includes(b.category as string)
    )
      return false;
    if (b.accuracy !== null && !finite(b.accuracy, 0, 100)) return false;
    if (b.moveType !== null && !integer(b.moveType, 1, 18)) return false;
    if (expectedHp - (hit.afterHp as number) > (b.damage as number))
      return false;
    expectedHp = hit.afterHp as number;
    calculated += b.damage as number;
  }
  if (expectedHp !== v.afterHp || calculated !== v.calculatedDamage)
    return false;
  return v.changes.every(
    (change) =>
      record(change) &&
      side(change.side) &&
      typeof change.message === "string" &&
      change.message.length < 300 &&
      (change.boosts === undefined ||
        (record(change.boosts) &&
          Object.entries(change.boosts).every(
            ([key, n]) => statKeys.includes(key) && integer(n, -12, 12),
          ))),
  );
}
