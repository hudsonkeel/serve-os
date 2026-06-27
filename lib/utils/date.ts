const CENTRAL_TIME_ZONE = "America/Chicago";

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
