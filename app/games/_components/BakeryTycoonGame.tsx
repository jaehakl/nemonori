"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import type Phaser from "phaser";
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";
import styles from "./BakeryTycoonGame.module.css";

const GAME_SLUG = "bakery-tycoon";
const GAME_TITLE = "Bakery Tycoon";
const TICK_MS = 600;
const START_MINUTE = 8 * 60;
const INITIAL_CASH = 1200;
const INITIAL_INGREDIENTS = 70;
const INGREDIENT_UNIT_COST = 2;
const BASE_BREAD_PRICE = 8;
const INGREDIENT_SHELF = 420;
const COUNTER_SHELF = 120;
const DOUGH_SHELF = 120;
const BREAD_SHELF = 240;
const PREP_MINUTES = 22;
const BAKE_MINUTES = 32;
const PAYROLL_INTERVAL = 360;
const SALARY_PER_EMPLOYEE = 180;
const HIRE_COST = 420;
const BASE_MARKETING_COST = 280;
const BASE_TECH_COST = 340;
const INVEST_DURATION = 360;
const BASE_EXPAND_COST = 980;
const EXPAND_STEP = 520;
const BASE_FIRST_PER_HOUR = 6.5;
const BASE_REPURCHASE = 0.06;
const MAX_REPEAT_PER_HOUR = 32;
const EMPLOYEE_BREAD_PER_HOUR = 1.2;
const MAX_LOG = 14;
const MAP_WIDTH = 680;
const MAP_HEIGHT = 380;
const PLAYER_SPEED = 220;
const STATION_RADIUS = 74;

type PhaserRuntime = typeof Phaser;
type Station = "fridge" | "counter" | "oven" | "display" | "office";
type ActiveStation = Station | null;
type IngredientBatch = { id: number; quantity: number; expiresAt: number };
type Portion = { id: number; units: number; expiresAt: number };
type OvenSlot = { id: number; units: number; finishAt: number; expiresAt: number };
type Bread = { id: number; units: number; expiresAt: number };
type Carrying =
  | { type: "ingredient"; units: number; expiresAt: number }
  | { type: "bread"; units: number; expiresAt: number }
  | null;
type Task = { endsAt: number; units: number } | null;
type Stats = {
  sold: number;
  firstSales: number;
  repeatSales: number;
  manual: number;
  auto: number;
  wasteIngredients: number;
  wasteBread: number;
};
type State = {
  minute: number;
  cash: number;
  bestCash: number;
  station: ActiveStation;
  carrying: Carrying;
  ingredients: IngredientBatch[];
  counter: Portion[];
  dough: Portion[];
  oven: OvenSlot[];
  ready: Bread[];
  display: Bread[];
  ingredientPerBread: number;
  breadPrice: number;
  buyUnits: number;
  task: Task;
  storeLevel: number;
  employees: number;
  marketingLevel: number;
  marketingUntil: number;
  techLevel: number;
  techUntil: number;
  customerBase: number;
  newPool: number;
  repeatPool: number;
  workerPool: number;
  payrollDueAt: number;
  lastWorkerBlockLogAt: number;
  nextId: number;
  stats: Stats;
  logs: string[];
  paused: boolean;
};
type Action =
  | { type: "tick" }
  | { type: "setStation"; station: ActiveStation }
  | { type: "setIngredient"; value: number }
  | { type: "setPrice"; value: number }
  | { type: "setBuyUnits"; value: number }
  | { type: "buyIngredients" }
  | { type: "pickIngredients" }
  | { type: "placeIngredients" }
  | { type: "startPrep" }
  | { type: "loadOven" }
  | { type: "takeBread" }
  | { type: "placeBread" }
  | { type: "investMarketing" }
  | { type: "investTech" }
  | { type: "expand" }
  | { type: "hire" }
  | { type: "fire" }
  | { type: "togglePause" }
  | { type: "reset"; bestCash: number };
type StationPoint = { key: Station; label: string; x: number; y: number; color: number };
type FloorController = { game: Phaser.Game; setMovementLocked: (locked: boolean) => void };
type CreateFloorOptions = {
  PhaserRef: PhaserRuntime;
  parent: HTMLDivElement;
  onStationChange: (station: ActiveStation) => void;
};

const STATION_LABEL: Record<Station, string> = {
  fridge: "Fridge",
  counter: "Counter",
  oven: "Oven",
  display: "Display",
  office: "Office",
};

const STATION_POINTS: StationPoint[] = [
  { key: "fridge", label: "FRIDGE", x: 96, y: 88, color: 0x38bdf8 },
  { key: "counter", label: "COUNTER", x: 330, y: 88, color: 0xf59e0b },
  { key: "oven", label: "OVEN", x: 566, y: 96, color: 0xf97316 },
  { key: "display", label: "DISPLAY", x: 560, y: 292, color: 0x4ade80 },
  { key: "office", label: "OFFICE", x: 124, y: 292, color: 0xa78bfa },
];

const money = new Intl.NumberFormat("ko-KR");

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const fMoney = (v: number) => `${money.format(Math.round(v))}원`;
const fClock = (m: number) => {
  const day = Math.floor(m / (24 * 60)) + 1;
  const h = String(Math.floor((m % (24 * 60)) / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `D${day} ${h}:${mm}`;
};
const fDur = (m: number) => {
  const safe = Math.max(0, Math.floor(m));
  const h = Math.floor(safe / 60);
  const mm = safe % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
};
const pushLog = (rows: string[], minute: number, msg: string) =>
  [`[${fClock(minute)}] ${msg}`, ...rows].slice(0, MAX_LOG);
const withLog = (s: State, msg: string): State => ({ ...s, logs: pushLog(s.logs, s.minute, msg) });
const fridgeCap = (lv: number) => 140 + (lv - 1) * 90;
const employeeCap = (lv: number) => 1 + (lv - 1) * 2;
const ovenCap = (lv: number) => 2 + (lv - 1);
const counterCap = (lv: number) => 2 + (lv - 1);
const sumIngredients = (rows: IngredientBatch[]) => rows.reduce((sum, row) => sum + row.quantity, 0);
const addIngredient = (rows: IngredientBatch[], row: IngredientBatch) =>
  [...rows, row].sort((a, b) => a.expiresAt - b.expiresAt);
const addByExpiry = <T extends { expiresAt: number }>(rows: T[], row: T) =>
  [...rows, row].sort((a, b) => a.expiresAt - b.expiresAt);
const addOven = (rows: OvenSlot[], row: OvenSlot) => [...rows, row].sort((a, b) => a.finishAt - b.finishAt);
const firstVisitorsPerHour = (price: number, mkLv: number) =>
  BASE_FIRST_PER_HOUR * (1 + mkLv * 0.45) * (0.8 + (price / BASE_BREAD_PRICE) * 0.35);
const repurchaseChance = (techLv: number, ingredient: number, price: number) =>
  clamp(BASE_REPURCHASE + techLv * 0.03 + ingredient * 0.012 + (price / BASE_BREAD_PRICE) * 0.01, 0.04, 0.45);
const workerRate = (techLv: number) => EMPLOYEE_BREAD_PER_HOUR + techLv * 0.2;

function consumeIngredients(
  rows: IngredientBatch[],
  units: number,
): { ok: false } | { ok: true; rows: IngredientBatch[]; expiresAt: number } {
  if (sumIngredients(rows) < units) return { ok: false };
  const sorted = [...rows].sort((a, b) => a.expiresAt - b.expiresAt);
  const next: IngredientBatch[] = [];
  let need = units;
  const expiresAt = sorted[0]?.expiresAt ?? START_MINUTE;
  for (const row of sorted) {
    if (need <= 0) {
      next.push(row);
      continue;
    }
    if (row.quantity <= need) {
      need -= row.quantity;
      continue;
    }
    next.push({ ...row, quantity: row.quantity - need });
    need = 0;
  }
  return need > 0 ? { ok: false } : { ok: true, rows: next, expiresAt };
}

function pruneIngredients(rows: IngredientBatch[], minute: number) {
  let expired = 0;
  const keep: IngredientBatch[] = [];
  for (const row of rows) {
    if (row.expiresAt <= minute) expired += row.quantity;
    else keep.push(row);
  }
  return { keep, expired };
}

function prunePortions(rows: Portion[], minute: number) {
  let expired = 0;
  const keep: Portion[] = [];
  for (const row of rows) {
    if (row.expiresAt <= minute) expired += row.units;
    else keep.push(row);
  }
  return { keep, expired };
}

function pruneBread(rows: Bread[], minute: number) {
  let expired = 0;
  const keep: Bread[] = [];
  for (const row of rows) {
    if (row.expiresAt <= minute) expired += 1;
    else keep.push(row);
  }
  return { keep, expired };
}

function init(bestCash: number): State {
  return {
    minute: START_MINUTE,
    cash: INITIAL_CASH,
    bestCash: Math.max(INITIAL_CASH, bestCash),
    station: null,
    carrying: null,
    ingredients: [{ id: 1, quantity: INITIAL_INGREDIENTS, expiresAt: START_MINUTE + INGREDIENT_SHELF }],
    counter: [],
    dough: [],
    oven: [],
    ready: [],
    display: [],
    ingredientPerBread: 3,
    breadPrice: BASE_BREAD_PRICE,
    buyUnits: 30,
    task: null,
    storeLevel: 1,
    employees: 0,
    marketingLevel: 0,
    marketingUntil: 0,
    techLevel: 0,
    techUntil: 0,
    customerBase: 0,
    newPool: 0,
    repeatPool: 0,
    workerPool: 0,
    payrollDueAt: START_MINUTE + PAYROLL_INTERVAL,
    lastWorkerBlockLogAt: -999,
    nextId: 2,
    stats: {
      sold: 0,
      firstSales: 0,
      repeatSales: 0,
      manual: 0,
      auto: 0,
      wasteIngredients: 0,
      wasteBread: 0,
    },
    logs: [`[${fClock(START_MINUTE)}] Shift started. Move with Arrow keys or WASD.`],
    paused: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "tick": {
      if (state.paused) return state;
      const minute = state.minute + 1;
      let cash = state.cash;
      let bestCash = state.bestCash;
      let ingredients = state.ingredients;
      let counter = state.counter;
      let dough = state.dough;
      let oven = state.oven;
      let ready = state.ready;
      let display = state.display;
      let carrying = state.carrying;
      let task = state.task;
      let marketingLevel = state.marketingLevel;
      let marketingUntil = state.marketingUntil;
      let techLevel = state.techLevel;
      let techUntil = state.techUntil;
      let customerBase = state.customerBase;
      let newPool = state.newPool;
      let repeatPool = state.repeatPool;
      let workerPool = state.workerPool;
      let payrollDueAt = state.payrollDueAt;
      let lastWorkerBlockLogAt = state.lastWorkerBlockLogAt;
      let nextId = state.nextId;
      const stats: Stats = { ...state.stats };
      let logs = state.logs;

      if (marketingLevel > 0 && minute >= marketingUntil) {
        marketingLevel = 0;
        marketingUntil = 0;
        logs = pushLog(logs, minute, "Marketing bonus expired.");
      }
      if (techLevel > 0 && minute >= techUntil) {
        techLevel = 0;
        techUntil = 0;
        logs = pushLog(logs, minute, "Tech bonus expired.");
      }
      if (task && minute >= task.endsAt) {
        dough = addByExpiry(dough, { id: nextId, units: task.units, expiresAt: minute + DOUGH_SHELF });
        nextId += 1;
        task = null;
        logs = pushLog(logs, minute, "Counter prep finished.");
      }
      {
        const nextBaking: OvenSlot[] = [];
        const nextReady = [...ready];
        let done = 0;
        for (const slot of oven) {
          if (slot.finishAt <= minute) {
            nextReady.push({ id: slot.id, units: slot.units, expiresAt: slot.expiresAt });
            done += 1;
          } else nextBaking.push(slot);
        }
        oven = nextBaking;
        ready = nextReady.sort((a, b) => a.expiresAt - b.expiresAt);
        if (done > 0) logs = pushLog(logs, minute, `${done} bread finished baking.`);
      }
      {
        const p = pruneIngredients(ingredients, minute);
        ingredients = p.keep;
        if (p.expired > 0) {
          stats.wasteIngredients += p.expired;
          logs = pushLog(logs, minute, `Expired ingredients: ${p.expired} units.`);
        }
      }
      {
        const p = prunePortions(counter, minute);
        counter = p.keep;
        if (p.expired > 0) {
          stats.wasteIngredients += p.expired;
          logs = pushLog(logs, minute, `Counter portions expired: ${p.expired}.`);
        }
      }
      {
        const p = prunePortions(dough, minute);
        dough = p.keep;
        if (p.expired > 0) {
          stats.wasteIngredients += p.expired;
          logs = pushLog(logs, minute, `Dough expired: ${p.expired}.`);
        }
      }
      {
        const p = pruneBread(ready, minute);
        ready = p.keep;
        if (p.expired > 0) {
          stats.wasteBread += p.expired;
          logs = pushLog(logs, minute, `Oven queue expired: ${p.expired}.`);
        }
      }
      {
        const p = pruneBread(display, minute);
        display = p.keep;
        if (p.expired > 0) {
          stats.wasteBread += p.expired;
          logs = pushLog(logs, minute, `Display expired: ${p.expired}.`);
        }
      }
      if (carrying && carrying.expiresAt <= minute) {
        if (carrying.type === "ingredient") stats.wasteIngredients += carrying.units;
        else stats.wasteBread += 1;
        carrying = null;
        logs = pushLog(logs, minute, "Carried item expired.");
      }
      workerPool += (state.employees * workerRate(techLevel)) / 60;
      let autoCount = 0;
      while (workerPool >= 1) {
        const consumed = consumeIngredients(ingredients, state.ingredientPerBread);
        if (!consumed.ok) {
          workerPool = Math.min(workerPool, 0.99);
          if (state.employees > 0 && minute - lastWorkerBlockLogAt >= 20) {
            logs = pushLog(logs, minute, "Employees idle: ingredient shortage.");
            lastWorkerBlockLogAt = minute;
          }
          break;
        }
        ingredients = consumed.rows;
        display = addByExpiry(display, { id: nextId, units: state.ingredientPerBread, expiresAt: minute + BREAD_SHELF });
        nextId += 1;
        workerPool -= 1;
        autoCount += 1;
      }
      stats.auto += autoCount;
      if (display.length > 0) {
        newPool += firstVisitorsPerHour(state.breadPrice, marketingLevel) / 60;
        repeatPool += Math.min(MAX_REPEAT_PER_HOUR, customerBase * repurchaseChance(techLevel, state.ingredientPerBread, state.breadPrice)) / 60;
      }
      let firstSales = 0;
      let repeatSales = 0;
      while (newPool >= 1 && display.length > 0) {
        display = display.slice(1);
        newPool -= 1;
        customerBase += 1;
        cash += state.breadPrice;
        firstSales += 1;
      }
      while (repeatPool >= 1 && display.length > 0) {
        display = display.slice(1);
        repeatPool -= 1;
        cash += state.breadPrice;
        repeatSales += 1;
      }
      stats.sold += firstSales + repeatSales;
      stats.firstSales += firstSales;
      stats.repeatSales += repeatSales;
      while (minute >= payrollDueAt) {
        const salary = state.employees * SALARY_PER_EMPLOYEE;
        if (salary > 0) {
          cash -= salary;
          logs = pushLog(logs, minute, `Payroll: ${fMoney(salary)}.`);
        }
        payrollDueAt += PAYROLL_INTERVAL;
      }
      if (cash > bestCash) bestCash = cash;
      if (state.cash > 0 && cash <= 0) logs = pushLog(logs, minute, "Cash below zero.");
      return {
        ...state,
        minute,
        cash,
        bestCash,
        ingredients,
        counter,
        dough,
        oven,
        ready,
        display,
        carrying,
        task,
        marketingLevel,
        marketingUntil,
        techLevel,
        techUntil,
        customerBase,
        newPool,
        repeatPool,
        workerPool,
        payrollDueAt,
        lastWorkerBlockLogAt,
        nextId,
        stats,
        logs,
      };
    }
    case "setStation":
      return state.task || state.station === action.station ? state : { ...state, station: action.station };
    case "setIngredient":
      return { ...state, ingredientPerBread: clamp(Math.round(action.value), 1, 8) };
    case "setPrice":
      return { ...state, breadPrice: clamp(Math.round(action.value), 4, 20) };
    case "setBuyUnits":
      return { ...state, buyUnits: clamp(Math.round(action.value), 10, 80) };
    case "buyIngredients": {
      if (state.station !== "fridge") return withLog(state, "Move near fridge.");
      if (sumIngredients(state.ingredients) + state.buyUnits > fridgeCap(state.storeLevel)) return withLog(state, "Fridge capacity full.");
      const cost = state.buyUnits * INGREDIENT_UNIT_COST;
      if (state.cash < cost) return withLog(state, "Not enough cash.");
      return {
        ...state,
        cash: state.cash - cost,
        ingredients: addIngredient(state.ingredients, { id: state.nextId, quantity: state.buyUnits, expiresAt: state.minute + INGREDIENT_SHELF }),
        nextId: state.nextId + 1,
        logs: pushLog(state.logs, state.minute, `Bought ${state.buyUnits} ingredient units.`),
      };
    }
    case "pickIngredients": {
      if (state.station !== "fridge") return withLog(state, "Move near fridge.");
      if (state.carrying) return withLog(state, "Hands must be empty.");
      const consumed = consumeIngredients(state.ingredients, state.ingredientPerBread);
      if (!consumed.ok) return withLog(state, "Not enough ingredients.");
      return {
        ...state,
        ingredients: consumed.rows,
        carrying: { type: "ingredient", units: state.ingredientPerBread, expiresAt: consumed.expiresAt },
        logs: pushLog(state.logs, state.minute, "Picked ingredients. Move to counter."),
      };
    }
    case "placeIngredients":
      if (state.station !== "counter") return withLog(state, "Move near counter.");
      if (!state.carrying || state.carrying.type !== "ingredient") return withLog(state, "No ingredients in hand.");
      if (state.counter.length >= counterCap(state.storeLevel)) return withLog(state, "Counter queue full.");
      return {
        ...state,
        carrying: null,
        counter: addByExpiry(state.counter, { id: state.nextId, units: state.carrying.units, expiresAt: Math.min(state.carrying.expiresAt, state.minute + COUNTER_SHELF) }),
        nextId: state.nextId + 1,
        logs: pushLog(state.logs, state.minute, "Placed ingredients on counter."),
      };
    case "startPrep": {
      if (state.station !== "counter") return withLog(state, "Move near counter.");
      if (state.task) return withLog(state, "Prep already running.");
      const [item, ...rest] = state.counter;
      if (!item) return withLog(state, "No counter portion.");
      if (item.expiresAt <= state.minute) {
        return {
          ...state,
          counter: rest,
          stats: { ...state.stats, wasteIngredients: state.stats.wasteIngredients + item.units },
          logs: pushLog(state.logs, state.minute, "Counter portion expired."),
        };
      }
      return {
        ...state,
        counter: rest,
        task: { endsAt: state.minute + PREP_MINUTES, units: item.units },
        logs: pushLog(state.logs, state.minute, "Prep started. Movement locked."),
      };
    }
    case "loadOven": {
      if (state.station !== "oven") return withLog(state, "Move near oven.");
      if (state.oven.length >= ovenCap(state.storeLevel)) return withLog(state, "Oven is full.");
      const [item, ...rest] = state.dough;
      if (!item) return withLog(state, "No dough ready.");
      if (item.expiresAt <= state.minute) {
        return {
          ...state,
          dough: rest,
          stats: { ...state.stats, wasteIngredients: state.stats.wasteIngredients + item.units },
          logs: pushLog(state.logs, state.minute, "Dough expired."),
        };
      }
      return {
        ...state,
        dough: rest,
        oven: addOven(state.oven, { id: state.nextId, units: item.units, finishAt: state.minute + BAKE_MINUTES, expiresAt: state.minute + BAKE_MINUTES + BREAD_SHELF }),
        nextId: state.nextId + 1,
        logs: pushLog(state.logs, state.minute, "Loaded dough into oven."),
      };
    }
    case "takeBread": {
      if (state.station !== "oven") return withLog(state, "Move near oven.");
      if (state.carrying) return withLog(state, "Hands must be empty.");
      const [item, ...rest] = state.ready;
      if (!item) return withLog(state, "No baked bread to take.");
      if (item.expiresAt <= state.minute) {
        return {
          ...state,
          ready: rest,
          stats: { ...state.stats, wasteBread: state.stats.wasteBread + 1 },
          logs: pushLog(state.logs, state.minute, "Baked bread expired in queue."),
        };
      }
      return {
        ...state,
        ready: rest,
        carrying: { type: "bread", units: item.units, expiresAt: item.expiresAt },
        logs: pushLog(state.logs, state.minute, "Picked baked bread. Move to display."),
      };
    }
    case "placeBread":
      if (state.station !== "display") return withLog(state, "Move near display.");
      if (!state.carrying || state.carrying.type !== "bread") return withLog(state, "No bread in hand.");
      if (state.carrying.expiresAt <= state.minute) {
        return {
          ...state,
          carrying: null,
          stats: { ...state.stats, wasteBread: state.stats.wasteBread + 1 },
          logs: pushLog(state.logs, state.minute, "Carried bread expired."),
        };
      }
      return {
        ...state,
        carrying: null,
        display: addByExpiry(state.display, { id: state.nextId, units: state.carrying.units, expiresAt: state.carrying.expiresAt }),
        nextId: state.nextId + 1,
        stats: { ...state.stats, manual: state.stats.manual + 1 },
        logs: pushLog(state.logs, state.minute, "Placed bread on display."),
      };
    case "investMarketing": {
      if (state.station !== "office") return withLog(state, "Move near office.");
      const cost = BASE_MARKETING_COST + state.marketingLevel * 160;
      if (state.cash < cost) return withLog(state, "Not enough cash.");
      const lv = Math.min(3, state.marketingLevel + 1);
      return { ...state, cash: state.cash - cost, marketingLevel: lv, marketingUntil: state.minute + INVEST_DURATION, logs: pushLog(state.logs, state.minute, `Marketing Lv.${lv}`) };
    }
    case "investTech": {
      if (state.station !== "office") return withLog(state, "Move near office.");
      const cost = BASE_TECH_COST + state.techLevel * 180;
      if (state.cash < cost) return withLog(state, "Not enough cash.");
      const lv = Math.min(3, state.techLevel + 1);
      return { ...state, cash: state.cash - cost, techLevel: lv, techUntil: state.minute + INVEST_DURATION, logs: pushLog(state.logs, state.minute, `Tech Lv.${lv}`) };
    }
    case "expand": {
      if (state.station !== "office") return withLog(state, "Move near office.");
      const cost = BASE_EXPAND_COST + (state.storeLevel - 1) * EXPAND_STEP;
      if (state.cash < cost) return withLog(state, "Not enough cash.");
      return { ...state, cash: state.cash - cost, storeLevel: state.storeLevel + 1, logs: pushLog(state.logs, state.minute, `Store expanded to Lv.${state.storeLevel + 1}.`) };
    }
    case "hire":
      if (state.station !== "office") return withLog(state, "Move near office.");
      if (state.employees >= employeeCap(state.storeLevel)) return withLog(state, "Employee cap reached.");
      if (state.cash < HIRE_COST) return withLog(state, "Not enough cash.");
      return { ...state, employees: state.employees + 1, cash: state.cash - HIRE_COST, logs: pushLog(state.logs, state.minute, `Hired employee. Total ${state.employees + 1}.`) };
    case "fire":
      if (state.station !== "office") return withLog(state, "Move near office.");
      if (state.employees <= 0) return withLog(state, "No employee to remove.");
      return { ...state, employees: state.employees - 1, logs: pushLog(state.logs, state.minute, `Removed employee. Total ${state.employees - 1}.`) };
    case "togglePause":
      return { ...state, paused: !state.paused, logs: pushLog(state.logs, state.minute, state.paused ? "Simulation resumed." : "Simulation paused.") };
    case "reset":
      return { ...init(Math.max(action.bestCash, state.bestCash)), station: state.station };
    default:
      return state;
  }
}

const carryLabel = (carrying: Carrying, minute: number) =>
  !carrying
    ? "None"
    : carrying.type === "ingredient"
      ? `Ingredients ${carrying.units} (${fDur(carrying.expiresAt - minute)} left)`
      : `Bread x1 (${fDur(carrying.expiresAt - minute)} left)`;

function getAutoAction(state: State): Action | null {
  if (!state.station) return null;

  if (state.station === "fridge") {
    if (!state.carrying) {
      if (sumIngredients(state.ingredients) < state.ingredientPerBread) {
        const cost = state.buyUnits * INGREDIENT_UNIT_COST;
        const capacityOk = sumIngredients(state.ingredients) + state.buyUnits <= fridgeCap(state.storeLevel);
        if (capacityOk && state.cash >= cost) return { type: "buyIngredients" };
      }
      if (sumIngredients(state.ingredients) >= state.ingredientPerBread) return { type: "pickIngredients" };
    }
    return null;
  }

  if (state.station === "counter") {
    if (state.carrying?.type === "ingredient" && state.counter.length < counterCap(state.storeLevel)) {
      return { type: "placeIngredients" };
    }
    if (!state.task && state.counter.length > 0) return { type: "startPrep" };
    return null;
  }

  if (state.station === "oven") {
    if (!state.carrying && state.ready.length > 0) return { type: "takeBread" };
    if (state.dough.length > 0 && state.oven.length < ovenCap(state.storeLevel)) return { type: "loadOven" };
    return null;
  }

  if (state.station === "display") {
    if (state.carrying?.type === "bread") return { type: "placeBread" };
    return null;
  }

  return null;
}

function prepProgress(state: State) {
  if (!state.task) return 0;
  const total = PREP_MINUTES;
  const remaining = Math.max(0, state.task.endsAt - state.minute);
  return clamp((total - remaining) / total, 0, 1);
}

function ovenProgress(slot: OvenSlot, minute: number) {
  const startedAt = slot.finishAt - BAKE_MINUTES;
  return clamp((minute - startedAt) / BAKE_MINUTES, 0, 1);
}

function createBakeryFloorGame({ PhaserRef, parent, onStationChange }: CreateFloorOptions): FloorController {
  let player: Phaser.GameObjects.Arc | null = null;
  let shadow: Phaser.GameObjects.Ellipse | null = null;
  let cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  let keyW: Phaser.Input.Keyboard.Key | null = null;
  let keyA: Phaser.Input.Keyboard.Key | null = null;
  let keyS: Phaser.Input.Keyboard.Key | null = null;
  let keyD: Phaser.Input.Keyboard.Key | null = null;
  let hintText: Phaser.GameObjects.Text | null = null;
  let movementLocked = false;
  let currentStation: ActiveStation = null;

  const stationNodes = new Map<
    Station,
    {
      pad: Phaser.GameObjects.Rectangle;
      ring: Phaser.GameObjects.Arc;
    }
  >();

  const detectStation = (x: number, y: number): ActiveStation => {
    let matched: ActiveStation = null;
    let best = Number.POSITIVE_INFINITY;
    for (const p of STATION_POINTS) {
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist <= STATION_RADIUS && dist < best) {
        best = dist;
        matched = p.key;
      }
    }
    return matched;
  };

  const setHighlight = (next: ActiveStation) => {
    for (const p of STATION_POINTS) {
      const node = stationNodes.get(p.key);
      if (!node) continue;
      const active = next === p.key;
      node.pad.setFillStyle(p.color, active ? 0.42 : 0.24).setStrokeStyle(active ? 3 : 2, p.color, active ? 1 : 0.8);
      node.ring.setAlpha(active ? 0.5 : 0.22);
    }
  };

  const scene: Phaser.Types.Scenes.SceneType = {
    key: "BakeryFloorScene",
    create(this: Phaser.Scene) {
      this.add.rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, 0x78350f, 1).setDepth(-6);
      this.add.rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH - 26, MAP_HEIGHT - 26, 0xfffbeb, 1).setDepth(-5);

      const checker = this.add.graphics().setDepth(-4);
      checker.fillStyle(0xfef3c7, 0.7);
      for (let y = 20; y < MAP_HEIGHT; y += 40) {
        for (let x = 20; x < MAP_WIDTH; x += 40) {
          if ((x + y) % 80 === 0) checker.fillRect(x, y, 22, 22);
        }
      }

      for (const p of STATION_POINTS) {
        const pad = this.add.rectangle(p.x, p.y, 108, 62, p.color, 0.24).setStrokeStyle(2, p.color, 0.8);
        const ring = this.add.circle(p.x, p.y, STATION_RADIUS - 12, p.color, 0.12).setStrokeStyle(2, p.color, 0.5);
        this.tweens.add({
          targets: ring,
          alpha: { from: 0.12, to: 0.35 },
          duration: 1300,
          ease: "Sine.InOut",
          yoyo: true,
          repeat: -1,
          delay: p.x,
        });
        this.add
          .text(p.x, p.y, p.label, {
            color: "#111827",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "13px",
          })
          .setOrigin(0.5);
        stationNodes.set(p.key, { pad, ring });
      }

      shadow = this.add.ellipse(MAP_WIDTH / 2, MAP_HEIGHT / 2 + 13, 32, 14, 0x000000, 0.2);
      player = this.add.circle(MAP_WIDTH / 2, MAP_HEIGHT / 2, 12, 0x111827, 1).setStrokeStyle(3, 0xfef3c7, 1);
      hintText = this.add.text(14, 12, "Move: Arrow or WASD", {
        color: "#1f2937",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "13px",
      });

      if (!this.input.keyboard) {
        hintText.setText("Keyboard unavailable");
        onStationChange(null);
        return;
      }

      cursors = this.input.keyboard.createCursorKeys();
      keyW = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.W);
      keyA = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.A);
      keyS = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.S);
      keyD = this.input.keyboard.addKey(PhaserRef.Input.Keyboard.KeyCodes.D);

      currentStation = detectStation(player.x, player.y);
      setHighlight(currentStation);
      onStationChange(currentStation);
    },
    update(this: Phaser.Scene, _time: number, delta: number) {
      if (!player || !shadow || !cursors || !keyW || !keyA || !keyS || !keyD) return;

      if (!movementLocked) {
        const left = Boolean(cursors.left?.isDown || keyA.isDown);
        const right = Boolean(cursors.right?.isDown || keyD.isDown);
        const up = Boolean(cursors.up?.isDown || keyW.isDown);
        const down = Boolean(cursors.down?.isDown || keyS.isDown);
        let vx = (right ? 1 : 0) - (left ? 1 : 0);
        let vy = (down ? 1 : 0) - (up ? 1 : 0);
        if (vx !== 0 || vy !== 0) {
          const len = Math.hypot(vx, vy);
          vx /= len;
          vy /= len;
          player.x += ((PLAYER_SPEED * vx) / 1000) * delta;
          player.y += ((PLAYER_SPEED * vy) / 1000) * delta;
        }
        player.x = PhaserRef.Math.Clamp(player.x, 34, MAP_WIDTH - 34);
        player.y = PhaserRef.Math.Clamp(player.y, 34, MAP_HEIGHT - 34);
      }

      shadow.setPosition(player.x, player.y + 13);
      const next = detectStation(player.x, player.y);
      if (next !== currentStation) {
        currentStation = next;
        setHighlight(next);
        onStationChange(next);
      }

      if (hintText) {
        hintText.setText(
          movementLocked
            ? "Counter prep running: movement locked"
            : currentStation
              ? `Nearby: ${STATION_LABEL[currentStation]}`
              : "Move near a station",
        );
      }
    },
  };

  const game = new PhaserRef.Game({
    type: PhaserRef.AUTO,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    parent,
    backgroundColor: "#78350f",
    scene,
    scale: { mode: PhaserRef.Scale.FIT, autoCenter: PhaserRef.Scale.CENTER_BOTH },
  });

  return {
    game,
    setMovementLocked(locked: boolean) {
      movementLocked = locked;
    },
  };
}

export function BakeryTycoonGame() {
  const floorRef = useRef<HTMLDivElement | null>(null);
  const floorControllerRef = useRef<FloorController | null>(null);

  const savedBest = useMemo(() => {
    if (typeof window === "undefined") return INITIAL_CASH;
    const saved = loadGameSave<{ bestCash?: number }>(GAME_SLUG);
    if (saved?.data && typeof saved.data.bestCash === "number") {
      return Math.max(INITIAL_CASH, saved.data.bestCash);
    }
    return INITIAL_CASH;
  }, []);

  const [state, dispatch] = useReducer(reducer, savedBest, init);

  useEffect(() => {
    if (state.paused) return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.paused]);

  useEffect(() => {
    saveGameSave(GAME_SLUG, GAME_TITLE, { bestCash: state.bestCash });
  }, [state.bestCash]);

  useEffect(() => {
    if (!floorRef.current) return;
    let cancelled = false;
    let createdController: FloorController | null = null;

    const start = async () => {
      const phaserModule = await import("phaser");
      const PhaserRef = ("default" in phaserModule ? phaserModule.default : phaserModule) as PhaserRuntime;
      if (cancelled || !floorRef.current) return;

      createdController = createBakeryFloorGame({
        PhaserRef,
        parent: floorRef.current,
        onStationChange: (station) => {
          if (!cancelled) dispatch({ type: "setStation", station });
        },
      });

      floorControllerRef.current = createdController;
    };

    void start();

    return () => {
      cancelled = true;
      if (createdController) createdController.game.destroy(true);
      floorControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    floorControllerRef.current?.setMovementLocked(Boolean(state.task));
  }, [state.task]);

  const atFridge = state.station === "fridge";
  const atOffice = state.station === "office";
  const fridgeCapacity = fridgeCap(state.storeLevel);
  const ingredientUnits = sumIngredients(state.ingredients);
  const firstRate = firstVisitorsPerHour(state.breadPrice, state.marketingLevel);
  const repeatRate = Math.min(
    MAX_REPEAT_PER_HOUR,
    state.customerBase * repurchaseChance(state.techLevel, state.ingredientPerBread, state.breadPrice),
  );
  const marketingCost = BASE_MARKETING_COST + state.marketingLevel * 160;
  const techCost = BASE_TECH_COST + state.techLevel * 180;
  const expandCost = BASE_EXPAND_COST + (state.storeLevel - 1) * EXPAND_STEP;
  const prepRemaining = state.task ? Math.max(0, state.task.endsAt - state.minute) : 0;
  const prepPct = prepProgress(state);
  const autoAction = useMemo(() => getAutoAction(state), [state]);

  useEffect(() => {
    if (!autoAction) return;
    const timer = window.setTimeout(() => {
      dispatch(autoAction);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [autoAction]);

  return (
    <div className={styles.panel}>
      <header className={styles.stats}>
        <span>Time {fClock(state.minute)}</span>
        <span>Cash {fMoney(state.cash)} (Best {fMoney(state.bestCash)})</span>
        <span>Station {state.station ? STATION_LABEL[state.station] : "Transit"}</span>
        <span>Fridge {ingredientUnits}/{fridgeCapacity}</span>
        <span>Oven {state.oven.length}/{ovenCap(state.storeLevel)} | Ready {state.ready.length}</span>
        <span>Display {state.display.length}</span>
        <span>Employees {state.employees}/{employeeCap(state.storeLevel)}</span>
        <span>Customers {state.customerBase}</span>
      </header>

      <section className={styles.box}>
        <h3>Bakery Floor (Phaser)</h3>
        <div className={styles.floorWrap}>
          <div ref={floorRef} className={styles.floorMount} />
        </div>
        <p className={styles.helpText}>
          Move with Arrow keys or WASD. Stand near a station to enable actions.
          {state.task ? ` Prep lock: ${fDur(prepRemaining)} left.` : ""}
        </p>
        <div className={styles.legendGrid}>
          {(Object.keys(STATION_LABEL) as Station[]).map((station) => (
            <span
              key={station}
              className={`${styles.legendItem} ${state.station === station ? styles.legendItemActive : ""}`}
            >
              {STATION_LABEL[station]}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.box}>
        <h3>Production Flow</h3>
        <p>Carrying: {carryLabel(state.carrying, state.minute)}</p>
        <p className={styles.helpText}>
          Station auto-action enabled. When conditions match, actions run automatically at each station.
        </p>

        <div className={styles.visualGrid}>
          <article className={styles.visualCard}>
            <h4>Ingredient Stock</h4>
            <p>
              {ingredientUnits} / {fridgeCapacity}
            </p>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${(ingredientUnits / Math.max(1, fridgeCapacity)) * 100}%` }} />
            </div>
          </article>

          <article className={styles.visualCard}>
            <h4>Counter Prep</h4>
            <p>{state.task ? `Running (${fDur(prepRemaining)} left)` : "Idle"}</p>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${prepPct * 100}%` }} />
            </div>
            <small>Queue: {state.counter.length}/{counterCap(state.storeLevel)}</small>
          </article>

          <article className={styles.visualCard}>
            <h4>Display Shelf</h4>
            <p>{state.display.length} breads</p>
            <div className={styles.shelfRow}>
              {Array.from({ length: Math.min(14, state.display.length) }).map((_, idx) => (
                <span key={`bread-${idx}`} className={styles.shelfBread} />
              ))}
            </div>
          </article>
        </div>

        <div className={styles.ovenList}>
          <h4>Oven Progress</h4>
          {state.oven.map((slot) => {
            const pct = ovenProgress(slot, state.minute);
            return (
              <div key={slot.id} className={styles.ovenRow}>
                <span>Slot #{slot.id}</span>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${pct * 100}%` }} />
                </div>
                <span>{Math.round(pct * 100)}%</span>
              </div>
            );
          })}
          {state.oven.length === 0 && <p className={styles.emptyText}>No bread currently baking.</p>}
        </div>

        <ul className={styles.metaList}>
          <li>Counter queue {state.counter.length}/{counterCap(state.storeLevel)}</li>
          <li>Dough queue {state.dough.length}</li>
          <li>Oven ready queue {state.ready.length}</li>
          <li>Display queue {state.display.length}</li>
        </ul>
      </section>

      <section className={styles.box}>
        <h3>Tuning & Demand</h3>
        <label>Bread ingredient usage: {state.ingredientPerBread}</label>
        <input className={styles.slider} type="range" min={1} max={8} step={1} value={state.ingredientPerBread} onChange={(e) => dispatch({ type: "setIngredient", value: Number(e.currentTarget.value) })} />
        <label>Bread price: {fMoney(state.breadPrice)}</label>
        <input className={styles.slider} type="range" min={4} max={20} step={1} value={state.breadPrice} onChange={(e) => dispatch({ type: "setPrice", value: Number(e.currentTarget.value) })} />
        <label>Ingredient purchase amount: {state.buyUnits} units</label>
        <input className={styles.slider} type="range" min={10} max={80} step={5} value={state.buyUnits} onChange={(e) => dispatch({ type: "setBuyUnits", value: Number(e.currentTarget.value) })} />
        <p>Purchase cost: {fMoney(state.buyUnits * INGREDIENT_UNIT_COST)}</p>
        <p>New visitors/hour: {firstRate.toFixed(1)} (marketing + price)</p>
        <p>Repeat visitors/hour: {repeatRate.toFixed(1)} (tech + ingredient + price)</p>
        <div className={styles.actionGrid}>
          <button type="button" onClick={() => dispatch({ type: "buyIngredients" })} disabled={!atFridge}>Buy ingredients</button>
          <button type="button" onClick={() => dispatch({ type: "togglePause" })}>{state.paused ? "Resume" : "Pause"}</button>
          <button type="button" onClick={() => dispatch({ type: "reset", bestCash: state.bestCash })}>Reset run</button>
        </div>
      </section>

      <section className={styles.box}>
        <h3>Management (Office)</h3>
        <div className={styles.actionGrid}>
          <button type="button" onClick={() => dispatch({ type: "investMarketing" })} disabled={!atOffice}>Marketing {fMoney(marketingCost)}</button>
          <button type="button" onClick={() => dispatch({ type: "investTech" })} disabled={!atOffice}>Tech {fMoney(techCost)}</button>
          <button type="button" onClick={() => dispatch({ type: "expand" })} disabled={!atOffice}>Expand {fMoney(expandCost)}</button>
          <button type="button" onClick={() => dispatch({ type: "hire" })} disabled={!atOffice}>Hire {fMoney(HIRE_COST)}</button>
          <button type="button" onClick={() => dispatch({ type: "fire" })} disabled={!atOffice || state.employees === 0}>Fire</button>
        </div>
        <ul className={styles.metaList}>
          <li>Marketing Lv.{state.marketingLevel}</li>
          <li>Tech Lv.{state.techLevel}</li>
          <li>Store Lv.{state.storeLevel}</li>
          <li>Auto production {(state.employees * workerRate(state.techLevel)).toFixed(1)} / hour</li>
          <li>Payroll {fMoney(state.employees * SALARY_PER_EMPLOYEE)} every {fDur(PAYROLL_INTERVAL)}</li>
        </ul>
      </section>

      <section className={styles.box}>
        <h3>Run Stats</h3>
        <ul className={styles.metaList}>
          <li>Sales {state.stats.sold} (new {state.stats.firstSales} / repeat {state.stats.repeatSales})</li>
          <li>Production manual {state.stats.manual} / auto {state.stats.auto}</li>
          <li>Waste ingredients {state.stats.wasteIngredients} units</li>
          <li>Waste bread {state.stats.wasteBread}</li>
        </ul>
        <ul className={styles.logList}>
          {state.logs.map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
