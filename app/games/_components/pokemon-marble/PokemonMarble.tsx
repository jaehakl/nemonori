"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import Board3D from "./Board3D";
import { createGame, getActingPlayer, transition } from "./engine";
import { speciesById } from "./pokemon-data";
import { validateSave } from "./save";
import Setup from "./Setup";
import ActionPanel, { PartySummary } from "./ActionPanel";
import RulesDialog, { Modal } from "./RulesDialog";
import type { GameAction, GameState } from "./types";
import styles from "./PokemonMarble.module.css";

const SLUG = "pokemon-marble";
const TITLE = "포켓몬 마블";
const tileNames = { center: "포켓몬센터", grass: "풀숲", road: "도로" };

// GameHost loads this component only after its browser mount.
export default function PokemonMarble() {
  const [loaded] = useState(() => loadGameSave(SLUG, validateSave));
  const [savedGame, setSavedGame] = useState<GameState | null>(() =>
    loaded.ok ? (loaded.value?.data ?? null) : null,
  );
  const [game, setGame] = useState<GameState | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(() =>
    loaded.ok ? null : loaded.error.message,
  );
  const [gameError, setGameError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<{
    starters: number[];
    names: string[];
  } | null>(null);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
    setSavedGame(next);
    const saved = saveGameSave(SLUG, TITLE, next);
    setSaveError(saved.ok ? null : saved.error.message);
  }, []);

  const dispatch = useCallback(
    (action: GameAction, expectedRevision?: number) => {
      const current = gameRef.current;
      if (
        !current ||
        (expectedRevision !== undefined &&
          current.revision !== expectedRevision)
      )
        return;
      try {
        const next = transition(current, action);
        if (next !== current) {
          setGameError(null);
          commit(next);
        }
      } catch {
        setGameError(
          "이 행동을 처리하지 못했습니다. 현재 진행은 유지됩니다. 다시 시도해 주세요.",
        );
      }
    },
    [commit],
  );

  useEffect(() => {
    if (!game) return;
    const action: GameAction | null =
      game.phase === "moving"
        ? { type: "STEP" }
        : game.phase === "attack" && getActingPlayer(game) === null
          ? { type: "WILD_ATTACK" }
          : null;
    if (!action) return;
    const timer = window.setTimeout(
      () => dispatch(action, game.revision),
      game.phase === "moving" ? 380 : 900,
    );
    return () => window.clearTimeout(timer);
  }, [game, dispatch]);

  function start(starters: number[], names: string[]) {
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      commit(createGame(starters, names, seed));
      setPendingStart(null);
      setGameError(null);
      setSelectedTile(null);
    } catch {
      setGameError(
        "게임을 시작하지 못했습니다. 각 트레이너의 포켓몬 선택을 확인해 주세요.",
      );
    }
  }

  function requestStart(starters: number[], names: string[]) {
    if (savedGame || !loaded.ok) setPendingStart({ starters, names });
    else start(starters, names);
  }

  function returnToSetup() {
    gameRef.current = null;
    setGame(null);
    setRestartOpen(false);
    setSelectedTile(null);
  }

  return (
    <div className={styles.game}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            ◈
          </span>
          <div>
            <small>NEMONORI ADVENTURES</small>
            <strong>포켓몬 마블</strong>
          </div>
        </div>
        <div className={styles.topActions}>
          <span className={styles.savePill}>
            {saveError
              ? "저장 확인 필요"
              : game
                ? "자동 저장됨"
                : "LOCAL · 2–4 PLAYERS"}
          </span>
          <button
            className={styles.textButton}
            onClick={() => setRulesOpen(true)}
          >
            ⓘ 모험 가이드
          </button>
          {game && (
            <button
              className={styles.textButton}
              onClick={() => setRestartOpen(true)}
            >
              새 게임
            </button>
          )}
        </div>
      </header>
      {saveError && (
        <div className={styles.notice} role="alert">
          <span>
            {saveError}{" "}
            {game
              ? "현재 화면에서는 계속 플레이할 수 있습니다."
              : "기존 저장은 자동으로 삭제하지 않습니다."}
          </span>
          {game && (
            <button
              className={styles.secondaryButton}
              onClick={() => commit(game)}
            >
              저장 다시 시도
            </button>
          )}
          <a href="/saves">세이브 관리</a>
        </div>
      )}
      {gameError && (
        <div className={styles.notice} role="alert">
          {gameError}
        </div>
      )}
      {!game ? (
        <Setup
          onStart={requestStart}
          onResume={
            savedGame
              ? () => {
                  gameRef.current = savedGame;
                  setGame(savedGame);
                }
              : null
          }
          loading={false}
        />
      ) : (
        <div className={styles.playLayout}>
          <div className={styles.boardColumn}>
            <div className={styles.boardHeader}>
              <div>
                <span className={styles.eyebrow}>THE ADVENTURE BOARD</span>
                <h2>작은 세계, 새로운 만남</h2>
              </div>
              <small>
                {game.players.filter((player) => !player.eliminated).length} /{" "}
                {game.players.length} TRAINERS
              </small>
            </div>
            <div className={styles.boardFrame}>
              <Board3D
                tokens={game.players.map((player) => ({
                  id: player.id,
                  name: player.name,
                  color: PLAYER_COLORS[player.id],
                  position: player.position,
                  eliminated: player.eliminated,
                }))}
                guardians={game.roads.flatMap((guardian, tile) =>
                  guardian
                    ? [
                        {
                          tile,
                          ownerId: guardian.ownerId,
                          speciesId: guardian.pokemon.speciesId,
                        },
                      ]
                    : [],
                )}
                activePlayerId={game.winner ?? game.activePlayer}
                dice={game.dice}
                rolling={game.phase === "moving"}
                onTileSelect={setSelectedTile}
              />
            </div>
            {selectedTile !== null && (
              <div className={styles.tileDetail}>
                <strong>
                  {selectedTile + 1}번 · {tileNames[BOARD_TILES[selectedTile]]}
                </strong>
                {game.roads[selectedTile]
                  ? ` — ${game.players[game.roads[selectedTile]!.ownerId].name}의 ${speciesById[game.roads[selectedTile]!.pokemon.speciesId].name} · HP ${game.roads[selectedTile]!.pokemon.hp}`
                  : ""}
                {game.players
                  .filter(
                    (player) =>
                      !player.eliminated && player.position === selectedTile,
                  )
                  .map((player) => ` · ${player.name}`)}
              </div>
            )}
            <PartySummary state={game} />
          </div>
          <aside className={styles.sidebar}>
            <ActionPanel
              key={`${game.activePlayer}-${game.turn}-${game.phase}`}
              state={game}
              dispatch={(action) => dispatch(action, game.revision)}
              onRestart={() => setRestartOpen(true)}
            />
            <section className={styles.logPanel} aria-label="모험 기록">
              <h3>ADVENTURE LOG · 모험 기록</h3>
              <ol>
                {game.log
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <li key={`${game.log.length - index}-${entry}`}>{entry}</li>
                  ))}
              </ol>
            </section>
          </aside>
        </div>
      )}
      <footer className={styles.footer}>
        NEMONORI · POKÉMON MARBLE <span aria-hidden="true"> / </span>{" "}
        <a href="/pokemon-marble/README.md" target="_blank" rel="noreferrer">
          데이터 및 이미지 출처
        </a>
      </footer>
      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}
      {restartOpen && (
        <Modal
          title="새 모험을 준비할까요?"
          onClose={() => setRestartOpen(false)}
        >
          <p>
            파트너 선택 화면으로 돌아갑니다. 새 모험을 시작하기 전까지 현재
            세이브를 이어할 수 있습니다.
          </p>
          <div className={styles.buttonRow}>
            <button
              className={styles.secondaryButton}
              onClick={() => setRestartOpen(false)}
            >
              계속 플레이
            </button>
            <button className={styles.primaryButton} onClick={returnToSetup}>
              파트너 선택으로
            </button>
          </div>
        </Modal>
      )}
      {pendingStart && (
        <Modal
          title="새 모험으로 저장을 교체할까요?"
          onClose={() => setPendingStart(null)}
        >
          <p>
            이 게임은 브라우저에 한 개의 모험을 저장합니다. 새 게임을 시작하면
            이전 진행 상황을 덮어씁니다.
          </p>
          <div className={styles.buttonRow}>
            <button
              className={styles.secondaryButton}
              onClick={() => setPendingStart(null)}
            >
              취소
            </button>
            <button
              className={styles.primaryButton}
              onClick={() => start(pendingStart.starters, pendingStart.names)}
            >
              새 모험 시작
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
