"use client";

import styles from "./DiceCradle.module.css";

type Props = {
  dice: [number, number] | null;
  progress?: number;
  reducedMotion?: boolean;
};

function Die({
  value,
  index,
  progress,
  reducedMotion,
}: {
  value: number;
  index: number;
  progress: number;
  reducedMotion: boolean;
}) {
  // Follow the 1.8s presentation and audio: shake, slowing tumbles, land, hold.
  const moving = !reducedMotion && progress < 0.86;
  const tumble = Math.max(0, Math.min(1, (progress - 0.145) / 0.605));
  const settle = Math.max(0, Math.min(1, (progress - 0.75) / 0.11));
  const deceleration = 1 - (1 - tumble) ** 3;
  const shake = progress < 0.145 ? Math.sin(progress * 180 + index) * 7 : 0;
  const angle = moving ? shake + (index ? -1 : 1) * deceleration * 1080 : 0;
  const scale = !moving ? 1 : progress < 0.145 ? 0.9 : 0.62 + settle * 0.38;
  const travel = moving ? Math.sin(progress * 34 + index * 2) * 16 * (1 - progress / 0.86) : 0;
  const hop = moving && progress >= 0.145 && progress < 0.75
    ? Math.sin(tumble * Math.PI * 5 + index) * 4 * (1 - tumble)
    : 0;
  const faceTick = Math.floor((1 - (1 - Math.min(1, progress / 0.75)) ** 2) * 26);
  const face = !reducedMotion && progress < 0.75
    ? 1 + (faceTick * 5 + index * 3 + value) % 6
    : value;
  const impactTime = (progress - (index ? 0.81 : 0.75)) / 0.1;
  const impact = !reducedMotion && impactTime > 0 && impactTime < 1
    ? Math.sin(impactTime * Math.PI)
    : 0;
  const pips: [number, number][] = [];
  if (face % 2) pips.push([0, 0]);
  if (face >= 2) pips.push([-15, -15], [15, 15]);
  if (face >= 4) pips.push([15, -15], [-15, 15]);
  if (face === 6) pips.push([-15, 0], [15, 0]);

  return (
    <g
      transform={`translate(${60 + index * 100 + travel} ${55 + hop})`}
      data-die={index}
      data-face={face}
      data-result={value}
    >
      <ellipse cx="0" cy="21" rx="29" ry="7" fill="#294c35" opacity={moving ? 0.1 : 0.16} />
      {impact > 0 && (
        <ellipse
          cx="0" cy="20"
          rx={32 + impact * 8} ry={5 + impact * 3}
          fill="none" stroke="#718e61" strokeWidth="2"
          opacity={impact * 0.6}
        />
      )}
      <g transform={`rotate(${angle}) scale(${scale})`}>
        <rect x="-30" y="-30" width="60" height="60" rx="10" fill="#fff3d6" stroke="#d7b46a" strokeWidth="2.5" />
        <rect x="-25" y="-25" width="50" height="50" rx="7" fill="none" stroke="#fffdf2" strokeWidth="2" />
        {pips.map(([px, py], pip) => (
          <circle key={pip} cx={px} cy={py} r="4.3" fill={face === 1 ? "#cf534c" : "#26382b"} />
        ))}
      </g>
    </g>
  );
}

/** A single pair driven only by presentation progress, including when paused. */
export default function DiceCradle({ dice, progress = 1, reducedMotion = false }: Props) {
  const rollProgress = dice ? Math.max(0, Math.min(1, progress)) : 1;
  const settled = reducedMotion || rollProgress >= 0.86;
  const label = !dice
    ? "주사위 두 개"
    : settled ? `주사위 ${dice[0]} + ${dice[1]}` : "주사위를 굴리는 중";
  const values = dice ?? [1, 6];

  return (
    <svg
      className={styles.cradle}
      viewBox="0 0 220 110"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {values.map((value, index) => (
        <Die key={index} value={value} index={index} progress={rollProgress} reducedMotion={reducedMotion} />
      ))}
    </svg>
  );
}
