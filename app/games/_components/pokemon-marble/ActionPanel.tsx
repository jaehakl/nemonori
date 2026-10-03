import { hasExtraRoll, transition } from "./engine";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import { speciesById } from "./pokemon-data";
import { PokemonSprite, TypeBadge } from "./PokemonSprite";
import BattlePanel from "./BattlePanel";
import type { GameAction, GameState } from "./types";
import PokemonCard from "./PokemonCard";
import { getPartyLeader, sortPartyByLevel } from "./party";
import styles from "./PokemonMarble.module.css";

const dieFaces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function TurnHeading({ state }: { state: GameState }) {
  const player = state.players[state.activePlayer];
  const roads = state.roads.filter((guardian) => guardian?.ownerId === player.id).length;
  return (
    <div className={styles.journeyHeading}>
      <span className={styles.playerDot} style={{ "--player-color": PLAYER_COLORS[player.id] } as React.CSSProperties}>{player.id + 1}</span>
      <div><small>{state.players.length === 1 ? "나만의 모험" : "이번 차례"}</small><h3>{player.name}</h3></div>
      <div className={styles.journeyStats}><strong>TURN {state.turn}</strong><span>도로 {roads}/27</span></div>
    </div>
  );
}

function DiceCradle({ dice, rolling = false }: { dice: [number, number] | null; rolling?: boolean }) {
  const pipPositions: [number, number][] = [[18, 18], [42, 42], [42, 18], [18, 42], [18, 30], [42, 30]];
  return (
    <div className={styles.diceCradle} aria-hidden="true">
      {rolling ? <span className={styles.rollingLabel}>결과를 기다려요</span> : (dice ?? [3, 5]).map((face, index) => (
        <svg key={index} viewBox="0 0 60 60" className={styles.cradleDie}>
          <rect x="3" y="3" width="54" height="54" rx="12" fill="#fff5d9" stroke="#d7b46a" strokeWidth="2" />
          <rect x="7" y="7" width="46" height="46" rx="9" fill="none" stroke="#fffdf1" strokeWidth="2" />
          {face % 2 === 1 && <circle cx="30" cy="30" r="3.7" fill="#b24f42" />}
          {pipPositions.slice(0, face - (face % 2)).map(([x, y], pip) => <circle key={pip} cx={x} cy={y} r="3.7" fill="#173f35" />)}
        </svg>
      ))}
    </div>
  );
}

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

  // A save imported from version 2 can have an already-earned capture choice.
  if (state.phase === "capture" && state.battle?.wild &&
    state.battle.outcome?.kind === "knockout" && state.battle.outcome.legacyCapturePending) {
    const wild = state.battle.wild;
    return (
      <section className={styles.actionPanel}>
        <div className={styles.captureHero}>
          <PokemonSprite speciesId={wild.speciesId} size={72} />
          <h3>{speciesById[wild.speciesId].name}</h3>
        </div>
        <p className={styles.legacyCaptureNote}>이전 모험에서 남겨 둔 포획을 마무리하세요. 이 포켓몬은 당시 규칙대로 HP 0으로 합류합니다.</p>
        <div className={styles.buttonRow}>
          <button className={styles.primaryButton} disabled={player.party.length >= 6}
            onClick={() => dispatch({ type: "CAPTURE", capture: true })}>포획하기</button>
          <button className={styles.secondaryButton}
            onClick={() => dispatch({ type: "CAPTURE", capture: false })}>놓아주기</button>
        </div>
      </section>
    );
  }

  if (state.phase === "roll") {
    return (
      <section className={`${styles.actionPanel} ${styles.journeyPanel}`} aria-label="이번 차례">
        <TurnHeading state={state} />
        <div className={styles.journeyCenter}>
          <DiceCradle dice={null} />
          <p className={styles.journeyHint}>두 개의 주사위, 새로운 만남.</p>
        </div>
        <button className={`${styles.primaryButton} ${styles.journeyButton}`} onClick={() => dispatch({ type: "ROLL" })}>
          주사위 굴리기 <span aria-hidden="true">→</span>
        </button>
      </section>
    );
  }

  return (
    <section className={styles.actionPanel}>
      <TurnHeading state={state} />
      {(state.phase === "moving" ||
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
          {state.phase === "turn-end" ? (
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
  const total = state.dice ? state.dice[0] + state.dice[1] : 0;
  const remaining = state.movement?.remaining ?? 0;
  return (
    <section className={`${styles.actionPanel} ${styles.movementPanel} ${styles.journeyPanel}`} aria-label="주사위와 이동">
      <TurnHeading state={state} />
      <div className={styles.journeyCenter}>
        <DiceCradle dice={state.dice} rolling={rolling} />
        <p className={styles.journeyHint} role="status">
          {notice ?? (rolling ? "주사위를 굴리고 있어요!" : `${total}칸 이동 · 앞으로 ${remaining}칸${hasExtraRoll(state) ? " · 더블!" : ""}`)}
        </p>
        <progress aria-label="이동 진행" max={total || 1} value={rolling ? 0 : total - remaining} />
      </div>
      <button className={`${styles.secondaryButton} ${styles.journeyButton}`} disabled={!busy} onClick={onSkip}>
        연출 건너뛰기 →
      </button>
    </section>
  );
}

export function PartySummary({ state, dispatch, blocked = false }: { state: GameState; dispatch?: (action: GameAction) => void; blocked?: boolean }) {
  const player = state.players[state.activePlayer];
  const leader = getPartyLeader(player.party);
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
        <small>{state.players.length === 1 ? "혼자 모험 · " : ""}도로 {ownedRoads}/{roadCount}</small>
        {player.restTurnsRemaining > 0 && <small>휴식 {player.restTurnsRemaining}턴</small>}
      </div>
      <div className={styles.partyCards} tabIndex={0} aria-label="파티 카드 목록">
        {sortPartyByLevel(player.party).map((pokemon) => {
          const action: GameAction = state.phase === "center"
            ? { type: "CENTER_TRANSFER", pokemonId: pokemon.id, to: "box" }
            : { type: "DEPLOY", pokemonId: pokemon.id };
          const canMove = !blocked && state.exchangeActive && dispatch && transition(state, action) !== state;
          return <PokemonCard key={pokemon.id} pokemon={pokemon}
            leader={pokemon.id === leader?.id}
            destination={state.phase === "center" ? "박스로 이동" : "수비로 배치"}
            onClick={canMove ? () => dispatch(action) : undefined} />;
        })}
      </div>
    </section>
  );
}
