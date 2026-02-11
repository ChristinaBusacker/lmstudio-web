/**
 * ISO 8601 datetime string (e.g. "2026-02-11T13:37:00.000Z").
 * Prefer string over Date for JSON contracts.
 */
export type IsoDateTimeString = string;

/** Unix timestamp in milliseconds. */
export type UnixMs = number;
