import type { AudioPreferences } from "./audio-preferences";
import type { DisplayMode } from "./display-preferences";
import SystemIcon from "./SystemIcon";
import systemStyles from "./SystemControls.module.css";
import styles from "./Experience.module.css";

export default function ExperienceControls({
  preferences,
  onPreferences,
  reducedMotion,
  onReducedMotion,
  onUnlock,
  displayMode,
  onDisplayMode,
}: {
  preferences: AudioPreferences;
  onPreferences: (preferences: AudioPreferences) => void;
  reducedMotion: boolean;
  onReducedMotion: (value: boolean) => void;
  onUnlock: () => void;
  displayMode: DisplayMode;
  onDisplayMode: (mode: DisplayMode) => void;
}) {
  return (
    <details className={styles.settings}>
      <summary
        className={systemStyles.iconButton}
        aria-label="화면 방향과 사운드 설정"
        title="화면 방향과 사운드 설정"
      >
        <SystemIcon name="settings" />
      </summary>
      <div className={styles.settingsPopover}>
        <label>
          화면 방향
          <select value={displayMode} onChange={(event) => onDisplayMode(event.target.value as DisplayMode)}>
            <option value="fixed">고정 방향</option>
            <option value="auto">조작자 방향 자동 회전</option>
          </select>
        </label>
        <strong>모험의 소리</strong>
        <button
          type="button"
          aria-pressed={!preferences.muted}
          onClick={() => {
            onPreferences({ ...preferences, muted: !preferences.muted });
            onUnlock();
          }}
        >
          {preferences.muted ? "소리 켜기" : "전체 음소거"}
        </button>
        <button type="button" onClick={onUnlock}>
          소리 재생·다시 연결
        </button>
        <label>
          배경 음악 <span>{Math.round(preferences.musicVolume * 100)}%</span>
          <input
            aria-label="배경 음악 볼륨"
            type="range"
            min="0"
            max="100"
            value={Math.round(preferences.musicVolume * 100)}
            onChange={(event) => {
              onPreferences({
                ...preferences,
                musicVolume: Number(event.target.value) / 100,
              });
              onUnlock();
            }}
          />
        </label>
        <label>
          효과음 <span>{Math.round(preferences.effectsVolume * 100)}%</span>
          <input
            aria-label="효과음 볼륨"
            type="range"
            min="0"
            max="100"
            value={Math.round(preferences.effectsVolume * 100)}
            onChange={(event) => {
              onPreferences({
                ...preferences,
                effectsVolume: Number(event.target.value) / 100,
              });
              onUnlock();
            }}
          />
        </label>
        <label className={styles.motionSetting}>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => onReducedMotion(event.target.checked)}
          />
          동작 줄이기
        </label>
      </div>
    </details>
  );
}
