import { useState } from "react";
import type { BattleActionResult, DamageBreakdown } from "./combat-types";
import type { Move } from "./data-types";
import type { DamagePreview } from "./battle";
import { STAT_NAMES } from "./battle-actions";
import { Modal } from "./RulesDialog";
import styles from "./PokemonMarble.module.css";

export function DamageCalculation({ value }: { value: DamageBreakdown }) {
  return (
    <div className={styles.damageCalculation}>
      <dl>
        <div>
          <dt>기술 위력</dt>
          <dd>
            {value.powerLabel}
            {value.originalPower > 0 && value.powerLabel !== String(value.power)
              ? ` (기본 ${value.originalPower} → 적용 ${value.power})`
              : ""}
          </dd>
        </div>
        <div>
          <dt>레벨</dt>
          <dd>
            {value.level} · 레벨 계수 {value.levelFactor}
          </dd>
        </div>
        <div>
          <dt>{STAT_NAMES[value.offenseStat]}</dt>
          <dd>
            {value.offense} (적용 단계 {value.offenseStage > 0 ? "+" : ""}
            {value.offenseStage})
          </dd>
        </div>
        <div>
          <dt>{STAT_NAMES[value.defenseStat]}</dt>
          <dd>
            {value.defense} (적용 단계 {value.defenseStage > 0 ? "+" : ""}
            {value.defenseStage})
          </dd>
        </div>
        <div>
          <dt>보정</dt>
          <dd>
            자속 ×{value.stab} · 상성 ×{value.effectiveness} · 급소 ×
            {value.criticalMultiplier} · 기타 ×
            {Number(value.modifier.toFixed(3))}
          </dd>
        </div>
      </dl>
      {value.fixed ? (
        <p>
          {value.powerLabel} = {value.damage} 피해. 고정 피해에는 방어·자속·급소
          배율을 곱하지 않습니다.
        </p>
      ) : (
        <>
          <p>
            기초 피해 = ⌊⌊{value.levelFactor} × {value.power} × {value.offense}{" "}
            ÷ {value.defense}⌋ ÷ 50⌋ + 2 = {value.baseDamage}
          </p>
          <p>
            최종 피해 = ⌊{value.baseDamage} × {value.stab} ×{" "}
            {value.effectiveness} × {value.criticalMultiplier} ×{" "}
            {Number(value.modifier.toFixed(3))}⌋ →{" "}
            <strong>{value.damage}</strong>
          </p>
          <small>
            ⌊ ⌋는 소수점 버림입니다. 타입 면역은 0, 그 외 명중 피해는 최소
            1입니다.
          </small>
        </>
      )}
    </div>
  );
}

export default function DamageDetails({
  preview,
  move,
  result,
  onClose,
}: {
  preview?: DamagePreview;
  move?: Move;
  result?: BattleActionResult;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`${result?.moveName ?? move?.name ?? "공격"} · 계산 상세`}
      onClose={onClose}
    >
      <div className={styles.damageDetails}>
        {preview && (
          <>
            <p>
              명중 시 예상 피해입니다. 급소는 제외하며, 방어·자속·상성은 이미
              반영했습니다.
            </p>
            {preview.maxHits > 1 && (
              <p>
                <strong>
                  예상 총 피해 {preview.minDamage}~{preview.maxDamage}
                </strong>{" "}
                · {preview.minHits}~{preview.maxHits}회<br />
                {preview.hitDamages.length > 1
                  ? `타격별 피해 ${preview.hitDamages.join(" / ")}`
                  : `타격당 피해 ${preview.damage}`}
                . 아래 계산은 첫 타격 기준입니다.
              </p>
            )}
            <DamageCalculation value={preview} />
          </>
        )}
        {move && (
          <p className={styles.subtle}>
            {[
              move.effects.charge ? "충전 후 공격" : "",
              move.effects.recharge ? "공격 후 다음 행동에 휴식" : "",
              move.effects.drain
                ? `실제 HP 감소량의 ${move.effects.drain * 100}% 흡수 (반올림)`
                : "",
              move.effects.recoil
                ? `실제 피해의 ${Math.round(move.effects.recoil * 100)}% 반동 (반올림)`
                : "",
              move.effects.selfDamage === "quarter"
                ? "최대 HP의 25% 반동 (반올림)"
                : "",
              move.effects.selfDamage === "half"
                ? "최대 HP의 50% 반동 (반올림)"
                : "",
              move.effects.selfDamage === "faint"
                ? "사용 후 자신도 행동불능"
                : "",
              move.effects.alwaysCritical ? "항상 급소에 맞는 기술" : "",
              move.effects.rule === "false-swipe"
                ? "상대 HP를 최소 1 남기도록 실제 감소량을 제한합니다."
                : "",
              move.effects.reason ?? "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {result && (
          <>
            <p>
              {result.message}
              {result.critical && <strong> · 급소에 맞았다!</strong>}
            </p>
            <p>
              <strong>
                계산 피해 {result.calculatedDamage} / 실제 HP 감소{" "}
                {result.damage}
              </strong>
              <br />
              상대 HP {result.beforeHp} → {result.afterHp}
            </p>
            <p>
              내 HP {result.sourceBeforeHp} → {result.sourceAfterHp} · 흡수 회복{" "}
              {result.healing} · 반동 {result.recoil}
            </p>
            {result.hits.map((hit, index) => (
              <details key={index} open={result.hits.length === 1}>
                <summary>
                  {index + 1}번째 타격 · {hit.beforeHp - hit.afterHp} 피해
                  {hit.breakdown.critical ? " · 급소" : ""}
                </summary>
                <DamageCalculation value={hit.breakdown} />
              </details>
            ))}
            {result.changes.length > 0 && (
              <ul>
                {result.changes.map((change, index) => (
                  <li key={index}>
                    {change.side === result.side ? "사용자" : "상대"} ·{" "}
                    {change.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function BattleHistoryButton({
  result,
  disabled,
}: {
  result: BattleActionResult | null;
  disabled?: boolean;
}) {
  const [opened, setOpened] = useState<BattleActionResult | null>(null);
  return (
    <>
      <button
        className={styles.historyButton}
        disabled={!result || disabled}
        aria-label="직전 배틀 행동 계산 기록"
        onClick={() => setOpened(result ? structuredClone(result) : null)}
      >
        배틀 기록
      </button>
      {opened && (
        <DamageDetails result={opened} onClose={() => setOpened(null)} />
      )}
    </>
  );
}
