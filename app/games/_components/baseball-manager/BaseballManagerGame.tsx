"use client";

import { useMemo, useReducer } from "react";
import { BASEBALL_MANAGER_TITLE, SCREENS } from "./constants";
import { reduceGameState } from "./engine/gameReducer";
import { selectDashboard, selectMatchView, selectRosterCards, selectSelectedPlayerCard } from "./engine/selectors";
import { loadBaseballManagerState, saveBaseballManagerState } from "./engine/save";
import { createNewGameState } from "./sim/generateLeague";
import type { ScreenKey } from "./types";
import { DashboardPanel } from "./ui/DashboardPanel";
import { FieldView } from "./ui/FieldView";
import { PlayerCard } from "./ui/PlayerCard";
import styles from "./BaseballManagerGame.module.css";

export function BaseballManagerGame() {
  const initialState = useMemo(() => loadBaseballManagerState() ?? createNewGameState(), []);
  const [state, dispatch] = useReducer(reduceGameState, initialState);

  const dashboard = selectDashboard(state);
  const rosterCards = selectRosterCards(state);
  const selectedCard = selectSelectedPlayerCard(state);
  const matchView = selectMatchView(state);

  const saveGame = () => {
    const saved = saveBaseballManagerState(state);
    if (!saved) {
      return;
    }
    dispatch({
      type: "manual_save_complete",
      savedAt: saved.updatedAt,
    });
  };

  const loadGame = () => {
    const savedState = loadBaseballManagerState();
    if (!savedState) {
      return;
    }
    dispatch({
      type: "load_state",
      state: savedState,
    });
  };

  const renderScreen = () => {
    if (state.currentScreen === "dashboard") {
      return (
        <div className={styles.grid}>
          <DashboardPanel view={dashboard} />
          <div className={styles.stack}>
            <section className={styles.card}>
              <p className={styles.eyebrow}>Selected Player</p>
              {selectedCard ? <PlayerCard card={selectedCard} selected /> : <p className={styles.metaLine}>선수 선택 없음</p>}
            </section>
            <section className={styles.card}>
              <p className={styles.eyebrow}>Next Match Snapshot</p>
              <p className={styles.metaLine}>{matchView.header}</p>
              <p className={styles.metaLine}>{matchView.inningLine}</p>
              <p className={styles.metaLine}>{matchView.countLine}</p>
            </section>
          </div>
        </div>
      );
    }

    if (state.currentScreen === "roster") {
      return (
        <div className={styles.grid}>
          <section className={styles.card}>
            <p className={styles.eyebrow}>Major Roster</p>
            <div className={styles.playerList}>
              {rosterCards.map((card) => (
                <PlayerCard
                  key={card.id}
                  card={card}
                  selected={card.id === state.selectedPlayerId}
                  onClick={() => dispatch({ type: "select_player", playerId: card.id })}
                />
              ))}
            </div>
          </section>
          <section className={styles.card}>
            <p className={styles.eyebrow}>Player Detail</p>
            {selectedCard ? <PlayerCard card={selectedCard} selected /> : <p className={styles.metaLine}>선수를 선택하세요.</p>}
          </section>
        </div>
      );
    }

    if (state.currentScreen === "match") {
      return (
        <div className={styles.stack}>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => dispatch({ type: "continue_match" })}>
              투구 진행
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatch({ type: "queue_strategy", strategy: "bunt" })}>
              번트 지시
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatch({ type: "queue_strategy", strategy: "pinch-hit" })}>
              대타 대기
            </button>
            <button type="button" className={styles.btn} onClick={() => dispatch({ type: "queue_strategy", strategy: "defensive-sub" })}>
              대수비 대기
            </button>
          </div>
          <FieldView view={matchView} />
        </div>
      );
    }

    return (
      <section className={styles.placeholder}>
        <p className={styles.eyebrow}>Draft</p>
        <h2 className={styles.sectionTitle}>드래프트 화면 예정</h2>
        <p className={styles.metaLine}>
          v1 타입 구조와 상태 계층은 준비되어 있고, 다음 단계에서 생성형 신인 풀과 스카우팅 리포트를 붙이면 된다.
        </p>
      </section>
    );
  };

  return (
    <div className={styles.panel}>
      <header className={styles.toolbar}>
        <div className={styles.titleBlock}>
          <h2>{BASEBALL_MANAGER_TITLE}</h2>
          <p>React 셸 + 순수 TS 엔진 + SVG/DOM UI 초기 골격</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => dispatch({ type: "advance_day" })}>
            하루 진행
          </button>
          <button type="button" className={styles.btn} onClick={saveGame}>
            수동 저장
          </button>
          <button type="button" className={styles.btn} onClick={loadGame}>
            저장 불러오기
          </button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Baseball manager navigation">
        {SCREENS.map((screen) => (
          <button
            key={screen}
            type="button"
            className={`${styles.tab} ${state.currentScreen === screen ? styles.tabActive : ""}`}
            onClick={() => dispatch({ type: "set_screen", screen: screen as ScreenKey })}
          >
            {screen}
          </button>
        ))}
      </nav>

      {renderScreen()}
    </div>
  );
}
