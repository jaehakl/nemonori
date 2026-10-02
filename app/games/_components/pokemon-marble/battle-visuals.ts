import type { BattleView, PresentationEvent } from "./presentation-events";
import type { BattleSide } from "./types";

export type BattlePresentation = { event: PresentationEvent; progress: number } | null;

export const BATTLE_ANCHORS = {
  attacker: { x: 265, y: 285 },
  defender: { x: 735, y: 285 },
};

export function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
}

/** Pure poses share the presentation clock with HP and audio, including pause/skip. */
export function getBattlePose(
  battle: BattleView,
  side: BattleSide,
  presentation: BattlePresentation,
  reducedMotion: boolean,
) {
  const pokemon = battle[side];
  const event = presentation?.event;
  const p = clampProgress(presentation?.progress ?? 1);
  const eventSide = event?.side ??
    (battle.defender?.id === event?.pokemon?.id ? "defender" : "attacker");
  const fainting = event?.kind === "faint" && (event.side ?? "defender") === side;
  const capturing = event?.kind === "capture" && side === "defender";
  const finalHit = event?.kind === "attack" && event.attack?.side !== side &&
    Boolean(event.attack?.beforeHp);
  const pose = {
    ...BATTLE_ANCHORS[side],
    speciesId: pokemon?.speciesId ?? null,
    visible: Boolean(pokemon && (pokemon.hp > 0 || fainting || capturing || finalHit)),
    opacity: 1,
    scale: 1,
    hit: false,
    glow: 0,
  };
  if (!event) return pose;

  if (event.kind === "attack" && event.attack) {
    const source = event.attack.side === side;
    const direction = side === "attacker" ? 1 : -1;
    if (!reducedMotion) {
      if (source) pose.x += Math.sin(Math.min(1, p / 0.45) * Math.PI) * 42 * direction;
      else if (p > 0.45 && p < 0.75) pose.x += Math.sin((p - 0.45) * 65) * 12;
    }
    pose.hit = !source && p >= 0.45 && p < 0.62;
  } else if (fainting) {
    pose.opacity = 1 - p;
    if (!reducedMotion) pose.y += p * 45;
  } else if (["send-out", "deploy"].includes(event.kind) && eventSide === side) {
    pose.opacity = Math.min(1, p * 3);
    if (!reducedMotion) pose.scale = 0.55 + Math.min(1, p * 2) * 0.45;
  } else if (event.kind === "evolution" && eventSide === side) {
    if (p < 0.5) pose.speciesId = event.previousSpeciesId ?? pose.speciesId;
    pose.glow = Math.sin(p * Math.PI);
    if (!reducedMotion) pose.scale = 1 + pose.glow * 0.1;
  } else if (capturing) {
    const t = clampProgress((p - 0.15) / 0.4);
    const shrink = t * t * (3 - 2 * t);
    pose.scale = reducedMotion ? 1 : 1 - shrink;
    pose.opacity = (pokemon?.hp === 0 ? 0.35 : 1) * (1 - shrink);
  } else if (["heal", "level-up"].includes(event.kind) && eventSide === side) {
    pose.glow = Math.sin(p * Math.PI);
  }
  return pose;
}

// PokeAPI types retain distinct shapes as well as colors.
export const TYPE_EFFECTS = [
  ["#cfa34b", "burst"], ["#cfa34b", "burst"], ["#da6647", "rush"],
  ["#74b3d1", "spiral"], ["#aa65ba", "bubble"], ["#b38a51", "rocks"],
  ["#9d8259", "rocks"], ["#8aac3c", "swarm"], ["#8275c4", "spiral"],
  ["#7c9fac", "shards"], ["#ef743b", "flame"], ["#39afd2", "wave"],
  ["#54a551", "leaves"], ["#e4ac1c", "bolt"], ["#d568a7", "spiral"],
  ["#6bc5ca", "shards"], ["#866dce", "helix"], ["#625773", "slash"],
  ["#dc83b5", "stars"],
] as const;
