import { MongoClient } from "mongodb";
import { getConfig } from "../lib/tracecase/config";
import { applyMongoPlan } from "../lib/tracecase/mongodb";

const config = getConfig();
if (!config.applyMongoChanges) throw new Error("Refusing to change MongoDB. Set MONGODB_APPLY_CHANGES=true for this command only.");
if (config.persistence !== "mongodb" || !config.mongodbUri) throw new Error("Set TRACECASE_PERSISTENCE=mongodb and MONGODB_URI first.");

const client = new MongoClient(config.mongodbUri, { appName: "tracecase-schema-apply" });
try {
  await client.connect();
  await applyMongoPlan(client.db(config.mongodbDatabase));
  console.log(`Applied validators and normal indexes to ${config.mongodbDatabase}.`);
  console.log("Atlas Vector Search definitions remain in lib/tracecase/mongodb.ts for Atlas activation.");
} finally {
  await client.close();
}
