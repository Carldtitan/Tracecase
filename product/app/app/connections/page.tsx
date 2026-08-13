import { PageHeader, StatusPill } from "../../components/DashboardParts";
import { Icon, type IconName } from "../../components/Icon";

export const metadata = { title: "Connections" };

const connections: Array<{ name: string; detail: string; icon: IconName; ready: boolean; href: string; action: string }> = [
  { name: "MongoDB Atlas", detail: "Cases, runs, repo memory", icon: "database", ready: Boolean(process.env.MONGODB_URI), href: "https://cloud.mongodb.com/", action: "Open Atlas" },
  { name: "GitHub App", detail: "Repositories and draft PRs", icon: "github", ready: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_SLUG), href: "https://github.com/settings/apps", action: "GitHub settings" },
  { name: "Fireworks", detail: "Reasoning and vision", icon: "spark", ready: Boolean(process.env.FIREWORKS_API_KEY), href: "https://app.fireworks.ai/", action: "Open Fireworks" },
  { name: "Daytona", detail: "Isolated browser workers", icon: "terminal", ready: Boolean(process.env.DAYTONA_API_KEY), href: "https://app.daytona.io/", action: "Open Daytona" },
];

export default function ConnectionsPage() {
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Connections" title="Stack" />
      <section className="connection-list">
        {connections.map((connection) => <article className="connection-row" key={connection.name}><span className="connection-icon"><Icon name={connection.icon} /></span><div><strong>{connection.name}</strong><small>{connection.detail}</small></div><StatusPill ready={connection.ready} readyLabel="Configured" /><a href={connection.href} target="_blank" rel="noreferrer">{connection.action}<Icon name="external" size={14} /></a></article>)}
      </section>
    </main>
  );
}
