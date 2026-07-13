const CENTRAL_TIME_ZONE = "America/Chicago";

function centralOffsetMinutes(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * Returns the true UTC instant marking the start of the Central-time
 * calendar day that is `daysFromToday` days after `referenceDate`'s Central
 * calendar day — i.e. an exclusive upper bound for "due on or before the end
 * of that Central day". Handles the CST/CDT transition correctly since the
 * offset is computed from the actual date in question.
 *
 * Example: getCentralDayBoundaryUtc(0) is "midnight tonight, Central time,
 * converted to UTC" — anything with due_at < this value is due today or
 * earlier (Central); anything >= this value is due tomorrow or later.
 */
export function getCentralDayBoundaryUtc(
  daysFromToday: number,
  referenceDate = new Date()
): Date {
  const offsetMinutes = centralOffsetMinutes(referenceDate);
  const centralWallClock = new Date(referenceDate.getTime() + offsetMinutes * 60_000);

  const year = centralWallClock.getUTCFullYear();
  const month = centralWallClock.getUTCMonth();
  const day = centralWallClock.getUTCDate();

  const nextDayCentralWallClock = Date.UTC(year, month, day + daysFromToday + 1);
  return new Date(nextDayCentralWallClock - offsetMinutes * 60_000);
}

export function formatCentralDashboardDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

export function getCentralTimeGreeting(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TIME_ZONE,
      hour: "numeric",
      hour12: false,
    }).format(date)
  );

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
