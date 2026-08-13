import { signOut } from "@/auth";
import { PageHeader, StatusPill } from "../../components/DashboardParts";
import { Icon } from "../../components/Icon";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const projectKey = process.env.NEXT_PUBLIC_WIDGET_PROJECT_KEY;
  const widgetReady = Boolean(appUrl && projectKey);
  const snippet = widgetReady ? `<script src="${appUrl}/tracecase-widget.js" defer></script>\n<tracecase-widget base-url="${appUrl}" project-key="${projectKey}"></tracecase-widget>` : "Add NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_WIDGET_PROJECT_KEY.";
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Settings" title="Workspace" />
      <section className="settings-grid">
        <article className="settings-card reporter-settings"><div className="card-heading"><span><Icon name="report" /></span><div><h2>Reporter</h2><StatusPill ready={widgetReady} readyLabel="Configured" /></div></div><pre><code>{snippet}</code></pre><p>Public key only. Dashboard access stays private.</p></article>
        <article className="settings-card security-settings"><div className="card-heading"><span><Icon name="connections" /></span><div><h2>Boundary</h2><small>Public → private</small></div></div><div className="boundary-map"><span>Website</span><i /><span>Reporter</span><i className="boundary-stop" /><span>Dashboard</span></div><p>The iframe cannot open the dashboard session.</p></article>
        <article className="settings-card account-settings"><div className="card-heading"><span><Icon name="settings" /></span><div><h2>Account</h2><small>GitHub sign-in</small></div></div><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="button secondary" type="submit">Sign out</button></form></article>
      </section>
    </main>
  );
}
