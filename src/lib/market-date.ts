// Market dates are US-exchange calendar dates. Deriving them from UTC mislabels the
// evening: at 20:00 America/New_York it is already "tomorrow" in UTC, so a UTC
// market date would jump a day ahead of the tape. Anchor to America/New_York.

const NY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's US-market calendar date (YYYY-MM-DD) in America/New_York. */
export function marketDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return NY.format(now);
}
