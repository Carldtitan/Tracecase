import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getDefaultScope } from "@/lib/tracecase/config";
import { getRun } from "@/lib/tracecase/service";
import { PageHeader, StatusLabel } from "../../../components/DashboardParts";
import { Icon } from "../../../components/Icon";
import { startRun } from "./actions";
import { LiveRefresh } from "./LiveRefresh";

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  let result;
  try {
    result = await getRun(getDefaultScope(), runId);
  } catch {
    notFound();
  }
  if (!result) notFound();
  const { run, events, artifacts } = result;
  const active = ["dispatching", "planning", "running", "reproduced", "fixing"].includes(run.status);
  const frames = new Map(artifacts.filter((artifact) => artifact.kind === "live-frame" && artifact.workerId).map((artifact) => [artifact.workerId!, artifact]));
  const evidenceArtifacts = artifacts.filter((artifact) => artifact.kind !== "live-frame");
  const canStart = run.status === "queued" || run.status === "failed";
  const headerAction = <div className="page-action-row">{canStart && <form action={startRun}><input type="hidden" name="runId" value={run.id} /><button className="button primary" type="submit">{run.status === "failed" ? "Retry" : "Start"}<Icon name="activity" size={15} /></button></form>}<Link className="button secondary" href="/app/runs"><Icon name="back" size={15} />Runs</Link></div>;
  return (
    <main className="dashboard-page">
      <LiveRefresh active={active} />
      <PageHeader eyebrow="Investigation" title={run.id} action={headerAction} />
      <section className="run-summary-bar"><StatusLabel value={run.status} /><span>Context class <strong>{run.contextClass}</strong></span><span>{run.budget.workersUsed}/{run.budget.maxWorkers} environments</span><span>{run.modelBundle.model}</span></section>
      <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Environments</span><h2>Live preview</h2></div><span>{run.environments.length}</span></div>{run.environments.length ? <div className="environment-grid">{run.environments.map((environment, index) => {
        const workerId = `worker_${run.id}_${index + 1}`.replace(/[^a-zA-Z0-9_:-]/g, "_");
        const worker = run.workerResults.find((item) => item.workerId === workerId);
        const frame = frames.get(workerId);
        const status = worker?.status ?? (active ? "running" : "queued");
        const genuine = environment.executionProvider === "browserstack" && environment.realDevice === true;
        const platformLabel = genuine ? (environment.deviceProfile === "desktop" ? "Cloud VM" : "Real device") : environment.executionProvider ?? "Daytona";
        return <article className={`environment-card environment-${status}`} key={workerId}><div className="environment-screen">{worker?.providerSessionUrl && !active ? <video src={`/api/runs/${encodeURIComponent(run.id)}/replay/${encodeURIComponent(workerId)}`} controls muted playsInline preload="metadata"><track kind="captions" src="/silent.vtt" srcLang="en" label="No audio" /></video> : frame ? <Image src={`/api/artifacts/${frame.id}?v=${encodeURIComponent(frame.updatedAt ?? frame.createdAt)}`} alt={`${environment.operatingSystem} browser session`} width={640} height={360} unoptimized /> : <><Icon name={status === "passed" ? "check" : "activity"} size={25} /><span>{active ? "Starting" : environment.operatingSystem}</span></>}<div className="environment-screen-badges"><span>{frame && active ? "Live" : worker?.providerSessionUrl ? "Replay" : environment.operatingSystem}</span><span className={genuine ? "real-device" : "emulated-device"}>{platformLabel}</span></div></div><footer><span><strong>{environment.deviceModel ?? environment.browser}</strong><small>{environment.stateProfile} · {environment.operatingSystem}</small></span><StatusLabel value={status} /></footer></article>;
      })}</div> : <div className="quiet-panel">Waiting for the environment plan.</div>}</section>
      {run.outcome && <section className="detail-card outcome-card"><div className="detail-card-heading"><span>Result</span><StatusLabel value={run.outcome.reproduced ? "reproduced" : "not_reproduced"} /></div><p>{run.outcome.summary}</p>{run.outcome.uncertainty.length > 0 && <div><span className="eyebrow">Uncertainty</span><ul className="plain-list">{run.outcome.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul></div>}</section>}
      {evidenceArtifacts.length > 0 && <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Captured</span><h2>Evidence</h2></div><span>{evidenceArtifacts.length}</span></div><div className="artifact-grid">{evidenceArtifacts.map((artifact) => artifact.kind === "screenshot" ? <a className="artifact-card" href={`/api/artifacts/${artifact.id}`} target="_blank" rel="noreferrer" key={artifact.id}><Image src={`/api/artifacts/${artifact.id}`} alt="Captured browser state" width={640} height={360} unoptimized /><span>Screenshot</span></a> : artifact.kind === "video" ? <article className="artifact-card" key={artifact.id}><video src={`/api/artifacts/${artifact.id}`} controls muted preload="metadata"><track kind="captions" src="/silent.vtt" srcLang="en" label="No audio" /></video><span>Run video</span></article> : null)}</div></section>}
      {run.patch && <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Proposed fix</span><h2>Code change</h2></div>{run.review?.draftPullRequestUrl && <a className="button primary" href={run.review.draftPullRequestUrl} target="_blank" rel="noreferrer">Open draft PR<Icon name="external" size={15} /></a>}</div><div className="diff-stack">{run.patch.files.map((file) => <article className="diff-card" key={file.path}><header>{file.path}</header><pre><code>{file.diff}</code></pre></article>)}</div></section>}
      <section className="run-section"><div className="section-heading"><div><span className="eyebrow">Evidence</span><h2>Agent timeline</h2></div><span>{events.length}</span></div>{events.length ? <ol className="timeline-list">{events.map((event) => <li key={event.id}><i /><span><strong>{event.summary}</strong><small>{event.agent} · {new Date(event.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></span></li>)}</ol> : <div className="quiet-panel">No evidence events yet.</div>}</section>
    </main>
  );
}
