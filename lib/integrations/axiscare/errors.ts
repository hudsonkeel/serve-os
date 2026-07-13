// Typed, safe error categories for the AxisCare read-only integration.
// Every thrown error must use AxisCareError with one of these categories —
// never a raw vendor error message, never a raw response body.

export type AxisCareErrorCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "rate_limit"
  | "timeout"
  | "upstream_unavailable"
  | "invalid_response"
  | "unknown";

export class AxisCareError extends Error {
  readonly category: AxisCareErrorCategory;
  readonly statusCode: number | null;

  constructor(
    category: AxisCareErrorCategory,
    message: string,
    statusCode: number | null = null
  ) {
    super(message);
    this.name = "AxisCareError";
    this.category = category;
    this.statusCode = statusCode;
  }
}

// Maps an HTTP status code to a safe error category. Never pass a response
// body into this function — status code only.
export function categorizeHttpStatus(status: number): AxisCareErrorCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream_unavailable";
  if (status >= 400) return "invalid_response";
  return "unknown";
}

// Operator-facing message with no vendor payload, no token, no PHI. Safe
// to log, print, or surface in a UI.
export function safeErrorMessage(
  category: AxisCareErrorCategory,
  statusCode: number | null
): string {
  switch (category) {
    case "configuration":
      return "AxisCare integration is not configured correctly.";
    case "authentication":
      return "AxisCare rejected the configured credentials.";
    case "authorization":
      return "AxisCare denied access to this resource for the configured credentials.";
    case "rate_limit":
      return "AxisCare rate-limited this request.";
    case "timeout":
      return "AxisCare did not respond in time.";
    case "upstream_unavailable":
      return "AxisCare is currently unavailable.";
    case "invalid_response":
      return statusCode
        ? `AxisCare returned an unexpected response (HTTP ${statusCode}).`
        : "AxisCare returned an unexpected response.";
    case "unknown":
    default:
      return "AxisCare request failed for an unknown reason.";
  }
}
