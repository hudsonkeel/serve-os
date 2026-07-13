import "server-only";
import { getAxisCareConfig } from "./config.ts";
import { AxisCareError, categorizeHttpStatus, safeErrorMessage } from "./errors.ts";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface AxisCareGetResult<T> {
  statusCode: number;
  body: T;
}

// The single point of HTTP access in this integration. Read-only by
// construction — there is no `method` parameter, so POST/PUT/PATCH/DELETE
// are not reachable through this function at all. No retries: a failed
// request throws once and returns control to the caller immediately,
// appropriate for a discovery-phase spike where silent retried traffic
// against an unfamiliar API is exactly what we want to avoid.
//
// Per the AxisCare OpenAPI specification: the site number is represented
// in the hostname (config.baseUrl is already
// https://<siteNumber>.axiscare.com), so no X-AxisCare-Site-Number header
// is sent — sending an undocumented header would be a guess, not a
// confirmed requirement. AXISCARE_SITE_NUMBER is still validated as
// configuration metadata (see config.ts) even though it isn't sent here.
export async function axisCareGet<T = unknown>(
  path: string,
  searchParams?: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AxisCareGetResult<T>> {
  const config = getAxisCareConfig(); // throws AxisCareError('configuration', ...)

  const url = new URL(path, config.baseUrl);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "X-AxisCare-Api-Version": config.apiVersion,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AxisCareError("timeout", safeErrorMessage("timeout", null));
    }
    throw new AxisCareError(
      "upstream_unavailable",
      safeErrorMessage("upstream_unavailable", null)
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const category = categorizeHttpStatus(response.status);
    // Body is read only to let the connection close cleanly — never
    // logged and never included in the thrown error. It may contain PHI
    // or vendor-internal detail we have no reason to retain.
    await response.text().catch(() => undefined);
    throw new AxisCareError(
      category,
      safeErrorMessage(category, response.status),
      response.status
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new AxisCareError(
      "invalid_response",
      "AxisCare returned a non-JSON response.",
      response.status
    );
  }

  return { statusCode: response.status, body: parsed as T };
}
