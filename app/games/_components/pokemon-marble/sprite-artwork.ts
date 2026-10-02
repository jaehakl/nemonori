import { useCallback, useSyncExternalStore } from "react";
import { spriteUrl } from "./pokemon-data";

export type SpriteArtworkBounds = {
  centerX: number;
  centerY: number;
  scale: number;
};

type Artwork = {
  status: "loading" | "ready" | "failed";
  bounds: SpriteArtworkBounds | null;
};

const loading: Artwork = { status: "loading", bounds: null };
const cache = new Map<number, { artwork: Artwork; listeners: Set<() => void> }>();

/** Measure the visible pixels once; HTML cards and SVG board images share it. */
export function measureSpriteArtwork(image: HTMLImageElement): SpriteArtworkBounds | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  try {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let right = -1;
    let top = canvas.height;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 24) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left) return null;
    return {
      centerX: (left + right + 1) / (2 * canvas.width),
      centerY: (top + bottom + 1) / (2 * canvas.height),
      scale: 0.9 / Math.max(
        (right - left + 1) / canvas.width,
        (bottom - top + 1) / canvas.height,
      ),
    };
  } catch {
    return null;
  }
}

export function subscribeSpriteArtwork(speciesId: number, listener: () => void) {
  let entry = cache.get(speciesId);
  if (!entry) {
    entry = { artwork: loading, listeners: new Set() };
    cache.set(speciesId, entry);
    const retained = entry;
    const image = new window.Image();
    const finish = (artwork: Artwork) => {
      retained.artwork = artwork;
      retained.listeners.forEach((notify) => notify());
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => finish({ status: "ready", bounds: measureSpriteArtwork(image) });
    image.onerror = () => finish({ status: "failed", bounds: null });
    image.src = spriteUrl(speciesId);
  }
  entry.listeners.add(listener);
  const retained = entry;
  return () => { retained.listeners.delete(listener); };
}

export function useSpriteArtwork(speciesId: number, enabled = true): Artwork {
  const subscribe = useCallback(
    (listener: () => void) => enabled ? subscribeSpriteArtwork(speciesId, listener) : () => {},
    [speciesId, enabled],
  );
  const getSnapshot = useCallback(
    () => enabled ? cache.get(speciesId)?.artwork ?? loading : loading,
    [speciesId, enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => loading);
}
