"use client";

import { useMemo, useState } from "react";
import { isStarter, speciesList, typeNames } from "./pokemon-data";
import { PokemonSprite, TypeBadge } from "./PokemonSprite";
import styles from "./PokemonMarble.module.css";
import { getDefaultSeatSides, PLAYER_COLORS } from "./board";
import type { SeatSide } from "./types";
import type { DisplayMode } from "./display-preferences";

type Props = {
  onStart: (starters: number[], names: string[], seatSides: SeatSide[]) => void;
  onResume: (() => void) | null;
  loading: boolean;
  displayMode?: DisplayMode;
  onDisplayMode?: (mode: DisplayMode) => void;
};

export function filterStarters(
  query: string,
  generation: string,
  type: string,
) {
  const keyword = query.trim().toLowerCase();
  return speciesList.filter(
    (species) =>
      isStarter(species) &&
      (generation === "all" || species.generation === Number(generation)) &&
      (type === "all" || species.types.includes(Number(type))) &&
      `${species.name} ${species.englishName} ${species.id.toString().padStart(4, "0")}`
        .toLowerCase()
        .includes(keyword),
  );
}

export default function Setup({ onStart, onResume, loading, displayMode = "fixed", onDisplayMode }: Props) {
  const [count, setCount] = useState(2);
  const [active, setActive] = useState(0);
  const [seatSides, setSeatSides] = useState<SeatSide[]>(() => getDefaultSeatSides(2));
  const [names, setNames] = useState([
    "트레이너 1",
    "트레이너 2",
    "트레이너 3",
    "트레이너 4",
  ]);
  const [starters, setStarters] = useState<(number | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [query, setQuery] = useState("");
  const [generation, setGeneration] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(0);
  const candidates = useMemo(
    () => filterStarters(query, generation, type),
    [generation, type, query],
  );
  const pageCount = Math.max(1, Math.ceil(candidates.length / 24));
  const currentPage = Math.min(page, pageCount - 1);
  const ready = starters.slice(0, count).every((id) => id !== null);

  function selectStarter(id: number) {
    const next = starters.map((value, index) =>
      index === active ? id : value,
    );
    setStarters(next);
    const unselected = next
      .slice(0, count)
      .findIndex((value) => value === null);
    if (unselected >= 0) setActive(unselected);
  }

  return (
    <div className={styles.setup}>
      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>
            A LITTLE WORLD. A BIG ADVENTURE.
          </span>
          <h2>
            주사위 두 개로 시작하는
            <br />
            <em>우리들의 포켓몬 모험.</em>
          </h2>
          <p>
            풀숲에서 새로운 친구를 만나고, 나만의 도로를 지키세요.
            <br />
            도로 27칸을 모두 차지하면 승리합니다.
          </p>
          <div className={styles.featurePills}>
            <span>◈ 40칸 탑뷰 보드</span>
            <span>1–4인 모험</span>
            <span>1,025종 도감</span>
          </div>
        </div>
        <div className={styles.introPokemon} aria-hidden="true">
          <span className={styles.orbit} />
          <div>
            <PokemonSprite speciesId={1} size={110} />
            <PokemonSprite speciesId={4} size={132} />
            <PokemonSprite speciesId={7} size={110} />
          </div>
          <span className={styles.introCaption}>CHOOSE YOUR FIRST PARTNER</span>
        </div>
      </section>

      <section className={styles.setupPanel} aria-labelledby="trainer-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>01 / TRAINERS</span>
            <h3 id="trainer-heading">함께할 트레이너</h3>
          </div>
          <div className={styles.segmented} aria-label="플레이어 수">
            {[1, 2, 3, 4].map((value) => (
              <button
                key={value}
                aria-pressed={count === value}
                onClick={() => {
                  setCount(value);
                  setSeatSides(getDefaultSeatSides(value));
                  setActive(Math.min(active, value - 1));
                }}
              >
                {value}인
              </button>
            ))}
          </div>
        </div>
        <label className={styles.displaySetting}>
          화면 방향
          <select value={displayMode} onChange={(event) => onDisplayMode?.(event.target.value as DisplayMode)}>
            <option value="fixed">고정 방향</option>
            <option value="auto">조작자 방향으로 자동 회전</option>
          </select>
          <small>{count === 1 ? "혼자서 포켓몬을 키우고 도로 27칸에 도전하세요." : "아이패드를 가로로 눕히고, 앉는 위치를 골라주세요."}</small>
        </label>
        <div className={styles.trainerSlots} data-solo={count === 1}>
          {Array.from({ length: count }, (_, index) => (
            <div
              className={`${styles.trainerSlot} ${active === index ? styles.selectedSlot : ""}`}
              key={index}
              style={
                {
                  "--player-color": PLAYER_COLORS[index],
                } as React.CSSProperties
              }
            >
              <button
                className={styles.trainerPick}
                onClick={() => setActive(index)}
                aria-pressed={active === index}
                aria-label={`${index + 1}번 트레이너의 포켓몬 선택`}
              >
                <span className={styles.playerDot}>{index + 1}</span>
                {starters[index] === null ? (
                  <span className={styles.emptyBall}>＋</span>
                ) : (
                  <PokemonSprite speciesId={starters[index]} size={72} />
                )}
                <strong>
                  {starters[index] === null
                    ? "파트너를 선택하세요"
                    : speciesList.find(
                        (species) => species.id === starters[index],
                      )?.name}
                </strong>
              </button>
              <input
                aria-label={`${index + 1}번 트레이너 이름`}
                maxLength={16}
                value={names[index]}
                onChange={(event) =>
                  setNames(
                    names.map((name, player) =>
                      player === index ? event.target.value : name,
                    ),
                  )
                }
              />
              <label className={styles.seatSetting}>
                앉는 위치
                <select
                  aria-label={`${index + 1}번 트레이너 자리`}
                  value={seatSides[index]}
                  onChange={(event) => setSeatSides(seatSides.map((seat, id) => id === index ? event.target.value as SeatSide : seat))}
                >
                  <option value="bottom">아래 ↓</option>
                  <option value="left">왼쪽 ←</option>
                  <option value="top">위 ↑</option>
                  <option value="right">오른쪽 →</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.setupPanel} aria-labelledby="partner-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>02 / FIRST PARTNER</span>
            <h3 id="partner-heading">
              <span style={{ color: PLAYER_COLORS[active] }}>
                {names[active] || `트레이너 ${active + 1}`}
              </span>
              의 첫 포켓몬
            </h3>
          </div>
          <span className={styles.subtle}>
            모두 Lv. 3 · 일반 미진화형 선택 가능
          </span>
        </div>
        <div className={styles.filters}>
          <label className={styles.search}>
            ⌕{" "}
            <input
              aria-label="포켓몬 이름 또는 도감 번호 검색"
              placeholder="이름 또는 도감 번호 검색"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <select
            aria-label="세대 필터"
            value={generation}
            onChange={(event) => {
              setGeneration(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">모든 세대</option>
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}세대
              </option>
            ))}
          </select>
          <select
            aria-label="타입 필터"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">모든 타입</option>
            {Object.entries(typeNames).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.speciesGrid}>
          {candidates
            .slice(currentPage * 24, (currentPage + 1) * 24)
            .map((species) => (
              <button
                key={species.id}
                className={`${styles.speciesCard} ${starters[active] === species.id ? styles.speciesSelected : ""}`}
                aria-pressed={starters[active] === species.id}
                onClick={() => selectStarter(species.id)}
              >
                <span className={styles.dexNumber}>
                  #{species.id.toString().padStart(4, "0")}
                </span>
                <PokemonSprite speciesId={species.id} size={80} />
                <strong>{species.name}</strong>
                <span className={styles.typeRow}>
                  {species.types.map((id) => (
                    <TypeBadge key={id} type={id} />
                  ))}
                </span>
              </button>
            ))}
        </div>
        {candidates.length === 0 && (
          <p className={styles.emptyState}>
            조건에 맞는 시작 포켓몬이 없습니다.
          </p>
        )}
        <div className={styles.pagination}>
          <span>{candidates.length}종의 파트너</span>
          <div>
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              aria-label="이전 포켓몬 목록"
            >
              ←
            </button>
            <span>
              {currentPage + 1} / {pageCount}
            </span>
            <button
              disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              aria-label="다음 포켓몬 목록"
            >
              →
            </button>
          </div>
        </div>
      </section>
      <div className={styles.startBar}>
        <div>
          <strong>
            {ready
              ? "모험을 시작할 준비가 됐어요!"
              : "각 트레이너의 첫 파트너를 골라주세요."}
          </strong>
          <p>{count === 1 ? "AI 상대 없이 즐기는 나만의 모험." : "한 화면에서 차례대로 조작합니다."} 진행 상황은 자동 저장됩니다.</p>
        </div>
        <div className={styles.buttonRow}>
          {onResume && (
            <button className={styles.secondaryButton} onClick={onResume}>
              이전 모험 이어하기
            </button>
          )}
          <button
            className={styles.primaryButton}
            disabled={!ready || loading}
            onClick={() =>
              onStart(
                starters.slice(0, count) as number[],
                names
                  .slice(0, count)
                  .map((name, index) => name.trim() || `트레이너 ${index + 1}`),
                seatSides,
              )
            }
          >
            모험 시작하기 <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
