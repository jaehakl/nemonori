import {
  speciesById,
  movesById,
  typeEffectiveness,
  getAvailableMoves,
  struggleMove,
} from "./pokemon-data";
import type { Move, BattleStat } from "./data-types";
import type { Pokemon, BattleSide } from "./types";
import {
  createCombatState,
  type CombatState,
  type CombatantState,
  type DamageBreakdown,
} from "./combat-types";

export type BattleContext = {
  combat?: CombatState;
  side?: BattleSide;
  critical?: boolean;
  hit?: number;
  fickleBoost?: boolean;
  faintedAllies?: number;
};

/** No IVs, EVs or natures: all players use the same species and level formula. */
export function getStats(pokemon: Pick<Pokemon, "speciesId" | "level">) {
  const base = speciesById[pokemon.speciesId].stats;
  const stat = (value: number) =>
    Math.floor((2 * value * pokemon.level) / 100) + 5;
  return {
    hp: Math.floor((2 * base.hp * pokemon.level) / 100) + pokemon.level + 10,
    attack: stat(base.attack),
    defense: stat(base.defense),
    specialAttack: stat(base.specialAttack),
    specialDefense: stat(base.specialDefense),
    speed: stat(base.speed),
  };
}
export const oppositeSide = (side: BattleSide): BattleSide =>
  side === "attacker" ? "defender" : "attacker";
export const stageMultiplier = (stage: number, accuracy = false) => {
  const base = accuracy ? 3 : 2;
  return stage >= 0 ? (base + stage) / base : base / (base - stage);
};
export const combatTypes = (pokemon: Pokemon, state: CombatantState) =>
  state.types ?? speciesById[pokemon.speciesId].types;
export function effectiveStat(
  pokemon: Pokemon,
  state: CombatantState,
  stat: Exclude<BattleStat, "accuracy" | "evasion">,
  stage = state.stages[stat],
) {
  const value = Math.max(
    1,
    Math.floor(getStats(pokemon)[stat] * stageMultiplier(stage)),
  );
  return stat === "speed" && state.status === "par"
    ? Math.max(1, Math.floor(value / 2))
    : value;
}
export function getForcedMove(state: CombatantState): number | null {
  return (
    state.charging ??
    state.locked?.moveId ??
    (state.recharge ? state.lastMove : null)
  );
}
export function getMoveUnavailableReason(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  context: BattleContext = {},
): string | null {
  const combat = context.combat ?? createCombatState(),
    side = context.side ?? "attacker";
  const source = combat[side],
    target = combat[oppositeSide(side)],
    forced = getForcedMove(source);
  if (forced !== null && forced !== move.id)
    return "진행 중인 행동을 먼저 마쳐야 합니다.";
  if (move.effects.support === "excluded")
    return move.effects.reason ?? "지원하지 않는 기술입니다.";
  if (source.throatChop && move.effects.sound)
    return "지옥찌르기로 소리 기술을 사용할 수 없습니다.";
  switch (move.effects.rule) {
    case "dream-eater":
      if (target.status !== "slp") return "상대가 잠들어 있어야 합니다.";
      break;
    case "snore":
      if (source.status !== "slp")
        return "잠들어 있을 때만 사용할 수 있습니다.";
      break;
    case "no-repeat":
      if (source.lastMove === move.id) return "연속으로 사용할 수 없습니다.";
      break;
    case "first-action":
      if (source.actions > 0) return "첫 행동에서만 사용할 수 있습니다.";
      break;
    case "false-swipe":
      if (defender.hp <= 1) return "상대 HP가 1이라 더 줄일 수 없습니다.";
      break;
    case "remove-type":
      if (!combatTypes(attacker, source).includes(move.type!))
        return "해당 타입을 가지고 있어야 합니다.";
      break;
    case "comeuppance":
      if (source.receivedDamage === 0)
        return "직전 상대 행동에서 받은 피해가 없습니다.";
      break;
    case "shell-trap":
      if (!source.receivedPhysical || !source.receivedDamage)
        return "직전 상대 행동에서 물리 공격을 받아야 합니다.";
      break;
    case "focus-punch":
      if (source.receivedDamage > 0)
        return "직전 상대 공격으로 집중이 끊겼습니다.";
      break;
    case "last-resort": {
      const others = getAvailableMoves(
        attacker.speciesId,
        attacker.level,
      ).filter((m) => m.id !== move.id);
      if (
        !others.length ||
        others.some((m) => !source.usedMoves.includes(m.id))
      )
        return "다른 기술을 모두 사용한 뒤 사용할 수 있습니다.";
      break;
    }
  }
  if (getDamagePreview(attacker, defender, move, context).effectiveness === 0)
    return "상대에게 효과가 없습니다.";
  return null;
}
export function getBattleMoves(
  attacker: Pokemon,
  defender: Pokemon,
  context: BattleContext = {},
): Move[] {
  const source = context.combat?.[context.side ?? "attacker"],
    forced = source ? getForcedMove(source) : null;
  if (forced !== null) return [movesById[forced]];
  const learned = getAvailableMoves(attacker.speciesId, attacker.level);
  return learned.some(
    (move) => !getMoveUnavailableReason(attacker, defender, move, context),
  )
    ? learned
    : [...learned, struggleMove];
}
function resolvePower(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  source: CombatantState,
  target: CombatantState,
  context: BattleContext,
) {
  const power = move.power;
  switch (move.effects.rule) {
    case "acrobatics":
      return power * 2;
    case "hp-power":
      return Math.max(
        1,
        Math.floor((power * attacker.hp) / getStats(attacker).hp),
      );
    case "brine":
      return defender.hp <= getStats(defender).hp / 2 ? power * 2 : power;
    case "hex":
      return target.status ? power * 2 : power;
    case "poison-double":
      return ["psn", "tox"].includes(target.status ?? "") ? power * 2 : power;
    case "facade":
      return ["brn", "psn", "tox", "par"].includes(source.status ?? "")
        ? power * 2
        : power;
    case "retaliation":
      return source.receivedDamage > 0 ? power * 2 : power;
    case "payback":
      return context.side === "attacker" ? power * 2 : power;
    case "moving-first":
      return context.side === "defender" ? power * 2 : power;
    case "round":
      return context.side === "attacker" && target.lastMove === move.id
        ? power * 2
        : power;
    case "fusion":
      return context.side === "attacker" &&
        target.lastMove === (move.id === 558 ? 559 : 558)
        ? power * 2
        : power;
    case "assurance":
      return target.damagedRound === context.combat?.round ? power * 2 : power;
    case "stomping-tantrum":
      return source.lastFailed ? power * 2 : power;
    case "boost-power":
      return (
        power +
        20 *
          Object.values(source.stages).reduce(
            (sum, n) => sum + Math.max(0, n),
            0,
          )
      );
    case "rage-fist":
      return Math.min(350, 50 + 50 * source.timesHit);
    case "last-respects":
      return power + 50 * (context.faintedAllies ?? 0);
    case "fury-cutter":
      return (
        power *
        2 ** Math.min(source.lastMove === move.id ? source.consecutive : 0, 2)
      );
    case "echoed-voice":
      return (
        power *
        Math.min((source.lastMove === move.id ? source.consecutive : 0) + 1, 5)
      );
    case "triple-kick":
      return power * (context.hit ?? 1);
    case "fickle-beam":
      return context.fickleBoost ? power * 2 : power;
  }
  if (move.effects.lock === "rollout")
    return (
      power *
      2 ** Math.min(source.lastMove === move.id ? source.consecutive : 0, 4)
    );
  return power;
}

/** Labels distinguish conditional calculations from a literal base power. */
const POWER_CONDITIONS: Record<string, string> = {
  "hp-power": "남은 HP 비례",
  brine: "상대 HP 절반 이하 시 2배",
  hex: "상대 상태이상 시 2배",
  "poison-double": "상대 독 상태 시 2배",
  facade: "내 상태이상 시 2배",
  retaliation: "직전 피격 시 2배",
  payback: "후공 시 2배",
  "moving-first": "선공 시 2배",
  round: "앞선 돌림노래 사용 시 2배",
  fusion: "앞선 합체 기술 사용 시 2배",
  assurance: "이번 라운드 피격 시 2배",
  "stomping-tantrum": "직전 실패 시 2배",
  "boost-power": "능력치 상승 단계 비례",
  "rage-fist": "피격 횟수 비례",
  "last-respects": "쓰러진 동료 수 비례",
  "fury-cutter": "연속 사용 시 증가",
  "echoed-voice": "연속 사용 시 증가",
  "triple-kick": "타격마다 증가",
  "fickle-beam": "30% 확률로 2배",
  ruination: "현재 HP의 절반",
  comeuppance: "받은 피해 ×1.5",
};
export type DamagePreview = DamageBreakdown & {
  minDamage: number;
  maxDamage: number;
  minHits: number;
  maxHits: number;
  hitDamages: number[];
};

export function getDamagePreview(
  attacker: Pokemon,
  defender: Pokemon,
  moveOrId: Move | number,
  context: BattleContext = {},
): DamagePreview {
  const move = typeof moveOrId === "number" ? movesById[moveOrId] : moveOrId;
  if (!move) throw new Error("알 수 없는 기술입니다.");
  const combat = context.combat ?? createCombatState(),
    side = context.side ?? "attacker";
  const source = combat[side],
    target = combat[oppositeSide(side)],
    rule = move.effects.rule;
  const critical =
    Boolean(context.critical) &&
    !["ruination", "comeuppance"].includes(rule ?? "");
  const category =
    rule === "photon-geyser" &&
    effectiveStat(attacker, source, "attack") >
      effectiveStat(attacker, source, "specialAttack")
      ? "physical"
      : move.category;
  const offenseStat =
    move.effects.offensiveStat ??
    (category === "special" ? "specialAttack" : "attack");
  const defenseStat =
    move.effects.defensiveStat ??
    (category === "special" ? "specialDefense" : "defense");
  const offenseSource = move.effects.targetOffense ? target : source;
  const offensePokemon = move.effects.targetOffense ? defender : attacker;
  const offenseStage = critical
    ? Math.max(0, offenseSource.stages[offenseStat])
    : offenseSource.stages[offenseStat];
  const defenseStage = move.effects.ignoreDefenseStages
    ? 0
    : critical
      ? Math.min(0, target.stages[defenseStat])
      : target.stages[defenseStat];
  const offense = effectiveStat(
    offensePokemon,
    offenseSource,
    offenseStat,
    offenseStage,
  );
  const defense = effectiveStat(defender, target, defenseStat, defenseStage);
  let moveType =
    rule === "revelation-dance"
      ? (combatTypes(attacker, source)[0] ?? null)
      : move.type;
  if (combat.plasma && moveType === 1) moveType = 13;
  const targetTypes = combatTypes(defender, target);
  let effectiveness = typeEffectiveness(moveType, targetTypes);
  if (rule === "freeze-dry")
    effectiveness = targetTypes.reduce(
      (n, type) => n * (type === 11 ? 2 : typeEffectiveness(moveType, [type])),
      1,
    );
  if (rule === "flying-press")
    effectiveness *= typeEffectiveness(3, targetTypes);
  if (move.id === 614 || (target.grounded && moveType === 5))
    effectiveness = typeEffectiveness(
      moveType,
      targetTypes.filter((type) => type !== 3),
    );
  const stab =
    moveType !== null && combatTypes(attacker, source).includes(moveType)
      ? 1.5
      : 1;
  const power = resolvePower(attacker, defender, move, source, target, {
    ...context,
    side,
    combat,
  });
  const levelFactor = Math.floor((2 * attacker.level) / 5) + 2;
  let baseDamage =
    Math.floor(Math.floor((levelFactor * power * offense) / defense) / 50) + 2;
  const fixed = rule === "ruination" || rule === "comeuppance";
  if (rule === "ruination")
    baseDamage = Math.max(1, Math.floor(defender.hp / 2));
  if (rule === "comeuppance")
    baseDamage = Math.floor(source.receivedDamage * 1.5);
  let modifier =
    source.status === "brn" && category === "physical" && rule !== "facade"
      ? 0.5
      : 1;
  if (target.exposed) modifier *= 2;
  if (rule === "super-effective" && effectiveness > 1) modifier *= 4 / 3;
  if (
    target.charging &&
    (([16, 239].includes(move.id) &&
      movesById[target.charging].effects.charge === "air") ||
      (move.id === 89 && target.charging === 91) ||
      ([57, 250].includes(move.id) && target.charging === 291))
  )
    modifier *= 2;
  const damage =
    effectiveness === 0
      ? 0
      : fixed
        ? baseDamage
        : Math.max(
            1,
            Math.floor(
              baseDamage *
                stab *
                effectiveness *
                (critical ? 1.5 : 1) *
                modifier,
            ),
          );
  const accuracyStage = Math.max(
    -6,
    Math.min(
      6,
      source.stages.accuracy -
        (move.effects.ignoreEvasion ? 0 : target.stages.evasion),
    ),
  );
  const accuracy =
    move.accuracy === null
      ? null
      : Math.min(100, move.accuracy * stageMultiplier(accuracyStage, true));
  const [requiredHits, maxHits] = move.effects.hits ?? [1, 1];
  const minHits = move.effects.perHitAccuracy ? 1 : requiredHits;
  const previewDamage =
    rule === "false-swipe"
      ? Math.min(damage, Math.max(0, defender.hp - 1))
      : damage;
  let hitDamages = [previewDamage];
  let minDamage = previewDamage * minHits,
    maxDamage = previewDamage * maxHits;
  if (rule === "triple-kick" && context.hit === undefined) {
    hitDamages = [1, 2, 3].map(
      (hit) =>
        getDamagePreview(attacker, defender, move, { ...context, hit }).damage,
    );
    minDamage = hitDamages[0];
    maxDamage = hitDamages.reduce((sum, value) => sum + value, 0);
  }
  if (rule === "fickle-beam" && !context.fickleBoost)
    maxDamage = getDamagePreview(attacker, defender, move, {
      ...context,
      fickleBoost: true,
    }).damage;
  return {
    level: attacker.level,
    levelFactor,
    originalPower: move.power,
    power,
    powerLabel:
      POWER_CONDITIONS[rule ?? ""] ??
      (move.effects.lock === "rollout"
        ? "연속 사용 시 증가"
        : String(move.power)),
    category,
    offenseStat,
    defenseStat,
    offense,
    defense,
    offenseStage,
    defenseStage,
    baseDamage,
    stab: fixed ? 1 : stab,
    effectiveness,
    critical,
    criticalMultiplier: critical ? 1.5 : 1,
    modifier: fixed ? 1 : modifier,
    damage,
    fixed,
    accuracy,
    moveType,
    minDamage,
    maxDamage,
    minHits,
    maxHits,
    hitDamages,
  };
}
export function calculateDamage(
  attacker: Pokemon,
  defender: Pokemon,
  moveOrId: Move | number,
  context?: BattleContext,
): number {
  return getDamagePreview(attacker, defender, moveOrId, context).damage;
}
