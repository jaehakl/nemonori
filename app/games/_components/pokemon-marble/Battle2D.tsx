"use client";

import { useId } from "react";
import type { BattleView } from "./presentation-events";
import { speciesById, typeNames } from "./pokemon-data";
import SvgPokemon from "./SvgPokemon";
import {
  BATTLE_ANCHORS, TYPE_EFFECTS, clampProgress, getBattlePose, getAttackFrame,
  type BattlePresentation,
} from "./battle-visuals";
import styles from "./Battle2D.module.css";

function EffectShape({ shape }: { shape: string }) {
  switch (shape) {
    case "bolt": return <path d="M5-23-12 3H0l-5 22L15-5H3Z" />;
    case "flame": return <path d="M0-24C9-9 22-3 15 12 8 29-20 19-16 3-13-8-5-9 0-24Z" />;
    case "wave": return <path d="M0-24C-9-9-19 1-16 10-12 28 13 28 17 10 20 1 9-9 0-24Z" />;
    case "leaves": return <path d="M-18 17C-23-8-2-25 20-18 24 7 5 25-18 17ZM-15 14 13-11" />;
    case "rocks": return <path d="M-20-6-7-22 17-13 22 9 3 21-17 13Z" />;
    case "shards": return <path d="M0-25 13 0 0 25-13 0ZM-22-10 22 10M-22 10 22-10" />;
    case "slash": return <path d="M-23 22 16-24 23-20-17 24Z" />;
    case "rush": return <path d="m-24-16 23 16-23 16h17L18 0-7-16Z" />;
    case "stars": return <path d="m0-25 7 17 18 1-14 12 4 19L0 14-15 24l4-19-14-12 18-1Z" />;
    case "bubble": return <><circle r="18" fill="none" strokeWidth="4" /><circle cx="-6" cy="-6" r="4" /></>;
    case "spiral": return <path d="M-21 1C-21-24 23-24 23 0S-9 23-9 4 10-9 9 3" fill="none" strokeWidth="5" />;
    case "helix": return <path d="M-23-18C24-18-24 18 23 18M23-18C-24-18 24 18-23 18" fill="none" strokeWidth="5" />;
    case "swarm": return <><ellipse cx="-9" cy="-4" rx="8" ry="14" /><ellipse cx="9" cy="-4" rx="8" ry="14" /></>;
    default: return <path d="m0-25 7 16 16-9-9 17 20 5-20 5 9 17-16-9-7 17-7-17-16 9 9-17-20-5 20-5-9-17 16 9Z" />;
  }
}

function AttackEffect({ presentation, reducedMotion }: {
  presentation: BattlePresentation;
  reducedMotion: boolean;
}) {
  const attack = presentation?.event.attack;
  if (presentation?.event.kind !== "attack" || !attack || attack.outcome === "miss") return null;
  const frame = getAttackFrame(presentation);
  const p = frame.progress;
  const critical = frame.hit?.breakdown.critical ?? attack.critical;
  if (p < 0.12 || p > 0.85) return null;
  const source = BATTLE_ANCHORS[attack.side];
  const target = BATTLE_ANCHORS[attack.side === "attacker" ? "defender" : "attacker"];
  const [color, shape] = TYPE_EFFECTS[attack.moveType ?? 0] ?? TYPE_EFFECTS[0];
  const impact = clampProgress((p - 0.45) / 0.4);
  if (reducedMotion) {
    return p < 0.45 ? null : (
      <g data-effect={shape} data-reduced-motion="true" stroke={color} fill="none" strokeWidth="4">
        <ellipse cx={target.x} cy={target.y} rx="165" ry="165" />
        {critical && <text data-critical="true" x={target.x} y={target.y - 140} textAnchor="middle" fill="#ffe390" stroke="none" fontSize="28" fontWeight="800">급소!</text>}
      </g>
    );
  }
  const travel = clampProgress((p - 0.12) / 0.33);
  const x = source.x + (target.x - source.x) * travel;
  return (
    <g data-effect={shape} data-source={attack.side} fill={color} stroke={color} strokeWidth="1.5" opacity={1 - impact}>
      {Array.from({ length: 9 }, (_, index) => {
        const angle = index * Math.PI * 2 / 9;
        const radius = p < 0.45 ? 18 + index * 3 : 30 + impact * 140;
        const px = x + Math.cos(angle) * radius;
        const py = target.y + Math.sin(angle) * radius;
        return (
          <g key={index} transform={`translate(${px} ${py}) rotate(${index * 40 + travel * 90}) scale(${0.55 + index % 3 * 0.18})`}>
            <EffectShape shape={shape} />
          </g>
        );
      })}
      {p >= 0.45 && <circle cx={target.x} cy={target.y} r={30 + impact * 135} fill="none" strokeWidth={7 * (1 - impact)} />}
      {critical && p >= 0.45 && <g data-critical="true" fill="#ffe390" stroke="#fff4c1" strokeWidth="3">
        <path d="m0-68 12 43 43-18-28 36 42 16-45 3 9 45-28-35-29 35 10-45-45-3 42-16-28-36 43 18Z" transform={`translate(${target.x} ${target.y}) scale(${1 + impact})`} />
        <text x={target.x} y={target.y - 140} textAnchor="middle" stroke="none" fontSize="28" fontWeight="800">급소!</text>
      </g>}
    </g>
  );
}

function CaptureBall({ presentation, reducedMotion }: {
  presentation: NonNullable<BattlePresentation>;
  reducedMotion: boolean;
}) {
  const { event } = presentation;
  const p = clampProgress(presentation.progress);
  const throwing = event.kind === "capture-throw";
  const shaking = event.kind === "capture-shake" || event.kind === "capture";
  const result = event.kind === "capture-result";
  const success = result && event.capture?.success === true;
  const failed = result && !event.capture?.success;
  const travel = throwing ? clampProgress(p / 0.6) : 1;
  const x = reducedMotion ? BATTLE_ANCHORS.defender.x
    : BATTLE_ANCHORS.attacker.x + (BATTLE_ANCHORS.defender.x - BATTLE_ANCHORS.attacker.x) * travel;
  const y = throwing && !reducedMotion
    ? 390 - Math.sin(travel * Math.PI) * 210 - (1 - clampProgress((p - 0.6) / 0.4)) * travel * 95
    : 390;
  const rotation = reducedMotion ? 0 : throwing ? travel * 360
    : shaking ? Math.sin(p * Math.PI * 4) * Math.sin(p * Math.PI) * 19 : 0;
  const opening = failed ? clampProgress(p / 0.5) : 0;
  return (
    <g data-capture-ball="true" data-capture-stage={event.kind} data-capture-success={result ? success : undefined}
      data-capture-shake={event.capture?.shake} transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <ellipse cy="33" rx="31" ry="8" fill="#071C15" opacity=".24" />
      {success && (
        <g data-capture-light="green">
          <circle r={reducedMotion ? 47 : 38 + p * 32} fill="none" stroke="#A6FCA4" strokeWidth="3" opacity={1 - p * .7} />
          <circle r="37" fill="#73EB88" opacity=".2" />
          {[-1, 1].map((direction) => (
            <path key={direction} d="m0-8 2.4 5.6L8 0 2.4 2.4 0 8-2.4 2.4-8 0-2.4-2.4Z"
              transform={`translate(${direction * (reducedMotion ? 48 : 38 + p * 20)} ${-28 - (reducedMotion ? 0 : p * 16)})`}
              fill="#EBDD94" opacity={1 - p * .6} />
          ))}
        </g>
      )}
      {failed && <circle data-capture-release="true" r={reducedMotion ? 42 : 25 + p * 90} fill="#FFF3D6" opacity={(1 - p) * .8} />}
      <g opacity={failed ? 1 - opening : 1}>
        <g transform={`translate(0 ${reducedMotion ? 0 : -opening * 30})`}>
          <path d="M-28 0a28 28 0 0 1 56 0Z" fill="#D95746" stroke="#243A31" strokeWidth="4" />
          <path d="M-18-12a21 21 0 0 1 27-7" fill="none" stroke="#FFA99A" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g transform={`translate(0 ${reducedMotion ? 0 : opening * 22})`}>
          <path d="M-28 0a28 28 0 0 0 56 0Z" fill="#FFF3D6" stroke="#243A31" strokeWidth="4" />
          <path d="M-21 13a24 24 0 0 0 41-2" fill="none" stroke="#D8CBB2" strokeWidth="3" />
        </g>
        <path d="M-28 0h56" stroke="#243A31" strokeWidth="6" />
        <circle r="10" fill="#243A31" stroke="#D7B46A" strokeWidth="2" />
        <circle r="6" fill={success ? "#8CF58A" : "#FFF9EC"} />
        {success && <circle r="3" fill="#E9FFE8" />}
      </g>
    </g>
  );
}

/** No canvas, GPU resources or private clock: each frame is an ordinary SVG. */
export default function Battle2D({ battle, presentation = null, reducedMotion = false }: {
  battle: BattleView;
  presentation?: BattlePresentation;
  reducedMotion?: boolean;
}) {
  const artId = useId().replace(/:/g, "");
  const p = clampProgress(presentation?.progress ?? 1);
  return (
    <svg className={styles.stage} viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="포켓몬 2D 배틀 무대. 체력과 기술은 배틀 정보에서 확인할 수 있습니다."
      data-battle-kind={battle.kind}>
      <title>{`${battle.attackerName} 대 ${battle.defenderName}`}</title>
      <defs>
        <radialGradient id={`${artId}-light`} cx="50%" cy="44%" r="72%">
          <stop offset="0" stopColor="#497B5D" /><stop offset="1" stopColor="#102D25" />
        </radialGradient>
        <linearGradient id={`${artId}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7DC99" /><stop offset=".6" stopColor="#A07739" /><stop offset="1" stopColor="#D7B46A" />
        </linearGradient>
        <linearGradient id={`${artId}-arena`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9E4BD" /><stop offset="1" stopColor="#BEC995" />
        </linearGradient>
        <pattern id={`${artId}-grain`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 0h2M4 4h2" stroke="#FFF3D6" strokeWidth=".7" opacity=".07" />
        </pattern>
      </defs>
      <path d="M0 0h1000v560H0Z" fill={`url(#${artId}-light)`} />
      <path d="M0 0h1000v560H0Z" fill={`url(#${artId}-grain)`} />
      <path d="M28 90V28h90m764 0h90v62M28 470v62h90m764 0h90v-62" fill="none" stroke="#D7B46A" strokeWidth="2" opacity=".45" />
      <ellipse cx="500" cy="435" rx="470" ry="112" fill="#071D16" opacity=".45" />
      <ellipse cx="500" cy="423" rx="466" ry="113" fill="#513629" stroke="#8B643A" strokeWidth="4" />
      <ellipse cx="500" cy="407" rx="466" ry="113" fill={`url(#${artId}-arena)`} stroke={`url(#${artId}-rim)`} strokeWidth="8" />
      <ellipse cx="500" cy="407" rx="430" ry="91" fill="none" stroke="#FFF3D6" strokeWidth="3" opacity=".8" />
      <path d="M500 316v182" stroke="#FFF3D6" strokeWidth="3" opacity=".8" />
      <ellipse cx="500" cy="407" rx="55" ry="30" fill="#D6D9AF" stroke="#FFF3D6" strokeWidth="3" />
      {(["attacker", "defender"] as const).map((side) => {
        const pose = getBattlePose(battle, side, presentation, reducedMotion);
        const color = side === "attacker" ? "#AF7846" : "#497D65";
        const anchor = BATTLE_ANCHORS[side];
        return (
          <g key={side} data-fighter={side} data-species={pose.speciesId} data-visible={pose.visible}>
            <ellipse cx={anchor.x} cy="428" rx="166" ry="46" fill="#243A31" opacity=".25" />
            <ellipse cx={anchor.x} cy="422" rx="166" ry="46" fill={side === "attacker" ? "#FFF3D6" : "#DAE8C9"} stroke={color} strokeWidth="3" />
            <ellipse cx={anchor.x} cy="422" rx="153" ry="38" fill="none" stroke="#D7B46A" strokeWidth="1.5" opacity=".7" />
            {pose.visible && pose.speciesId !== null ? (
              <>
                <ellipse cx={anchor.x} cy="426" rx={90 * pose.scale} ry="19" fill="#304f42" opacity={0.16 * pose.opacity} />
                <g transform={`translate(${pose.x} ${pose.y}) scale(${pose.scale})`} opacity={pose.opacity} data-pose="true" data-hit={pose.hit}>
                  {pose.glow > 0 && <circle r="157" fill="#ffe8a0" opacity={pose.glow * 0.65} />}
                  <SvgPokemon speciesId={pose.speciesId} x={0} y={0} size={320} color={color} />
                  {pose.hit && <path d="m-130-65 18 8-12 15m253-23-18 8 12 15" fill="none" stroke="#dc7750" strokeWidth="7" />}
                </g>
              </>
            ) : !battle[side] ? (
              <text x={anchor.x} y="310" textAnchor="middle" fill="#FFF3D6" fontSize="23">파트너 선택 중</text>
            ) : null}
            {battle[side] && (
              <text x={anchor.x} y="495" textAnchor="middle" fill="#365749" fontSize="21" fontWeight="700">
                {speciesById[pose.speciesId ?? battle[side]!.speciesId]?.name}
              </text>
            )}
          </g>
        );
      })}
      <AttackEffect presentation={presentation} reducedMotion={reducedMotion} />
      {presentation && (presentation.event.kind === "capture" || presentation.event.kind.startsWith("capture-")) && (
        <CaptureBall presentation={presentation} reducedMotion={reducedMotion} />
      )}
      {presentation?.event.attack && p >= 0.45 && p <= 0.85 && (
        <text x="500" y="72" textAnchor="middle" fill="#FFF3D6" fontSize="20" fontWeight="700">
          {typeNames[presentation.event.attack.moveType ?? 0] ?? "무상성"} · 명중
        </text>
      )}
    </svg>
  );
}
