/**
 * Tracecase uses MongoDB through lib/tracecase/mongodb.ts.
 * This file remains only to make the former starter import fail clearly.
 */
export function getDb(): never {
  throw new Error("D1 is not part of Tracecase. Use getRuntime() to access the MongoDB-backed store.");
}
