"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import Board3D from "./Board3D";
import {
  createGame,
  snapshotForPresentation,
  transitionWithEvents,
} from "./engine";
import { speciesById } from "./pokemon-data";
import { validateSave } from "./save";
import Setup from "./Setup";
import ActionPanel, { PartySummary } from "./ActionPanel";
import RulesDialog, { Modal } from "./RulesDialog";
import type { GameAction, GameState } from "./types";
import styles from "./PokemonMarble.module.css";
import experienceStyles from "./Experience.module.css";
import ExperienceControls from "./ExperienceControls";
import { useExperience } from "./use-experience";
import { useAutomaticAction } from "./use-automatic-action";

const SLUG = "pokemon-marble";
const TITLE = "포켓몬 마블";
const tileNames = { center: "포켓몬센터", grass: "풀숲", road: "도로" };

// GameHost loads this component only after its browser mount.
export default function PokemonMarble() {
  const experience = useExperience();
  const { enqueue, isBlocked, setScene } = experience;
  const [loaded] = useState(() => loadGameSave(SLUG, validateSave));
  const [savedGame, setSavedGame] = useState<GameState | null>(() =>
    loaded.ok ? (loaded.value?.data ?? null) : null,
  );
  const [game, setGame] = useState<GameState | null>(null);
  const gameRoot = useRef<HTMLDivElement>(null);
  const playing = game !== null;
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
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const canonicalView = useMemo(
    () => (game ? snapshotForPresentation(game) : null),
    [game],
  );
  const view = experience.frame.event?.snapshot ?? canonicalView;
  const battleVisible = Boolean(view?.battle);

  useEffect(() => setScene(battleVisible), [battleVisible, setScene]);
  useEffect(() => {
    if (playing) gameRoot.current?.scrollIntoView({ block: "start" });
  }, [playing]);

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
        isBlocked() ||
        (expectedRevision !== undefined &&
          current.revision !== expectedRevision)
      )
        return;
      try {
        const { state: next, events } = transitionWithEvents(current, action);
        if (next !== current) {
          setGameError(null);
          commit(next);
          if (!graphicsFailed) enqueue(events);
        }
      } catch {
        setGameError(
          "이 행동을 처리하지 못했습니다. 현재 진행은 유지됩니다. 다시 시도해 주세요.",
        );
      }
    },
    [commit, enqueue, graphicsFailed, isBlocked],
  );

  useAutomaticAction(
    game,
    experience.busy || experience.paused,
    experience.frame.session,
    dispatch,
  );

  function start(starters: number[], names: string[]) {
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      experience.reset();
      experience.unlockAudio();
      setGraphicsFailed(false);
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
    experience.unlockAudio();
    if (savedGame || !loaded.ok) setPendingStart({ starters, names });
    else start(starters, names);
  }

  function returnToSetup() {
    experience.reset();
    gameRef.current = null;
    setGame(null);
    setRestartOpen(false);
    setSelectedTile(null);
  }

  return (
    <>
      <div
        ref={gameRoot}
        className={styles.game}
        inert={experience.portrait}
        data-reduced-motion={experience.reducedMotion}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("button"))
            experience.click();
        }}
      >
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
            <ExperienceControls
              preferences={experience.preferences}
              onPreferences={experience.updatePreferences}
              reducedMotion={experience.reducedMotion}
              onReducedMotion={experience.updateReducedMotion}
              onUnlock={experience.unlockAudio}
            />
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
                    experience.reset();
                    experience.unlockAudio();
                    setGraphicsFailed(false);
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
                  <h2>
                    {battleVisible
                      ? "파트너와 함께, 배틀!"
                      : "작은 세계, 새로운 만남"}
                  </h2>
                </div>
                <small>
                  {view!.players.filter((player) => !player.eliminated).length}{" "}
                  / {game.players.length} TRAINERS
                </small>
              </div>
              <div className={styles.boardFrame}>
                <Board3D
                  tokens={view!.players.map((player) => ({
                    id: player.id,
                    name: player.name,
                    color: PLAYER_COLORS[player.id],
                    position: player.position,
                    eliminated: player.eliminated,
                  }))}
                  guardians={view!.guardians}
                  activePlayerId={view!.activePlayerId}
                  dice={view!.dice}
                  rolling={
                    experience.frame.event?.kind === "roll" &&
                    experience.frame.progress < 0.8
                  }
                  battle={view!.battle}
                  presentation={
                    experience.frame.event
                      ? {
                          event: experience.frame.event,
                          progress: experience.frame.progress,
                        }
                      : null
                  }
                  paused={experience.paused}
                  reducedMotion={experience.reducedMotion}
                  onFailure={() => {
                    setGraphicsFailed(true);
                    experience.skip();
                  }}
                  onReady={() => setGraphicsFailed(false)}
                  onTileSelect={setSelectedTile}
                />
              </div>
              {selectedTile !== null && !experience.busy && (
                <div className={styles.tileDetail}>
                  <strong>
                    {selectedTile + 1}번 ·{" "}
                    {tileNames[BOARD_TILES[selectedTile]]}
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
              <details className={experienceStyles.collapsible}>
                <summary>내 파티 · 트레이너 현황</summary>
                {experience.busy ? (
                  <p className={styles.actionCopy}>
                    연출이 끝나면 파티를 확인할 수 있어요.
                  </p>
                ) : (
                  <PartySummary state={game} />
                )}
              </details>
            </div>
            <aside className={styles.sidebar}>
              {experience.frame.event ? (
                <section
                  className={experienceStyles.playingNotice}
                  aria-label="진행 중인 연출"
                >
                  <small>ADVENTURE IN MOTION</small>
                  <strong role="status">
                    {experience.frame.event.message}
                  </strong>
                  <progress
                    aria-label="연출 진행"
                    max={1}
                    value={experience.frame.progress}
                  />
                  <button type="button" onClick={experience.skip}>
                    연출 건너뛰기 →
                  </button>
                </section>
              ) : (
                <ActionPanel
                  key={`${game.activePlayer}-${game.turn}-${game.phase}`}
                  state={game}
                  compactBattle={!graphicsFailed}
                  dispatch={(action) => dispatch(action, game.revision)}
                  onRestart={() => setRestartOpen(true)}
                />
              )}
              <details className={experienceStyles.collapsible}>
                <summary>모험 기록</summary>
                <section className={styles.logPanel} aria-label="모험 기록">
                  <h3>ADVENTURE LOG · 모험 기록</h3>
                  <ol>
                    {game.log
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <li key={`${game.log.length - index}-${entry}`}>
                          {entry}
                        </li>
                      ))}
                  </ol>
                </section>
              </details>
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
      {experience.portrait && (
        <div className={experienceStyles.orientation} role="status">
          <span className={experienceStyles.orientationIcon} aria-hidden="true">
            ▯ ↻ ▭
          </span>
          <strong>아이패드를 가로로 돌려주세요</strong>
          <p>
            넓은 화면에서 모험이 펼쳐집니다.
            <br />
            진행은 잠시 멈춰 두었어요.
          </p>
        </div>
      )}
    </>
  );
}
