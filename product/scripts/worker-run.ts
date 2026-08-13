import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorkerManifest } from "../lib/tracecase/contracts";
import { LocalPlaywrightWorkerExecutor } from "../lib/tracecase/local-playwright";
import { validateWorkerManifest } from "../lib/tracecase/operations";

const manifestPath = resolve(process.argv[2] ?? "worker-manifest.json");
const outputPath = resolve(process.argv[3] ?? "worker-result.json");
const secret = process.env.WORKER_SIGNING_SECRET;
if (!secret) throw new Error("WORKER_SIGNING_SECRET is required inside the isolated worker");

const raw = JSON.parse(await readFile(manifestPath, "utf8")) as WorkerManifest;
const manifest = validateWorkerManifest(raw, secret);
const result = await new LocalPlaywrightWorkerExecutor().execute(manifest);
await writeFile(outputPath, JSON.stringify(result, null, 2), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ workerId: result.workerId, status: result.status, outputPath }));
