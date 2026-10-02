export function getFullscreenState(
  target: HTMLElement | null,
  source?: Document,
) {
  const document = source ?? globalThis.document;
  return {
    supported: Boolean(
      document?.fullscreenEnabled &&
        typeof (target ?? document.documentElement)?.requestFullscreen ===
          "function" &&
        typeof document.exitFullscreen === "function",
    ),
    active: Boolean(target && document?.fullscreenElement === target),
  };
}

/** Call directly from a click so Safari keeps the required user activation. */
export async function toggleFullscreen(
  target: HTMLElement,
  source?: Document,
): Promise<void> {
  const document = source ?? globalThis.document;
  const state = getFullscreenState(target, document);
  if (!state.supported) throw new Error("Fullscreen is unavailable");
  if (state.active) await document.exitFullscreen();
  else await target.requestFullscreen();
}
