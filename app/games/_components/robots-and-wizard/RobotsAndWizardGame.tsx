"use client";

import { useEffect } from "react";
import styles from "../RobotsAndWizardGame.module.css";
import { formatTime, LANDMARKS, PLAYER_MAX_HEALTH } from "./constants";
import { createRobotsAndWizardScene } from "./createRobotsAndWizardScene";
import { useRobotsAndWizardGame } from "./useRobotsAndWizardGame";

export function RobotsAndWizardGame() {
  const game = useRobotsAndWizardGame();
  const {
    panelRef,
    mountRef,
    bestTimeRef,
    selectedSpellRef,
    runId,
    visitedCount,
    elapsedSeconds,
    isCleared,
    isFullscreen,
    playerHealth,
    fireballChargeLevel,
    message,
    bestTime,
    selectedSpell,
    setVisitedCount,
    setElapsedSeconds,
    setIsCleared,
    setPlayerHealth,
    setFireballChargeLevel,
    setMessage,
    setBestTime,
    setSelectedSpell,
    restart,
    toggleFullscreen,
  } = game;

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      const mountElement = mountRef.current;
      if (!mountElement) {
        return;
      }

      cleanup = await createRobotsAndWizardScene({
        mountElement,
        canvasClassName: styles.canvas,
        bestTimeRef,
        selectedSpellRef,
        callbacks: {
          setVisitedCount,
          setElapsedSeconds,
          setIsCleared,
          setPlayerHealth,
          setFireballChargeLevel,
          setMessage,
          setBestTime,
          setSelectedSpell,
        },
      });

      if (disposed) {
        cleanup?.();
      }
    };

    void start();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [
    bestTimeRef,
    mountRef,
    runId,
    selectedSpellRef,
    setBestTime,
    setElapsedSeconds,
    setFireballChargeLevel,
    setIsCleared,
    setMessage,
    setPlayerHealth,
    setSelectedSpell,
    setVisitedCount,
  ]);

  const playerHealthPercent = Math.max(0, Math.min(100, (playerHealth / PLAYER_MAX_HEALTH) * 100));
  const chargePercent = Math.round(fireballChargeLevel * 100);

  return (
    <div ref={panelRef} className={`${styles.panel} ${isFullscreen ? styles.panelFullscreen : ""}`}>
      <header className={styles.stats}>
        <span>진행: {visitedCount}/{LANDMARKS.length}</span>
        <span>시간: {formatTime(elapsedSeconds)}</span>
        <span>상태: {isCleared ? "완료" : "진행 중"}</span>
        <span>최고기록: {bestTime === null ? "-" : formatTime(bestTime)}</span>
      </header>

      <div className={styles.playerHealthCard}>
        <div className={styles.playerHealthHeader}>
          <span>플레이어 체력</span>
          <strong>{playerHealth}/{PLAYER_MAX_HEALTH}</strong>
        </div>
        <div className={styles.playerHealthTrack}>
          <div className={styles.playerHealthFill} style={{ width: `${playerHealthPercent}%` }} />
        </div>
      </div>

      <div className={styles.canvasShell}>
        <div ref={mountRef} className={styles.canvasMount} />
        <div className={`${styles.crosshair} ${fireballChargeLevel > 0 ? styles.crosshairCharging : ""}`} aria-hidden="true">
          <span />
          <span />
        </div>
        {selectedSpell === "fireball" ? (
          <div className={`${styles.chargeHud} ${fireballChargeLevel > 0 ? styles.chargeHudVisible : ""}`}>
            <div className={styles.chargeHudHeader}>
              <span>파이어볼 차지</span>
              <strong>{chargePercent}%</strong>
            </div>
            <div className={styles.chargeTrack}>
              <div className={styles.chargeFill} style={{ width: `${chargePercent}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={restart}>
            다시 시작
          </button>
          <button type="button" className={styles.controlSecondary} onClick={() => void toggleFullscreen()}>
            {isFullscreen ? "전체화면 종료" : "전체화면"}
          </button>
        </div>
        <p className={styles.help}>
          {message} 현재 마법: {selectedSpell === "fireball" ? "파이어볼" : "체인 라이트닝"} · `1` 파이어볼 · `2` 체인
          라이트닝 · 파이어볼은 좌클릭 홀드 후 발사
        </p>
      </footer>
    </div>
  );
}
