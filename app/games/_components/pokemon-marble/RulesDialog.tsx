import { useEffect, useRef } from "react";
import styles from "./PokemonMarble.module.css";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onCancel={onClose}
      aria-labelledby="dialog-title"
    >
      <div className={styles.sectionHeading}>
        <h2 id="dialog-title">{title}</h2>
        <button
          className={styles.iconButton}
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="모험 가이드" onClose={onClose}>
      <div className={styles.rules}>
        <p className={styles.ruleLead}>
          파티를 지키고, 마지막 트레이너가 되세요.
        </p>
        <h3>01. 주사위를 굴리고 이동하기</h3>
        <p>
          주사위 두 개의 합만큼 이동합니다. 도중에 다른 트레이너를 만나면
          배틀하고, 살아남으면 남은 거리를 이동합니다. 도착 칸에서도 트레이너
          배틀이 타일 효과보다 먼저입니다. 더블은 추가 턴을 주지 않습니다.
        </p>
        <h3>02. 세 가지 타일</h3>
        <p>
          <strong>풀숲</strong> · 야생과 배틀해 승리하면 포획할 수 있습니다.
          포획한 포켓몬은 HP 0으로 합류합니다. 파티가 6마리면 박스로 갑니다.
        </p>
        <p>
          <strong>포켓몬센터</strong> · 파티와 박스를 모두 회복하고 자유롭게
          교환합니다. 도로의 수비 포켓몬은 회복하지 않습니다. 센터는 도착해야
          이용할 수 있습니다.
        </p>
        <p>
          <strong>도로</strong> · 파티에서 포켓몬을 보내 수비합니다. 상대 도로에
          도착하면 반드시 배틀합니다. 쓰러진 수비는 박스로 돌아갑니다. 내 도로에
          다시 도착하면 회수·교체할 수 있습니다.
        </p>
        <h3>03. 후공의 선택, 선공의 공격</h3>
        <p>
          현재 이동하는 트레이너가 후공입니다. 상대가 먼저 포켓몬을 고르면 이를
          보고 선택하세요. 선공부터 기술을 하나씩 골라 번갈아 공격하며, 각자 한
          마리로 단판 승부합니다. 교체와 도주는 없습니다.
        </p>
        <p>
          종족값, 물리·특수 공격과 방어, 기술 위력, 자속 보정 1.5배, 복합 타입
          상성을 적용합니다. 모든 기술은 한 번의 직접 공격입니다. 원작의 부가
          효과·특성·상태이상·PP·명중·급소·반동은 적용하지 않습니다.
        </p>
        <p>
          레벨에 맞는 공격기 최대 3개가 자동 편성됩니다. 모든 포켓몬은 무상성
          기본 공격도 사용할 수 있습니다. 효과가 없는 기술은 선택할 수 없습니다.
        </p>
        <h3>04. 성장과 진화</h3>
        <p>
          승리한 포켓몬은 1레벨씩 성장합니다(최대 100). 레벨 진화는 원작 기준,
          돌·교환·친밀도 등 특수 진화는 레벨 20입니다. 한 번의 승리로 한 단계
          진화하며 분기는 직접 선택합니다. 레벨업과 진화는 HP를 회복하지
          않습니다.
        </p>
        <h3>05. 마지막까지 살아남기</h3>
        <p>
          파티의 포켓몬이 모두 쓰러지면 즉시 탈락합니다. 박스나 도로에 포켓몬이
          있어도 구제되지 않습니다. 마지막으로 살아 있는 파티 포켓몬은 도로에
          보낼 수 없습니다.
        </p>
        <p>
          야생은 전 종이 등장하며 전설·환상은 1% 범주에 속합니다. 야생 레벨은
          살아 있는 내 파티의 최고 레벨 ±1입니다. 각 확정 행동은 자동 저장되며
          이어하기는 같은 주사위·배틀 상태에서 재개됩니다.
        </p>
        <p className={styles.subtle}>
          포켓몬 데이터·이미지:{" "}
          <a href="https://pokeapi.co/" target="_blank" rel="noreferrer">
            PokéAPI
          </a>
          . 기본 종 1,025종 수록. 별도 폼은 포함하지 않습니다.
        </p>
      </div>
      <button className={styles.primaryButton} onClick={onClose}>
        모험으로 돌아가기
      </button>
    </Modal>
  );
}
