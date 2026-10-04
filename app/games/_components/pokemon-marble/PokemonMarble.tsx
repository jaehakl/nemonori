"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveGameSave } from "@/app/lib/save-protocol";
import { PLAYER_COLORS } from "./board";
import GameBoard, { BattleHud, EventCaption } from "./GameBoard";
import {
  createGame,
  snapshotForPresentation,
  transitionWithEvents,
} from "./engine";
import { loadPokemonSave } from "./load-save";
import Setup from "./Setup";
import GuardianPopup from "./GuardianPopup";
import ActionPanel, { ExchangeControls, MovementPanel, PartySummary } from "./ActionPanel";
import RulesDialog, { Modal } from "./RulesDialog";
import type { GameAction, GameState, SeatSide } from "./types";
import styles from "./PokemonMarble.module.css";
import experienceStyles from "./Experience.module.css";
import ExperienceControls from "./ExperienceControls";
import { useExperience } from "./use-experience";
import { getAudioScene } from "./music-scene";
import { useAutomaticAction } from "./use-automatic-action";
import TabletopControls from "./TabletopControls";
import GrowthPresentation, { hasGrowthPresentation } from "./GrowthPresentation";
import FullscreenToggle from "./FullscreenToggle";
import SystemIcon from "./SystemIcon";
import systemStyles from "./SystemControls.module.css";
import { resolveControlLayout, type ControlLayout } from "./control-orientation";
import { loadDisplayPreferences, saveDisplayPreferences, type DisplayMode } from "./display-preferences";

const SLUG = "pokemon-marble";
const TITLE = "포켓몬 마블";

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
  const [selection, setSelection] = useState<{ tile: number; revision: number } | null>(null);
  const selectedTile = selection?.revision === game?.revision ? selection?.tile ?? null : null;
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
  const growthEvent = hasGrowthPresentation(experience.frame.event) ? experience.frame.event : null;
  const growthOwner = growthEvent?.snapshot.players.find((player) => player.id === growthEvent.playerId);
  // A committed state can already belong to the next actor while its animations
  // are still playing. Keep the visible controls facing the previous actor.
  const nextControlLayout = resolveControlLayout(game, displayPreferences.mode, controlLayout, experience.busy);
  if (nextControlLayout !== controlLayout) setControlLayout(nextControlLayout);

  function updateDisplayMode(mode: DisplayMode) {
    setDisplayPreferences({ mode });
    saveDisplayPreferences({ mode });
  }

  const audioScene = getAudioScene(
    view,
    experience.frame.event,
    experience.skippedRevision === (experience.frame.event?.revision ?? game?.revision),
  );
  useEffect(() => setScene(audioScene), [audioScene, setScene]);
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
          // Start a combined turn handoff with the dice already facing its roller.
          if (action.type === "ROLL" || action.type === "END_TURN_AND_ROLL") {
            setControlLayout((previous) => resolveControlLayout(next, displayPreferences.mode, previous, false));
          }
          commit(next);
          enqueue(events);
        }
      } catch {
        setGameError(
          "이 행동을 처리하지 못했습니다. 현재 진행은 유지됩니다. 다시 시도해 주세요.",
        );
      }
    },
    [commit, displayPreferences.mode, enqueue, isBlocked],
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
      experience.reset("adventure");
      experience.unlockAudio();
      commit(createGame(starters, names, seed, seatSides));
      setPendingStart(null);
      setGameError(null);
      setSelection(null);
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
    setSelection(null);
  }

  const systemControls = (
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
        <button className={systemStyles.iconButton} aria-label="모험 가이드"
          title="모험 가이드" onClick={() => setRulesOpen(true)}>
          <SystemIcon name="guide" />
        </button>
        {game && (
          <button className={systemStyles.iconButton} aria-label="새 게임"
            title="새 게임" onClick={() => setRestartOpen(true)}>
            <SystemIcon name="restart" />
          </button>
        )}
      </div>
    </header>
  );

  return (
    <>
      <div
        ref={gameRoot}
        className={styles.game}
        data-reduced-motion={experience.reducedMotion}
        data-playing={playing}
        data-battle={battleVisible}
        data-control-seat={controlLayout.mode === "fixed" ? "bottom" : controlLayout.seatSide}
        onPointerDownCapture={experience.unlockAudio}
        onKeyDownCapture={experience.unlockAudio}
        onClickCapture={(event) => {
          experience.unlockAudio();
          if ((event.target as HTMLElement).closest("button"))
            experience.click();
        }}
      >
        <div className={styles.gameContent} inert={experience.portrait}>
          {!battleVisible && !growthEvent && systemControls}
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
                      experience.reset(getAudioScene(snapshotForPresentation(savedGame)));
                      experience.unlockAudio();
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
                systemControls={battleVisible ? systemControls : undefined}
                overlay={growthEvent ? {
                  seatSide: growthOwner?.seatSide ?? controlLayout.seatSide,
                  render: (size) => <GrowthPresentation event={growthEvent} progress={experience.frame.progress}
                    reducedMotion={experience.reducedMotion} {...size} />,
                } : undefined}
                board={
                  <GameBoard
                    tabletop
                    hideHud
                    selectedTile={selectedTile}
                    tokens={view!.players.map((player) => ({
                      id: player.id,
                      name: player.name,
                      color: PLAYER_COLORS[player.id],
                      position: player.position,
                      starterSpeciesId: player.starterSpeciesId,
                      leaderSpeciesId: player.leaderSpeciesId,
                      restTurnsRemaining: player.restTurnsRemaining,
                    }))}
                    guardians={view!.guardians}
                    activePlayerId={view!.activePlayerId}
                    battle={view!.battle}
                    presentation={presentation}
                    paused={experience.paused}
                    reducedMotion={experience.reducedMotion}
                    onTileSelect={(tile) => {
                      if (!experience.busy && !experience.paused && !movementVisible && game.roads[tile])
                        setSelection({ tile, revision: game.revision });
                    }}
                  />
                }
              >
                <div className={battleVisible ? styles.battleControls : styles.tableControls}>
                  <div className={styles.controlActions}>
                    {view!.battle && <BattleHud battle={view!.battle} presentation={presentation} inline />}
                    {!battleVisible && movementVisible ? (
                      <MovementPanel
                        state={game}
                        presentation={presentation}
                        reducedMotion={experience.reducedMotion}
                        notice={
                          presentation && ["lap", "level-up", "evolution"].includes(presentation.event.kind)
                            ? presentation.event.message
                            : undefined
                        }
                      />
                    ) : experience.frame.event ? (
                      <section className={styles.tableNotice} aria-label="진행 중인 연출">
                        {experience.frame.event.attack && <EventCaption presentation={presentation} inline />}
                        <strong role="status">{experience.frame.event.message}</strong>
                        <progress aria-label="연출 진행" max={1} value={experience.frame.progress} />
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

                  </div>
                  {!battleVisible && <PartySummary state={game} blocked={experience.busy || experience.paused} dispatch={(action) => dispatch(action, game.revision)} />}
                  {!battleVisible && <ExchangeControls state={game} blocked={experience.busy || experience.paused} dispatch={(action) => dispatch(action, game.revision)} />}
                </div>
              </TabletopControls>
              {selectedTile !== null && game.roads[selectedTile] && !battleVisible && !movementVisible && !experience.busy && !experience.paused && (
                <GuardianPopup tile={selectedTile} pokemon={game.roads[selectedTile]!.pokemon}
                  ownerName={game.players[game.roads[selectedTile]!.ownerId].name}
                  rootRef={gameRoot} onClose={() => setSelection(null)} />
              )}
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
