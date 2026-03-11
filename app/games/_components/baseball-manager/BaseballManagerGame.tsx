"use client";

import { useEffect, useMemo, useState } from "react";
import type { Database } from "sql.js";
import { BASEBALL_MANAGER_TITLE, SCREENS } from "./constants";
import { reduceGameState } from "./engine/gameReducer";
import { loadBaseballManagerState, saveBaseballManagerState } from "./engine/save";
import { seedBaseballManagerDb, selectMatchDetail, selectMatchDirectory, selectPlayerDetailFromDb, selectPlayerDirectoryFromDb } from "./engine/sqliteDb";
import { selectDashboard, selectMatchView, selectPlayerDirectory, selectSelectedPlayerCard } from "./engine/selectors";
import { createNewGameState } from "./sim/generateLeague";
import type {
  BaseballManagerUiState,
  GameState,
  MatchDirectoryFilters,
  PlayerDirectoryFilters,
  ScreenKey,
  UserAction,
} from "./types";
import { DashboardPanel } from "./ui/DashboardPanel";
import { FieldView } from "./ui/FieldView";
import { PlayerCard } from "./ui/PlayerCard";
import styles from "./BaseballManagerGame.module.css";

const HITTER_COLUMNS: Array<{ key: PlayerDirectoryFilters["sortKey"]; label: string }> = [
  { key: "name", label: "Name" },
  { key: "team", label: "Team" },
  { key: "position", label: "Pos" },
  { key: "games", label: "G" },
  { key: "plateAppearances", label: "PA" },
  { key: "hits", label: "H" },
  { key: "walks", label: "BB" },
  { key: "strikeOuts", label: "K" },
  { key: "homeRuns", label: "HR" },
  { key: "battingAverage", label: "AVG" },
];

const PITCHER_COLUMNS: Array<{ key: PlayerDirectoryFilters["sortKey"]; label: string }> = [
  { key: "name", label: "Name" },
  { key: "team", label: "Team" },
  { key: "position", label: "Pos" },
  { key: "games", label: "G" },
  { key: "inningsPitched", label: "IP" },
  { key: "earnedRuns", label: "ER" },
  { key: "hitsAllowed", label: "H" },
  { key: "walksAllowed", label: "BB" },
  { key: "strikeOutsThrown", label: "K" },
  { key: "pitchCount", label: "Pitches" },
  { key: "earnedRunAverage", label: "ERA" },
];

const MATCH_COLUMNS: Array<{ key: MatchDirectoryFilters["sortKey"]; label: string }> = [
  { key: "day", label: "Day" },
  { key: "date", label: "Date" },
  { key: "awayTeam", label: "Away" },
  { key: "homeTeam", label: "Home" },
  { key: "score", label: "Score" },
  { key: "pitchCount", label: "Pitches" },
  { key: "status", label: "Status" },
];

type RosterViewMode = "hitter" | "pitcher";

type UiAction =
  | { type: "set_screen"; screen: ScreenKey }
  | { type: "select_player"; playerId: string | null }
  | { type: "highlight_game"; gameId: string | null };

function createInitialUiState(state: GameState): BaseballManagerUiState {
  return {
    currentScreen: "dashboard",
    selectedPlayerId: null,
    highlightedGameId: null,
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
  const [state, setState] = useState<GameState | null>(null);
  const [uiState, setUiState] = useState<BaseballManagerUiState | null>(null);
  const [saveStatus, setSaveStatus] = useState("No local save written yet.");
  const [db, setDb] = useState<Database | null>(null);
  const [dbStatus, setDbStatus] = useState("Loading opening-day match records...");
  const [rosterViewMode, setRosterViewMode] = useState<RosterViewMode>("hitter");
  const [directoryFilters, setDirectoryFilters] = useState<PlayerDirectoryFilters>({
    search: "",
    teamId: "all",
    rosterLevel: "major",
    role: "hitter",
    position: "all",
    sortKey: "name",
    sortDirection: "asc",
  });
  const [matchFilters, setMatchFilters] = useState<MatchDirectoryFilters>({
    search: "",
    teamId: "all",
    played: "all",
    sortKey: "day",
    sortDirection: "asc",
  });

  const dispatchGame = (action: UserAction) => {
    setState((currentState) => (currentState ? reduceGameState(currentState, action) : currentState));
  };

  const dispatchUi = (action: UiAction) => {
    setUiState((currentState) => (currentState ? reduceUiState(currentState, action) : currentState));
  };

  useEffect(() => {
    const initialState = loadBaseballManagerState() ?? createNewGameState();
    setState(initialState);
    setUiState(createInitialUiState(initialState));
    setDirectoryFilters({
      search: "",
      teamId: initialState.userTeamId,
      rosterLevel: "major",
      role: "hitter",
      position: "all",
      sortKey: "name",
      sortDirection: "asc",
    });
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }

    let active = true;

    seedBaseballManagerDb(state)
      .then((nextDb) => {
        if (!active) {
          nextDb.close();
          return;
        }

        setDb((currentDb) => {
          currentDb?.close();
          return nextDb;
        });
        setDbStatus("Opening-day match records ready.");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setDb(null);
        setDbStatus("Failed to build in-memory match database.");
      });

    return () => {
      active = false;
    };
  }, [state]);

  const dashboard = useMemo(() => (state ? selectDashboard(state) : null), [state]);
  const selectedCard = useMemo(
    () => (state && uiState ? selectSelectedPlayerCard(state, uiState.selectedPlayerId) : null),
    [state, uiState],
  );
  const matchView = useMemo(() => (state ? selectMatchView(state) : null), [state]);
  const directoryRows = useMemo(
    () => (state ? (db ? selectPlayerDirectoryFromDb(db, directoryFilters) : selectPlayerDirectory(state, directoryFilters)) : []),
    [db, state, directoryFilters],
  );
  const matchRows = useMemo(() => (db ? selectMatchDirectory(db, matchFilters) : []), [db, matchFilters]);
  const selectedMatch = useMemo(
    () => (db && uiState?.highlightedGameId ? selectMatchDetail(db, uiState.highlightedGameId) : null),
    [db, uiState?.highlightedGameId],
  );
  const selectedPlayerDetail = useMemo(
    () => (db && uiState?.selectedPlayerId ? selectPlayerDetailFromDb(db, uiState.selectedPlayerId) : null),
    [db, uiState?.selectedPlayerId],
  );
  const teamOptions = useMemo(
    () => (state ? state.league.teams.map((team) => ({ id: team.id, name: team.name })) : []),
    [state],
  );
  const totalPlayers = state ? Object.keys(state.league.players).length : 0;
  const userTeamId = state?.userTeamId ?? "all";
  const rosterColumns = rosterViewMode === "pitcher" ? PITCHER_COLUMNS : HITTER_COLUMNS;

  if (!state || !uiState || !dashboard) {
    return (
      <div className={styles.panel}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Loading</p>
          <p className={styles.metaLine}>Preparing league data...</p>
        </section>
      </div>
    );
  }

  const changeDirectorySort = (sortKey: PlayerDirectoryFilters["sortKey"]) => {
    setDirectoryFilters((current) => ({
      ...current,
      sortKey,
      sortDirection: current.sortKey === sortKey && current.sortDirection === "asc" ? "desc" : "asc",
    }));
  };

  const changeRosterViewMode = (mode: RosterViewMode) => {
    setRosterViewMode(mode);
    setDirectoryFilters((current) => ({
      ...current,
      role: mode,
    }));
  };

  const changeMatchSort = (sortKey: MatchDirectoryFilters["sortKey"]) => {
    setMatchFilters((current) => ({
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
    setRosterViewMode("hitter");
    setUiState(createInitialUiState(savedState));
    setDirectoryFilters({
      search: "",
      teamId: savedState.userTeamId,
      rosterLevel: "major",
      role: "hitter",
      position: "all",
      sortKey: "name",
      sortDirection: "asc",
    });
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
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.tab} ${rosterViewMode === "hitter" ? styles.tabActive : ""}`}
              onClick={() => changeRosterViewMode("hitter")}
            >
              Batters
            </button>
            <button
              type="button"
              className={`${styles.tab} ${rosterViewMode === "pitcher" ? styles.tabActive : ""}`}
              onClick={() => changeRosterViewMode("pitcher")}
            >
              Pitchers
            </button>
          </div>
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
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="all">All levels</option>
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
                setDirectoryFilters({
                  search: "",
                  teamId: userTeamId,
                  rosterLevel: "major",
                  role: rosterViewMode,
                  position: "all",
                  sortKey: "name",
                  sortDirection: "asc",
                })
              }
            >
              Reset Filters
            </button>
          </div>
          <div className={styles.directoryTable}>
            <div className={`${styles.directoryRow} ${styles.directoryHeaderRow}`}>
              {rosterColumns.map((column) => (
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
                  {rosterViewMode === "pitcher" ? (
                    <>
                      <strong>{row.name}</strong>
                      <span>{row.teamName}</span>
                      <span>{row.position}</span>
                      <span>{row.games}</span>
                      <span>{row.inningsPitched.toFixed(1)}</span>
                      <span>{row.earnedRuns}</span>
                      <span>{row.hitsAllowed}</span>
                      <span>{row.walksAllowed}</span>
                      <span>{row.strikeOutsThrown}</span>
                      <span>{row.pitchCount}</span>
                      <span>{row.earnedRunAverageLabel}</span>
                    </>
                  ) : (
                    <>
                      <strong>{row.name}</strong>
                      <span>{row.teamName}</span>
                      <span>{row.position}</span>
                      <span>{row.games}</span>
                      <span>{row.plateAppearances}</span>
                      <span>{row.hits}</span>
                      <span>{row.walks}</span>
                      <span>{row.strikeOuts}</span>
                      <span>{row.homeRuns}</span>
                      <span>{row.battingAverageLabel}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (uiState.currentScreen === "games") {
      return (
        <section className={styles.card}>
          <p className={styles.eyebrow}>Match Records</p>
          <h2 className={styles.sectionTitle}>{matchRows.length} games</h2>
          <p className={styles.metaLine}>{dbStatus}</p>
          <div className={styles.filterBar}>
            <input
              type="search"
              value={matchFilters.search}
              onChange={(event) => setMatchFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search team or date"
              className={styles.input}
            />
            <select
              className={styles.select}
              value={matchFilters.teamId}
              onChange={(event) => setMatchFilters((current) => ({ ...current, teamId: event.target.value }))}
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
              value={matchFilters.played}
              onChange={(event) =>
                setMatchFilters((current) => ({
                  ...current,
                  played: event.target.value as MatchDirectoryFilters["played"],
                }))
              }
            >
              <option value="all">All statuses</option>
              <option value="played">Played</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <button
              type="button"
              className={styles.btn}
              onClick={() =>
                setMatchFilters({
                  search: "",
                  teamId: "all",
                  played: "all",
                  sortKey: "day",
                  sortDirection: "asc",
                })
              }
            >
              Reset Filters
            </button>
          </div>
          <div className={styles.directoryTable}>
            <div className={`${styles.matchRow} ${styles.directoryHeaderRow}`}>
              {MATCH_COLUMNS.map((column) => (
                <button
                  key={column.key}
                  type="button"
                  className={`${styles.headerButton} ${matchFilters.sortKey === column.key ? styles.headerButtonActive : ""}`}
                  onClick={() => changeMatchSort(column.key)}
                >
                  {column.label}
                  {matchFilters.sortKey === column.key ? (matchFilters.sortDirection === "asc" ? " ^" : " v") : ""}
                </button>
              ))}
            </div>
            <div className={styles.directoryList}>
              {matchRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`${styles.matchRow} ${row.id === uiState.highlightedGameId ? styles.playerCardSelected : ""}`}
                  onClick={() => dispatchUi({ type: "highlight_game", gameId: row.id })}
                >
                  <strong>Day {row.day}</strong>
                  <span>{row.dateLabel}</span>
                  <span>{row.awayTeamName}</span>
                  <span>{row.homeTeamName}</span>
                  <span>{row.scoreLine}</span>
                  <span>{row.pitchCount}</span>
                  <span>{row.statusLabel}</span>
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
            <section className={styles.playerDetailHeader}>
              <div className={styles.playerDetailProfile}>
                <div className={styles.playerHeader}>
                  <strong>{selectedCard.name}</strong>
                  <span>{selectedCard.badge}</span>
                </div>
                <p>{selectedCard.teamLine}</p>
                <p>{selectedCard.profileLine}</p>
                <p>{selectedCard.conditionLine}</p>
                <p>{selectedCard.recentUsage}</p>
                <p>{selectedCard.interview}</p>
              </div>
              <div className={styles.playerSummaryGrid}>
                {(selectedPlayerDetail?.summaryItems ?? []).map((item) => (
                  <div key={item.label} className={styles.playerSummaryItem}>
                    <span className={styles.eyebrow}>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className={styles.playerGameSection}>
              <p className={styles.eyebrow}>Game Log</p>
              <div className={styles.playerGameLogList}>
                {(selectedPlayerDetail?.games ?? []).map((game) => (
                  <div key={game.matchId} className={styles.playerGameLogRow}>
                    <strong>Day {game.day}</strong>
                    <span>{game.dateLabel}</span>
                    <span>
                      {game.venueLabel} {game.opponentName}
                    </span>
                    <span>{game.scoreLine}</span>
                    <span>{game.statLine}</span>
                  </div>
                ))}
                {selectedPlayerDetail && selectedPlayerDetail.games.length === 0 ? (
                  <p className={styles.metaLine}>No game log recorded yet.</p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {uiState.currentScreen === "games" && selectedMatch ? (
        <div className={styles.modalBackdrop} onClick={() => dispatchUi({ type: "highlight_game", gameId: null })} role="presentation">
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Match Detail</p>
                <h3 className={styles.sectionTitle}>{selectedMatch.title}</h3>
                <p className={styles.metaLine}>{selectedMatch.metaLine}</p>
                <p className={styles.metaLine}>{selectedMatch.scoreLine}</p>
                <p className={styles.metaLine}>{selectedMatch.pitchCount} pitches logged</p>
              </div>
              <button type="button" className={styles.btn} onClick={() => dispatchUi({ type: "highlight_game", gameId: null })}>
                Close
              </button>
            </div>
            <div className={styles.pitchLogList}>
              {selectedMatch.pitches.map((pitch) => (
                <div key={`${pitch.inningLabel}-${pitch.pitchNumber}-${pitch.pitcherName}-${pitch.batterName}`} className={styles.pitchLogRow}>
                  <strong>
                    {pitch.inningLabel} #{pitch.pitchNumber}
                  </strong>
                  <span>{pitch.pitcherName}</span>
                  <span>{pitch.batterName}</span>
                  <span>{pitch.pitchType}</span>
                  <span>{pitch.velocityLabel}</span>
                  <span>{pitch.resultLabel}</span>
                  <span>{pitch.runsScored > 0 ? `+${pitch.runsScored} R` : "-"}</span>
                  <span>{pitch.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
