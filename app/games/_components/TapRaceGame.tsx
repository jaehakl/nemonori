"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./TapRaceGame.module.css";

const ROUND_SECONDS = 10;

export function TapRaceGame() {
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  useEffect(() => {
    if (!running) {
      return;
    }

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [running]);

  const buttonLabel = useMemo(() => {
    if (secondsLeft === 0) {
      return "라운드 종료 - 다시 시작";
    }
    if (!running && score === 0) {
      return "시작";
    }
    if (!running) {
      return "다시 시작";
    }
    return "탭!";
  }, [running, score, secondsLeft]);

  const handlePress = () => {
    if (!running) {
      setRunning(true);
      setSecondsLeft(ROUND_SECONDS);
      setScore(0);
      return;
    }

    setScore((prev) => {
      const next = prev + 1;
      setBestScore((best) => Math.max(best, next));
      return next;
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.stats}>
        <span>남은 시간: {secondsLeft}s</span>
        <span>점수: {score}</span>
        <span>최고: {bestScore}</span>
      </div>
      <button type="button" className={styles.tapButton} onClick={handlePress}>
        {buttonLabel}
      </button>
      <p className={styles.help}>룰: 시작 후 10초 동안 버튼을 가능한 빨리 누르세요.</p>
    </div>
  );
}
