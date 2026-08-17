import { PageHeader, StatusPill } from "../../components/DashboardParts";
import { Icon, type IconName } from "../../components/Icon";
import { getDefaultScope } from "@/lib/tracecase/config";
import { getRuntime } from "@/lib/tracecase/service";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const { store } = await getRuntime();
  const project = await store.getProject(getDefaultScope());
  const connections: Array<{ name: string; detail: string; icon: IconName; ready: boolean; href: string; action: string }> = [
    { name: "Supabase", detail: "Cases, runs, repo memory, files", icon: "database", ready: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && project), href: "https://supabase.com/dashboard", action: "Open Supabase" },
    { name: "GitHub App", detail: "Repositories and draft PRs", icon: "github", ready: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_SLUG && project?.repository?.installationId), href: "https://github.com/settings/apps", action: "GitHub settings" },
    { name: "Fireworks", detail: "Reasoning and vision", icon: "spark", ready: Boolean(process.env.FIREWORKS_API_KEY && process.env.FIREWORKS_MODEL), href: "https://app.fireworks.ai/", action: "Open Fireworks" },
    { name: "Daytona", detail: "Isolated browser workers", icon: "terminal", ready: Boolean(process.env.DAYTONA_API_KEY && process.env.DAYTONA_API_URL), href: "https://app.daytona.io/", action: "Open Daytona" },
    { name: "BrowserStack", detail: "Windows, macOS, Android, iOS", icon: "activity", ready: process.env.REAL_DEVICE_PROVIDER === "browserstack" && Boolean(process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY), href: "https://automate.browserstack.com/", action: "Open Automate" },
  ];
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Connections" title="Stack" />
      <section className="connection-list">
        {connections.map((connection) => <article className="connection-row" key={connection.name}><span className="connection-icon"><Icon name={connection.icon} /></span><div><strong>{connection.name}</strong><small>{connection.detail}</small></div><StatusPill ready={connection.ready} readyLabel="Configured" /><a href={connection.href} target="_blank" rel="noreferrer">{connection.action}<Icon name="external" size={14} /></a></article>)}
      </section>
    </main>
  );
}
