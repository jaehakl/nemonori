import ts from "typescript";

export const mechanicsRevision = "9fb3a5b99f1a0bea17f495c5cc1bfe04fdd19c3e";
const statNames = {
  atk: "attack",
  def: "defense",
  spa: "specialAttack",
  spd: "specialDefense",
  spe: "speed",
  accuracy: "accuracy",
  evasion: "evasion",
};

// Only read literals. Downloaded JavaScript and callbacks are never executed.
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
  )
    return -literal(node.operand);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties
        .filter(
          (p) =>
            ts.isPropertyAssignment(p) &&
            !ts.isArrowFunction(p.initializer) &&
            !ts.isFunctionExpression(p.initializer),
        )
        .map((p) => [
          p.name.getText().replace(/['"]/g, ""),
          literal(p.initializer),
        ]),
    );
  throw new Error(`Unsupported move literal: ${node.getText().slice(0, 80)}`);
}

export function readMechanics(source) {
  const ast = ts.createSourceFile(
    "moves.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const object = ast.statements.find(ts.isVariableStatement).declarationList
    .declarations[0].initializer;
  const result = new Map();
  for (const entry of object.properties) {
    if (!ts.isPropertyAssignment(entry)) continue;
    const value = literal(entry.initializer);
    if (value.placeholderFor || value.num <= 0) continue;
    const callbacks = [];
    const visit = (node) => {
      if (
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      )
        callbacks.push(node.name?.getText(ast) ?? "callback");
      else ts.forEachChild(node, visit);
    };
    visit(entry.initializer);
    result.set(value.num, {
      ...value,
      key: entry.name.getText(ast),
      callbacks,
    });
  }
  return result;
}

const rules = {};
function group(rule, ids) {
  for (const id of ids) rules[id] = rule;
}
group("acrobatics", [512]);
group("assurance", [372]);
group("retaliation", [279, 419]);
group("poison-double", [474, 839]);
group("brine", [362]);
group("remove-type", [682, 892]);
group("clear-stages", [499]);
group("super-effective", [878, 879]);
group("comeuppance", [894]);
group("hp-power", [284, 323, 820]);
group("dream-eater", [138]);
group("echoed-voice", [497]);
group("facade", [263]);
group("first-action", [252, 660]);
group("false-swipe", [206]);
group("fell-stinger", [565]);
group("fickle-beam", [907]);
group("flying-press", [560]);
group("focus-punch", [264]);
group("freeze-dry", [573]);
group("fury-cutter", [210]);
group("fusion", [558, 559]);
group("delayed", [248, 353]);
group("glaive-rush", [862]);
group("hex", [506]);
group("last-resort", [387]);
group("last-respects", [854]);
group("payback", [371]);
group("moving-first", [754, 755]);
group("photon-geyser", [722]);
group("plasma-fists", [721]);
group("boost-power", [500, 681]);
group("rage-fist", [889]);
group("rapid-spin", [229, 866]);
group("revelation-dance", [686]);
group("round", [496]);
group("ruination", [877]);
group("salt-cure", [864]);
group("shell-trap", [704]);
group("smack-down", [479, 614]);
group("snore", [173]);
group("sparkling-aria", [664]);
group("spectral-thief", [712]);
group("stomping-tantrum", [707]);
group("syrup-bomb", [903]);
group("throat-chop", [675]);
group("triple-kick", [167]);
group("random-status", [161, 827]);

const excluded = {
  237: "개체값에 따른 타입 결정은 지원하지 않습니다.",
  389: "상대의 다음 기술 선택이 필요한 기술입니다.",
  562: "나무열매를 먹은 기록이 필요한 기술입니다.",
  690: "라운드 시작 전 기술 예약이 필요한 기술입니다.",
  783: "별도 폼 전환이 필요한 기술입니다.",
  798: "필드가 있어야 사용할 수 있는 기술입니다.",
  909: "상대의 다음 기술 선택이 필요한 기술입니다.",
};
// These callbacks affect systems deliberately absent from this single-combatant game.
const baseOnly = {
  59: "날씨",
  87: "날씨",
  168: "도구",
  250: "날씨",
  280: "장벽",
  282: "도구",
  311: "날씨",
  343: "도구",
  365: "나무열매",
  449: "도구",
  450: "나무열매",
  514: "교체·아군 행동불능 라운드",
  481: "다중 대상",
  510: "도구",
  542: "날씨",
  546: "도구",
  547: "폼 전환",
  615: "교체",
  662: "교체",
  676: "아군 대상",
  677: "교체",
  687: "특성",
  706: "장벽",
  718: "도구",
  746: "교체",
  788: "중력",
  797: "필드",
  804: "필드",
  805: "필드",
  830: "교체 시 설치물",
  846: "날씨",
  847: "날씨",
  848: "날씨",
  856: "특성",
  861: "필드",
  873: "별도 폼·장벽",
  875: "필드",
  904: "별도 폼",
  906: "테라스탈",
};
// Callbacks fully represented by the shared effect fields below.
const shared = new Set([
  19, 76, 91, 120, 130, 136, 143, 153, 165, 205, 253, 291, 340, 467, 566, 594,
  669, 720, 853, 905,
]);
const harmlessFields = new Set([
  "zMove",
  "maxMove",
  "ignoreAbility",
  "breaksProtect",
  "tracksTarget",
  "smartTarget",
  "noPPBoosts",
  "onDamagePriority",
]);
const scalarFields = new Set([
  "num",
  "name",
  "accuracy",
  "basePower",
  "category",
  "pp",
  "priority",
  "flags",
  "target",
  "type",
  "contestType",
  "isNonstandard",
  "secondary",
  "secondaries",
  "self",
  "boosts",
  "drain",
  "recoil",
  "multihit",
  "critRatio",
  "willCrit",
  "hasSheerForceBoost",
  "selfBoost",
  "selfdestruct",
  "forceSwitch",
  "selfSwitch",
  "overrideOffensiveStat",
  "overrideDefensiveStat",
  "overrideOffensivePokemon",
  "ignoreEvasion",
  "ignoreDefensive",
  "hasCrashDamage",
  "thawsTarget",
  "multiaccuracy",
  "sleepUsable",
  "mindBlownRecoil",
  "struggleRecoil",
  "stealsBoosts",
  "volatileStatus",
  "ignoreImmunity",
  "pseudoWeather",
  "condition",
  "key",
  "callbacks",
]);
const boosts = (value) =>
  value &&
  Object.fromEntries(
    Object.entries(value).map(([key, amount]) => [statNames[key], amount]),
  );

function secondary(effect, self = false) {
  const result = [];
  if (effect.status || effect.volatileStatus || effect.boosts)
    result.push({
      chance: effect.chance ?? 100,
      ...(self ? { self: true } : {}),
      ...(effect.status ? { status: effect.status } : {}),
      ...(effect.volatileStatus ? { volatile: effect.volatileStatus } : {}),
      ...(effect.boosts ? { boosts: boosts(effect.boosts) } : {}),
    });
  if (effect.self)
    result.push(...secondary({ chance: effect.chance, ...effect.self }, true));
  return result;
}

export function buildMoveEffects(id, data, meta) {
  if (!data) throw new Error(`Missing mechanics for move ${id}`);
  const known = rules[id] || excluded[id] || baseOnly[id] || shared.has(id);
  if (data.callbacks.length && !known)
    throw new Error(
      `Unclassified callbacks: ${id} ${data.key} ${data.callbacks}`,
    );
  for (const key of Object.keys(data)) {
    if (!scalarFields.has(key) && !harmlessFields.has(key))
      throw new Error(`Unclassified field: ${id} ${key}`);
  }
  const effects = { support: "full" };
  if (excluded[id])
    Object.assign(effects, { support: "excluded", reason: excluded[id] });
  else if (baseOnly[id] || data.selfSwitch || data.forceSwitch)
    Object.assign(effects, {
      support: "base",
      reason: `${baseOnly[id] ?? "교체"} 효과는 적용하지 않습니다.`,
    });
  if (rules[id]) effects.rule = rules[id];
  if (data.critRatio > 1) effects.criticalStage = data.critRatio - 1;
  if (data.willCrit) effects.alwaysCritical = true;
  if (data.drain) effects.drain = data.drain[0] / data.drain[1];
  else if (Number(meta?.drain) > 0) effects.drain = Number(meta.drain) / 100;
  if (data.recoil) effects.recoil = data.recoil[0] / data.recoil[1];
  if (data.selfdestruct) effects.selfDamage = "faint";
  if (data.mindBlownRecoil) effects.selfDamage = "half";
  if (data.struggleRecoil) effects.selfDamage = "quarter";
  if (data.multihit)
    effects.hits = Array.isArray(data.multihit)
      ? data.multihit
      : [data.multihit, data.multihit];
  if (data.multiaccuracy) effects.perHitAccuracy = true;
  if (data.flags.charge)
    effects.charge =
      {
        19: "air",
        340: "air",
        91: "ground",
        291: "water",
        467: "vanish",
        566: "vanish",
      }[id] ?? "normal";
  if (id === 130) effects.chargeBoosts = { defense: 1 };
  if (id === 905) effects.chargeBoosts = { specialAttack: 1 };
  if (data.self?.volatileStatus === "mustrecharge") effects.recharge = true;
  if (data.self?.volatileStatus === "lockedmove") effects.lock = "rampage";
  if (id === 205) effects.lock = "rollout";
  if (id === 253) effects.lock = "uproar";
  if (data.flags.cantusetwice) effects.rule = "no-repeat";
  const changes = [
    ...(data.secondaries ?? (data.secondary ? [data.secondary] : [])),
  ].flatMap((e) => secondary(e));
  if (data.volatileStatus)
    changes.push(...secondary({ volatileStatus: data.volatileStatus }));
  if (
    data.self?.volatileStatus &&
    data.self.volatileStatus !== "mustrecharge" &&
    data.self.volatileStatus !== "lockedmove"
  )
    changes.push(
      ...secondary({ volatileStatus: data.self.volatileStatus }, true),
    );
  if (changes.length) effects.secondary = changes;
  if (id === 161 || id === 827)
    effects.secondary = [
      {
        chance: id === 161 ? 20 : 50,
        randomStatuses:
          id === 161 ? ["brn", "par", "frz"] : ["psn", "par", "slp"],
      },
    ];
  if (data.selfBoost?.boosts || data.self?.boosts)
    effects.selfBoosts = boosts(data.selfBoost?.boosts ?? data.self.boosts);
  if (data.overrideOffensiveStat === "def") effects.offensiveStat = "defense";
  if (data.overrideDefensiveStat === "def") effects.defensiveStat = "defense";
  if (data.overrideOffensivePokemon === "target") effects.targetOffense = true;
  if (data.ignoreDefensive) effects.ignoreDefenseStages = true;
  if (data.ignoreEvasion) effects.ignoreEvasion = true;
  for (const flag of ["sound", "contact", "defrost"])
    if (data.flags[flag]) effects[flag] = true;
  if (data.thawsTarget) effects.thawsTarget = true;
  if (data.hasCrashDamage) effects.crash = true;
  return effects;
}
