import type { PresentationEvent } from "./presentation-events";

export const EVENT_DURATION: Record<PresentationEvent["kind"], number> = {
  roll: 1800,
  move: 300,
  lap: 800,
  encounter: 600,
  "send-out": 400,
  attack: 1000,
  faint: 500,
  "level-up": 600,
  evolution: 2400,
  heal: 900,
  capture: 1000,
  deploy: 500,
  retrieve: 500,
  rescue: 900,
  rest: 500,
  victory: 2600,
  turn: 350,
};

export type PresentationFrame = {
  event: PresentationEvent | null;
  progress: number;
  pending: number;
  session: number;
};

type Scheduler = {
  now: () => number;
  request: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
};

/** A disposable display clock. It never advances or saves the rules engine. */
export function createPresentationPlayer(
  onFrame: (frame: PresentationFrame) => void,
  onCue: (event: PresentationEvent) => void,
  scheduler: Scheduler = {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let queue: PresentationEvent[] = [];
  let session = 0;
  let frameId: number | null = null;
  let elapsed = 0;
  let previousTime = 0;
  let lastPublished = 0;
  let paused = false;
  let reducedMotion = false;
  let disposed = false;
  let cuePlayed = false;
  let clockGeneration = 0;

  const duration = () =>
    reducedMotion
      ? Math.min(180, EVENT_DURATION[queue[0].kind])
      : EVENT_DURATION[queue[0].kind];
  const publish = () =>
    onFrame({
      event: queue[0] ?? null,
      progress: queue.length ? Math.min(1, elapsed / duration()) : 1,
      pending: queue.length,
      session,
    });

  function cancelFrame() {
    clockGeneration += 1;
    if (frameId !== null) scheduler.cancel(frameId);
    frameId = null;
  }

  function schedule() {
    if (disposed || paused || !queue.length || frameId !== null) return;
    const generation = session;
    const clock = clockGeneration;
    frameId = scheduler.request((time) => {
      if (
        disposed ||
        paused ||
        generation !== session ||
        clock !== clockGeneration ||
        !queue.length
      )
        return;
      frameId = null;
      elapsed += Math.max(0, Math.min(100, time - previousTime));
      previousTime = time;
      const progress = elapsed / duration();
      // Dice includes its own timed rattle/landing; attack cues begin on contact.
      const impact = queue[0].kind === "attack" ? 0.45 : 0;
      if (!cuePlayed && progress >= impact) {
        cuePlayed = true;
        try {
          onCue(queue[0]);
        } catch {
          /* A sound failure cannot strand the display queue. */
        }
      }
      if (progress >= 1) {
        queue.shift();
        elapsed = 0;
        cuePlayed = false;
        publish();
        lastPublished = time;
      } else if (time - lastPublished >= 1000 / 30) {
        publish();
        lastPublished = time;
      }
      schedule();
    });
  }

  function clear() {
    cancelFrame();
    queue = [];
    elapsed = 0;
    cuePlayed = false;
    session += 1;
    if (!disposed) publish();
  }

  return {
    get busy() {
      return queue.length > 0;
    },
    enqueue(events: PresentationEvent[]) {
      if (disposed || !events.length) return;
      const wasEmpty = queue.length === 0;
      queue.push(...events);
      if (wasEmpty) {
        elapsed = 0;
        cuePlayed = false;
        previousTime = scheduler.now();
        lastPublished = previousTime;
        publish();
      }
      schedule();
    },
    setPaused(value: boolean) {
      if (disposed || paused === value) return;
      paused = value;
      cancelFrame();
      previousTime = scheduler.now();
      schedule();
    },
    setReducedMotion(value: boolean) {
      if (reducedMotion === value) return;
      const progress = queue.length ? elapsed / duration() : 0;
      reducedMotion = value;
      if (queue.length) elapsed = progress * duration();
    },
    skip: clear,
    reset: clear,
    dispose() {
      disposed = true;
      clear();
    },
  };
}

export type PresentationPlayer = ReturnType<typeof createPresentationPlayer>;
