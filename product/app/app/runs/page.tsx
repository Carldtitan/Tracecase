import Link from "next/link";
import { getDefaultScope } from "@/lib/tracecase/config";
import { listRuns } from "@/lib/tracecase/service";
import { EmptyPanel, PageHeader, RecordList, StatusLabel } from "../../components/DashboardParts";

export const metadata = { title: "Runs" };

export default async function RunsPage() {
  let runs;
  try {
    runs = await listRuns(getDefaultScope());
  } catch {
    return <main className="dashboard-page"><PageHeader eyebrow="Runs" title="Investigations" /><EmptyPanel icon="database" title="Runs unavailable" detail="Connect Supabase to load investigations." action={{ href: "/app/connections", label: "Check connection" }} /></main>;
  }
  if (!runs.length) return <main className="dashboard-page"><PageHeader eyebrow="Runs" title="Investigations" /><EmptyPanel icon="activity" title="No runs yet" detail="A complete report starts an investigation." action={{ href: "/app/connections", label: "Check connections" }} /></main>;
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Runs" title="Investigations" />
      <RecordList>
        {runs.map((run) => <Link className="record-row" href={`/app/runs/${run.id}`} key={run.id}><span className="record-main"><strong>{run.id}</strong><small>Class {run.contextClass} · {run.workerResults.length} environments · {new Date(run.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></span><StatusLabel value={run.status} /><span className="record-arrow" aria-hidden="true">→</span></Link>)}
      </RecordList>
    </main>
  );
}
