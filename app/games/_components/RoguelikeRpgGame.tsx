"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import styles from "./RoguelikeRpgGame.module.css";

const GAME_SLUG = "roguelike-rpg";
const GAME_TITLE = "Drift Rogue";
const VIEW_RADIUS = 6;
const MAX_LOG_LINES = 10;

type Position = {
  x: number;
  y: number;
};

type Stats = {
  strength: number;
  agility: number;
  maxHp: number;
};

type GearType = "sword" | "armor";

type GearItem = {
  id: number;
  type: GearType;
  name: string;
  strength: number;
  agility: number;
  maxHp: number;
  weaponFactor: number;
  defense: number;
};

type Enemy = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  strength: number;
  agility: number;
  weaponFactor: number;
  defense: number;
};

type SaveData = {
  position: Position;
  baseStats: Stats;
  hp: number;
  sword: GearItem | null;
  armor: GearItem | null;
  inventory: GearItem[];
  enemies: Enemy[];
  combatEnemyId: number | null;
  nextEnemyId: number;
  nextItemId: number;
};

const DIRECTIONS: Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function keyOf(x: number, y: number) {
  return `${x},${y}`;
}

function hashToUnit(x: number, y: number) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function isWall(x: number, y: number) {
  if (x === 0 && y === 0) {
    return false;
  }
  return hashToUnit(x, y) < 0.16;
}

function isPassable(x: number, y: number) {
  return !isWall(x, y);
}

function randomInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffleDirections() {
  const copy = [...DIRECTIONS];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeEnemy(id: number, distance: number): Enemy {
  const level = Math.max(1, Math.floor(distance / 5) + 1);
  const maxHp = 24 + level * 8 + randomInt(0, 10);
  return {
    id,
    x: 0,
    y: 0,
    hp: maxHp,
    maxHp,
    strength: 5 + level * 2 + randomInt(0, 2),
    agility: 4 + level * 2 + randomInt(0, 3),
    weaponFactor: 0.8 + level * 0.08 + Math.random() * 0.2,
    defense: 1 + level + randomInt(0, 2),
  };
}

function makeItem(id: number): GearItem {
  const type: GearType = Math.random() < 0.5 ? "sword" : "armor";
  const prefix = ["낡은", "강철", "사파이어", "암흑", "고대"];
  const suffix = type === "sword" ? "검" : "갑옷";
  const quality = randomInt(1, 6);
  return {
    id,
    type,
    name: `${prefix[randomInt(0, prefix.length - 1)]} ${suffix}`,
    strength: randomInt(0, quality + 1),
    agility: randomInt(0, quality),
    maxHp: randomInt(0, quality + 2),
    weaponFactor: type === "sword" ? 1 + quality * 0.12 + Math.random() * 0.22 : 1,
    defense: type === "armor" ? quality + randomInt(1, 5) : 0,
  };
}

function formatTime(date: Date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function RoguelikeRpgGame() {
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [baseStats, setBaseStats] = useState<Stats>({ strength: 8, agility: 6, maxHp: 42 });
  const [hp, setHp] = useState(42);
  const [sword, setSword] = useState<GearItem | null>(null);
  const [armor, setArmor] = useState<GearItem | null>(null);
  const [inventory, setInventory] = useState<GearItem[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [combatEnemyId, setCombatEnemyId] = useState<number | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>(() => [
    `[${formatTime(new Date())}] 새 여정을 시작했습니다.`,
  ]);
  const [saveUpdatedAt, setSaveUpdatedAt] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return loadGameSave<SaveData>(GAME_SLUG)?.updatedAt ?? null;
  });

  const nextEnemyIdRef = useRef(1);
  const nextItemIdRef = useRef(1);

  const appendLog = useCallback((text: string) => {
    const stamp = formatTime(new Date());
    setBattleLog((prev) => [`[${stamp}] ${text}`, ...prev].slice(0, MAX_LOG_LINES));
  }, []);

  const totalStats = useMemo(() => {
    const gear = [sword, armor].filter((item): item is GearItem => item !== null);
    const bonus = gear.reduce(
      (acc, item) => {
        acc.strength += item.strength;
        acc.agility += item.agility;
        acc.maxHp += item.maxHp;
        return acc;
      },
      { strength: 0, agility: 0, maxHp: 0 },
    );

    return {
      strength: baseStats.strength + bonus.strength,
      agility: baseStats.agility + bonus.agility,
      maxHp: baseStats.maxHp + bonus.maxHp,
      swordFactor: sword?.weaponFactor ?? 1,
      armorDefense: armor?.defense ?? 0,
    };
  }, [armor, baseStats.agility, baseStats.maxHp, baseStats.strength, sword]);

  const combatEnemy = useMemo(
    () => enemies.find((enemy) => enemy.id === combatEnemyId) ?? null,
    [combatEnemyId, enemies],
  );

  const spawnEnemiesNear = useCallback((center: Position) => {
    setEnemies((prev) => {
      const nearby = prev.filter((enemy) => Math.abs(enemy.x - center.x) <= 7 && Math.abs(enemy.y - center.y) <= 7);
      if (nearby.length >= 6) {
        return prev;
      }

      const occupied = new Set(prev.map((enemy) => keyOf(enemy.x, enemy.y)));
      occupied.add(keyOf(center.x, center.y));
      const needed = 6 - nearby.length;
      const created: Enemy[] = [];

      for (let index = 0; index < needed; index += 1) {
        let placed = false;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const dx = randomInt(-8, 8);
          const dy = randomInt(-8, 8);
          if (dx === 0 && dy === 0) {
            continue;
          }
          const tx = center.x + dx;
          const ty = center.y + dy;
          if (!isPassable(tx, ty)) {
            continue;
          }
          const key = keyOf(tx, ty);
          if (occupied.has(key)) {
            continue;
          }

          const distance = Math.abs(tx) + Math.abs(ty);
          const enemy = makeEnemy(nextEnemyIdRef.current, distance);
          nextEnemyIdRef.current += 1;
          enemy.x = tx;
          enemy.y = ty;
          created.push(enemy);
          occupied.add(key);
          placed = true;
          break;
        }
        if (!placed) {
          break;
        }
      }

      return created.length > 0 ? [...prev, ...created] : prev;
    });
  }, []);

  const resetGame = useCallback(() => {
    nextEnemyIdRef.current = 1;
    nextItemIdRef.current = 1;
    setPosition({ x: 0, y: 0 });
    setBaseStats({ strength: 8, agility: 6, maxHp: 42 });
    setHp(42);
    setSword(null);
    setArmor(null);
    setInventory([]);
    setEnemies([]);
    setCombatEnemyId(null);
    setBattleLog([]);
    appendLog("새 여정을 시작했습니다.");
    spawnEnemiesNear({ x: 0, y: 0 });
  }, [appendLog, spawnEnemiesNear]);

  const loadFromSave = useCallback(() => {
    const saved = loadGameSave<SaveData>(GAME_SLUG);
    if (!saved?.data) {
      appendLog("저장 데이터가 없습니다.");
      return;
    }

    const data = saved.data;
    setPosition(data.position ?? { x: 0, y: 0 });
    setBaseStats(data.baseStats ?? { strength: 8, agility: 6, maxHp: 42 });
    setHp(typeof data.hp === "number" ? data.hp : 42);
    setSword(data.sword ?? null);
    setArmor(data.armor ?? null);
    setInventory(Array.isArray(data.inventory) ? data.inventory : []);
    setEnemies(Array.isArray(data.enemies) ? data.enemies : []);
    setCombatEnemyId(typeof data.combatEnemyId === "number" ? data.combatEnemyId : null);
    nextEnemyIdRef.current = typeof data.nextEnemyId === "number" ? data.nextEnemyId : 1;
    nextItemIdRef.current = typeof data.nextItemId === "number" ? data.nextItemId : 1;
    setSaveUpdatedAt(saved.updatedAt);
    appendLog("세이브를 불러왔습니다.");
  }, [appendLog]);

  const saveNow = useCallback(() => {
    const payload: SaveData = {
      position,
      baseStats,
      hp,
      sword,
      armor,
      inventory,
      enemies,
      combatEnemyId,
      nextEnemyId: nextEnemyIdRef.current,
      nextItemId: nextItemIdRef.current,
    };
    const envelope = saveGameSave(GAME_SLUG, GAME_TITLE, payload);
    if (envelope) {
      setSaveUpdatedAt(envelope.updatedAt);
      appendLog("중간 세이브 완료.");
    }
  }, [appendLog, armor, baseStats, combatEnemyId, enemies, hp, inventory, position, sword]);

  useEffect(() => {
    spawnEnemiesNear(position);
  }, [position, spawnEnemiesNear]);

  useEffect(() => {
    if (!combatEnemy) {
      return;
    }

    const interval = Math.max(220, 1200 - totalStats.agility * 22);
    const timer = window.setInterval(() => {
      setBaseStats((prev) => ({ ...prev, strength: prev.strength + 1 }));

      setEnemies((prev) => {
        const index = prev.findIndex((enemy) => enemy.id === combatEnemy.id);
        if (index < 0) {
          return prev;
        }

        const enemy = prev[index];
        const enemyEvadeChance = Math.min(0.48, enemy.agility * 0.012);
        if (Math.random() < enemyEvadeChance) {
          appendLog(`적 ${enemy.id}이(가) 회피했습니다.`);
          return prev;
        }

        const raw = totalStats.strength * totalStats.swordFactor;
        const damage = Math.max(1, Math.floor(raw - enemy.defense));
        const nextHp = enemy.hp - damage;
        appendLog(`플레이어 공격 ${damage} 피해 (적 ${enemy.id}).`);

        if (nextHp <= 0) {
          const next = prev.filter((candidate) => candidate.id !== enemy.id);
          const dropped = makeItem(nextItemIdRef.current);
          nextItemIdRef.current += 1;
          setInventory((items) => [dropped, ...items]);
          setCombatEnemyId(null);
          appendLog(`적 ${enemy.id} 처치. ${dropped.name} 획득.`);
          return next;
        }

        const next = [...prev];
        next[index] = { ...enemy, hp: nextHp };
        return next;
      });
    }, interval);

    return () => window.clearInterval(timer);
  }, [appendLog, combatEnemy, totalStats.agility, totalStats.strength, totalStats.swordFactor]);

  useEffect(() => {
    if (!combatEnemy) {
      return;
    }

    const interval = Math.max(300, 1300 - combatEnemy.agility * 20);
    const timer = window.setInterval(() => {
      const playerEvadeChance = Math.min(0.58, totalStats.agility * 0.012);
      if (Math.random() < playerEvadeChance) {
        appendLog("플레이어가 회피했습니다.");
        return;
      }

      const raw = combatEnemy.strength * combatEnemy.weaponFactor;
      const damage = Math.max(1, Math.floor(raw - totalStats.armorDefense));
      setBaseStats((prev) => ({ ...prev, maxHp: prev.maxHp + 1 }));
      setHp((prev) => {
        const next = Math.max(0, prev - damage);
        if (next <= 0) {
          setCombatEnemyId(null);
          appendLog("플레이어가 쓰러졌습니다. 다시 시작하세요.");
        } else {
          appendLog(`플레이어 피격 ${damage} 피해.`);
        }
        return next;
      });
    }, interval);

    return () => window.clearInterval(timer);
  }, [appendLog, combatEnemy, totalStats.agility, totalStats.armorDefense]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEnemies((prev) => {
        const occupied = new Set(prev.map((enemy) => keyOf(enemy.x, enemy.y)));
        const next: Enemy[] = [];
        let triggeredCombatId: number | null = null;

        for (const enemy of prev) {
          occupied.delete(keyOf(enemy.x, enemy.y));
          let moved = enemy;

          if (combatEnemyId !== enemy.id && Math.random() < 0.72) {
            const dirs = shuffleDirections();
            for (const dir of dirs) {
              const tx = enemy.x + dir.x;
              const ty = enemy.y + dir.y;
              const targetKey = keyOf(tx, ty);

              if (!isPassable(tx, ty)) {
                continue;
              }
              if (occupied.has(targetKey)) {
                continue;
              }

              moved = { ...enemy, x: tx, y: ty };
              break;
            }
          }

          if (moved.x === position.x && moved.y === position.y) {
            triggeredCombatId = moved.id;
            moved = enemy;
          }

          occupied.add(keyOf(moved.x, moved.y));
          next.push(moved);
        }

        if (triggeredCombatId !== null) {
          setCombatEnemyId(triggeredCombatId);
          appendLog(`적 ${triggeredCombatId}이(가) 접근해 교전 시작.`);
        }

        return next;
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [appendLog, combatEnemyId, position.x, position.y]);

  useEffect(() => {
    if (hp > 0) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        resetGame();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hp, resetGame]);

  const tryMove = useCallback(
    (dx: number, dy: number) => {
      if (hp <= 0) {
        return;
      }
      if (combatEnemyId !== null) {
        appendLog("교전 중에는 이동할 수 없습니다.");
        return;
      }

      const nx = position.x + dx;
      const ny = position.y + dy;
      if (!isPassable(nx, ny)) {
        appendLog("벽입니다.");
        return;
      }

      const enemy = enemies.find((target) => target.x === nx && target.y === ny);
      if (enemy) {
        setCombatEnemyId(enemy.id);
        appendLog(`적 ${enemy.id}과(와) 교전 시작.`);
        return;
      }

      setPosition({ x: nx, y: ny });
      setBaseStats((prev) => ({ ...prev, agility: prev.agility + 1 }));
    },
    [appendLog, combatEnemyId, enemies, hp, position.x, position.y],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
      }

      if (key === "arrowup" || key === "w") {
        tryMove(0, -1);
      } else if (key === "arrowdown" || key === "s") {
        tryMove(0, 1);
      } else if (key === "arrowleft" || key === "a") {
        tryMove(-1, 0);
      } else if (key === "arrowright" || key === "d") {
        tryMove(1, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tryMove]);

  const enemiesByPosition = useMemo(() => {
    const map = new Map<string, Enemy>();
    enemies.forEach((enemy) => map.set(keyOf(enemy.x, enemy.y), enemy));
    return map;
  }, [enemies]);

  const viewCells = useMemo(() => {
    const cells: { x: number; y: number; type: "player" | "enemy" | "wall" | "floor"; hp: number }[] = [];

    for (let y = position.y - VIEW_RADIUS; y <= position.y + VIEW_RADIUS; y += 1) {
      for (let x = position.x - VIEW_RADIUS; x <= position.x + VIEW_RADIUS; x += 1) {
        if (x === position.x && y === position.y) {
          cells.push({ x, y, type: "player", hp: 0 });
          continue;
        }

        const enemy = enemiesByPosition.get(keyOf(x, y));
        if (enemy) {
          cells.push({ x, y, type: "enemy", hp: Math.floor((enemy.hp / enemy.maxHp) * 100) });
          continue;
        }

        cells.push({ x, y, type: isPassable(x, y) ? "floor" : "wall", hp: 0 });
      }
    }

    return cells;
  }, [enemiesByPosition, position.x, position.y]);

  const equipItem = useCallback((item: GearItem) => {
    if (item.type === "sword") {
      setSword(item);
      appendLog(`${item.name} 장착.`);
    } else {
      setArmor(item);
      appendLog(`${item.name} 장착.`);
    }
  }, [appendLog]);

  const currentHp = Math.min(hp, totalStats.maxHp);

  return (
    <div className={styles.panel}>
      <header className={styles.statsRow}>
        <span>HP {currentHp} / {totalStats.maxHp}</span>
        <span>힘 {totalStats.strength} (기본 {baseStats.strength})</span>
        <span>민첩 {totalStats.agility} (기본 {baseStats.agility})</span>
        <span>방어 {totalStats.armorDefense}</span>
        <span>공격 배율 x{totalStats.swordFactor.toFixed(2)}</span>
      </header>

      <div className={styles.layout}>
        <section className={styles.map} aria-label="Roguelike map">
          {viewCells.map((cell) => (
            <div
              key={`${cell.x}-${cell.y}`}
              className={`${styles.cell} ${styles[cell.type]} ${
                cell.type === "enemy" && combatEnemyId !== null && enemiesByPosition.get(keyOf(cell.x, cell.y))?.id === combatEnemyId
                  ? styles.target
                  : ""
              }`}
              title={cell.type === "enemy" ? `적 HP ${cell.hp}%` : undefined}
            />
          ))}
        </section>

        <aside className={styles.side}>
          <div className={styles.box}>
            <p>현재 좌표: ({position.x}, {position.y})</p>
            <p>{combatEnemy ? `교전 중: 적 ${combatEnemy.id}` : "교전 없음"}</p>
            <p>{saveUpdatedAt ? `최근 세이브: ${new Date(saveUpdatedAt).toLocaleString()}` : "세이브 없음"}</p>
            <div className={styles.actions}>
              <button type="button" onClick={saveNow} className={styles.action}>세이브</button>
              <button type="button" onClick={loadFromSave} className={styles.action}>불러오기</button>
              <button type="button" onClick={resetGame} className={styles.action}>리셋</button>
            </div>
          </div>

          <div className={styles.box}>
            <p>이동</p>
            <div className={styles.controls}>
              <button type="button" onClick={() => tryMove(0, -1)} className={styles.control}>UP</button>
              <button type="button" onClick={() => tryMove(-1, 0)} className={styles.control}>LEFT</button>
              <button type="button" onClick={() => tryMove(0, 1)} className={styles.control}>DOWN</button>
              <button type="button" onClick={() => tryMove(1, 0)} className={styles.control}>RIGHT</button>
            </div>
          </div>

          <div className={styles.box}>
            <p>장비</p>
            <p>검: {sword ? `${sword.name} (x${sword.weaponFactor.toFixed(2)})` : "없음"}</p>
            <p>갑옷: {armor ? `${armor.name} (방어 ${armor.defense})` : "없음"}</p>
          </div>

          <div className={styles.box}>
            <p>인벤토리</p>
            <ul className={styles.inventory}>
              {inventory.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <span>
                    {item.name} [+힘 {item.strength} / +민첩 {item.agility} / +HP {item.maxHp}]
                  </span>
                  <button type="button" onClick={() => equipItem(item)} className={styles.equip}>장착</button>
                </li>
              ))}
              {inventory.length === 0 && <li>아이템 없음</li>}
            </ul>
          </div>
        </aside>
      </div>

      <section className={styles.logBox}>
        <p>전투 로그</p>
        <ul>
          {battleLog.map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
          {battleLog.length === 0 && <li>로그 없음</li>}
        </ul>
      </section>

      <p className={styles.help}>이동 시 민첩 +1, 공격 시 힘 +1, 피격 시 최대 HP +1. 방향키/WASD 이동, 사망 시 R로 재시작.</p>
    </div>
  );
}
