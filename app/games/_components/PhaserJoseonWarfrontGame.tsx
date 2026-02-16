"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Phaser from "phaser";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import styles from "./PhaserJoseonWarfrontGame.module.css";

const GAME_SLUG = "phaser-joseon-warfront";
const GAME_TITLE = "Joseon Warfront";
const MAP_WIDTH = 680;
const MAP_HEIGHT = 420;

type PhaserRuntime = typeof Phaser;
type Owner = "player" | "enemy";

type Region = {
  id: number;
  name: string;
  x: number;
  y: number;
  neighbors: number[];
};

type BattleConfig = {
  targetRegionId: number;
  attackerCount: number;
  defenderCount: number;
};

type BattleResult = "victory" | "defeat";

const REGIONS: Region[] = [
  { id: 0, name: "서해북부", x: 120, y: 82, neighbors: [1, 3] },
  { id: 1, name: "한양", x: 245, y: 96, neighbors: [0, 2, 4] },
  { id: 2, name: "동해북부", x: 382, y: 86, neighbors: [1, 5] },
  { id: 3, name: "황해", x: 150, y: 190, neighbors: [0, 4, 6] },
  { id: 4, name: "중원", x: 265, y: 198, neighbors: [1, 3, 5, 7] },
  { id: 5, name: "영동", x: 388, y: 198, neighbors: [2, 4, 8] },
  { id: 6, name: "전라", x: 166, y: 305, neighbors: [3, 7, 9] },
  { id: 7, name: "충청", x: 278, y: 304, neighbors: [4, 6, 8, 9] },
  { id: 8, name: "경상", x: 390, y: 308, neighbors: [5, 7, 9] },
  { id: 9, name: "남해", x: 280, y: 378, neighbors: [6, 7, 8] },
];

const INITIAL_OWNERS: Owner[] = [
  "enemy",
  "enemy",
  "enemy",
  "player",
  "player",
  "enemy",
  "player",
  "player",
  "enemy",
  "player",
];

function createStrategyModeGame({
  PhaserRef,
  parent,
  owners,
  turn,
  allowAttack,
  onAttackSelected,
}: {
  PhaserRef: PhaserRuntime;
  parent: HTMLDivElement;
  owners: Owner[];
  turn: number;
  allowAttack: boolean;
  onAttackSelected: (regionId: number) => void;
}): Phaser.Game {
  const isAttackable = (regionId: number) => {
    if (owners[regionId] !== "enemy") {
      return false;
    }
    return REGIONS[regionId].neighbors.some((neighborId) => owners[neighborId] === "player");
  };

  const scene: Phaser.Types.Scenes.SceneType = {
    key: "JoseonWarfrontStrategyScene",
    create(this: Phaser.Scene) {
      this.add.rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, 0x0f172a, 1);
      this.add.rectangle(MAP_WIDTH / 2, 58, MAP_WIDTH, 92, 0x1e293b, 0.62);

      const links = new Set<string>();
      const g = this.add.graphics().setDepth(1);
      g.lineStyle(3, 0x94a3b8, 0.46);

      for (const region of REGIONS) {
        for (const neighborId of region.neighbors) {
          const key = [region.id, neighborId].sort((a, b) => a - b).join("-");
          if (links.has(key)) {
            continue;
          }
          links.add(key);
          const n = REGIONS[neighborId];
          g.beginPath();
          g.moveTo(region.x, region.y);
          g.lineTo(n.x, n.y);
          g.strokePath();
        }
      }

      for (const region of REGIONS) {
        const owner = owners[region.id];
        const attackable = allowAttack && isAttackable(region.id);
        const fill = owner === "player" ? 0x3b82f6 : attackable ? 0xb91c1c : 0x334155;
        const stroke = attackable ? 0xfbbf24 : 0xe2e8f0;

        const node = this.add
          .circle(region.x, region.y, 28, fill, 0.95)
          .setStrokeStyle(3, stroke, 0.95)
          .setDepth(3)
          .setInteractive({ cursor: attackable ? "pointer" : "default" });

        this.add
          .text(region.x, region.y - 3, region.name, {
            color: "#f8fafc",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "12px",
          })
          .setOrigin(0.5)
          .setDepth(4);

        this.add
          .text(region.x, region.y + 15, owner === "player" ? "아군" : "적", {
            color: owner === "player" ? "#bfdbfe" : attackable ? "#fcd34d" : "#cbd5e1",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "11px",
          })
          .setOrigin(0.5)
          .setDepth(4);

        if (attackable) {
          node.on("pointerdown", () => {
            onAttackSelected(region.id);
          });
        }
      }

      this.add
        .text(14, 12, `전략 모드 (턴 ${turn})`, {
          color: "#fcd34d",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "14px",
        })
        .setDepth(10);

      this.add
        .text(14, 32, "인접한 적 영토를 클릭하면 전투 모드가 시작됩니다.", {
          color: "#e2e8f0",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "12px",
        })
        .setDepth(10);
    },
  };

  return new PhaserRef.Game({
    type: PhaserRef.AUTO,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    parent,
    backgroundColor: "#0f172a",
    scene,
    scale: {
      mode: PhaserRef.Scale.FIT,
      autoCenter: PhaserRef.Scale.CENTER_BOTH,
    },
  });
}

function createBattleModeGame({
  PhaserRef,
  parent,
  config,
  onBattleTick,
  onBattleEnd,
}: {
  PhaserRef: PhaserRuntime;
  parent: HTMLDivElement;
  config: BattleConfig;
  onBattleTick: (alliesLeft: number, enemiesLeft: number) => void;
  onBattleEnd: (result: BattleResult) => void;
}): Phaser.Game {
  const heroSpeed = 220;
  const heroAttackRange = 50;
  const heroAttackArc = 0.8;
  const heroAttackCooldown = 360;
  const heroAttackDuration = 140;
  const unitAttackRange = 18;
  const unitAttackCooldown = 580;
  const allySpeed = 105;
  const enemySpeed = 128;

  type Unit = {
    team: "ally" | "enemy";
    sprite: Phaser.GameObjects.Arc;
    cooldown: number;
    alive: boolean;
  };

  let hero: Phaser.GameObjects.Rectangle | null = null;
  let heroShadow: Phaser.GameObjects.Ellipse | null = null;
  let heroFacing = { x: 1, y: 0 };
  let heroAttackCooldownLeft = 0;
  let heroAttackTimeLeft = 0;
  let heroAlive = true;
  let isEnded = false;
  let spaceWasDown = false;

  const allies: Unit[] = [];
  const enemies: Unit[] = [];

  let cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  let keyW: Phaser.Input.Keyboard.Key | null = null;
  let keyA: Phaser.Input.Keyboard.Key | null = null;
  let keyS: Phaser.Input.Keyboard.Key | null = null;
  let keyD: Phaser.Input.Keyboard.Key | null = null;
  let keySpace: Phaser.Input.Keyboard.Key | null = null;

  const removeDeadUnits = () => {
    for (let i = allies.length - 1; i >= 0; i -= 1) {
      if (!allies[i].alive) {
        allies[i].sprite.destroy();
        allies.splice(i, 1);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (!enemies[i].alive) {
        enemies[i].sprite.destroy();
        enemies.splice(i, 1);
      }
    }
  };

  const nearestEnemyFor = (x: number, y: number) => {
    let nearest: Unit | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const d = Math.hypot(enemy.sprite.x - x, enemy.sprite.y - y);
      if (d < nearestDist) {
        nearest = enemy;
        nearestDist = d;
      }
    }
    return { nearest, nearestDist };
  };

  const nearestAllyFor = (x: number, y: number) => {
    let nearest: Unit | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const ally of allies) {
      if (!ally.alive) continue;
      const d = Math.hypot(ally.sprite.x - x, ally.sprite.y - y);
      if (d < nearestDist) {
        nearest = ally;
        nearestDist = d;
      }
    }
    return { nearest, nearestDist };
  };

  const scene: Phaser.Types.Scenes.SceneType = {
    key: "JoseonWarfrontBattleScene",
    create(this: Phaser.Scene) {
      this.add.rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, 0x14532d, 1).setDepth(-8);
      this.add.rectangle(MAP_WIDTH / 2, 52, MAP_WIDTH, 88, 0x052e16, 0.45).setDepth(-7);

      const battlefield = this.add.graphics().setDepth(-4);
      battlefield.fillStyle(0x166534, 1);
      battlefield.fillRoundedRect(38, 52, MAP_WIDTH - 76, MAP_HEIGHT - 90, 24);
      battlefield.lineStyle(4, 0x78350f, 0.9);
      battlefield.strokeRoundedRect(38, 52, MAP_WIDTH - 76, MAP_HEIGHT - 90, 24);

      heroShadow = this.add.ellipse(95, MAP_HEIGHT / 2 + 10, 28, 12, 0x000000, 0.24);
      hero = this.add.rectangle(95, MAP_HEIGHT / 2, 18, 18, 0xf8fafc, 1).setStrokeStyle(2, 0x1e3a8a, 1);

      for (let i = 0; i < config.attackerCount; i += 1) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const ally = this.add
          .circle(120 + col * 22, 148 + row * 24, 7, 0x60a5fa, 0.95)
          .setStrokeStyle(2, 0x1d4ed8, 0.95);
        allies.push({ team: "ally", sprite: ally, cooldown: PhaserRef.Math.Between(0, 360), alive: true });
      }

      for (let i = 0; i < config.defenderCount; i += 1) {
        const row = Math.floor(i / 5);
        const col = i % 5;
        const enemy = this.add
          .circle(MAP_WIDTH - 180 + col * 22, 138 + row * 24, 7, 0xf87171, 0.96)
          .setStrokeStyle(2, 0x7f1d1d, 0.95);
        enemies.push({ team: "enemy", sprite: enemy, cooldown: PhaserRef.Math.Between(0, 360), alive: true });
      }

      this.add
        .text(14, 11, "전투 모드", {
          color: "#fde68a",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "14px",
        })
        .setDepth(12);

      this.add
        .text(14, 31, "이동: 화살표/WASD | 칼 휘두르기: Space", {
          color: "#f8fafc",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "12px",
        })
        .setDepth(12);

      if (this.input.keyboard) {
        cursors = this.input.keyboard.createCursorKeys();
        keyW = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.W);
        keyA = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.A);
        keyS = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.S);
        keyD = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.D);
        keySpace = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.SPACE);
      }

      onBattleTick(allies.length, enemies.length);
    },
    update(this: Phaser.Scene, _time: number, delta: number) {
      if (!hero || !heroShadow || !heroAlive || isEnded) {
        return;
      }

      const dt = delta / 1000;
      heroAttackCooldownLeft = Math.max(0, heroAttackCooldownLeft - delta);
      heroAttackTimeLeft = Math.max(0, heroAttackTimeLeft - delta);

      const left = Boolean(cursors?.left?.isDown || keyA?.isDown);
      const right = Boolean(cursors?.right?.isDown || keyD?.isDown);
      const up = Boolean(cursors?.up?.isDown || keyW?.isDown);
      const down = Boolean(cursors?.down?.isDown || keyS?.isDown);
      const sx = (right ? 1 : 0) - (left ? 1 : 0);
      const sy = (down ? 1 : 0) - (up ? 1 : 0);

      if (sx !== 0 || sy !== 0) {
        const len = Math.hypot(sx, sy);
        const nx = sx / len;
        const ny = sy / len;
        hero.x += nx * heroSpeed * dt;
        hero.y += ny * heroSpeed * dt;
        heroFacing = { x: nx, y: ny };
      }

      hero.x = PhaserRef.Math.Clamp(hero.x, 54, MAP_WIDTH - 54);
      hero.y = PhaserRef.Math.Clamp(hero.y, 72, MAP_HEIGHT - 44);
      heroShadow.setPosition(hero.x, hero.y + 9);

      const spaceDown = Boolean(keySpace?.isDown);
      const justPressedSpace = spaceDown && !spaceWasDown;
      spaceWasDown = spaceDown;

      if (justPressedSpace && heroAttackCooldownLeft <= 0) {
        heroAttackCooldownLeft = heroAttackCooldown;
        heroAttackTimeLeft = heroAttackDuration;
      }

      if (heroAttackTimeLeft > 0) {
        const sweep = this.add.graphics().setDepth(11);
        sweep.fillStyle(0xf59e0b, 0.24);
        sweep.slice(
          hero.x,
          hero.y,
          heroAttackRange,
          Math.atan2(heroFacing.y, heroFacing.x) - heroAttackArc,
          Math.atan2(heroFacing.y, heroFacing.x) + heroAttackArc,
          false,
        );
        sweep.fillPath();
        this.time.delayedCall(35, () => {
          sweep.destroy();
        });

        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const dx = enemy.sprite.x - hero.x;
          const dy = enemy.sprite.y - hero.y;
          const dist = Math.hypot(dx, dy);
          if (dist > heroAttackRange) continue;

          const ex = dx / Math.max(0.0001, dist);
          const ey = dy / Math.max(0.0001, dist);
          const dot = ex * heroFacing.x + ey * heroFacing.y;
          if (dot < Math.cos(heroAttackArc)) continue;
          enemy.alive = false;
        }
      }

      for (let i = 0; i < allies.length; i += 1) {
        const ally = allies[i];
        if (!ally.alive) continue;
        ally.cooldown = Math.max(0, ally.cooldown - delta);

        const { nearest: target, nearestDist } = nearestEnemyFor(ally.sprite.x, ally.sprite.y);
        if (target) {
          if (nearestDist > unitAttackRange) {
            const dx = target.sprite.x - ally.sprite.x;
            const dy = target.sprite.y - ally.sprite.y;
            const len = Math.max(0.001, Math.hypot(dx, dy));
            ally.sprite.x += (dx / len) * allySpeed * dt;
            ally.sprite.y += (dy / len) * allySpeed * dt;
          } else if (ally.cooldown <= 0) {
            target.alive = false;
            ally.cooldown = unitAttackCooldown;
          }
        } else {
          const followX = hero.x - 38 - (i % 4) * 12;
          const followY = hero.y + Math.floor(i / 4) * 12 - 18;
          const dx = followX - ally.sprite.x;
          const dy = followY - ally.sprite.y;
          const len = Math.max(0.001, Math.hypot(dx, dy));
          if (len > 8) {
            ally.sprite.x += (dx / len) * allySpeed * 0.76 * dt;
            ally.sprite.y += (dy / len) * allySpeed * 0.76 * dt;
          }
        }
      }

      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        enemy.cooldown = Math.max(0, enemy.cooldown - delta);

        const nearAlly = nearestAllyFor(enemy.sprite.x, enemy.sprite.y);
        const shouldAttackAlly = nearAlly.nearest && nearAlly.nearestDist < 115;

        if (shouldAttackAlly && nearAlly.nearest) {
          if (nearAlly.nearestDist > unitAttackRange) {
            const dx = nearAlly.nearest.sprite.x - enemy.sprite.x;
            const dy = nearAlly.nearest.sprite.y - enemy.sprite.y;
            const len = Math.max(0.001, Math.hypot(dx, dy));
            enemy.sprite.x += (dx / len) * enemySpeed * dt;
            enemy.sprite.y += (dy / len) * enemySpeed * dt;
          } else if (enemy.cooldown <= 0) {
            nearAlly.nearest.alive = false;
            enemy.cooldown = unitAttackCooldown;
          }
        } else {
          const dx = hero.x - enemy.sprite.x;
          const dy = hero.y - enemy.sprite.y;
          const dist = Math.max(0.001, Math.hypot(dx, dy));
          if (dist > unitAttackRange) {
            enemy.sprite.x += (dx / dist) * enemySpeed * dt;
            enemy.sprite.y += (dy / dist) * enemySpeed * dt;
          } else if (enemy.cooldown <= 0) {
            heroAlive = false;
            enemy.cooldown = unitAttackCooldown;
          }
        }
      }

      removeDeadUnits();
      onBattleTick(allies.length, enemies.length);

      if (!heroAlive) {
        isEnded = true;
        hero.setFillStyle(0x7f1d1d, 1);
        this.time.delayedCall(320, () => {
          onBattleEnd("defeat");
        });
        return;
      }

      if (enemies.length === 0) {
        isEnded = true;
        this.time.delayedCall(220, () => {
          onBattleEnd("victory");
        });
      }
    },
  };

  return new PhaserRef.Game({
    type: PhaserRef.AUTO,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    parent,
    backgroundColor: "#14532d",
    scene,
    scale: {
      mode: PhaserRef.Scale.FIT,
      autoCenter: PhaserRef.Scale.CENTER_BOTH,
    },
  });
}

function countOwned(owners: Owner[], side: Owner) {
  return owners.filter((owner) => owner === side).length;
}

function hasAttackableEnemy(owners: Owner[]) {
  return REGIONS.some((region) => {
    if (owners[region.id] !== "enemy") {
      return false;
    }
    return region.neighbors.some((neighborId) => owners[neighborId] === "player");
  });
}

export function PhaserJoseonWarfrontGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [runId, setRunId] = useState(0);
  const [turn, setTurn] = useState(1);
  const [owners, setOwners] = useState<Owner[]>([...INITIAL_OWNERS]);
  const [phase, setPhase] = useState<"strategy" | "battle" | "ended">("strategy");
  const [status, setStatus] = useState("전략 모드");
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null);
  const [battleAllies, setBattleAllies] = useState(0);
  const [battleEnemies, setBattleEnemies] = useState(0);
  const [lastLog, setLastLog] = useState("인접한 적 영토를 선택해 공격하세요.");
  const [bestTerritories, setBestTerritories] = useState(() => {
    if (typeof window === "undefined") {
      return countOwned(INITIAL_OWNERS, "player");
    }
    const saved = loadGameSave<{ bestTerritories?: number }>(GAME_SLUG);
    if (typeof saved?.data?.bestTerritories === "number") {
      return saved.data.bestTerritories;
    }
    return countOwned(INITIAL_OWNERS, "player");
  });

  const playerTerritories = useMemo(() => countOwned(owners, "player"), [owners]);
  const enemyTerritories = REGIONS.length - playerTerritories;

  useEffect(() => {
    saveGameSave(GAME_SLUG, GAME_TITLE, { bestTerritories });
  }, [bestTerritories]);

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }

    let cancelled = false;
    let phaserGame: Phaser.Game | null = null;

    const start = async () => {
      const phaserModule = await import("phaser");
      const PhaserRef = ("default" in phaserModule ? phaserModule.default : phaserModule) as PhaserRuntime;
      if (cancelled || !mountRef.current) {
        return;
      }

      if (phase === "strategy" || phase === "ended") {
        phaserGame = createStrategyModeGame({
          PhaserRef,
          parent: mountRef.current,
          owners,
          turn,
          allowAttack: phase === "strategy",
          onAttackSelected: (targetRegionId) => {
            if (cancelled) {
              return;
            }
            const attackerCount = countOwned(owners, "player");
            const defenderCount = countOwned(owners, "enemy");
            if (attackerCount <= 0 || defenderCount <= 0) {
              return;
            }
            setBattleConfig({
              targetRegionId,
              attackerCount,
              defenderCount,
            });
            setBattleAllies(attackerCount);
            setBattleEnemies(defenderCount);
            setStatus("전투 모드");
            setLastLog(`${REGIONS[targetRegionId].name} 공격 개시: 아군 ${attackerCount} vs 적 ${defenderCount}`);
            setPhase("battle");
          },
        });
        return;
      }

      if (phase === "battle" && battleConfig) {
        phaserGame = createBattleModeGame({
          PhaserRef,
          parent: mountRef.current,
          config: battleConfig,
          onBattleTick: (alliesLeft, enemiesLeft) => {
            if (cancelled) {
              return;
            }
            setBattleAllies((prev) => (prev === alliesLeft ? prev : alliesLeft));
            setBattleEnemies((prev) => (prev === enemiesLeft ? prev : enemiesLeft));
          },
          onBattleEnd: (result) => {
            if (cancelled) {
              return;
            }

            setOwners((prev) => {
              const next = [...prev];
              const attacked = battleConfig.targetRegionId;

              if (result === "victory") {
                next[attacked] = "player";
                setLastLog(`${REGIONS[attacked].name} 점령 성공`);
              } else {
                const loseCandidates = REGIONS[attacked].neighbors.filter(
                  (neighborId) => next[neighborId] === "player",
                );
                if (loseCandidates.length > 0) {
                  const lostRegion = loseCandidates[Math.floor(Math.random() * loseCandidates.length)];
                  next[lostRegion] = "enemy";
                  setLastLog(`전투 패배: ${REGIONS[lostRegion].name} 상실`);
                } else {
                  setLastLog("전투 패배: 인접 아군 영토가 없어 추가 상실 없음");
                }
              }

              const newPlayerCount = countOwned(next, "player");
              setBestTerritories((prevBest) => Math.max(prevBest, newPlayerCount));

              if (newPlayerCount <= 0) {
                setStatus("패배");
                setPhase("ended");
              } else if (newPlayerCount >= REGIONS.length) {
                setStatus("통일 달성");
                setPhase("ended");
              } else {
                setStatus("전략 모드");
                setPhase("strategy");
              }

              setTurn((prevTurn) => prevTurn + 1);
              return next;
            });
          },
        });
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (phaserGame) {
        phaserGame.destroy(true);
      }
    };
  }, [phase, battleConfig, owners, turn, runId]);

  useEffect(() => {
    if (phase === "strategy" && !hasAttackableEnemy(owners)) {
      setStatus("공격 불가");
      setPhase("ended");
      setLastLog("인접한 적 영토가 없습니다. 이번 판은 종료됩니다.");
    }
  }, [phase, owners]);

  const resetRun = () => {
    setRunId((prev) => prev + 1);
    setOwners([...INITIAL_OWNERS]);
    setBattleConfig(null);
    setBattleAllies(0);
    setBattleEnemies(0);
    setTurn(1);
    setStatus("전략 모드");
    setLastLog("인접한 적 영토를 선택해 공격하세요.");
    setPhase("strategy");
  };

  const helpText =
    phase === "strategy"
      ? "전략 모드: 인접한 적 영토를 클릭하면 전투가 시작됩니다."
      : phase === "battle"
        ? "전투 모드: 주인공만 직접 조종할 수 있습니다. Space로 칼을 휘두르세요."
        : "게임 종료: 리셋 버튼으로 새 판을 시작할 수 있습니다.";

  return (
    <div className={styles.panel}>
      <header className={styles.stats}>
        <span>상태: {status}</span>
        <span>턴: {turn}</span>
        <span>아군 영토: {playerTerritories}</span>
        <span>적 영토: {enemyTerritories}</span>
        <span>최고 영토 수: {bestTerritories}</span>
      </header>

      <div className={styles.canvasShell}>
        <div ref={mountRef} className={styles.canvasMount} />
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={resetRun}>
          리셋
        </button>
        <p className={styles.help}>
          {helpText} | 전투 병력(생존): 아군 {battleAllies} / 적 {battleEnemies} | 로그: {lastLog}
        </p>
      </div>
    </div>
  );
}
