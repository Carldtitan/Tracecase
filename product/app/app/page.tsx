import Link from "next/link";
import { PageHeader, StatusPill } from "../components/DashboardParts";
import { Icon } from "../components/Icon";

const systems = [
  { name: "MongoDB", icon: "database" as const, ready: Boolean(process.env.MONGODB_URI) },
  { name: "GitHub", icon: "github" as const, ready: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_SLUG) },
  { name: "Fireworks", icon: "spark" as const, ready: Boolean(process.env.FIREWORKS_API_KEY && process.env.FIREWORKS_MODEL) },
  { name: "Daytona", icon: "terminal" as const, ready: Boolean(process.env.DAYTONA_API_KEY) },
];

export default function OverviewPage() {
  const readyCount = systems.filter((system) => system.ready).length;
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Overview" title={readyCount === systems.length ? "Ready for reports" : "Connect your stack"} action={<Link className="button secondary" href="/app/connections">Connections</Link>} />
      <section className="setup-hero">
        <div className="setup-copy">
          <span className="setup-count">{readyCount}<small>/4</small></span>
          <h2>Core systems</h2>
        </div>
        <div className="system-track">
          {systems.map((system, index) => (
            <div className="system-node" key={system.name}>
              <span className="system-icon"><Icon name={system.icon} /></span>
              <span><strong>{system.name}</strong><StatusPill ready={system.ready} readyLabel="Configured" /></span>
              {index < systems.length - 1 && <i className="system-line" />}
            </div>
          ))}
        </div>
      </section>
      <section className="quick-grid">
        <Link className="quick-card" href="/app/repositories"><span><Icon name="folder" /></span><div><strong>Repository</strong><small>Code context</small></div><Icon name="arrow" /></Link>
        <Link className="quick-card" href="/app/settings"><span><Icon name="report" /></span><div><strong>Reporter</strong><small>Install widget</small></div><Icon name="arrow" /></Link>
        <Link className="quick-card" href="/app/runs"><span><Icon name="activity" /></span><div><strong>Runs</strong><small>Live evidence</small></div><Icon name="arrow" /></Link>
      </section>
    </main>
  );
}
