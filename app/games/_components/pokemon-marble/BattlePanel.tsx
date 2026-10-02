import {
  getActingPlayer,
  getBattlePokemon,
  getDamagePreview,
  getStats,
} from "./engine";
import { getAvailableMoves, movesById, speciesById } from "./pokemon-data";
import { HealthBar, PokemonSprite, TypeBadge } from "./PokemonSprite";
import type { GameAction, GameState, Pokemon } from "./types";
import styles from "./PokemonMarble.module.css";

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
              battle.lastAttack !== null && battle.lastAttack.side !== side;
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
          {movesById[battle.lastAttack.moveId].name} ·{" "}
          {battle.lastAttack.damage} 피해
          {battle.lastAttack.effectiveness > 1
            ? " · 효과가 굉장합니다!"
            : battle.lastAttack.effectiveness < 1
              ? " · 효과가 약합니다."
              : ""}
        </p>
      )}
      {choosing && actorId !== null && (
        <div className={styles.selectionList}>
          {state.players[actorId].party.map((pokemon) => (
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
        <div className={styles.moves}>
          {getAvailableMoves(actingPokemon.speciesId, actingPokemon.level).map(
            (move) => {
              const preview = getDamagePreview(
                actingPokemon,
                targetPokemon,
                move,
              );
              return (
                <button
                  key={move.id}
                  className={styles.moveButton}
                  disabled={actorId === null || preview.damage === 0}
                  onClick={() => dispatch({ type: "ATTACK", moveId: move.id })}
                  aria-label={`${move.name}, 예상 피해 ${preview.damage}`}
                >
                  <TypeBadge type={move.type} />
                  <strong>{move.name}</strong>
                  <small>
                    {move.category === "physical" ? "물리" : "특수"} · 위력{" "}
                    {move.power}
                  </small>
                  <small>
                    {preview.damage === 0
                      ? "효과 없음"
                      : `피해 ${preview.damage} · 상성 ×${preview.effectiveness}${preview.stab > 1 ? " · 자속" : ""}`}
                  </small>
                </button>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}
