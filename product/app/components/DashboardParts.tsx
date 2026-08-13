import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      {action && <div className="page-action">{action}</div>}
    </header>
  );
}

export function EmptyPanel({ icon, title, detail, action }: { icon: IconName; title: string; detail: string; action?: { href: string; label: string } }) {
  return (
    <section className="empty-panel">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action && <Link className="button primary" href={action.href}>{action.label}<Icon name="arrow" size={15} /></Link>}
    </section>
  );
}

export function StatusPill({ ready, readyLabel = "Ready" }: { ready: boolean; readyLabel?: string }) {
  return <span className={`status-pill ${ready ? "status-ready" : "status-needed"}`}><i />{ready ? readyLabel : "Needed"}</span>;
}

export function RecordList({ children }: { children: React.ReactNode }) {
  return <section className="record-list">{children}</section>;
}

export function StatusLabel({ value }: { value: string }) {
  const resolved = value.replaceAll("_", " ");
  const complete = ["fixed", "closed", "verified", "reproduced"].includes(value);
  const warning = ["failed", "cancelled", "not_reproduced"].includes(value);
  return <span className={`record-status ${complete ? "record-status-good" : warning ? "record-status-warning" : ""}`}>{resolved}</span>;
}
