import type { Landmark, SpellId } from "./types";

export const GAME_SLUG = "robots-and-wizard";
export const GAME_TITLE = "Robots and Wizard";

export const DEFAULT_MESSAGE = "캔버스를 클릭해 시점을 고정하고, 마우스와 WASD로 모든 장소를 방문하세요.";
export const DEFAULT_SPELL: SpellId = "fireball";

export const MOVE_SPEED = 10;
export const JUMP_SPEED = 9.5;
export const PLAYER_GRAVITY = 15;
export const WORLD_LIMIT = 52;
export const CLEAR_RADIUS = 4.2;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_MAX_HEALTH = 100;

export const FIREBALL_SPEED = 24;
export const FIREBALL_MAX_SPEED = 64;
export const FIREBALL_LIFETIME = 30.5;
export const FIREBALL_RADIUS = 0.21;
export const FIREBALL_HIT_RADIUS = 7;
export const FIREBALL_DAMAGE = 34;
export const FIREBALL_CHARGE_MAX_MS = 1600;
export const FIREBALL_MAX_EXPLOSION_SCALE = 10.0;

export const CHAIN_LIGHTNING_RANGE = 42;
export const CHAIN_LIGHTNING_WIDTH = 3.4;
export const CHAIN_LIGHTNING_BOUNCE_RANGE = 14;
export const CHAIN_LIGHTNING_MAX_BOUNCES = 5;
export const CHAIN_LIGHTNING_DAMAGE = 26;

export const EXPLOSION_RADIUS = 9;
export const EXPLOSION_DAMAGE = 55;
export const HOUSE_MAX_HEALTH = 100;

export const ENEMY_MOVE_SPEED = 4.3;
export const ENEMY_SPAWN_INTERVAL = 1.6;
export const ENEMY_MAX_ACTIVE = 5;
export const ENEMY_SPAWN_OFFSET = 6;
export const ENEMY_DESPAWN_DISTANCE = 95;
export const ENEMY_VISUAL_SCALE = 2.45;
export const ENEMY_BODY_HEIGHT = 4.6;
export const ENEMY_BODY_RADIUS = 1.1;
export const ENEMY_ATTACK_DISTANCE = 4.2;
export const ENEMY_MIN_HEALTH = 25;
export const ENEMY_MAX_HEALTH = 80;
export const ENEMY_MISSILE_RANGE = 34;
export const ENEMY_MISSILE_SPEED = 13;
export const ENEMY_MISSILE_MAX_SPEED = 25;
export const ENEMY_MISSILE_ACCELERATION = 18;
export const ENEMY_MISSILE_GRAVITY = 15;
export const ENEMY_MISSILE_LAUNCH_ANGLE_DEGREES = 30;
export const ENEMY_MISSILE_RADIUS = 0.16;
export const ENEMY_MISSILE_HIT_RADIUS = 1.2;
export const ENEMY_MISSILE_COOLDOWN = 2.2;
export const ENEMY_MISSILE_DAMAGE = 14;
export const ENEMY_MISSILE_LIFETIME = 5.6;

export const LANDMARKS: Landmark[] = [
  { id: "plaza", label: "Plaza Fountain", position: { x: -24, z: -12 }, color: [0.95, 0.76, 0.25] },
  { id: "market", label: "Market", position: { x: 18, z: -18 }, color: [0.98, 0.51, 0.3] },
  { id: "tower", label: "Watch Tower", position: { x: 30, z: 14 }, color: [0.5, 0.76, 0.98] },
  { id: "lake", label: "Lake", position: { x: -22, z: 22 }, color: [0.31, 0.85, 0.64] },
  { id: "gate", label: "Village Gate", position: { x: 0, z: 34 }, color: [0.75, 0.65, 0.99] },
];

export const formatTime = (seconds: number) => {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
};
