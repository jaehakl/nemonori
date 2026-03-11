"use client";

import { useMemo, useReducer, useState } from "react";
import { BASEBALL_MANAGER_TITLE, SCREENS } from "./constants";
import { reduceGameState } from "./engine/gameReducer";
import { selectDashboard, selectMatchView, selectPlayerDirectory, selectSelectedPlayerCard } from "./engine/selectors";
import { loadBaseballManagerState, saveBaseballManagerState } from "./engine/save";
import { createNewGameState } from "./sim/generateLeague";
import type { BaseballManagerUiState, GameState, PlayerDirectoryFilters, ScreenKey, UserAction } from "./types";
import { DashboardPanel } from "./ui/DashboardPanel";
import { FieldView } from "./ui/FieldView";
import { PlayerCard } from "./ui/PlayerCard";
import styles from "./BaseballManagerGame.module.css";

const DIRECTORY_COLUMNS: Array<{ key: PlayerDirectoryFilters["sortKey"]; label: string }> = [
  { key: "name", label: "선수명" },
  { key: "team", label: "팀" },
  { key: "position", label: "포지션" },
  { key: "role", label: "유형" },
  { key: "games", label: "경기" },
  { key: "inningsPitched", label: "이닝" },
  { key: "battingAverage", label: "타율" },
  { key: "homeRuns", label: "홈런" },
  { key: "earnedRunAverage", label: "방어율" },
];

type UiAction =
  | { type: "set_screen"; screen: ScreenKey }
  | { type: "select_player"; playerId: string | null }
  | { type: "highlight_game"; gameId: string | null };

function createInitialUiState(state: GameState): BaseballManagerUiState {
  return {
    currentScreen: "dashboard",
    selectedPlayerId: null,
    highlightedGameId: state.season.nextUserGameId,
  };
}

function reduceUiState(state: BaseballManagerUiState, action: UiAction): BaseballManagerUiState {
  switch (action.type) {
    case "set_screen":
      return {
        ...state,
        currentScreen: action.screen,
      };
    case "select_player":
      return {
        ...state,
        selectedPlayerId: action.playerId,
      };
    case "highlight_game":
      return {
        ...state,
        highlightedGameId: action.gameId,
      };
    default:
      return state;
  }
}

export function BaseballManagerGame() {
  const initialState = useMemo(() => loadBaseballManagerState() ?? createNewGameState(), []);
  const [state, setState] = useState<GameState>(initialState);
  const [uiState, dispatchUi] = useReducer(reduceUiState, initialState, createInitialUiState);
  const [saveStatus, setSaveStatus] = useState("No local save written yet.");
  const [directoryFilters, setDirectoryFilters] = useState<PlayerDirectoryFilters>({
    search: "",
    teamId: "all",
    rosterLevel: "all",
    role: "all",
    position: "all",
    sortKey: "name",
    sortDirection: "asc",
  });

  const dispatchGame = (action: UserAction) => {
    setState((currentState) => reduceGameState(currentState, action));
  };

  const dashboard = selectDashboard(state);
  const selectedCard = selectSelectedPlayerCard(state, uiState.selectedPlayerId);
  const matchView = selectMatchView(state);
  const directoryRows = useMemo(() => selectPlayerDirectory(state, directoryFilters), [state, directoryFilters]);
  const teamOptions = useMemo(
    () => state.league.teams.map((team) => ({ id: team.id, name: team.name })),
    [state.league.teams],
  );
  const totalPlayers = Object.keys(state.league.players).length;

  const changeDirectorySort = (sortKey: PlayerDirectoryFilters["sortKey"]) => {
    setDirectoryFilters((current) => ({
      ...current,
      sortKey,
      sortDirection: current.sortKey === sortKey && current.sortDirection === "asc" ? "desc" : "asc",
    }));
  };

  const saveGame = () => {
    const saved = saveBaseballManagerState(state);
    if (!saved) {
      setSaveStatus("Save failed in this environment.");
      return;
    }
    setSaveStatus(`Saved at ${new Date(saved.updatedAt).toLocaleString("ko-KR")}`);
  };

  const loadGame = () => {
    const savedState = loadBaseballManagerState();
    if (!savedState) {
      setSaveStatus("No compatible save found.");
      return;
    }
    setState(savedState);
    dispatchUi({ type: "select_player", playerId: null });
    dispatchUi({ type: "highlight_game", gameId: savedState.season.nextUserGameId });
    setSaveStatus("Loaded local save.");
  };

  const renderScreen = () => {
    if (uiState.currentScreen === "dashboard") {
      return (
        <div className={styles.grid}>
          <DashboardPanel view={dashboard} saveStatus={saveStatus} />
          <div className={styles.stack}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>Selected Player</p>
              {selectedCard ? <PlayerCard card={selectedCard} selected /> : <p className={styles.metaLine}>No player selected.</p>}
            </section>
            <section className={styles.card}>
              <p className={styles.eyebrow}>Next Match Snapshot</p>
              <p className={styles.metaLine}>{dashboard.nextOpponent}</p>
              <p className={styles.metaLine}>{dashboard.matchStatus}</p>
            </section>
          </div>
        </div>
      );
    }

    if (uiState.currentScreen === "roster") {
      return (
        <section className={styles.card}>
          <p className={styles.eyebrow}>Player Directory</p>
          <h2 className={styles.sectionTitle}>
            {directoryRows.length} / {totalPlayers} players
          </h2>
          <div className={styles.filterBar}>
            <input
              type="search"
              value={directoryFilters.search}
              onChange={(event) => setDirectoryFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search player or team"
              className={styles.input}
            />
            <select
              className={styles.select}
              value={directoryFilters.teamId}
              onChange={(event) => setDirectoryFilters((current) => ({ ...current, teamId: event.target.value }))}
            >
              <option value="all">All teams</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={directoryFilters.rosterLevel}
              onChange={(event) =>
                setDirectoryFilters((current) => ({
                  ...current,
                  rosterLevel: event.target.value as PlayerDirectoryFilters["rosterLevel"],
                }))
              }
            >
              <option value="all">All levels</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
            <select
              className={styles.select}
              value={directoryFilters.role}
              onChange={(event) =>
                setDirectoryFilters((current) => ({
                  ...current,
                  role: event.target.value as PlayerDirectoryFilters["role"],
                }))
              }
            >
              <option value="all">All roles</option>
              <option value="hitter">Hitter</option>
              <option value="pitcher">Pitcher</option>
              <option value="two-way">Two-way</option>
            </select>
            <select
              className={styles.select}
              value={directoryFilters.position}
              onChange={(event) =>
                setDirectoryFilters((current) => ({
                  ...current,
                  position: event.target.value as PlayerDirectoryFilters["position"],
                }))
              }
            >
              <option value="all">All positions</option>
              <option value="SP">SP</option>
              <option value="RP">RP</option>
              <option value="C">C</option>
              <option value="1B">1B</option>
              <option value="2B">2B</option>
              <option value="3B">3B</option>
              <option value="SS">SS</option>
              <option value="LF">LF</option>
              <option value="CF">CF</option>
              <option value="RF">RF</option>
              <option value="DH">DH</option>
            </select>
            <button
              type="button"
              className={styles.btn}
              onClick={() =>
                setDirectoryFilters((current) => ({
                  ...current,
                  search: "",
                  teamId: "all",
                  rosterLevel: "all",
                  role: "all",
                  position: "all",
                  sortKey: "name",
                  sortDirection: "asc",
                }))
              }
            >
              Reset Filters
            </button>
          </div>
          <div className={styles.directoryTable}>
            <div className={`${styles.directoryRow} ${styles.directoryHeaderRow}`}>
              {DIRECTORY_COLUMNS.map((column) => (
                <button
                  key={column.key}
                  type="button"
                  className={`${styles.headerButton} ${directoryFilters.sortKey === column.key ? styles.headerButtonActive : ""}`}
                  onClick={() => changeDirectorySort(column.key)}
                >
                  {column.label}
                  {directoryFilters.sortKey === column.key ? (directoryFilters.sortDirection === "asc" ? " ^" : " v") : ""}
                </button>
              ))}
            </div>
            <div className={styles.directoryList}>
              {directoryRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`${styles.directoryRow} ${row.id === uiState.selectedPlayerId ? styles.playerCardSelected : ""}`}
                  onClick={() => dispatchUi({ type: "select_player", playerId: row.id })}
                >
                  <strong>{row.name}</strong>
                  <span>{row.teamName}</span>
                  <span>{row.position}</span>
                  <span>{row.role}</span>
                  <span>{row.games}</span>
                  <span>{row.inningsPitched.toFixed(1)}</span>
                  <span>{row.battingAverageLabel}</span>
                  <span>{row.homeRuns}</span>
                  <span>{row.earnedRunAverageLabel}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (uiState.currentScreen === "match") {
      if (!state.liveMatch) {
        return (
          <section className={styles.card}>
            <p className={styles.eyebrow}>Match Control</p>
            <p className={styles.metaLine}>
              {state.season.pendingUserMatch ? "A user match is ready. Start the session to enter pitch-by-pitch mode." : "Sim the season until the next user decision point."}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => dispatchGame({ type: "start_next_user_match" })}
                disabled={!state.season.pendingUserMatch}
              >
                Start Next User Match
              </button>
              <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "simulate_until_user_decision" })}>
                Sim To Next Decision
              </button>
            </div>
          </section>
        );
      }

      return (
        <div className={styles.stack}>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "resolve_match_step" })}>
              Resolve Pitch
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "queue_match_strategy", strategy: "bunt" })}>
              Queue Bunt
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "queue_match_strategy", strategy: "pinch-hit" })}>
              Queue Pinch Hit
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "queue_match_strategy", strategy: "defensive-sub" })}>
              Queue Defensive Sub
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "finish_user_match" })}>
              Finalize Match
            </button>
          </div>
          {matchView ? <FieldView view={matchView} /> : null}
        </div>
      );
    }

    return (
      <section className={styles.placeholder}>
        <p className={styles.eyebrow}>Draft</p>
        <h2 className={styles.sectionTitle}>Draft Screen Planned</h2>
        <p className={styles.metaLine}>
          Phase 1 locks the core state shape first. Draft flow can now be added on top of the regular-season state machine.
        </p>
      </section>
    );
  };

  return (
    <div className={styles.panel}>
      <header className={styles.toolbar}>
        <div className={styles.titleBlock}>
          <h2>{BASEBALL_MANAGER_TITLE}</h2>
          <p>React + pure TypeScript engine with DOM/SVG presentation.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => dispatchGame({ type: "simulate_until_user_decision" })}>
            Sim To Decision
          </button>
          <button type="button" className={styles.btn} onClick={saveGame}>
            Save Local
          </button>
          <button type="button" className={styles.btn} onClick={loadGame}>
            Load Local
          </button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Baseball manager navigation">
        {SCREENS.map((screen) => (
          <button
            key={screen}
            type="button"
            className={`${styles.tab} ${uiState.currentScreen === screen ? styles.tabActive : ""}`}
            onClick={() => dispatchUi({ type: "set_screen", screen: screen as ScreenKey })}
          >
            {screen}
          </button>
        ))}
      </nav>

      {renderScreen()}

      {uiState.currentScreen === "roster" && selectedCard ? (
        <div className={styles.modalBackdrop} onClick={() => dispatchUi({ type: "select_player", playerId: null })} role="presentation">
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Player Detail</p>
                <h3 className={styles.sectionTitle}>{selectedCard.name}</h3>
              </div>
              <button type="button" className={styles.btn} onClick={() => dispatchUi({ type: "select_player", playerId: null })}>
                Close
              </button>
            </div>
            <PlayerCard card={selectedCard} selected />
          </div>
        </div>
      ) : null}
    </div>
  );
}
