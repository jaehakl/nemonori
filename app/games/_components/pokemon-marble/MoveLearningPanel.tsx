import { MOVE_SLOT_LIMIT, movesById, speciesById, type Move } from "./pokemon-data";
import { PokemonSprite, TypeBadge } from "./PokemonSprite";
import { getMoveEffectSummary, getMovePowerLabel } from "./move-description";
import type { GameAction, GameState } from "./types";
import styles from "./MoveLearningPanel.module.css";

export default function MoveLearningPanel({ state, dispatch }: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const comparison = useRef<HTMLDivElement>(null);
  const candidateId = state.growth?.queue[0]?.pendingMoveIds[0];
  useEffect(() => { comparison.current?.focus(); }, [candidateId]);
  const learning = state.growth?.queue[0];
  if (!learning) return null;
  const owner = state.players[learning.ownerId];
  const pokemon = [...owner.party, ...owner.box,
    ...state.roads.flatMap((guardian) => guardian?.ownerId === owner.id ? [guardian.pokemon] : []),
  ].find((entry) => entry.id === learning.pokemonId);
  const candidate = movesById[learning.pendingMoveIds[0]];
  if (!pokemon || !candidate) return null;
  const known = pokemon.moveIds.map((id) => movesById[id]);
  const hasEmptySlot = known.length < MOVE_SLOT_LIMIT;
  const moves = [candidate, ...known];
  const row = (label: string, render: (move: Move) => React.ReactNode) => (
    <tr><th scope="row">{label}</th>{moves.map((move) => <td key={move.id}>{render(move)}</td>)}</tr>
  );

  return (
    <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="move-learning-title">
      <header className={styles.heading}>
        <PokemonSprite speciesId={pokemon.speciesId} size={64} />
        <div><small>{owner.name} · {speciesById[pokemon.speciesId].name} Lv. {pokemon.level}</small>
          <h2 id="move-learning-title">새로운 기술을 배울까요?</h2>
          <p>{hasEmptySlot
            ? "빈 슬롯에 새 기술을 배우거나, 기존 기술을 교체하거나, 배우지 않을 수 있어요."
            : `기술 ${MOVE_SLOT_LIMIT}칸이 모두 찼어요. 잊을 기술을 고르거나 새 기술을 배우지 않을 수 있어요.`}</p>
        </div>
      </header>
      <div ref={comparison} className={styles.comparison} tabIndex={0} aria-label="새 기술과 현재 기술 비교">
        <table>
          <thead><tr><th scope="col">스펙</th>{moves.map((move, index) => (
            <th key={move.id} scope="col" className={index === 0 ? styles.newMove : undefined}>
              <small>{index === 0 ? "새 기술" : `현재 기술 ${index}`}</small><strong>{move.name}</strong>
            </th>
          ))}</tr></thead>
          <tbody>
            {row("타입", (move) => <TypeBadge type={move.type} />)}
            {row("분류", (move) => move.category === "physical" ? "물리" : "특수")}
            {row("위력", getMovePowerLabel)}
            {row("명중률", (move) => move.accuracy === null ? "필중" : `${move.accuracy}%`)}
            {row("효과", (move) => <ul>{getMoveEffectSummary(move).map((effect) => <li key={effect}>{effect}</li>)}</ul>)}
          </tbody>
          <tfoot><tr><th scope="row">선택</th><td className={styles.newMove}>{hasEmptySlot
            ? <button type="button" onClick={() => dispatch({ type: "LEARN_MOVE" })}>빈 네 번째 슬롯에 배우기</button>
            : "배우려는 기술"}</td>
            {known.map((move) => <td key={move.id}><button type="button" onClick={() => dispatch({ type: "CHOOSE_MOVE", replaceMoveId: move.id })}
              aria-label={`${move.name} 대신 ${candidate.name} 배우기`}>{move.name} 잊기</button></td>)}
          </tr></tfoot>
        </table>
      </div>
      <footer className={styles.footer}>
        <p>{hasEmptySlot ? "빈 슬롯에 배우면 기존 기술을 모두 유지합니다." : "선택한 기존 기술만 새 기술로 바뀝니다."}</p>
        <button type="button" onClick={() => dispatch({ type: "CHOOSE_MOVE", replaceMoveId: null })}>{candidate.name} 배우지 않기</button>
      </footer>
    </section>
  );
}
import { useEffect, useRef } from "react";
