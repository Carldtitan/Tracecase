import { atlasSearchIndexPlans, mongoCollectionPlans } from "../lib/tracecase/mongodb";

console.log(JSON.stringify({
  mode: "plan-only",
  externalCallMade: false,
  collections: mongoCollectionPlans.map((plan) => ({ name: plan.name, indexes: plan.indexes.map((index) => index.name), validator: plan.validator })),
  atlasSearchIndexes: atlasSearchIndexPlans,
  nextStep: "Set TRACECASE_PERSISTENCE=mongodb, MONGODB_URI, and MONGODB_APPLY_CHANGES=true, then run npm run mongo:apply.",
}, null, 2));
