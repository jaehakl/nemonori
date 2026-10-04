import { canMoveToCenter, hasExtraRoll, transition } from "./engine";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import { speciesById } from "./pokemon-data";
import { PokemonSprite, TypeBadge } from "./PokemonSprite";
import BattlePanel from "./BattlePanel";
import type { GameAction, GameState } from "./types";
import PokemonCard from "./PokemonCard";
import { getPartyLeader, sortPartyByLevel } from "./party";
import DiceCradle from "./DiceCradle";
import SystemIcon from "./SystemIcon";
import type { PresentationEvent } from "./presentation-events";
import styles from "./PokemonMarble.module.css";

function TurnHeading({ state }: { state: GameState }) {
  const player = state.players[state.activePlayer];
  return (
    <div className={styles.journeyHeading}>
      <span className={styles.playerDot} style={{ "--player-color": PLAYER_COLORS[player.id] } as React.CSSProperties}>{player.id + 1}</span>
      <div><small>{state.players.length === 1 ? "나만의 모험" : "이번 차례"}</small><h3>{player.name}</h3></div>
    </div>
  );
}

function RollButton({ state, dispatch }: { state: GameState; dispatch: (action: GameAction) => void }) {
  if (state.phase !== "roll" && state.phase !== "rest-roll") return null;
  const player = state.players[state.activePlayer];
  const resting = player.restTurnsRemaining > 0;
  const label = `${player.name} ${resting ? "탈출 " : hasExtraRoll(state) ? "한 번 더 " : ""}주사위 굴리기`;
  return (
    <button
      type="button"
      className={styles.rollButton}
      aria-label={label}
      disabled={Boolean(state.exchangeActive)}
      onClick={() => dispatch({ type: "ROLL" })}
    >
      <DiceCradle dice={state.dice} />
      <span className={styles.rollLabel}>
        <span>{label}</span>
      </span>
    </button>
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
  const guardian = state.roads[player.position];
  const atCenter = BOARD_TILES[player.position] === "center";
  const storedPokemon = atCenter ? player.box : guardian ? [guardian.pokemon] : [];
  const exchangeAction: GameAction = { type: state.exchangeActive ? "END_EXCHANGE" : "START_EXCHANGE" };
  const beforeRoll = state.phase === "roll" || state.phase === "rest-roll";

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

  return (
    <section className={`${styles.actionPanel} ${styles.journeyPanel}`} aria-label="이번 차례">
      <TurnHeading state={state} />
      {state.exchangeActive ? (
        <>
          {player.party.length > 6 && <p className={styles.exchangeHint} role="status">한 마리를 옮겨 6마리로 정리하세요</p>}
          <div className={styles.centerSection}>
            <h4>{atCenter ? `박스 · ${player.box.length}` : "현재 수비"}</h4>
            <div className={styles.partyCards}>
              {storedPokemon.map((pokemon) => {
                const action: GameAction = atCenter
                  ? { type: "CENTER_TRANSFER", pokemonId: pokemon.id, to: "party" }
                  : { type: "RETRIEVE" };
                return <PokemonCard key={pokemon.id} pokemon={pokemon} destination="파티로 이동"
                  onClick={allowed(action) ? () => dispatch(action) : undefined} />;
              })}
            </div>
          </div>
        </>
      ) : (
        <div className={styles.journeyCenter}>
          {state.phase === "rest-roll" && (
            <p className={styles.journeyHint}>남은 휴식 {player.restTurnsRemaining}턴 · 더블이면 즉시 회복하고 나온 눈의 합만큼 이동해요.</p>
          )}
          {state.phase === "rest-end" && (
            <p className={styles.journeyHint} role="status">
              {state.dice?.join(" · ")} · 더블이 아니에요. {player.restTurnsRemaining > 0
                ? `남은 휴식 ${player.restTurnsRemaining}턴`
                : "회복이 끝났어요. 다음 내 차례부터 이동할 수 있어요."}
            </p>
          )}
          {state.phase === "turn-end" && player.restTurnsRemaining > 0 && (
            <p className={styles.journeyHint} role="status">남은 휴식 {player.restTurnsRemaining}턴</p>
          )}
          {!beforeRoll && <p className={styles.journeyHint} role="status">차례를 마무리하고 있어요.</p>}
        </div>
      )}
      {(beforeRoll || state.exchangeActive) && (
        <div className={styles.turnActions} role="group" aria-label="턴 행동">
          <RollButton state={state} dispatch={dispatch} />
          <button type="button" className={styles.exchangeAction} disabled={!allowed(exchangeAction)}
            title={state.exchangeActive ? "6마리 이하로 정리한 뒤 교환을 끝내세요" : "현재 센터나 빈 도로, 내 도로에서 교환할 수 있어요"}
            onClick={() => dispatch(exchangeAction)}>
            <SystemIcon name="exchange" />
            <span>{state.exchangeActive ? "교환 끝내기" : "포켓몬 교환"}</span>
          </button>
          <button type="button" className={styles.centerAction} disabled={!canMoveToCenter(state)}
            onClick={() => dispatch({ type: "MOVE_TO_CENTER" })}>
            <SystemIcon name="center" />
            <span>포켓몬센터 방문<small>다음 센터로 이동 · 3턴 휴식</small></span>
          </button>
        </div>
      )}
    </section>
  );
}

/** One persistent panel spans the roll, every step, and the gaps between steps. */
export function MovementPanel({
  state,
  presentation,
  reducedMotion = false,
  notice,
}: {
  state: GameState;
  presentation: { event: PresentationEvent; progress: number } | null;
  reducedMotion?: boolean;
  notice?: string;
}) {
  const rollProgress = presentation?.event.kind === "roll" ? presentation.progress : 1;
  const rolling = !reducedMotion && rollProgress < 0.86;
  const total = state.dice ? state.dice[0] + state.dice[1] : 0;
  const remaining = state.movement?.remaining ?? 0;
  const restRoll = presentation?.event.kind === "roll" && presentation.event.snapshot.dicePurpose === "rest";
  const restMessage = rolling ? "탈출 주사위를 굴리고 있어요!"
    : state.dice?.[0] === state.dice?.[1] ? `더블! 모두 회복하고 ${total}칸 이동해요.`
    : `더블이 아니에요. ${state.players[state.activePlayer].restTurnsRemaining > 0
      ? `남은 휴식 ${state.players[state.activePlayer].restTurnsRemaining}턴`
      : "회복 완료 · 다음 내 차례부터 이동해요."}`;
  return (
    <section className={`${styles.actionPanel} ${styles.movementPanel} ${styles.journeyPanel}`} aria-label={restRoll ? "탈출 주사위" : "주사위와 이동"}>
      <TurnHeading state={state} />
      <div className={styles.journeyCenter}>
        <DiceCradle dice={state.dice} progress={rollProgress} reducedMotion={reducedMotion} />
        <p className={styles.journeyHint} role="status">
          {notice ?? (restRoll ? restMessage : rolling ? "주사위를 굴리고 있어요!" : `${total}칸 이동 · 앞으로 ${remaining}칸${hasExtraRoll(state) ? " · 더블!" : ""}`)}
        </p>
        {!restRoll && <progress aria-label="이동 진행" max={total || 1} value={rolling ? 0 : total - remaining} />}
      </div>
    </section>
  );
}

export function PartySummary({ state, dispatch, blocked = false }: { state: GameState; dispatch?: (action: GameAction) => void; blocked?: boolean }) {
  const player = state.players[state.activePlayer];
  const leader = getPartyLeader(player.party);
  const ownedRoads = state.roads.filter((guardian) => guardian?.ownerId === player.id).length;
  const roadCount = BOARD_TILES.filter((tile) => tile === "road").length;
  const atCenter = BOARD_TILES[player.position] === "center";
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
          const action: GameAction = atCenter
            ? { type: "CENTER_TRANSFER", pokemonId: pokemon.id, to: "box" }
            : { type: "DEPLOY", pokemonId: pokemon.id };
          const canMove = !blocked && state.exchangeActive && dispatch && transition(state, action) !== state;
          return <PokemonCard key={pokemon.id} pokemon={pokemon}
            leader={pokemon.id === leader?.id}
            destination={atCenter ? "박스로 이동" : "수비로 배치"}
            onClick={canMove ? () => dispatch(action) : undefined} />;
        })}
      </div>
    </section>
  );
}
