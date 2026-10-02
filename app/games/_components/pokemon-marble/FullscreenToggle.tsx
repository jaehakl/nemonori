"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { getFullscreenState, toggleFullscreen } from "./fullscreen";
import SystemIcon from "./SystemIcon";
import systemStyles from "./SystemControls.module.css";
import styles from "./FullscreenToggle.module.css";

type Props = {
  targetRef: RefObject<HTMLDivElement | null>;
  onChange?: (fullscreen: boolean) => void;
};

export default function FullscreenToggle({ targetRef, onChange }: Props) {
  const messageId = useId();
  const [state, setState] = useState(() => getFullscreenState(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailable = "이 브라우저에서는 전체 화면을 지원하지 않습니다.";
  const label = busy
    ? "전체 화면 전환 중"
    : state.active
      ? "전체 화면 종료"
      : "전체 화면";

  useEffect(() => {
    const sync = () => {
      const next = getFullscreenState(targetRef.current);
      setState(next);
      onChange?.(next.active);
    };
    const failed = () => {
      setError("전체 화면을 전환하지 못했습니다. 다시 눌러 주세요.");
      sync();
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("fullscreenerror", failed);
    const frame = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("fullscreenerror", failed);
    };
  }, [targetRef, onChange]);

  async function toggle() {
    const target = targetRef.current;
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await toggleFullscreen(target);
      const next = getFullscreenState(target);
      setState(next);
      onChange?.(next.active);
    } catch {
      setError("전체 화면을 전환하지 못했습니다. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={systemStyles.iconButton}
        onClick={toggle}
        disabled={!state.supported || busy}
        aria-pressed={state.active}
        aria-label={label}
        aria-busy={busy}
        aria-describedby={error || !state.supported ? messageId : undefined}
        title={state.supported ? label : `${label} · ${unavailable}`}
      >
        <SystemIcon name={state.active ? "exitFullscreen" : "fullscreen"} />
      </button>
      {error ? (
        <span id={messageId} role="alert" className={styles.error}>
          {error}
        </span>
      ) : !state.supported ? (
        <span id={messageId} className={styles.visuallyHidden}>
          {unavailable}
        </span>
      ) : null}
    </div>
  );
}
