import Link from "next/link";
import { notFound } from "next/navigation";
import { getDefaultScope } from "@/lib/tracecase/config";
import { getCase, listRuns } from "@/lib/tracecase/service";
import { PageHeader, StatusLabel } from "../../../components/DashboardParts";
import { Icon } from "../../../components/Icon";

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  let caseDocument;
  let runs;
  try {
    const scope = getDefaultScope();
    [caseDocument, runs] = await Promise.all([getCase(scope, caseId), listRuns(scope)]);
  } catch {
    notFound();
  }
  if (!caseDocument) notFound();
  const relatedRuns = runs.filter((run) => run.caseId === caseDocument.id);
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Case" title={caseDocument.title} action={<Link className="button secondary" href="/app/cases"><Icon name="back" size={15} />Cases</Link>} />
      <section className="detail-grid">
        <article className="detail-card detail-summary"><div className="detail-card-heading"><span>State</span><StatusLabel value={caseDocument.status} /></div><dl><div><dt>Reports</dt><dd>{caseDocument.reportIds.length}</dd></div><div><dt>Investigations</dt><dd>{relatedRuns.length}</dd></div><div><dt>Updated</dt><dd>{new Date(caseDocument.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</dd></div></dl></article>
        <article className="detail-card"><div className="detail-card-heading"><span>Known signals</span></div>{caseDocument.exactIdentifiers.length ? <div className="tag-list">{caseDocument.exactIdentifiers.map((value) => <code key={value}>{value}</code>)}</div> : <p className="muted">No exact identifiers.</p>}</article>
        <article className="detail-card"><div className="detail-card-heading"><span>Unknowns</span></div>{caseDocument.unknowns.length ? <ul className="plain-list">{caseDocument.unknowns.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="muted">None recorded.</p>}</article>
        <article className="detail-card detail-wide"><div className="detail-card-heading"><span>Investigations</span></div>{relatedRuns.length ? <div className="nested-list">{relatedRuns.map((run) => <Link href={`/app/runs/${run.id}`} key={run.id}><span><strong>{run.id}</strong><small>Class {run.contextClass}</small></span><StatusLabel value={run.status} /><Icon name="arrow" size={15} /></Link>)}</div> : <p className="muted">No investigation started.</p>}</article>
      </section>
    </main>
  );
}
