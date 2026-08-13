export type IconName =
  | "activity" | "arrow" | "back" | "cases" | "check" | "chevron" | "chevron-right"
  | "close" | "code" | "connections" | "database" | "external" | "folder" | "github"
  | "home" | "menu" | "mic" | "more" | "pause" | "play" | "report" | "search"
  | "settings" | "spark" | "terminal" | "timeline" | "volume";

const paths: Record<IconName, React.ReactNode> = {
  activity: <path d="M3 12h3l2.2-5 3.5 10 2.5-6H21" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  back: <path d="m15 18-6-6 6-6" />,
  cases: <path d="M4 7.5h16v11H4zM8 7.5V5h8v2.5M9 12h6" />,
  check: <path d="m5 12 4 4 10-10" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  "chevron-right": <path d="m10 7 5 5-5 5" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  code: <path d="m9 18-6-6 6-6M15 6l6 6-6 6" />,
  connections: <><path d="M8 12h8M5 8v8M19 8v8" /><circle cx="5" cy="5" r="3" /><circle cx="19" cy="19" r="3" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  external: <path d="M14 5h5v5M19 5l-8 8M18 13v6H5V6h6" />,
  folder: <path d="M3.5 6.5h6l2 2H21v10H3.5z" />,
  github: <path d="M15 22v-3.9c.04-1-.36-1.8-.8-2.2 2.6-.3 5.3-1.3 5.3-5.8 0-1.3-.5-2.3-1.2-3.1.1-.3.5-1.5-.1-3.1 0 0-1-.3-3.2 1.2A11 11 0 0 0 12 4.7c-1 0-2 .1-2.9.4C6.9 3.6 6 4 6 4c-.7 1.6-.3 2.8-.2 3.1-.8.8-1.2 1.8-1.2 3.1 0 4.5 2.7 5.5 5.3 5.8-.4.4-.7 1-.8 1.8-.8.4-2.8 1-4-1.2-.8-1.4-2-1.5-2-1.5M9 22v-3.7" />,
  home: <path d="m3 11 9-8 9 8v9h-6v-6H9v6H3z" />,
  menu: <path d="M5 7h14M5 12h14M5 17h14" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
  more: <><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  pause: <path d="M8 6v12M16 6v12" />,
  play: <path d="m9 6 9 6-9 6z" />,
  report: <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  spark: <path d="m12 2 1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8ZM18.5 15l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z" />,
  terminal: <path d="m5 7 4 4-4 4M11 16h8" />,
  timeline: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  volume: <><path d="M5 10v4h3l4 4V6l-4 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
