"use client";

import { Component, type ReactNode } from "react";
import styles from "./GameHost.module.css";

export function GameLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.status} role="alert">
      <p>게임을 불러오지 못했습니다. 다시 시도해 주세요.</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

export class GameErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void; resetKey: unknown },
  { failed: boolean; resetKey: unknown }
> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { resetKey: unknown }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <GameLoadError onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}
