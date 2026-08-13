/**
 * Tracecase MongoDB schema entry point.
 *
 * Runtime validation uses the Zod contracts. Atlas collection validation and
 * index creation use the MongoDB plans. Run `npm run mongo:plan` to inspect the
 * plan without connecting to Atlas.
 */
export * from "../lib/tracecase/contracts";
export { atlasSearchIndexPlans, mongoCollectionPlans } from "../lib/tracecase/mongodb";
