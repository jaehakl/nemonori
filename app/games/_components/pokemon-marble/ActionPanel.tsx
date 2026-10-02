import { hasExtraRoll, transition } from "./engine";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import { speciesById } from "./pokemon-data";
import { PokemonSprite, TypeBadge } from "./PokemonSprite";
import BattlePanel from "./BattlePanel";
import type { GameAction, GameState } from "./types";
import PokemonCard from "./PokemonCard";
import styles from "./PokemonMarble.module.css";

const dieFaces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function ActionPanel({
  state,
  dispatch,
  onRestart,
  compactBattle = false,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
  onRestart: () => void;
  compactBattle?: boolean;
}) {
  const player = state.players[state.activePlayer];
  const allowed = (action: GameAction) => transition(state, action) !== state;
  const canStartExchange = allowed({ type: "START_EXCHANGE" });
  const exchangeAvailable = state.phase === "center" || state.phase === "road" || canStartExchange;
  const guardian = state.roads[player.position];
  const storedPokemon = state.phase === "center" ? player.box : guardian ? [guardian.pokemon] : [];
  const endButton = (
    <button
      className={`${styles.primaryButton} ${styles.fullWidth} ${styles.turnEnd}`}
      onClick={() => dispatch({ type: "END_TURN" })}
    >
      {hasExtraRoll(state) ? "한 번 더 굴리기 →" : "턴 마치기 →"}
    </button>
  );

  if (["choose-defender", "choose-attacker", "attack"].includes(state.phase))
    return (
      <BattlePanel state={state} dispatch={dispatch} compact={compactBattle} />
    );

  if (state.phase === "finished")
    return (
      <section className={styles.actionPanel}>
        <div className={styles.winner}>
          <span>🏆</span>
          <span className={styles.eyebrow}>ALL ROADS ARE YOURS</span>
          <h2>
            {state.players[state.winner!].name}
            <br />
            우승!
          </h2>
          <div className={styles.typeRow}>
            {state.players[state.winner!].party
              .filter((pokemon) => pokemon.hp > 0)
              .map((pokemon) => (
                <PokemonSprite
                  key={pokemon.id}
                  speciesId={pokemon.speciesId}
                  size={72}
                />
              ))}
          </div>
          <p>
            {state.turn}번의 턴을 지나
            <br />
            모든 도로 {BOARD_TILES.filter((tile) => tile === "road").length}칸을 차지했습니다!
          </p>
          <button className={styles.primaryButton} onClick={onRestart}>
            새로운 모험
          </button>
        </div>
      </section>
    );

  if (state.phase === "evolution" && state.evolution) {
    const evolution = state.evolution;
    return (
      <section className={styles.actionPanel}>
        <span className={styles.eyebrow}>A NEW CHAPTER</span>
        <h3>진화의 순간!</h3>
        <p className={styles.actionCopy}>
          {state.players[evolution.ownerId].name}, 진화할 모습을 선택하세요.
          현재 체력은 회복되지 않습니다.
        </p>
        <div className={styles.selectionList}>
          {evolution.options.map((id) => (
            <button
              className={styles.pokemonChoice}
              key={id}
              onClick={() =>
                dispatch({ type: "CHOOSE_EVOLUTION", speciesId: id })
              }
            >
              <PokemonSprite speciesId={id} size={64} />
              <div>
                <strong>{speciesById[id].name}</strong>
                <div className={styles.typeRow}>
                  {speciesById[id].types.map((type) => (
                    <TypeBadge type={type} key={type} />
                  ))}
                </div>
              </div>
              <span>진화 →</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (state.phase === "capture" && state.battle?.wild) {
    const wild = state.battle.wild;
    const species = speciesById[wild.speciesId];
    return (
      <section className={styles.actionPanel}>
        <span className={styles.eyebrow}>A NEW FRIEND</span>
        <div className={styles.captureHero}>
          <PokemonSprite speciesId={wild.speciesId} size={120} />
          <h3>{species.name}</h3>
          <div className={styles.typeRow}>
            {species.types.map((type) => (
              <TypeBadge type={type} key={type} />
            ))}
          </div>
          <span className={styles.subtle}>
            Lv. {wild.level} · HP 0 · 행동불능
          </span>
        </div>
        <p className={styles.actionCopy}>
          {player.party.length >= 6
            ? "파티 6칸이 모두 차서 포획할 수 없습니다. 포켓몬센터에서 파티를 정리하세요."
            : "포획하면 파티에 합류합니다. 포켓몬센터에서 회복해야 배틀할 수 있습니다."}
        </p>
        <div className={styles.buttonRow}>
          <button
            className={styles.primaryButton}
            disabled={player.party.length >= 6}
            onClick={() => dispatch({ type: "CAPTURE", capture: true })}
          >
            포획하기
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => dispatch({ type: "CAPTURE", capture: false })}
          >
            놓아주기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.actionPanel}>
      {(state.phase === "roll" ||
        state.phase === "moving" ||
        state.phase === "turn-end") && (
        <>
          <div
            className={styles.dicePair}
            aria-label={
              state.dice
                ? `주사위 ${state.dice[0]}, ${state.dice[1]}`
                : "주사위 대기"
            }
          >
            {[0, 1].map((index) => (
              <span className={styles.die} key={index}>
                {dieFaces[state.dice?.[index] ?? index + 1]}
              </span>
            ))}
          </div>
          {state.phase === "turn-end" && player.restTurnsRemaining > 0 && (
            <p role="status">남은 휴식 {player.restTurnsRemaining}턴</p>
          )}
          {state.phase === "roll" ? (
            <button
              className={`${styles.primaryButton} ${styles.fullWidth}`}
              onClick={() => dispatch({ type: "ROLL" })}
            >
              주사위 굴리기 <span>⚄</span>
            </button>
          ) : state.phase === "turn-end" ? (
            !canStartExchange && endButton
          ) : (
            <button
              className={`${styles.secondaryButton} ${styles.fullWidth}`}
              disabled
            >
              이동 중…
            </button>
          )}
        </>
      )}

      {exchangeAvailable && (
        <>
          <button className={styles.secondaryButton}
            disabled={state.exchangeActive && player.party.length > 6}
            onClick={() => dispatch({ type: state.exchangeActive ? "END_EXCHANGE" : "START_EXCHANGE" })}>
            {state.exchangeActive ? "교환 끝내기" : "교환 시작하기"}
          </button>
          {player.party.length > 6 && <p role="status">한 마리를 옮겨 6마리로 정리하세요</p>}
          <div className={styles.centerSection}>
            <h4>{state.phase === "center" ? `박스 · ${player.box.length}` : "현재 수비"}</h4>
            <div className={styles.partyCards}>
              {storedPokemon.map((pokemon) => {
                const action: GameAction = state.phase === "center"
                  ? { type: "CENTER_TRANSFER", pokemonId: pokemon.id, to: "party" }
                  : { type: "RETRIEVE" };
                return <PokemonCard key={pokemon.id} pokemon={pokemon} destination="파티로 이동"
                  onClick={allowed(action) ? () => dispatch(action) : undefined} />;
              })}
            </div>
          </div>
          {!state.exchangeActive && endButton}
        </>
      )}
    </section>
  );
}

/** One persistent panel spans the roll, every step, and the gaps between steps. */
export function MovementPanel({
  state,
  rolling,
  busy,
  notice,
  onSkip,
}: {
  state: GameState;
  rolling: boolean;
  busy: boolean;
  notice?: string;
  onSkip: () => void;
}) {
  const player = state.players[state.activePlayer];
  const total = state.dice ? state.dice[0] + state.dice[1] : 0;
  const remaining = state.movement?.remaining ?? 0;
  return (
    <section className={`${styles.actionPanel} ${styles.movementPanel}`} aria-label="주사위와 이동">
      <div className={styles.turnHeading}>
        <h3>{player.name}</h3>
        <span className={styles.turnBadge}>TURN {state.turn}</span>
      </div>
      <p className={styles.actionCopy} role="status">
        {notice ?? (rolling ? "주사위를 굴리고 있어요!" : `${total}칸 이동 · 앞으로 ${remaining}칸`)}
      </p>
      {!rolling && hasExtraRoll(state) && <p className={styles.actionCopy}>더블! 도착 칸의 행동을 마치면 한 번 더 굴립니다.</p>}
      <progress aria-label="이동 진행" max={total || 1} value={rolling ? 0 : total - remaining} />
      <button className={`${styles.secondaryButton} ${styles.fullWidth}`} disabled={!busy} onClick={onSkip}>
        연출 건너뛰기 →
      </button>
    </section>
  );
}

export function PartySummary({ state, dispatch, blocked = false }: { state: GameState; dispatch?: (action: GameAction) => void; blocked?: boolean }) {
  const player = state.players[state.activePlayer];
  const ownedRoads = state.roads.filter((guardian) => guardian?.ownerId === player.id).length;
  const roadCount = BOARD_TILES.filter((tile) => tile === "road").length;
  return (
    <section
      className={styles.partyPanel}
      style={{ "--player-color": PLAYER_COLORS[player.id] } as React.CSSProperties}
      aria-label={`${player.name}의 파티`}
    >
      <div className={styles.playerCardHeader}>
        <span className={styles.playerDot}>{player.id + 1}</span>
        <strong>{player.name}의 파티 · {player.party.length}/6</strong>
        <small>도로 {ownedRoads}/{roadCount}</small>
        {player.restTurnsRemaining > 0 && <small>휴식 {player.restTurnsRemaining}턴</small>}
      </div>
      <div className={styles.partyCards} tabIndex={0} aria-label="파티 카드 목록">
        {player.party.map((pokemon) => {
          const action: GameAction = state.phase === "center"
            ? { type: "CENTER_TRANSFER", pokemonId: pokemon.id, to: "box" }
            : { type: "DEPLOY", pokemonId: pokemon.id };
          const canMove = !blocked && state.exchangeActive && dispatch && transition(state, action) !== state;
          return <PokemonCard key={pokemon.id} pokemon={pokemon}
            destination={state.phase === "center" ? "박스로 이동" : "수비로 배치"}
            onClick={canMove ? () => dispatch(action) : undefined} />;
        })}
      </div>
    </section>
  );
}
