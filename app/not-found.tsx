import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1>404 · 페이지를 찾을 수 없습니다.</h1>
      <p>주소를 확인하거나 게임 목록으로 돌아가 주세요.</p>
      <Link href="/">게임 목록으로</Link>
    </main>
  );
}
