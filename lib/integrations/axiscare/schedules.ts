import "server-only";
import { axisCareGet } from "./client.ts";
import { todaysDateStringCentral } from "./centralDate.ts";
import type { AxisCareSchedulesResponse } from "./types.ts";

// Path confirmed by the AxisCare OpenAPI specification: /api/schedules.
const SCHEDULES_PATH = "/api/schedules";

// CORRECTED: the first live discovery attempt sent no parameters at all
// and returned HTTP 422 — AxisCare requires startDate and endDate together
// unless scheduleIds is provided. This discovery phase deliberately does
// not use scheduleIds (that would require already knowing a schedule ID,
// which contradicts the point of discovery). Uses the same Central-Time
// calendar-date helper as visits.ts, same-day startDate/endDate.
export async function getScheduleSample() {
  const today = todaysDateStringCentral();
  return axisCareGet<AxisCareSchedulesResponse>(SCHEDULES_PATH, {
    startDate: today,
    endDate: today,
  });
}
