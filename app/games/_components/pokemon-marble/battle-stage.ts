import * as THREE from "three";
import type {
  BattleView,
  PokemonView,
  PresentationEvent,
} from "./presentation-events";

export type SpriteTextureLease = {
  texture: THREE.Texture | null;
  release: () => void;
};
export type LoadPokemonTexture = (
  speciesId: number,
  ready: () => void,
  failed: () => void,
) => SpriteTextureLease;

type Actor = {
  root: THREE.Group;
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  fallback: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh;
  speciesId: number | null;
  spriteScale: number;
  release?: () => void;
};

/** A second set on the same WebGL stage, never a second canvas or context. */
export function createBattleStage(loadTexture: LoadPokemonTexture) {
  const root = new THREE.Group();
  root.name = "battle-stage";
  root.visible = false;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(value: T) => {
    geometries.add(value);
    return value;
  };
  const material = <T extends THREE.Material>(value: T) => {
    materials.add(value);
    return value;
  };
  const paint = (color: string, roughness = 0.65) =>
    material(new THREE.MeshStandardMaterial({ color, roughness }));
  function cylinder(radius: number, height: number, y: number, color: string) {
    const mesh = new THREE.Mesh(
      geometry(new THREE.CylinderGeometry(radius, radius, height, 64)),
      paint(color),
    );
    mesh.position.y = y;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  cylinder(5.05, 0.3, -0.35, "#4b9d91");
  cylinder(5.12, 0.1, -0.16, "#fff3ca");
  cylinder(4.98, 0.12, -0.05, "#cde9c3");
  cylinder(3.6, 0.02, 0.02, "#f4efd8");
  const fieldRing = new THREE.Mesh(
    geometry(new THREE.RingGeometry(3.42, 3.46, 64)),
    material(
      new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }),
    ),
  );
  fieldRing.rotation.x = -Math.PI / 2;
  fieldRing.position.y = 0.04;
  root.add(fieldRing);
  const center = new THREE.Mesh(
    geometry(new THREE.RingGeometry(0.65, 0.71, 48)),
    fieldRing.material,
  );
  center.rotation.x = -Math.PI / 2;
  center.position.y = 0.05;
  root.add(center);
  const line = new THREE.Mesh(
    geometry(new THREE.BoxGeometry(0.045, 0.01, 6.8)),
    fieldRing.material,
  );
  line.position.y = 0.03;
  root.add(line);

  const postGeometry = geometry(
    new THREE.CylinderGeometry(0.11, 0.15, 0.7, 12),
  );
  const lampGeometry = geometry(new THREE.SphereGeometry(0.22, 12, 8));
  const postMaterial = paint("#79af9c");
  const lampMaterial = material(
    new THREE.MeshBasicMaterial({ color: "#fff3b2" }),
  );
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(Math.cos(angle) * 4.55, 0.3, Math.sin(angle) * 4.55);
    root.add(post);
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
    lamp.position.copy(post.position);
    lamp.position.y = 0.73;
    root.add(lamp);
  }

  const actorRingGeometry = geometry(new THREE.RingGeometry(0.94, 1.04, 48));
  const shadowGeometry = geometry(new THREE.CircleGeometry(1, 32));
  const fallbackGeometry = geometry(new THREE.IcosahedronGeometry(0.65, 1));
  function makeActor(color: string): Actor {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      actorRingGeometry,
      material(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        }),
      ),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    group.add(ring);
    const shadow = new THREE.Mesh(
      shadowGeometry,
      material(
        new THREE.MeshBasicMaterial({
          color: "#477c73",
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      ),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.9, 0.65, 1);
    shadow.position.y = 0.07;
    group.add(shadow);
    const spriteMaterial = material(
      new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
    );
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.center.set(0.5, 0);
    sprite.scale.set(3.15, 3.15, 1);
    sprite.position.y = 0.12;
    group.add(sprite);
    const fallback = new THREE.Mesh(fallbackGeometry, paint(color));
    fallback.position.y = 1;
    group.add(fallback);
    root.add(group);
    return {
      root: group,
      sprite,
      material: spriteMaterial,
      fallback,
      ring,
      speciesId: null,
      spriteScale: 3.15,
    };
  }
  const actors = {
    attacker: makeActor("#f5ad6d"),
    defender: makeActor("#7dd4d4"),
  };
  actors.attacker.root.name = "battle-attacker";
  actors.defender.root.name = "battle-defender";
  const anchors = {
    attacker: new THREE.Vector3(-2.05, 1.4, 0.4),
    defender: new THREE.Vector3(2.05, 1.4, -0.4),
  };
  const ball = new THREE.Group();
  const hemisphere = geometry(
    new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  );
  ball.add(new THREE.Mesh(hemisphere, paint("#f87768")));
  const bottom = new THREE.Mesh(hemisphere, paint("#fffef0"));
  bottom.rotation.z = Math.PI;
  ball.add(bottom);
  const band = new THREE.Mesh(
    geometry(new THREE.CylinderGeometry(0.303, 0.303, 0.055, 20)),
    paint("#365769"),
  );
  ball.add(band);
  const button = new THREE.Mesh(
    geometry(new THREE.SphereGeometry(0.075, 12, 8)),
    lampMaterial,
  );
  button.position.z = 0.29;
  ball.add(button);
  ball.visible = false;
  root.add(ball);
  let disposed = false;

  function groundSprite(actor: Actor) {
    const bounds = actor.material.map?.userData.spriteBounds as
      | { centerX: number; bottom: number; width: number; height: number }
      | undefined;
    actor.sprite.center.set(bounds?.centerX ?? 0.5, bounds?.bottom ?? 0);
    actor.spriteScale = bounds
      ? Math.min(2.6 / bounds.height, 3.6 / bounds.width)
      : 3.15;
  }

  function setPokemon(
    actor: Actor,
    pokemon: PokemonView | null,
    speciesOverride?: number,
  ) {
    actor.root.visible = Boolean(pokemon);
    const speciesId = pokemon ? (speciesOverride ?? pokemon.speciesId) : null;
    if (actor.speciesId === speciesId) return;
    actor.release?.();
    actor.release = undefined;
    actor.material.map = null;
    actor.speciesId = speciesId;
    actor.sprite.visible = false;
    actor.fallback.visible = Boolean(pokemon);
    if (speciesId === null) return;
    const lease = loadTexture(
      speciesId,
      () => {
        if (disposed || actor.speciesId !== speciesId) return;
        actor.sprite.visible = true;
        actor.fallback.visible = false;
        actor.material.needsUpdate = true;
        groundSprite(actor);
      },
      () => {
        if (!disposed && actor.speciesId === speciesId)
          actor.material.map = null;
      },
    );
    actor.material.map = lease.texture;
    actor.release = lease.release;
    groundSprite(actor);
  }

  function update(
    battle: BattleView | null,
    event: PresentationEvent | null,
    progress: number,
    reducedMotion: boolean,
    time: number,
  ) {
    const showcase =
      !battle &&
      event?.pokemon &&
      ["capture", "evolution", "level-up"].includes(event.kind);
    root.visible = Boolean(battle || showcase);
    if (!root.visible) {
      setPokemon(actors.attacker, null);
      setPokemon(actors.defender, null);
      return;
    }
    const eventSide =
      event?.side ??
      (battle?.defender?.id === event?.pokemon?.id ? "defender" : "attacker");
    const oldSpecies =
      event?.kind === "evolution" && progress < 0.5
        ? event.previousSpeciesId
        : undefined;
    setPokemon(
      actors.attacker,
      battle?.attacker ?? (showcase ? event!.pokemon! : null),
      eventSide === "attacker" ? oldSpecies : undefined,
    );
    setPokemon(
      actors.defender,
      battle?.defender ?? null,
      eventSide === "defender" ? oldSpecies : undefined,
    );
    const bob = reducedMotion ? 0 : Math.sin(time / 450) * 0.035;
    for (const side of ["attacker", "defender"] as const) {
      const actor = actors[side];
      const pokemon =
        battle?.[side] ??
        (showcase && side === "attacker" ? event!.pokemon! : null);
      const fainted = Boolean(pokemon && pokemon.hp <= 0);
      const receivingFinalHit =
        event?.kind === "attack" &&
        event.attack?.side !== side &&
        Boolean(event.attack?.beforeHp);
      const fadingOut =
        event?.kind === "faint" && (event.side ?? "defender") === side;
      const beingCaptured =
        event?.kind === "capture" &&
        (showcase ? side === "attacker" : side === "defender");
      actor.root.visible =
        Boolean(pokemon) &&
        (!fainted || receivingFinalHit || fadingOut || beingCaptured);
      actor.root.position.set(
        showcase ? 0 : anchors[side].x,
        0,
        showcase ? 0 : anchors[side].z,
      );
      actor.sprite.position.set(0, 0.12 + (fainted ? 0 : bob), 0);
      actor.sprite.scale.set(actor.spriteScale, actor.spriteScale, 1);
      actor.material.opacity = fainted && beingCaptured ? 0.35 : 1;
      actor.material.color.set(
        fainted && beingCaptured ? "#bbc9d2" : "#ffffff",
      );
      actor.fallback.material.transparent = true;
      actor.fallback.material.opacity = actor.material.opacity;
      actor.ring.scale.setScalar(
        1 + (reducedMotion ? 0 : Math.sin(time / 350) * 0.025),
      );
    }
    ball.visible = event?.kind === "capture";
    if (!event) return;
    const p = Math.min(1, Math.max(0, progress));
    if (event.kind === "attack" && event.attack) {
      const source = actors[event.attack.side];
      const target =
        actors[event.attack.side === "attacker" ? "defender" : "attacker"];
      const direction = event.attack.side === "attacker" ? 1 : -1;
      if (!reducedMotion) {
        source.sprite.position.x =
          Math.sin(Math.min(1, p / 0.45) * Math.PI) * 0.55 * direction;
        if (p > 0.45 && p < 0.75)
          target.sprite.position.x = Math.sin((p - 0.45) * 65) * 0.14;
      }
      if (p >= 0.45 && p < 0.62) target.material.color.set("#ffc8a3");
    } else if (event.kind === "faint") {
      const actor = actors[event.side ?? "defender"];
      actor.material.opacity = 1 - p;
      if (!reducedMotion) actor.sprite.position.y -= p * 0.6;
    } else if (["send-out", "deploy"].includes(event.kind)) {
      const actor = actors[event.side ?? "attacker"];
      actor.material.opacity = Math.min(1, p * 3);
      if (!reducedMotion)
        actor.sprite.scale.setScalar(
          actor.spriteScale * (0.55 + Math.min(1, p * 2) * 0.45),
        );
    } else if (event.kind === "evolution") {
      const actor = actors[eventSide];
      actor.material.color.setRGB(
        1 + Math.sin(p * Math.PI) * 1.5,
        1 + Math.sin(p * Math.PI) * 1.5,
        1,
      );
      if (!reducedMotion)
        actor.sprite.scale.setScalar(
          actor.spriteScale * (1 + Math.sin(p * Math.PI) * 0.1),
        );
    } else if (event.kind === "capture") {
      const actor = showcase ? actors.attacker : actors.defender;
      const shrink = THREE.MathUtils.smoothstep(p, 0.15, 0.55);
      actor.sprite.scale.setScalar(actor.spriteScale * (1 - shrink));
      actor.material.opacity *= 1 - shrink;
      ball.position.set(
        actor.root.position.x,
        0.4 + (reducedMotion ? 0 : Math.sin(p * Math.PI) * 1.1),
        actor.root.position.z,
      );
      ball.rotation.z = reducedMotion ? 0 : Math.sin(p * 28) * (1 - p) * 0.3;
    }
    // Failed/late images use the same subdued/fading state as the sprite.
    for (const actor of [actors.attacker, actors.defender]) {
      actor.fallback.material.transparent = true;
      actor.fallback.material.opacity = actor.material.opacity;
    }
  }

  return {
    root,
    anchors,
    update,
    dispose() {
      disposed = true;
      actors.attacker.release?.();
      actors.defender.release?.();
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      root.removeFromParent();
    },
  };
}
