"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { dispatchRun } from "@/lib/tracecase/execution";
import { redactText } from "@/lib/tracecase/security";

export async function startRun(formData: FormData) {
  if (!(await auth())?.user) throw new Error("Unauthorized");
  const runId = String(formData.get("runId") ?? "");
  if (!/^[a-zA-Z0-9_:-]{3,96}$/.test(runId)) throw new Error("Invalid run ID");
  let failed = false;
  try {
    await dispatchRun(getDefaultScope(), runId);
  } catch (error) {
    failed = true;
    console.error("[run:start] dispatch failed", { runId, error: redactText(error instanceof Error ? error.message : "Unknown error") });
  }
  revalidatePath(`/app/runs/${runId}`);
  revalidatePath("/app/runs");
  redirect(`/app/runs/${encodeURIComponent(runId)}${failed ? "?start=failed" : ""}`);
}
