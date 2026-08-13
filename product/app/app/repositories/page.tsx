import { PageHeader, StatusPill } from "../../components/DashboardParts";
import { Icon } from "../../components/Icon";
import { getDefaultScope } from "@/lib/tracecase/config";
import { getRuntime } from "@/lib/tracecase/service";

export const metadata = { title: "Repositories" };

export default async function RepositoriesPage() {
  const appSlug = process.env.GITHUB_APP_SLUG;
  const { store } = await getRuntime();
  const project = await store.getProject(getDefaultScope());
  const ready = Boolean(process.env.GITHUB_APP_ID && appSlug && project?.repository?.installationId);
  const label = project?.repository ? `${project.repository.owner}/${project.repository.name}` : undefined;
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Repositories" title="Code context" />
      <section className="focus-card split-card">
        <div className="focus-copy"><span className="large-icon"><Icon name="github" size={25} /></span><StatusPill ready={ready} readyLabel="Connected" /><h2>{label ?? "Connect GitHub"}</h2><p>Read code. Create branches. Open draft PRs.</p></div>
        <div className="focus-action">
          {appSlug ? <a className="button primary" href={`https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`} target="_blank" rel="noreferrer">Install app<Icon name="external" size={15} /></a> : <a className="button primary" href="/app/connections">Configure app<Icon name="arrow" size={15} /></a>}
          <small>No merge or deploy permission.</small>
        </div>
      </section>
    </main>
  );
}
