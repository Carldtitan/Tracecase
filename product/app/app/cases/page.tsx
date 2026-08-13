import Link from "next/link";
import { getDefaultScope } from "@/lib/tracecase/config";
import { listCases } from "@/lib/tracecase/service";
import { EmptyPanel, PageHeader, RecordList, StatusLabel } from "../../components/DashboardParts";

export const metadata = { title: "Cases" };

export default async function CasesPage() {
  let cases;
  try {
    cases = await listCases(getDefaultScope());
  } catch {
    return <main className="dashboard-page"><PageHeader eyebrow="Cases" title="Customer reports" /><EmptyPanel icon="database" title="Cases unavailable" detail="Connect MongoDB to load reports." action={{ href: "/app/connections", label: "Check connection" }} /></main>;
  }
  if (!cases.length) return <main className="dashboard-page"><PageHeader eyebrow="Cases" title="Customer reports" /><EmptyPanel icon="cases" title="No cases yet" detail="Complete reports appear here." action={{ href: "/app/settings", label: "Install reporter" }} /></main>;
  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="Cases" title="Customer reports" />
      <RecordList>
        {cases.map((item) => <Link className="record-row" href={`/app/cases/${item.id}`} key={item.id}><span className="record-main"><strong>{item.title}</strong><small>{item.reportIds.length} {item.reportIds.length === 1 ? "report" : "reports"} · {new Date(item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></span><StatusLabel value={item.status} /><span className="record-arrow" aria-hidden="true">→</span></Link>)}
      </RecordList>
    </main>
  );
}
