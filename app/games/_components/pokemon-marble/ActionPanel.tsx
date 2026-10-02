import { useState } from "react";
import { getStats, transition } from "./engine";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import { speciesById, typeColors } from "./pokemon-data";
import { HealthBar, PokemonSprite, TypeBadge } from "./PokemonSprite";
import BattlePanel, { PokemonChoice } from "./BattlePanel";
import type { GameAction, GameState } from "./types";
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
  const [partyChoice, setPartyChoice] = useState(player.party[0]?.id ?? "");
  const [boxChoice, setBoxChoice] = useState(player.box[0]?.id ?? "");
  const allowed = (action: GameAction) => transition(state, action) !== state;
  const endButton = (
    <button
      className={`${styles.primaryButton} ${styles.fullWidth} ${styles.turnEnd}`}
      onClick={() => dispatch({ type: "END_TURN" })}
    >
      턴 마치기 →
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
      <div className={styles.turnHeading}>
        <div>
          <span className={styles.eyebrow}>YOUR ADVENTURE</span>
          <h3>{player.name}</h3>
        </div>
        <span className={styles.turnBadge}>TURN {state.turn}</span>
      </div>
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
          <p className={styles.actionCopy} aria-live="polite">
            {state.phase === "roll"
              ? "두 개의 주사위를 굴려 모험을 이어가세요."
              : state.phase === "moving"
                ? `${state.dice![0] + state.dice![1]}칸 이동 · 앞으로 ${state.movement?.remaining ?? 0}칸`
                : player.restTurnsRemaining > 0
                  ? `센터로 돌아왔습니다. 다음 본인 차례 ${player.restTurnsRemaining}번을 쉬면 파티와 박스가 모두 회복됩니다.`
                  : "이번 턴의 모험을 마쳤습니다. 다음 트레이너에게 차례를 넘겨주세요."}
          </p>
          {state.phase === "roll" ? (
            <button
              className={`${styles.primaryButton} ${styles.fullWidth}`}
              onClick={() => dispatch({ type: "ROLL" })}
            >
              주사위 굴리기 <span>⚄</span>
            </button>
          ) : state.phase === "turn-end" ? (
            endButton
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

      {state.phase === "road" && (
        <>
          <span className={styles.eyebrow}>ROAD #{player.position + 1}</span>
          <h3>
            {state.roads[player.position]
              ? "우리의 도로"
              : "이 도로를 지켜주세요"}
          </h3>
          <p className={styles.actionCopy}>
            파티의 포켓몬을 보내 수비할 수 있습니다. 살아 있는 파트너를 최소 한
            마리 남겨두세요.
          </p>
          {state.roads[player.position] && (
            <div className={styles.centerSection}>
              <h4>현재 수비</h4>
              <PokemonChoice
                pokemon={state.roads[player.position]!.pokemon}
                disabled={!allowed({ type: "RETRIEVE" })}
                onClick={() => dispatch({ type: "RETRIEVE" })}
                label={player.party.length >= 6 ? "파티 가득 참" : "파티로 회수"}
              />
            </div>
          )}
          <div className={styles.centerSection}>
            <h4>{state.roads[player.position] ? "수비 교체" : "수비 배치"}</h4>
            <div className={styles.selectionList}>
              {player.party.map((pokemon) => {
                const action: GameAction = {
                  type: state.roads[player.position]
                    ? "SWAP_GUARDIAN"
                    : "DEPLOY",
                  pokemonId: pokemon.id,
                };
                return (
                  <PokemonChoice
                    key={pokemon.id}
                    pokemon={pokemon}
                    disabled={!allowed(action)}
                    onClick={() => dispatch(action)}
                    label={state.roads[player.position] ? "교체" : "배치"}
                  />
                );
              })}
            </div>
          </div>
          <p className={styles.actionCopy}>배치하지 않고 턴을 마쳐도 됩니다.</p>
          {endButton}
        </>
      )}

      {state.phase === "center" && (
        <>
          <span className={styles.eyebrow}>POKÉMON CENTER</span>
          <h3>다시 힘차게, 출발!</h3>
          <p className={styles.actionCopy}>
            파티와 박스의 체력을 모두 회복했습니다. 파티는 최대 6마리이며, 살아
            있는 포켓몬이 최소 한 마리 있어야 합니다.
          </p>
          <div className={styles.centerSection}>
            <h4>파티 · {player.party.length}/6</h4>
            <div className={styles.selectionList}>
              {player.party.map((pokemon) => (
                <PokemonChoice
                  key={pokemon.id}
                  pokemon={pokemon}
                  label="박스로"
                  disabled={
                    !allowed({
                      type: "CENTER_TRANSFER",
                      pokemonId: pokemon.id,
                      to: "box",
                    })
                  }
                  onClick={() =>
                    dispatch({
                      type: "CENTER_TRANSFER",
                      pokemonId: pokemon.id,
                      to: "box",
                    })
                  }
                />
              ))}
            </div>
          </div>
          <div className={styles.centerSection}>
            <h4>박스 · {player.box.length}마리</h4>
            {player.box.length === 0 ? (
              <p className={styles.subtle}>아직 박스에 포켓몬이 없습니다.</p>
            ) : (
              <div className={styles.selectionList}>
                {player.box.map((pokemon) => (
                  <PokemonChoice
                    key={pokemon.id}
                    pokemon={pokemon}
                    label="파티로"
                    disabled={
                      !allowed({
                        type: "CENTER_TRANSFER",
                        pokemonId: pokemon.id,
                        to: "party",
                      })
                    }
                    onClick={() =>
                      dispatch({
                        type: "CENTER_TRANSFER",
                        pokemonId: pokemon.id,
                        to: "party",
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
          {player.box.length > 0 && (
            <div className={styles.centerSwap}>
              <span className={styles.subtle}>한 번에 맞교환</span>
              <select
                aria-label="교환할 파티 포켓몬"
                value={
                  player.party.some((pokemon) => pokemon.id === partyChoice)
                    ? partyChoice
                    : ""
                }
                onChange={(event) => setPartyChoice(event.target.value)}
              >
                <option value="" disabled>
                  파티 포켓몬 선택
                </option>
                {player.party.map((pokemon) => (
                  <option value={pokemon.id} key={pokemon.id}>
                    {speciesById[pokemon.speciesId].name} · Lv. {pokemon.level}
                  </option>
                ))}
              </select>
              <select
                aria-label="교환할 박스 포켓몬"
                value={
                  player.box.some((pokemon) => pokemon.id === boxChoice)
                    ? boxChoice
                    : ""
                }
                onChange={(event) => setBoxChoice(event.target.value)}
              >
                <option value="" disabled>
                  박스 포켓몬 선택
                </option>
                {player.box.map((pokemon) => (
                  <option value={pokemon.id} key={pokemon.id}>
                    {speciesById[pokemon.speciesId].name} · Lv. {pokemon.level}
                  </option>
                ))}
              </select>
              <button
                className={styles.secondaryButton}
                disabled={
                  !allowed({
                    type: "CENTER_SWAP",
                    partyPokemonId: partyChoice,
                    boxPokemonId: boxChoice,
                  })
                }
                onClick={() =>
                  dispatch({
                    type: "CENTER_SWAP",
                    partyPokemonId: partyChoice,
                    boxPokemonId: boxChoice,
                  })
                }
              >
                두 포켓몬 교환
              </button>
            </div>
          )}
          <div style={{ marginTop: 18 }}>{endButton}</div>
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
      <progress aria-label="이동 진행" max={total || 1} value={rolling ? 0 : total - remaining} />
      <button className={`${styles.secondaryButton} ${styles.fullWidth}`} disabled={!busy} onClick={onSkip}>
        연출 건너뛰기 →
      </button>
    </section>
  );
}

export function PartySummary({ state }: { state: GameState }) {
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
        <strong>{player.name}의 파티</strong>
        <small>도로 {ownedRoads}/{roadCount}</small>
        {player.restTurnsRemaining > 0 && <small>휴식 {player.restTurnsRemaining}턴</small>}
      </div>
      <div className={styles.partyCards} tabIndex={0} aria-label="파티 카드 목록">
        {player.party.map((pokemon) => {
          const species = speciesById[pokemon.speciesId];
          return (
            <article
              key={pokemon.id}
              className={`${styles.tradingCard} ${pokemon.hp === 0 ? styles.fainted : ""}`}
              style={{ "--type-color": typeColors[species.types[0]] } as React.CSSProperties}
              aria-label={`${species.name}, 레벨 ${pokemon.level}${pokemon.hp === 0 ? ", 행동불능" : ""}`}
            >
              <div className={styles.cardHeading}>
                <strong>{species.name}</strong><span>Lv. {pokemon.level}</span>
              </div>
              <div className={styles.cardArtwork}>
                <PokemonSprite speciesId={pokemon.speciesId} size={144} fit />
              </div>
              <div className={styles.typeRow}>
                {species.types.map((type) => <TypeBadge key={type} type={type} />)}
              </div>
              <HealthBar hp={pokemon.hp} max={getStats(pokemon).hp} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
