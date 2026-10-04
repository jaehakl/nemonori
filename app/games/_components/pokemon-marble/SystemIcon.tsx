export type SystemIconName =
  | "fullscreen"
  | "exitFullscreen"
  | "settings"
  | "guide"
  | "restart"
  | "exchange"
  | "center";

const paths: Record<SystemIconName, string> = {
  fullscreen: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  exitFullscreen: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5",
  settings:
    "M9.5 3h5l.6 2.2 1.6.9 2.2-.6 2.5 4.3-1.6 1.6v1.8l1.6 1.6-2.5 4.3-2.2-.6-1.6.9-.6 2.2h-5l-.6-2.2-1.6-.9-2.2.6-2.5-4.3 1.6-1.6v-1.8L2.6 9.8l2.5-4.3 2.2.6 1.6-.9L9.5 3Z",
  guide: "M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.5M12 17h.01",
  restart: "M3 11a9 9 0 1 1 2.7 7.4M3 4v7h7",
  exchange: "M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4",
  center: "M4 21V7l8-4 8 4v14H4Zm5-10h6m-3-3v6m-3 7v-4h6v4",
};

/** Button titles and labels provide names; these shared line icons are decorative. */
export default function SystemIcon({ name }: { name: SystemIconName }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "guide" && <circle cx="12" cy="12" r="9" />}
      {name === "settings" && <circle cx="12" cy="12" r="3" />}
      <path d={paths[name]} />
    </svg>
  );
}
