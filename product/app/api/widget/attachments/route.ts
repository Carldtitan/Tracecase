import { json } from "@/lib/tracecase/http";

export async function POST() {
  return json({ error: "attachment_storage_not_configured" }, 501);
}

export async function DELETE() {
  return json({ error: "attachment_storage_not_configured" }, 501);
}
