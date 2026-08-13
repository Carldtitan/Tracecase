"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { dispatchRun } from "@/lib/tracecase/execution";

export async function startRun(formData: FormData) {
  if (!(await auth())?.user) throw new Error("Unauthorized");
  const runId = String(formData.get("runId") ?? "");
  if (!/^[a-zA-Z0-9_:-]{3,96}$/.test(runId)) throw new Error("Invalid run ID");
  await dispatchRun(getDefaultScope(), runId);
  revalidatePath(`/app/runs/${runId}`);
  revalidatePath("/app/runs");
}

