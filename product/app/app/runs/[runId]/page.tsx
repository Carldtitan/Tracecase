import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefaultScope } from "@/lib/tracecase/config";
import { getRun } from "@/lib/tracecase/service";
import { PageHeader, StatusLabel } from "../../../components/DashboardParts";
import { Icon } from "../../../components/Icon";

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  let result;
  try {
    result = await getRun(getDefaultScope(), runId);
  } catch {
    notFound();
  }
  if (!result) notFound();
  const { run, events } = result;
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Investigation" title={run.id} action={<Link className="button secondary" href="/app/runs"><Icon name="back" size={15} />Runs</Link>} />
      <section className="run-summary-bar"><StatusLabel value={run.status} /><span>Context class <strong>{run.contextClass}</strong></span><span>{run.budget.workersUsed}/{run.budget.maxWorkers} environments</span><span>{run.modelBundle.model}</span></section>
      <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Environments</span><h2>Test matrix</h2></div><span>{run.workerResults.length}</span></div>{run.workerResults.length ? <div className="environment-grid">{run.workerResults.map((worker) => <article className={`environment-card environment-${worker.status}`} key={worker.workerId}><div className="environment-screen"><Icon name={worker.status === "passed" ? "check" : "activity"} size={25} /><span>{worker.environment.operatingSystem}</span></div><footer><span><strong>{worker.environment.browser}</strong><small>{worker.environment.stateProfile}</small></span><StatusLabel value={worker.status} /></footer></article>)}</div> : <div className="quiet-panel">Waiting for workers.</div>}</section>
      {run.outcome && <section className="detail-card outcome-card"><div className="detail-card-heading"><span>Result</span><StatusLabel value={run.outcome.reproduced ? "reproduced" : "not_reproduced"} /></div><p>{run.outcome.summary}</p>{run.outcome.uncertainty.length > 0 && <div><span className="eyebrow">Uncertainty</span><ul className="plain-list">{run.outcome.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul></div>}</section>}
      {run.patch && <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Proposed fix</span><h2>Code change</h2></div>{run.review?.draftPullRequestUrl && <a className="button primary" href={run.review.draftPullRequestUrl} target="_blank" rel="noreferrer">Open draft PR<Icon name="external" size={15} /></a>}</div><div className="diff-stack">{run.patch.files.map((file) => <article className="diff-card" key={file.path}><header>{file.path}</header><pre><code>{file.diff}</code></pre></article>)}</div></section>}
      <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Evidence</span><h2>Agent timeline</h2></div><span>{events.length}</span></div>{events.length ? <ol className="timeline-list">{events.map((event) => <li key={event.id}><i /><span><strong>{event.summary}</strong><small>{event.agent} · {new Date(event.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></span></li>)}</ol> : <div className="quiet-panel">No evidence events yet.</div>}</section>
    </main>
  );
}
