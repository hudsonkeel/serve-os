import "server-only";
import { AxisCareError } from "./errors.ts";

// AxisCare remains the authoritative scheduling/visit-execution system.
// This module only ever reads process.env — it never accepts a token as a
// function argument or constant, so there is exactly one place in the
// codebase where the AxisCare token can leak: this file, and only via
// process.env access, never returned or logged.

const REQUIRED_VARS = [
  "AXISCARE_API_TOKEN",
  "AXISCARE_SITE_NUMBER",
  "AXISCARE_API_VERSION",
  "AXISCARE_API_BASE_URL",
] as const;

export interface AxisCareConfigurationState {
  configured: boolean;
  missing: string[];
  siteNumberPresent: boolean;
  apiVersionPresent: boolean;
  baseUrlPresent: boolean;
  tokenPresent: boolean;
  // Present only when baseUrlPresent is true — reports whether the
  // configured base URL uses HTTPS, without revealing the URL itself.
  baseUrlIsHttps: boolean | null;
  // Base URL contract: AXISCARE_API_BASE_URL must be the bare server
  // origin (e.g. https://16282.axiscare.com) with NO /api suffix — every
  // endpoint path already includes /api (e.g. /api/visits), so a base URL
  // ending in /api would double it to /api/api/visits. Present only when
  // baseUrlPresent is true.
  baseUrlEndsWithApiSegment: boolean | null;
}

// Internal shape only — never log, print, or return this object as a whole
// from any function other than getAxisCareConfig(). Every caller in this
// integration must destructure only the single field it needs.
export interface AxisCareConfig {
  token: string;
  siteNumber: string;
  apiVersion: string;
  baseUrl: string;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function endsWithApiSegment(value: string): boolean {
  return /\/api\/?$/i.test(value);
}

// Safe to call anywhere, including from a script that will print the
// result — never includes the token or any other secret value, only
// presence booleans and the list of missing variable *names*.
export function getAxisCareConfigurationState(): AxisCareConfigurationState {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  const baseUrl = process.env.AXISCARE_API_BASE_URL;
  const baseUrlValid =
    !baseUrl || (isHttpsUrl(baseUrl) && !endsWithApiSegment(baseUrl));

  return {
    configured: missing.length === 0 && baseUrlValid,
    missing: [...missing],
    siteNumberPresent: Boolean(process.env.AXISCARE_SITE_NUMBER),
    apiVersionPresent: Boolean(process.env.AXISCARE_API_VERSION),
    baseUrlPresent: Boolean(baseUrl),
    tokenPresent: Boolean(process.env.AXISCARE_API_TOKEN),
    baseUrlIsHttps: baseUrl ? isHttpsUrl(baseUrl) : null,
    baseUrlEndsWithApiSegment: baseUrl ? endsWithApiSegment(baseUrl) : null,
  };
}

// Throws AxisCareError('configuration', ...) with a safe, secret-free
// message if anything required is missing, the base URL is not HTTPS, or
// the base URL already ends in /api (which would double up with the /api
// prefix every endpoint path already includes). This is the only function
// in the integration that resolves the real token value — every other
// module must call this, use the returned config immediately, and never
// persist or log it.
export function getAxisCareConfig(): AxisCareConfig {
  const state = getAxisCareConfigurationState();

  if (state.missing.length > 0) {
    throw new AxisCareError(
      "configuration",
      `AxisCare integration is not configured. Missing: ${state.missing.join(", ")}.`
    );
  }

  const baseUrl = process.env.AXISCARE_API_BASE_URL!;
  if (!isHttpsUrl(baseUrl)) {
    throw new AxisCareError(
      "configuration",
      "AXISCARE_API_BASE_URL must be an HTTPS URL."
    );
  }
  if (endsWithApiSegment(baseUrl)) {
    throw new AxisCareError(
      "configuration",
      "AXISCARE_API_BASE_URL must not end in /api — endpoint paths already include /api (e.g. /api/visits)."
    );
  }

  return {
    token: process.env.AXISCARE_API_TOKEN!,
    siteNumber: process.env.AXISCARE_SITE_NUMBER!,
    apiVersion: process.env.AXISCARE_API_VERSION!,
    baseUrl,
  };
}
