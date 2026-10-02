import { useEffect, useRef, type RefObject } from "react";
import type { Pokemon } from "./types";
import PokemonCard from "./PokemonCard";
import { guardianPopupPosition } from "./guardian-popup-position";
import styles from "./PokemonMarble.module.css";

export default function GuardianPopup({ tile, pokemon, ownerName, rootRef, onClose }: {
  tile: number;
  pokemon: Pokemon;
  ownerName: string;
  rootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const anchor = rootRef.current?.querySelector<SVGElement>(`[data-tile="${tile}"]`);
    if (!dialog || !anchor) return;
    dialog.showModal();
    const position = () => {
      const rect = guardianPopupPosition(anchor.getBoundingClientRect(), dialog.getBoundingClientRect(), {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      });
      dialog.style.left = `${rect.left}px`;
      dialog.style.top = `${rect.top}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(dialog);
    if (rootRef.current) observer.observe(rootRef.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      dialog.close();
      if (anchor.isConnected) anchor.focus();
    };
  }, [tile, rootRef]);
  return (
    <dialog ref={dialogRef} className={styles.guardianPopup} aria-labelledby="guardian-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <div className={styles.sectionHeading}>
        <strong id="guardian-title">{ownerName}의 수비</strong>
        <button type="button" className={styles.iconButton} aria-label="수비 정보 닫기" onClick={onClose}>×</button>
      </div>
      <PokemonCard pokemon={pokemon} />
    </dialog>
  );
}
