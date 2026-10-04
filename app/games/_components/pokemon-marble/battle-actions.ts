import type { Move, StatChanges, Status } from "./data-types";
import type { BattleSide, Pokemon } from "./types";
import type {
  BattleActionResult,
  CombatState,
  CombatantState,
} from "./combat-types";
import { movesById, speciesById } from "./pokemon-data";
import {
  combatTypes,
  effectiveStat,
  getDamagePreview,
  getStats,
  oppositeSide,
  type BattleContext,
} from "./battle";

export const STATUS_NAMES: Record<Status, string> = {
  brn: "화상",
  psn: "독",
  tox: "맹독",
  par: "마비",
  slp: "수면",
  frz: "얼음",
};
export const STAT_NAMES = {
  attack: "공격",
  defense: "방어",
  specialAttack: "특수공격",
  specialDefense: "특수방어",
  speed: "스피드",
  accuracy: "명중률",
  evasion: "회피율",
};
type Random = (limit: number) => number;
const chance = (random: Random, percent: number) =>
  percent >= 100 || (percent > 0 && random(10000) < percent * 100);
const hurt = (pokemon: Pokemon, amount: number) => {
  const damage = Math.min(pokemon.hp, Math.max(0, Math.floor(amount)));
  pokemon.hp -= damage;
  return damage;
};

export function changeStages(
  state: CombatantState,
  changes: StatChanges,
): StatChanges {
  const applied: StatChanges = {};
  for (const key of Object.keys(changes) as (keyof StatChanges)[]) {
    const before = state.stages[key];
    state.stages[key] = Math.max(-6, Math.min(6, before + changes[key]!));
    if (state.stages[key] !== before) applied[key] = state.stages[key] - before;
  }
  return applied;
}

function clearStatus(state: CombatantState) {
  state.status = null;
  state.statusTurns = 0;
  state.toxicCounter = 0;
}
export function inflictStatus(
  pokemon: Pokemon,
  state: CombatantState,
  status: Status,
  random: Random,
  uproar = false,
): boolean {
  if (!pokemon.hp || state.status) return false;
  const types = combatTypes(pokemon, state);
  if (
    (status === "brn" && types.includes(10)) ||
    (["psn", "tox"].includes(status) &&
      (types.includes(4) || types.includes(9))) ||
    (status === "par" && types.includes(13)) ||
    (status === "frz" && types.includes(15)) ||
    (status === "slp" && uproar)
  )
    return false;
  state.status = status;
  state.statusTurns = status === "slp" ? random(3) + 1 : 0;
  state.toxicCounter = 0;
  return true;
}

function avoidsAttack(target: CombatantState, move: Move): boolean {
  if (!target.charging || target.grounded) return false;
  const phase = movesById[target.charging].effects.charge;
  if (phase === "air")
    return ![16, 87, 239, 327, 479, 542, 614].includes(move.id);
  if (phase === "ground") return ![89, 222].includes(move.id);
  if (phase === "water") return ![57, 250].includes(move.id);
  return phase === "vanish";
}

/** Mutates only the reducer's cloned state. Display code never calls this resolver. */
export function resolveBattleMove(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  combat: CombatState,
  side: BattleSide,
  random: Random,
  context: BattleContext = {},
  delayed = false,
): BattleActionResult {
  const source = combat[side],
    targetSide = oppositeSide(side),
    target = combat[targetSide];
  const ctx = { ...context, combat, side };
  const initial = getDamagePreview(attacker, defender, move, ctx);
  const result: BattleActionResult = {
    side,
    moveId: move.id,
    moveName: move.name,
    moveType: initial.moveType,
    category: initial.category,
    outcome: "hit",
    message: `${speciesById[attacker.speciesId].name}의 ${move.name}!`,
    damage: 0,
    calculatedDamage: 0,
    effectiveness: initial.effectiveness,
    critical: false,
    beforeHp: defender.hp,
    afterHp: defender.hp,
    sourceBeforeHp: attacker.hp,
    sourceAfterHp: attacker.hp,
    healing: 0,
    recoil: 0,
    hits: [],
    changes: [],
  };
  const note = (affected: BattleSide, message: string, boosts?: StatChanges) =>
    result.changes.push({
      side: affected,
      message,
      ...(boosts ? { boosts } : {}),
    });
  const boost = (affected: BattleSide, changes: StatChanges) => {
    const applied = changeStages(combat[affected], changes);
    if (Object.keys(applied).length)
      note(
        affected,
        Object.entries(applied)
          .map(
            ([key, value]) =>
              `${STAT_NAMES[key as keyof StatChanges]} ${value! > 0 ? "+" : ""}${value}`,
          )
          .join(" · "),
        applied,
      );
  };
  const finish = (outcome = result.outcome, message = result.message) => {
    result.outcome = outcome;
    result.message = message;
    result.afterHp = defender.hp;
    result.sourceAfterHp = attacker.hp;
    if (!delayed) {
      source.actions += 1;
      source.lastFailed = ["miss", "blocked"].includes(outcome);
      source.consecutive =
        outcome === "hit"
          ? source.lastMove === move.id
            ? source.consecutive + 1
            : 1
          : 0;
      if (!["blocked", "recharge"].includes(outcome)) {
        source.lastMove = move.id;
        if (!source.usedMoves.includes(move.id)) source.usedMoves.push(move.id);
      }
      if (source.locked) {
        source.locked.remaining -= 1;
        if (source.locked.remaining <= 0 || outcome !== "hit" || !attacker.hp) {
          if (move.effects.lock === "rampage" && attacker.hp) {
            source.confusion = random(4) + 2;
            note(side, "연속 공격 후 혼란에 빠졌습니다.");
          }
          source.locked = null;
        }
      }
    }
    return result;
  };

  if (!delayed) {
    target.receivedDamage = 0;
    target.receivedPhysical = false;
    source.exposed = false;
    if (source.recharge) {
      source.recharge = false;
      return finish("recharge", "반동으로 쉬고 있습니다.");
    }
    if (source.flinch) {
      source.flinch = false;
      source.charging = null;
      return finish("blocked", "풀죽어서 움직일 수 없습니다.");
    }
    if (source.status === "slp") {
      if (source.statusTurns > 0) {
        source.statusTurns -= 1;
        if (move.effects.rule !== "snore") {
          source.charging = null;
          return finish("blocked", "잠들어 있습니다.");
        }
      } else {
        clearStatus(source);
        note(side, "잠에서 깨어났습니다.");
      }
    }
    if (source.status === "frz") {
      if (move.effects.defrost || chance(random, 20)) {
        clearStatus(source);
        note(side, "얼음이 녹았습니다.");
      } else {
        source.charging = null;
        return finish("blocked", "얼어서 움직일 수 없습니다.");
      }
    }
    if (source.status === "par" && chance(random, 25)) {
      source.charging = null;
      return finish("blocked", "몸이 마비되어 움직일 수 없습니다.");
    }
    if (source.confusion > 0) {
      source.confusion -= 1;
      if (source.confusion && chance(random, 100 / 3)) {
        const offense = effectiveStat(attacker, source, "attack"),
          defense = effectiveStat(attacker, source, "defense");
        const damage =
          Math.floor(
            Math.floor(
              ((Math.floor((2 * attacker.level) / 5) + 2) * 40 * offense) /
                defense,
            ) / 50,
          ) + 2;
        result.recoil += hurt(attacker, damage);
        source.charging = null;
        return finish("blocked", `혼란으로 자신에게 ${result.recoil} 피해!`);
      }
      if (!source.confusion) note(side, "혼란에서 벗어났습니다.");
    }
    if (move.effects.rule === "snore" && source.status !== "slp")
      return finish("blocked", "잠들어 있지 않아 실패했습니다.");
    if (source.throatChop && move.effects.sound) {
      source.charging = null;
      return finish("blocked", "지옥찌르기로 소리 기술을 사용할 수 없습니다.");
    }
    if (move.effects.charge && source.charging !== move.id) {
      source.charging = move.id;
      if (move.effects.chargeBoosts) boost(side, move.effects.chargeBoosts);
      return finish("charge", `${move.name}의 힘을 모으고 있습니다.`);
    }
    source.charging = null;
    if (move.effects.rule === "delayed") {
      if (combat.delayed.some((entry) => entry.side === side))
        return finish("blocked", "이미 예약된 공격이 있습니다.");
      combat.delayed.push({
        side,
        moveId: move.id,
        dueRound: combat.round + 2,
        pokemon: structuredClone(attacker),
        combatant: structuredClone(source),
      });
      return finish(
        "delayed",
        `${move.name}을 예고했습니다. 2라운드 뒤 공격합니다.`,
      );
    }
  }
  const fails =
    avoidsAttack(target, move) ||
    initial.effectiveness === 0 ||
    (!target.exposed && !chance(random, initial.accuracy ?? 100));
  if (fails) {
    if (move.effects.crash)
      result.recoil += hurt(
        attacker,
        Math.max(1, Math.floor(getStats(attacker).hp / 2)),
      );
    if (move.effects.selfDamage === "faint")
      result.recoil += hurt(attacker, attacker.hp);
    if (move.effects.selfDamage === "half")
      result.recoil += hurt(
        attacker,
        Math.max(1, Math.round(getStats(attacker).hp / 2)),
      );
    return finish(
      "miss",
      initial.effectiveness === 0 ? "효과가 없습니다." : "공격이 빗나갔습니다!",
    );
  }
  if (move.effects.rule === "spectral-thief") {
    const stolen: StatChanges = {};
    for (const key of Object.keys(target.stages) as (keyof StatChanges)[])
      if (target.stages[key] > 0) {
        stolen[key] = target.stages[key];
        target.stages[key] = 0;
      }
    boost(side, stolen);
  }
  const [minHits, maxHits] = move.effects.hits ?? [1, 1];
  const hitCount =
    minHits === maxHits
      ? minHits
      : minHits === 2 && maxHits === 5
        ? [2, 3, 4, 5][
            (() => {
              const n = random(100);
              return n < 35 ? 0 : n < 70 ? 1 : n < 85 ? 2 : 3;
            })()
          ]
        : random(maxHits - minHits + 1) + minHits;
  const fickleBoost = move.effects.rule === "fickle-beam" && chance(random, 30);
  for (let hit = 1; hit <= hitCount && defender.hp > 0; hit++) {
    if (
      hit > 1 &&
      move.effects.perHitAccuracy &&
      !chance(random, initial.accuracy ?? 100)
    ) {
      note(side, `${hit}번째 공격이 빗나갔습니다.`);
      break;
    }
    const critical =
      !initial.fixed &&
      (move.effects.alwaysCritical ||
        random([24, 8, 2, 1][Math.min(3, move.effects.criticalStage ?? 0)]) ===
          0);
    const breakdown = getDamagePreview(attacker, defender, move, {
      ...ctx,
      critical: Boolean(critical),
      hit,
      fickleBoost,
    });
    const beforeHp = defender.hp;
    const available =
      move.effects.rule === "false-swipe"
        ? Math.max(0, beforeHp - 1)
        : beforeHp;
    const damage = hurt(defender, Math.min(available, breakdown.damage));
    result.damage += damage;
    result.calculatedDamage += breakdown.damage;
    result.critical ||= Boolean(critical);
    result.hits.push({ breakdown, beforeHp, afterHp: defender.hp });
    if (damage) {
      target.timesHit += 1;
      target.receivedDamage += damage;
      target.receivedPhysical ||= breakdown.category === "physical";
      target.damagedRound = combat.round;
      if (move.effects.drain) {
        const heal = Math.min(
          getStats(attacker).hp - attacker.hp,
          Math.max(1, Math.round(damage * move.effects.drain)),
        );
        attacker.hp += heal;
        result.healing += heal;
      }
      if (
        target.status === "frz" &&
        (breakdown.moveType === 10 || move.effects.thawsTarget)
      ) {
        clearStatus(target);
        note(targetSide, "얼음이 녹았습니다.");
      }
    }
    for (const effect of move.effects.secondary ?? []) {
      const affected = effect.self ? side : targetSide,
        state = combat[affected],
        pokemon = effect.self ? attacker : defender;
      if (!pokemon.hp || !chance(random, effect.chance)) continue;
      const status =
        effect.status ??
        (effect.randomStatuses
          ? effect.randomStatuses[random(effect.randomStatuses.length)]
          : undefined);
      if (
        status &&
        inflictStatus(
          pokemon,
          state,
          status,
          random,
          [source, target].some(
            (s) =>
              s.locked && movesById[s.locked.moveId].effects.lock === "uproar",
          ),
        )
      )
        note(affected, `${STATUS_NAMES[status]} 상태가 되었습니다.`);
      if (effect.boosts) boost(affected, effect.boosts);
      switch (effect.volatile) {
        case "flinch":
          if (side === "defender") {
            state.flinch = true;
            note(affected, "풀죽었습니다.");
          }
          break;
        case "confusion":
          if (!state.confusion) {
            state.confusion = random(4) + 2;
            note(affected, "혼란에 빠졌습니다.");
          }
          break;
        case "partiallytrapped":
          if (!state.binding) {
            state.binding = random(2) + 4;
            note(affected, "조이기 피해가 지속됩니다.");
          }
          break;
        case "smackdown":
          state.grounded = true;
          if (
            state.charging &&
            movesById[state.charging].effects.charge === "air"
          )
            state.charging = null;
          break;
        case "glaiverush":
          state.exposed = true;
          break;
        case "saltcure":
          state.saltCure = true;
          note(affected, "소금절이 피해가 지속됩니다.");
          break;
        case "syrupbomb":
          state.syrup = 3;
          break;
        case "sparklingaria":
          if (state.status === "brn") {
            clearStatus(state);
            note(affected, "화상이 나았습니다.");
          }
          break;
        case "uproar":
          break; // The shared lock below handles the three-turn action.
      }
    }
  }
  if (move.effects.recoil && result.damage)
    result.recoil += hurt(
      attacker,
      Math.max(1, Math.round(result.damage * move.effects.recoil)),
    );
  if (move.effects.selfDamage)
    result.recoil += hurt(
      attacker,
      move.effects.selfDamage === "faint"
        ? attacker.hp
        : Math.max(
            1,
            Math.round(
              getStats(attacker).hp /
                (move.effects.selfDamage === "quarter" ? 4 : 2),
            ),
          ),
    );
  if (attacker.hp) {
    if (move.effects.selfBoosts) boost(side, move.effects.selfBoosts);
    if (move.effects.recharge) source.recharge = true;
    if (move.effects.lock && !source.locked)
      source.locked = {
        moveId: move.id,
        remaining:
          move.effects.lock === "rampage"
            ? random(2) + 2
            : move.effects.lock === "rollout"
              ? 5
              : 3,
      };
    switch (move.effects.rule) {
      case "fell-stinger":
        if (!defender.hp) boost(side, { attack: 3 });
        break;
      case "remove-type":
        source.types = combatTypes(attacker, source).filter(
          (type) => type !== move.type,
        );
        break;
      case "clear-stages":
        for (const key of Object.keys(target.stages) as (keyof StatChanges)[])
          target.stages[key] = 0;
        note(targetSide, "능력치 변화가 사라졌습니다.");
        break;
      case "rapid-spin":
        source.binding = 0;
        break;
      case "plasma-fists":
        combat.plasma = true;
        break;
      case "throat-chop":
        target.throatChop = 2;
        note(targetSide, "2번의 행동 동안 소리 기술을 쓸 수 없습니다.");
        break;
    }
  }
  if (move.effects.lock === "uproar")
    for (const s of [source, target]) if (s.status === "slp") clearStatus(s);
  return finish();
}

export type ResidualResult = {
  side: BattleSide;
  beforeHp: number;
  afterHp: number;
  message: string;
};
/** Residual HP changes resolve for both sides before the caller judges the outcome. */
export function finishCombatRound(
  pokemon: Record<BattleSide, Pokemon>,
  combat: CombatState,
  emit?: (effect: ResidualResult) => void,
): ResidualResult[] {
  const results: ResidualResult[] = [];
  const recordEffect = (effect: ResidualResult) => {
    results.push(effect);
    emit?.(effect);
  };
  for (const side of ["defender", "attacker"] as const) {
    const p = pokemon[side],
      state = combat[side],
      maxHp = getStats(p).hp;
    const damage = (amount: number, label: string) => {
      if (!p.hp) return;
      const beforeHp = p.hp,
        value = hurt(p, Math.max(1, Math.floor(amount)));
      recordEffect({
        side,
        beforeHp,
        afterHp: p.hp,
        message: `${label} · ${value} 피해`,
      });
    };
    if (state.status === "brn") damage(maxHp / 16, "화상");
    if (state.status === "psn") damage(maxHp / 8, "독");
    if (state.status === "tox") {
      state.toxicCounter = Math.min(15, state.toxicCounter + 1);
      damage((maxHp * state.toxicCounter) / 16, "맹독");
    }
    if (state.binding) {
      damage(maxHp / 8, "조이기");
      state.binding -= 1;
    }
    if (state.saltCure)
      damage(
        maxHp /
          (combatTypes(p, state).some((type) => [9, 11].includes(type))
            ? 4
            : 8),
        "소금절이",
      );
    if (state.syrup) {
      changeStages(state, { speed: -1 });
      state.syrup -= 1;
      recordEffect({
        side,
        beforeHp: p.hp,
        afterHp: p.hp,
        message: "시럽으로 스피드 -1",
      });
    }
    state.flinch = false;
  }
  combat.plasma = false;
  combat.round += 1;
  return results;
}
