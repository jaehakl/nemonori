"use client";

import { useId } from "react";
import { PLAYER_COLORS } from "./board";
import { speciesById } from "./pokemon-data";
import type { LapGrowthView, PresentationEvent } from "./presentation-events";
import { getEvolutionFrame, getGrowthFrame, getRewardGrid } from "./growth-visuals";
import SvgPokemon from "./SvgPokemon";
import styles from "./GrowthPresentation.module.css";

function RewardCard({ growth, progress, reducedMotion }: {
  growth: LapGrowthView;
  progress: number;
  reducedMotion: boolean;
}) {
  const frame = getGrowthFrame(growth, progress, reducedMotion);
  const name = speciesById[growth.before.speciesId].name;
  const location = growth.location.kind === "party" ? "파티" : `${growth.location.tile + 1}번 도로 수비`;
  const max = frame.level >= 100;
  return (
    <g role="group" aria-label={`${name} · ${location} · 레벨 ${frame.level}`} data-pokemon={growth.before.id}>
      <rect x="1" y="1" width="158" height="110" rx="12" fill="#fff6da" stroke="#c5a75b" strokeWidth="2" />
      <rect x="2" y="2" width="156" height="108" rx="11" fill="#ffe376" opacity={frame.glow * 0.35} />
      {frame.glow > 0 && (
        <circle cx="80" cy="52" r={18 + (1 - frame.glow) * 33}
          fill="#fff8bd" fillOpacity={frame.glow * 0.2}
          stroke="#edbe49" strokeWidth={frame.glow * 3} opacity={frame.glow} aria-hidden="true" />
      )}
      <text x="10" y="16" fontSize="9" fill="#706040">{location}</text>
      <g opacity={growth.before.hp === 0 ? 0.55 : 1}>
        <SvgPokemon speciesId={growth.before.speciesId} x={32} y={46} size={44} />
      </g>
      <text x="62" y="34" fontSize="12" fontWeight="800" fill="#173f35"
        textLength={name.length > 6 ? 87 : undefined} lengthAdjust="spacingAndGlyphs">{name}</text>
      <text x="62" y="52" fontSize="12" fill="#385644">Lv. {frame.level}</text>
      {frame.levelsGained > 0 && (
        <text x="80" y="70" textAnchor="middle" fontSize="10" fontWeight="900" fill="#946015">
          LEVEL UP! +{frame.levelsGained}
        </text>
      )}
      <g role="meter" aria-label={`${name} 경험치`} aria-valuemin={0} aria-valuemax={1000}
        aria-valuenow={max ? 1000 : frame.xp} aria-valuetext={max ? "최고 레벨" : `${Math.floor(frame.xp / 10)}%`}>
        <rect x="10" y="78" width="140" height="7" rx="3.5" fill="#d8dac3" />
        <rect x="10" y="78" width={max ? 140 : frame.xp / 1000 * 140} height="7" rx="3.5" fill="#27a17a" />
      </g>
      <text x="10" y="102" fontSize="10" fill="#55765f">{max ? "MAX" : `EXP +${growth.amount.toLocaleString("ko-KR")}`}</text>
      <text x="150" y="102" textAnchor="end" fontSize="10" fill="#55765f">{max ? "" : `${Math.floor(frame.xp / 10)}%`}</text>
      {frame.glow > 0 && (
        <g fill="#f9d75d" stroke="#b88632" strokeWidth="0.5" opacity={frame.glow} aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <path key={index} d="M0-5 1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z"
              transform={`translate(${12 + index * 44} ${22 + Math.sin(index * 2) * 12 - (1 - frame.glow) * 14})`} />
          ))}
        </g>
      )}
    </g>
  );
}

function LapReward({ event, progress, reducedMotion, width, height }: Props) {
  const growth = event.growth ?? [];
  const grid = getRewardGrid(growth.length, width, height);
  return (
    <section className={styles.scene} aria-label="완주 보상">
      <header className={styles.heading}>
        <span className={styles.eyebrow}>LAP COMPLETE</span>
        <h2>함께 달리고, 함께 성장!</h2>
        <p role="status">{event.snapshot.players.find((player) => player.id === event.playerId)?.name} · {growth.length}마리에게 완주 보상</p>
      </header>
      <svg className={styles.rewardGrid} viewBox={`0 0 ${grid.columns * 168 - 8} ${grid.rows * 120 - 8}`}
        role="group" aria-label="포켓몬 전체 성장 결과" preserveAspectRatio="xMidYMid meet">
        {growth.map((entry, index) => (
          <g key={entry.before.id} transform={`translate(${index % grid.columns * 168} ${Math.floor(index / grid.columns) * 120})`}>
            <RewardCard growth={entry} progress={progress} reducedMotion={reducedMotion} />
          </g>
        ))}
      </svg>
    </section>
  );
}

function EvolutionCelebration({ event, progress, reducedMotion, width, height }: Props) {
  const glowId = useId().replace(/:/g, "");
  const pokemon = event.pokemon!;
  const previousId = event.previousSpeciesId ?? pokemon.speciesId;
  const previousName = speciesById[previousId].name;
  const nextName = speciesById[pokemon.speciesId].name;
  const frame = getEvolutionFrame(progress, reducedMotion);
  const revealed = frame.stage === "reveal";
  const owner = event.snapshot.players.find((player) => player.id === event.playerId);
  const color = PLAYER_COLORS[event.playerId ?? 0];
  return (
    <section className={`${styles.scene} ${styles.evolution}`} aria-label="진화 연출" data-evolution-stage={frame.stage}>
      <header className={styles.heading}>
        <span className={styles.eyebrow}>A NEW CHAPTER</span>
        <h2 role="status">{revealed ? `${nextName}, 진화 성공!` : `${previousName}, 새로운 모습으로!`}</h2>
        <p><span className={styles.ownerDot} style={{ background: color }} />{owner?.name}의 포켓몬 · Lv. {pokemon.level}</p>
      </header>
      <svg className={styles.evolutionArt} viewBox={width < height ? "140 -60 620 640" : "0 0 900 520"} aria-hidden="true">
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0" stopColor="#ffefb0" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#ffd862" stopOpacity="0.25" />
            <stop offset="1" stopColor="#ffe49b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="450" cy="445" rx="195" ry="32" fill="#000" opacity="0.22" />
        <circle cx="450" cy="248" r={reducedMotion ? 225 : 180 + frame.progress * 100} fill={`url(#${glowId})`} />
        {!reducedMotion && [0, 1, 2].map((index) => (
          <ellipse key={index} cx="450" cy="248" rx={140 + index * 46} ry={70 + index * 20}
            fill="none" stroke="#ffe5a0" strokeWidth="2" opacity={revealed ? (1 - frame.reveal) * 0.5 : 0.25 + frame.transform * 0.4}
            transform={`rotate(${index * 60 + frame.progress * 150} 450 248)`} />
        ))}
        <g transform={`translate(450 248) scale(${frame.scale})`}>
          {!revealed && (
            <g opacity={1 - frame.transform} style={{ filter: frame.stage === "transform" ? "brightness(0) invert(1)" : undefined }}>
              <SvgPokemon speciesId={previousId} x={0} y={0} size={300} color={color} />
            </g>
          )}
          <g opacity={revealed ? 1 : frame.transform} style={{ filter: !revealed ? "brightness(0) invert(1)" : undefined }}>
            <SvgPokemon speciesId={pokemon.speciesId} x={0} y={0} size={300} color={color} />
          </g>
        </g>
        {!reducedMotion && Array.from({ length: 20 }, (_, index) => {
          const angle = index * Math.PI * 2 / 20;
          const distance = revealed ? 165 + frame.reveal * 190 : 290 - frame.progress * 220;
          const x = 450 + Math.cos(angle) * distance;
          const y = 248 + Math.sin(angle) * distance * 0.72;
          return <path key={index} d="M0-7 2-2 7 0 2 2 0 7-2 2-7 0-2-2Z" fill={index % 2 ? "#fff6cf" : "#e7c05e"}
            opacity={revealed ? 1 - frame.reveal : 0.7} transform={`translate(${x} ${y}) rotate(${frame.progress * 180 + index * 25})`} />;
        })}
        {revealed && (
          <g fill="#fff2c8" textAnchor="middle">
            <text x="450" y="470" fontSize="32" fontWeight="900">{nextName}</text>
            <text x="450" y="505" fontSize="17" opacity="0.8">{previousName} → {nextName}</text>
          </g>
        )}
      </svg>
    </section>
  );
}

type Props = {
  event: PresentationEvent;
  progress: number;
  reducedMotion: boolean;
  width: number;
  height: number;
};

export function hasGrowthPresentation(event: PresentationEvent | null): boolean {
  return Boolean(event && ((event.kind === "lap" && event.growth?.length)
    || (event.kind === "evolution" && event.pokemon)));
}

export default function GrowthPresentation(props: Props) {
  return props.event.kind === "lap" ? <LapReward {...props} /> : <EvolutionCelebration {...props} />;
}
