import { useState } from "react";
import {
  getActingPlayer,
  getBattlePokemon,
  getBattleCommands,
  getBattleMovePreview,
  getBattleContext,
  hasForcedBattleAction,
  getStats,
} from "./engine";
import { movesById, speciesById, type Move } from "./pokemon-data";
import { getMoveUnavailableReason, type DamagePreview } from "./battle";
import DamageDetails from "./DamageDetails";
import { HealthBar, PokemonSprite, TypeBadge } from "./PokemonSprite";
import type { GameAction, GameState, Pokemon } from "./types";
import styles from "./PokemonMarble.module.css";
import { sortPartyByLevel } from "./party";
import { getCaptureChance } from "./progression";

export function PokemonChoice({
  pokemon,
  onClick,
  disabled,
  label,
}: {
  pokemon: Pokemon;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  const species = speciesById[pokemon.speciesId];
  return (
    <button
      className={styles.pokemonChoice}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${species.name} ${label}`}
    >
      <PokemonSprite speciesId={pokemon.speciesId} size={52} fit />
      <div>
        <strong>{species.name}</strong>
        <small>Lv. {pokemon.level}</small>
        <div className={styles.typeRow}>
          {species.types.map((type) => (
            <TypeBadge type={type} key={type} />
          ))}
        </div>
        <HealthBar hp={pokemon.hp} max={getStats(pokemon).hp} />
      </div>
      <span>{label}</span>
    </button>
  );
}

export default function BattlePanel({
  state,
  dispatch,
  compact = false,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
  compact?: boolean;
}) {
  const battle = state.battle!;
  const [details, setDetails] = useState<{
    move: Move;
    preview: DamagePreview;
  } | null>(null);
  const forced = hasForcedBattleAction(state);
  const actorId = getActingPlayer(state);
  const actorName =
    actorId === null ? "야생 포켓몬" : state.players[actorId].name;
  const attacker = getBattlePokemon(state, "attacker");
  const defender = getBattlePokemon(state, "defender");
  const choosing =
    state.phase === "choose-defender" || state.phase === "choose-attacker";
  const actingPokemon = battle.turn === "defender" ? defender : attacker;
  const targetPokemon = battle.turn === "defender" ? attacker : defender;
  const defendingName =
    battle.defenderOwner === null
      ? "야생"
      : state.players[battle.defenderOwner].name;
  const canThrow =
    state.phase === "attack" &&
    battle.kind === "wild" &&
    battle.turn === "attacker" &&
    !forced;
  const partyFull = state.players[state.activePlayer].party.length >= 6;

  return (
    <section
      className={`${styles.actionPanel} ${styles.battlePanel}`}
      aria-label="배틀"
    >
      <div className={styles.battleKicker}>
        <span>
          {battle.kind === "wild"
            ? "WILD ENCOUNTER"
            : battle.kind === "road"
              ? "ROAD CHALLENGE"
              : "TRAINER BATTLE"}
        </span>
        <span>1 VS 1</span>
      </div>
      {compact ? (
        <div className={styles.battleMatchup}>
          <strong>
            {attacker ? speciesById[attacker.speciesId].name : "나의 파트너"}{" "}
            <span>VS</span>{" "}
            {defender ? speciesById[defender.speciesId].name : "상대 파트너"}
          </strong>
          {targetPokemon && (
            <div className={styles.typeRow}>
              <small>상대 타입</small>
              {speciesById[targetPokemon.speciesId].types.map((type) => (
                <TypeBadge key={type} type={type} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.combatants}>
          {(["defender", "attacker"] as const).map((side, index) => {
            const pokemon = side === "defender" ? defender : attacker;
            const hit =
              battle.lastAttack !== null &&
              battle.lastAttack.side !== side &&
              battle.lastAttack.damage > 0;
            return (
              <div style={{ display: "contents" }} key={side}>
                {index === 1 && <span className={styles.vs}>VS</span>}
                <div
                  key={`${side}-${state.revision}`}
                  className={`${styles.combatant} ${state.phase === "attack" && battle.turn === side ? styles.activeCombatant : ""} ${hit ? styles.hit : ""}`}
                >
                  <small>
                    {side === "defender" ? "선공" : "후공"} ·{" "}
                    {side === "defender"
                      ? defendingName
                      : state.players[state.activePlayer].name}
                  </small>
                  {pokemon ? (
                    <>
                      <PokemonSprite speciesId={pokemon.speciesId} size={80} />
                      <strong>{speciesById[pokemon.speciesId].name}</strong>
                      <small>Lv. {pokemon.level}</small>
                      <div className={styles.typeRow}>
                        {speciesById[pokemon.speciesId].types.map((type) => (
                          <TypeBadge type={type} key={type} />
                        ))}
                      </div>
                      <HealthBar hp={pokemon.hp} max={getStats(pokemon).hp} />
                    </>
                  ) : (
                    <>
                      <div className={styles.emptyState}>?</div>
                      <strong>출전 대기</strong>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className={styles.actionCopy} aria-live="polite">
        <strong>{actorName}</strong>
        {choosing
          ? " · 출전할 포켓몬을 골라주세요."
          : actorId === null
            ? "이 공격을 준비하고 있습니다…"
            : " · 사용할 기술을 골라주세요."}
        {state.phase === "choose-attacker" && (
          <>
            <br />
            상대 포켓몬을 확인하고 유리한 파트너를 선택하세요.
          </>
        )}
      </p>
      {battle.lastAttack && (
        <p className={styles.attackNotice} key={state.revision} role="status">
          {battle.lastAttack.legacy
            ? "이전 버전 공격"
            : movesById[battle.lastAttack.moveId]?.name}{" "}
          · {battle.lastAttack.damage} 피해
          {battle.lastAttack.effectiveness > 1
            ? " · 효과가 굉장합니다!"
            : battle.lastAttack.effectiveness < 1
              ? " · 효과가 약합니다."
              : ""}
        </p>
      )}
      {choosing && actorId !== null && (
        <div className={styles.selectionList}>
          {sortPartyByLevel(state.players[actorId].party).map((pokemon) => (
            <PokemonChoice
              key={pokemon.id}
              pokemon={pokemon}
              disabled={pokemon.hp === 0}
              label="출전"
              onClick={() =>
                dispatch({ type: "CHOOSE_POKEMON", pokemonId: pokemon.id })
              }
            />
          ))}
        </div>
      )}
      {state.phase === "attack" && actingPokemon && targetPokemon && (
        <div
          className={`${styles.commandDeck} ${battle.kind === "wild" ? styles.wildCommandDeck : ""}`}
        >
          <div className={styles.moves}>
            {getBattleCommands(state).map((move) => {
              const preview = getBattleMovePreview(state, move.id);
              const unavailable = getMoveUnavailableReason(
                actingPokemon,
                targetPokemon,
                move,
                getBattleContext(state),
              );
              const damage =
                preview.minDamage === preview.maxDamage
                  ? String(preview.minDamage)
                  : `${preview.minDamage}~${preview.maxDamage}`;
              return (
                <div className={styles.moveCommand} key={move.id}>
                  <button
                    className={styles.moveButton}
                    disabled={actorId === null || forced || !!unavailable}
                    onClick={() =>
                      dispatch({ type: "ATTACK", moveId: move.id })
                    }
                    aria-label={`${move.name}, 위력 ${preview.powerLabel}, 예상 피해 ${damage}, 급소 제외${unavailable ? `, ${unavailable}` : ""}`}
                    title={
                      unavailable ??
                      "명중 시 예상 피해 · 방어, 자속, 상성 반영 · 급소 제외"
                    }
                  >
                    <span className={styles.moveHeading}>
                      <TypeBadge type={move.type} />
                      <strong>{move.name}</strong>
                    </span>
                    <small>
                      {forced
                        ? "진행 중인 행동을 마치는 중…"
                        : `위력 ${preview.powerLabel} · ${move.effects.charge ? "충전 후 " : "예상 "}피해 ${damage}`}
                    </small>
                    <small>
                      {preview.category === "physical" ? "물리" : "특수"} · 상성
                      ×{preview.effectiveness} ·{" "}
                      {preview.accuracy === null
                        ? "필중"
                        : `명중 ${Math.round(preview.accuracy)}%`}
                    </small>
                    {preview.maxHits > 1 && (
                      <small>
                        {preview.hitDamages.length > 1
                          ? `타격별 ${preview.hitDamages.join("/")}`
                          : `타격당 ${preview.damage}`}{" "}
                        ·{" "}
                        {preview.minHits === preview.maxHits
                          ? preview.maxHits
                          : `${preview.minHits}~${preview.maxHits}`}
                        회
                      </small>
                    )}
                  </button>
                  <button
                    className={styles.moveDetailsButton}
                    disabled={actorId === null || forced}
                    onClick={() => setDetails({ move, preview })}
                    aria-label={`${move.name} 계산 상세`}
                  >
                    계산
                    <br />
                    상세
                  </button>
                </div>
              );
            })}
          </div>
          {battle.kind === "wild" && battle.wild && (
            <button
              className={styles.captureButton}
              disabled={!canThrow || partyFull}
              onClick={() => dispatch({ type: "THROW_BALL" })}
              aria-label={
                partyFull
                  ? "파티가 가득 차 포획할 수 없습니다"
                  : `포켓볼 던지기, 성공률 ${Math.round(getCaptureChance(battle.wild, attacker?.level) * 100)}%`
              }
              title={
                partyFull
                  ? "파티 6칸이 모두 차서 포획할 수 없습니다. 센터에서 파티를 정리하세요."
                  : "출전 포켓몬의 레벨이 상대보다 높거나 상대 HP가 낮을수록 포획 확률이 높아집니다. 실패하면 상대가 공격합니다."
              }
            >
              <svg
                className={styles.ballIcon}
                viewBox="0 0 40 40"
                aria-hidden="true"
              >
                <circle cx="20" cy="20" r="17" fill="#fff9e9" />
                <path d="M3 20a17 17 0 0 1 34 0Z" fill="#e65f4e" />
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path d="M3 20h34" stroke="currentColor" strokeWidth="3" />
                <circle
                  cx="20"
                  cy="20"
                  r="6"
                  fill="#fff9e9"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
              <strong>포켓볼 던지기</strong>
              <small>
                {partyFull
                  ? "파티 가득 참"
                  : `성공률 ${Math.round(getCaptureChance(battle.wild, attacker?.level) * 100)}%`}
              </small>
            </button>
          )}
        </div>
      )}
      {details && (
        <DamageDetails {...details} onClose={() => setDetails(null)} />
      )}
    </section>
  );
}
