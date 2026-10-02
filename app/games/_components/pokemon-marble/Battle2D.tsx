"use client";

import type { BattleView } from "./presentation-events";
import { speciesById, typeNames } from "./pokemon-data";
import SvgPokemon from "./SvgPokemon";
import {
  BATTLE_ANCHORS, TYPE_EFFECTS, clampProgress, getBattlePose,
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
  if (presentation?.event.kind !== "attack" || !attack) return null;
  const p = clampProgress(presentation.progress);
  if (p < 0.12 || p > 0.85) return null;
  const source = BATTLE_ANCHORS[attack.side];
  const target = BATTLE_ANCHORS[attack.side === "attacker" ? "defender" : "attacker"];
  const [color, shape] = TYPE_EFFECTS[attack.moveType ?? 0] ?? TYPE_EFFECTS[0];
  const impact = clampProgress((p - 0.45) / 0.4);
  if (reducedMotion) {
    return p < 0.45 ? null : (
      <g data-effect={shape} data-reduced-motion="true" stroke={color} fill="none" strokeWidth="4">
        <ellipse cx={target.x} cy={target.y} rx="165" ry="165" />
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
    </g>
  );
}

function CaptureBall({ progress, reducedMotion }: { progress: number; reducedMotion: boolean }) {
  const p = clampProgress(progress);
  const x = BATTLE_ANCHORS.defender.x;
  const y = reducedMotion ? 390 : 390 - Math.sin(p * Math.PI) * 95;
  const rotation = reducedMotion ? 0 : Math.sin(p * 28) * (1 - p) * 22;
  return (
    <g data-capture-ball="true" transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <circle r="27" fill="#fffdf5" stroke="#304b47" strokeWidth="4" />
      <path d="M-25 0a25 25 0 0 1 50 0Z" fill="#ed625b" />
      <path d="M-25 0h50" stroke="#304b47" strokeWidth="5" />
      <circle r="8" fill="#fffdf5" stroke="#304b47" strokeWidth="4" />
    </g>
  );
}

/** No canvas, GPU resources or private clock: each frame is an ordinary SVG. */
export default function Battle2D({ battle, presentation = null, reducedMotion = false }: {
  battle: BattleView;
  presentation?: BattlePresentation;
  reducedMotion?: boolean;
}) {
  const p = clampProgress(presentation?.progress ?? 1);
  return (
    <svg className={styles.stage} viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="포켓몬 2D 배틀 무대. 체력과 기술은 배틀 정보에서 확인할 수 있습니다."
      data-battle-kind={battle.kind}>
      <title>{`${battle.attackerName} 대 ${battle.defenderName}`}</title>
      <ellipse cx="500" cy="421" rx="466" ry="113" fill="#82b49c" />
      <ellipse cx="500" cy="407" rx="466" ry="113" fill="#e7efd2" stroke="#55836d" strokeWidth="3" />
      <ellipse cx="500" cy="407" rx="430" ry="91" fill="none" stroke="#fffdf0" strokeWidth="5" />
      <path d="M500 316v182" stroke="#fffdf0" strokeWidth="4" />
      <ellipse cx="500" cy="407" rx="55" ry="30" fill="none" stroke="#fffdf0" strokeWidth="4" />
      {(["attacker", "defender"] as const).map((side) => {
        const pose = getBattlePose(battle, side, presentation, reducedMotion);
        const color = side === "attacker" ? "#c46f43" : "#378b92";
        const anchor = BATTLE_ANCHORS[side];
        return (
          <g key={side} data-fighter={side} data-species={pose.speciesId} data-visible={pose.visible}>
            <ellipse cx={anchor.x} cy="422" rx="166" ry="46" fill={side === "attacker" ? "#f6e4ba" : "#c7e6d7"} stroke={color} strokeWidth="3" />
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
              <text x={anchor.x} y="310" textAnchor="middle" fill={color} fontSize="23">파트너 선택 중</text>
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
      {presentation?.event.kind === "capture" && <CaptureBall progress={p} reducedMotion={reducedMotion} />}
      {presentation?.event.attack && p >= 0.45 && p <= 0.85 && (
        <text x="500" y="72" textAnchor="middle" fill="#365749" fontSize="20" fontWeight="700">
          {typeNames[presentation.event.attack.moveType ?? 0] ?? "무상성"} · 명중
        </text>
      )}
    </svg>
  );
}
