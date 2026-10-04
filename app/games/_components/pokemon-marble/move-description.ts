import type { Move, MoveEffect, StatChanges } from "./data-types";
import { STAT_NAMES, STATUS_NAMES } from "./battle-actions";

const POWER_RULES: Record<string, string> = {
  "hp-power": "남은 HP 비례",
  brine: "상대 HP 절반 이하 시 2배",
  hex: "상대 상태이상 시 2배",
  "poison-double": "상대 독 상태 시 2배",
  facade: "내 화상·독·마비 시 2배",
  retaliation: "직전 피격 시 2배",
  payback: "후공 시 2배",
  "moving-first": "선공 시 2배",
  round: "상대가 먼저 돌림노래 사용 시 2배",
  fusion: "상대가 먼저 짝인 합체 기술 사용 시 2배",
  assurance: "이번 라운드에 상대가 피해를 받았으면 2배",
  "stomping-tantrum": "직전 행동 실패 시 2배",
  "boost-power": "능력치 상승 단계에 따라 증가",
  "rage-fist": "피격 횟수에 따라 증가 (최대 350)",
  "last-respects": "쓰러진 동료 수에 따라 증가",
  "fury-cutter": "연속 사용 시 증가",
  "echoed-voice": "연속 사용 시 증가",
  "triple-kick": "타격마다 증가",
  "fickle-beam": "30% 확률로 2배",
};

const RULE_EFFECTS: Record<string, string> = {
  acrobatics: "도구가 없는 이 게임에서는 위력 2배",
  "dream-eater": "잠든 상대에게만 사용 가능",
  snore: "자신이 잠들었을 때만 사용 가능",
  "no-repeat": "연속 사용 불가",
  "first-action": "배틀 첫 행동에만 사용 가능",
  "false-swipe": "상대 HP를 최소 1 남김",
  "remove-type": "자신에게 해당 타입이 있어야 하며, 사용 후 그 타입을 잃음",
  comeuppance: "직전 상대 행동에서 피해를 받아야 사용 가능",
  "shell-trap": "직전 상대 행동에서 물리 피해를 받아야 사용 가능",
  "focus-punch": "직전 상대 공격으로 피해를 받으면 실패",
  "last-resort": "현재 배운 다른 기술을 모두 사용한 뒤 사용 가능",
  "clear-stages": "상대의 능력치 변화를 초기화",
  "super-effective": "효과가 굉장할 때 피해를 추가로 4/3배",
  "fell-stinger": "상대를 쓰러뜨리면 자신의 공격 3단계 상승",
  "flying-press": "격투와 비행 타입 상성을 함께 적용",
  "freeze-dry": "물 타입에도 효과가 굉장함",
  delayed: "2라운드 뒤 피해를 줌",
  "glaive-rush": "다음 행동까지 자신이 받는 피해 2배",
  "photon-geyser": "자신의 공격이 특수공격보다 높으면 물리로 계산",
  "plasma-fists": "이번 라운드 노말 기술을 전기 타입으로 변경",
  "rapid-spin": "자신의 속박 상태 해제",
  "revelation-dance": "자신의 첫 번째 타입으로 공격",
  "salt-cure": "매 라운드 소금절이 피해 (물·강철 타입은 더 큰 피해)",
  "smack-down": "상대를 땅에 떨어뜨려 땅 기술이 닿게 함",
  "sparkling-aria": "상대의 화상 해제",
  "spectral-thief": "공격 전에 상대의 상승한 능력치를 빼앗음",
  "syrup-bomb": "3라운드 동안 상대 스피드 감소",
  "throat-chop": "상대의 소리 기술을 2라운드 차단",
};

const VOLATILE_EFFECTS: Record<string, string> = {
  flinch: "풀죽음", confusion: "혼란", partiallytrapped: "속박",
  smackdown: "땅으로 떨어뜨림", glaiverush: "다음 행동까지 받는 피해 2배",
  saltcure: "소금절이", syrupbomb: "스피드 감소", sparklingaria: "화상 해제",
  uproar: "소란으로 수면 방지",
};

function describeBoosts(boosts: StatChanges): string {
  return Object.entries(boosts).map(([stat, amount]) =>
    `${STAT_NAMES[stat as keyof StatChanges]} ${Math.abs(amount!)}단계 ${amount! > 0 ? "상승" : "하락"}`,
  ).join(", ");
}

function describeSecondary(effect: MoveEffect): string {
  const changes = [
    effect.status ? STATUS_NAMES[effect.status] : "",
    effect.randomStatuses ? `${effect.randomStatuses.map((status) => STATUS_NAMES[status]).join("·")} 중 하나` : "",
    effect.volatile ? VOLATILE_EFFECTS[effect.volatile] ?? "추가 상태 효과" : "",
    effect.boosts ? describeBoosts(effect.boosts) : "",
  ].filter(Boolean).join(", ");
  return `${effect.chance}% 확률로 ${effect.self ? "자신" : "상대"}에게 ${changes}`;
}

/** Compare a move without inventing a target or showing conditional power as zero. */
export function getMovePowerLabel(move: Move): string {
  if (move.effects.rule === "ruination") return "고정 피해 · 상대 현재 HP의 절반";
  if (move.effects.rule === "comeuppance") return "고정 피해 · 직전에 받은 피해 × 1.5";
  const condition = POWER_RULES[move.effects.rule ?? ""] ??
    (move.effects.lock === "rollout" ? "연속 사용 시 증가" : null);
  return condition ? `기본 ${move.power} · ${condition}` : String(move.power);
}

export function getMoveEffectSummary(move: Move): string[] {
  const effects = move.effects;
  const summaries: string[] = [];
  if (effects.hits) summaries.push(`${effects.hits[0] === effects.hits[1] ? effects.hits[0] : effects.hits.join("~")}회 연속 공격${effects.perHitAccuracy ? " · 매 타격 명중 판정" : ""}`);
  if (effects.charge) summaries.push(`한 턴 충전 후 공격${effects.charge !== "normal" ? " · 충전 중 대부분의 공격을 피함" : ""}`);
  if (effects.chargeBoosts) summaries.push(`충전 시 자신 ${describeBoosts(effects.chargeBoosts)}`);
  if (effects.recharge) summaries.push("공격 후 다음 행동에 휴식");
  if (effects.lock) summaries.push(effects.lock === "rollout" ? "최대 5회 연속 사용" : effects.lock === "rampage" ? "2~3회 연속 사용 후 혼란" : "3회 연속 사용하며 수면 방지");
  if (effects.drain) summaries.push(`상대의 실제 HP 감소량 ${Math.round(effects.drain * 100)}% 회복`);
  if (effects.recoil) summaries.push(`실제 피해 ${Math.round(effects.recoil * 100)}% 반동`);
  if (effects.selfDamage) summaries.push(effects.selfDamage === "faint" ? "사용 후 자신도 행동불능" : `최대 HP의 ${effects.selfDamage === "half" ? 50 : 25}% 반동`);
  if (effects.crash) summaries.push("공격 실패 시 최대 HP의 50% 반동");
  if (effects.alwaysCritical) summaries.push("항상 급소");
  else if (effects.criticalStage) summaries.push("급소에 맞기 쉬움");
  if (effects.secondary) summaries.push(...effects.secondary.map(describeSecondary));
  if (effects.selfBoosts) summaries.push(`자신 ${describeBoosts(effects.selfBoosts)}`);
  if (effects.offensiveStat) summaries.push("자신의 방어로 공격력을 계산");
  if (effects.defensiveStat) summaries.push("상대의 방어로 피해를 계산");
  if (effects.targetOffense) summaries.push("상대의 공격 능력치로 피해를 계산");
  if (effects.ignoreDefenseStages) summaries.push("상대의 방어 능력치 변화 무시");
  if (effects.ignoreEvasion) summaries.push("상대의 회피율 변화 무시");
  if (effects.defrost) summaries.push("자신의 얼음 상태 해제");
  if (effects.thawsTarget) summaries.push("상대의 얼음 상태 해제");
  if (effects.rule && RULE_EFFECTS[effects.rule]) summaries.push(RULE_EFFECTS[effects.rule]);
  if (effects.reason) summaries.push(effects.reason);
  return [...new Set(summaries)].length ? [...new Set(summaries)] : ["추가 효과 없음"];
}
