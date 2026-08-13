import { resolve } from "node:path";
import { getDefaultScope } from "../lib/tracecase/config";
import { indexLocalRepository } from "../lib/tracecase/operations";
import { MemoryTracecaseStore } from "../lib/tracecase/store";

const root = resolve(process.argv[2] ?? ".");
const result = await indexLocalRepository({ root, repository: process.env.REPOSITORY_NAME ?? "local-repository", commit: process.env.REPOSITORY_COMMIT ?? "local", scope: getDefaultScope(), store: new MemoryTracecaseStore() });
console.log(JSON.stringify({ ...result, root, externalCallMade: false }, null, 2));
