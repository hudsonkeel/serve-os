// Viventium employee URL parsing — structural, not positional. See the
// approved correction: a real URL
// (".../divisions/<divisionUuid>/hr/employees/<employeeUuid>/personal...")
// was previously parsed by matching the FIRST UUID-shaped substring
// anywhere in the URL, which silently returned the division's UUID
// instead of the employee's. That was a correctness bug, not a parsing
// edge case — this collector establishes canonical cross-system identity,
// so extraction must be anchored to verified semantic meaning, never to
// "whichever UUID happens to appear first."
//
// The only anchor trusted here: the literal path segment pair
// ".../hr/employees/<segment>..." — the employee UUID is EXACTLY the path
// component immediately following "employees" when it is itself preceded
// by "hr". Nothing else in the URL is ever treated as the employee
// identifier, no matter how UUID-shaped it looks.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ViventiumEmployeeUrlParseResult {
  readonly valid: boolean;
  // The canonical employee identifier — populated only when `valid`.
  readonly employeeUuid: string | null;
  // Informational only, from a DIFFERENT path segment ("divisions/<uuid>").
  // Never treated as, compared against, or substitutable for employeeUuid.
  readonly divisionUuid: string | null;
  // Populated only when `valid` is false — the exact reason extraction was
  // rejected, shown to the operator verbatim.
  readonly rejectionReason: string | null;
}

function extractDivisionUuid(pathSegments: readonly string[]): string | null {
  const divisionsIndex = pathSegments.findIndex((segment) => segment === "divisions");
  if (divisionsIndex === -1) return null;
  const candidate = pathSegments[divisionsIndex + 1];
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

export function parseViventiumEmployeeUrl(url: string): ViventiumEmployeeUrlParseResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, employeeUuid: null, divisionUuid: null, rejectionReason: "The URL could not be parsed at all." };
  }

  // Query parameters and trailing slashes never affect this — only the
  // path's own segment structure is ever consulted.
  const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  const divisionUuid = extractDivisionUuid(pathSegments);

  const employeesSegmentIndex = pathSegments.findIndex(
    (segment, i) => segment === "hr" && pathSegments[i + 1] === "employees"
  );
  if (employeesSegmentIndex === -1) {
    return {
      valid: false,
      employeeUuid: null,
      divisionUuid,
      rejectionReason:
        'The URL path does not contain "/hr/employees/" — this does not look like an individual HR employee record (e.g. it may be a division dashboard or an onboarding dashboard).',
    };
  }

  const employeeUuidSegment = pathSegments[employeesSegmentIndex + 2];
  if (!employeeUuidSegment) {
    return {
      valid: false,
      employeeUuid: null,
      divisionUuid,
      rejectionReason: 'The URL path contains "/hr/employees/" but no path segment follows it.',
    };
  }
  if (!UUID_PATTERN.test(employeeUuidSegment)) {
    return {
      valid: false,
      employeeUuid: null,
      divisionUuid,
      rejectionReason: `The path segment immediately after "/hr/employees/" ("${employeeUuidSegment}") is not a UUID.`,
    };
  }

  return { valid: true, employeeUuid: employeeUuidSegment, divisionUuid, rejectionReason: null };
}
