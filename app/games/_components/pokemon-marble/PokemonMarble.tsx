"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveGameSave } from "@/app/lib/save-protocol";
import { BOARD_TILES, PLAYER_COLORS } from "./board";
import Board3D, { BattleHud, BoardTileList, EventCaption } from "./Board3D";
import {
  createGame,
  snapshotForPresentation,
  transitionWithEvents,
} from "./engine";
import { speciesById } from "./pokemon-data";
import { loadPokemonSave } from "./load-save";
import Setup from "./Setup";
import ActionPanel, { MovementPanel, PartySummary } from "./ActionPanel";
import RulesDialog, { Modal } from "./RulesDialog";
import type { GameAction, GameState, SeatSide } from "./types";
import styles from "./PokemonMarble.module.css";
import experienceStyles from "./Experience.module.css";
import ExperienceControls from "./ExperienceControls";
import { useExperience } from "./use-experience";
import { useAutomaticAction } from "./use-automatic-action";
import TabletopControls from "./TabletopControls";
import FullscreenToggle from "./FullscreenToggle";
import SystemIcon from "./SystemIcon";
import systemStyles from "./SystemControls.module.css";
import { resolveControlLayout, type ControlLayout } from "./control-orientation";
import { loadDisplayPreferences, saveDisplayPreferences, type DisplayMode } from "./display-preferences";

const SLUG = "pokemon-marble";
const TITLE = "포켓몬 마블";
const tileNames = { center: "포켓몬센터", grass: "풀숲", road: "도로" };

// GameHost loads this component only after its browser mount.
export default function PokemonMarble() {
  const experience = useExperience();
  const { enqueue, isBlocked, setScene } = experience;
  const [loaded] = useState(loadPokemonSave);
  const [displayPreferences, setDisplayPreferences] = useState(loadDisplayPreferences);
  const [controlLayout, setControlLayout] = useState<ControlLayout>({ mode: "fixed", seatSide: "bottom" });
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
    seatSides: SeatSide[];
  } | null>(null);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [graphicsRetry, setGraphicsRetry] = useState(0);
  const canonicalView = useMemo(
    () => (game ? snapshotForPresentation(game) : null),
    [game],
  );
  const view = experience.frame.event?.snapshot ?? canonicalView;
  const battleVisible = Boolean(view?.battle);
  const movementVisible = game?.phase === "moving" ||
    experience.frame.event?.kind === "roll" || experience.frame.event?.kind === "move";
  const presentation = experience.frame.event
    ? { event: experience.frame.event, progress: experience.frame.progress }
    : null;
  // A committed state can already belong to the next actor while its animations
  // are still playing. Keep the visible controls facing the previous actor.
  const nextControlLayout = resolveControlLayout(game, displayPreferences.mode, controlLayout, experience.busy);
  if (nextControlLayout !== controlLayout) setControlLayout(nextControlLayout);

  function updateDisplayMode(mode: DisplayMode) {
    setDisplayPreferences({ mode });
    saveDisplayPreferences({ mode });
  }

  useEffect(() => setScene(battleVisible), [battleVisible, setScene]);
  useEffect(() => {
    if (playing) gameRoot.current?.scrollIntoView({ block: "start" });
  }, [playing]);

  const onFullscreenChange = useCallback((active: boolean) => {
    if (!active && gameRef.current) {
      requestAnimationFrame(() => gameRoot.current?.scrollIntoView({ block: "start" }));
    }
  }, []);

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
          enqueue(events);
        }
      } catch {
        setGameError(
          "이 행동을 처리하지 못했습니다. 현재 진행은 유지됩니다. 다시 시도해 주세요.",
        );
      }
    },
    [commit, enqueue, isBlocked],
  );

  useAutomaticAction(
    game,
    experience.busy || experience.paused,
    experience.frame.session,
    dispatch,
  );

  function start(starters: number[], names: string[], seatSides: SeatSide[]) {
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      experience.reset();
      experience.unlockAudio();
      setGraphicsFailed(false);
      commit(createGame(starters, names, seed, seatSides));
      setPendingStart(null);
      setGameError(null);
      setSelectedTile(null);
    } catch {
      setGameError(
        "게임을 시작하지 못했습니다. 각 트레이너의 포켓몬 선택을 확인해 주세요.",
      );
    }
  }

  function requestStart(starters: number[], names: string[], seatSides: SeatSide[]) {
    experience.unlockAudio();
    if (savedGame || !loaded.ok) setPendingStart({ starters, names, seatSides });
    else start(starters, names, seatSides);
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
        data-reduced-motion={experience.reducedMotion}
        data-playing={playing}
        data-battle={battleVisible}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("button"))
            experience.click();
        }}
      >
        <div className={styles.gameContent} inert={experience.portrait}>
          <header className={styles.topbar}>
            <div className={`${styles.topActions} ${styles.systemLeft}`}>
              <FullscreenToggle targetRef={gameRoot} onChange={onFullscreenChange} />
              <ExperienceControls
                preferences={experience.preferences}
                onPreferences={experience.updatePreferences}
                reducedMotion={experience.reducedMotion}
                onReducedMotion={experience.updateReducedMotion}
                onUnlock={experience.unlockAudio}
                displayMode={displayPreferences.mode}
                onDisplayMode={updateDisplayMode}
              />
            </div>
            <div className={styles.topActions}>
              <button
                className={systemStyles.iconButton}
                aria-label="모험 가이드"
                title="모험 가이드"
                onClick={() => setRulesOpen(true)}
              >
                <SystemIcon name="guide" />
              </button>
              {game && (
                <button
                  className={systemStyles.iconButton}
                  aria-label="새 게임"
                  title="새 게임"
                  onClick={() => setRestartOpen(true)}
                >
                  <SystemIcon name="restart" />
                </button>
              )}
            </div>
          </header>
          {graphicsFailed && battleVisible && (
            <aside className={styles.graphicsError} role="alert">
              <span>배틀 무대를 표시하지 못했습니다. 선택 버튼으로 계속할 수 있습니다.</span>
              <button className={styles.secondaryButton} onClick={() => setGraphicsRetry((value) => value + 1)}>
                무대 다시 불러오기
              </button>
            </aside>
          )}
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
              displayMode={displayPreferences.mode}
              onDisplayMode={updateDisplayMode}
            />
          ) : (
            <>
              <TabletopControls
                battle={battleVisible}
                seatSide={controlLayout.seatSide}
                mode={controlLayout.mode}
                board={
                  <Board3D
                    tabletop
                    hideHud
                    retryKey={graphicsRetry}
                    selectedTile={selectedTile}
                    tokens={view!.players.map((player) => ({
                      id: player.id,
                      name: player.name,
                      color: PLAYER_COLORS[player.id],
                      position: player.position,
                      starterSpeciesId: player.starterSpeciesId,
                      restTurnsRemaining: player.restTurnsRemaining,
                    }))}
                    guardians={view!.guardians}
                    activePlayerId={view!.activePlayerId}
                    dice={view!.dice}
                    rolling={experience.frame.event?.kind === "roll" && experience.frame.progress < 0.8}
                    battle={view!.battle}
                    presentation={presentation}
                    paused={experience.paused}
                    reducedMotion={experience.reducedMotion}
                    onFailure={() => {
                      setGraphicsFailed(true);
                      experience.skip();
                    }}
                    onReady={() => setGraphicsFailed(false)}
                    onTileSelect={setSelectedTile}
                  />
                }
              >
                <div className={battleVisible ? styles.battleControls : styles.tableControls}>
                  <div className={styles.controlActions}>
                    {view!.battle && <BattleHud battle={view!.battle} presentation={presentation} inline />}
                    {!battleVisible && movementVisible ? (
                      <MovementPanel
                        state={game}
                        rolling={experience.frame.event?.kind === "roll"}
                        busy={experience.busy}
                        notice={
                          presentation && ["lap", "level-up", "evolution"].includes(presentation.event.kind)
                            ? presentation.event.message
                            : undefined
                        }
                        onSkip={experience.skip}
                      />
                    ) : experience.frame.event ? (
                      <section className={styles.tableNotice} aria-label="진행 중인 연출">
                        {experience.frame.event.attack && <EventCaption presentation={presentation} inline />}
                        <strong role="status">{experience.frame.event.message}</strong>
                        <progress aria-label="연출 진행" max={1} value={experience.frame.progress} />
                        <button className={styles.secondaryButton} type="button" onClick={experience.skip}>
                          연출 건너뛰기 →
                        </button>
                      </section>
                    ) : (
                      <ActionPanel
                        key={`${game.activePlayer}-${game.turn}`}
                        state={game}
                        compactBattle
                        dispatch={(action) => dispatch(action, game.revision)}
                        onRestart={() => setRestartOpen(true)}
                      />
                    )}
                    {selectedTile !== null && !battleVisible && !experience.busy && (
                      <div className={styles.tileDetail}>
                        <strong>{selectedTile + 1}번 · {tileNames[BOARD_TILES[selectedTile]]}</strong>
                        {game.roads[selectedTile]
                          ? ` — ${game.players[game.roads[selectedTile]!.ownerId].name}의 ${speciesById[game.roads[selectedTile]!.pokemon.speciesId].name} · HP ${game.roads[selectedTile]!.pokemon.hp}`
                          : ""}
                        {game.players.filter((player) => player.position === selectedTile).map((player) => ` · ${player.name}`)}
                      </div>
                    )}
                    {!battleVisible && !movementVisible && !experience.busy && (
                      <BoardTileList
                        tokens={view!.players.map((player) => ({ ...player, color: PLAYER_COLORS[player.id] }))}
                        guardians={view!.guardians}
                        selectedTile={selectedTile}
                        onTileSelect={setSelectedTile}
                      />
                    )}
                  </div>
                  {!battleVisible && <PartySummary state={game} />}
                </div>
              </TabletopControls>
            </>
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
                  onClick={() => start(pendingStart.starters, pendingStart.names, pendingStart.seatSides)}
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
      </div>
    </>
  );
}
