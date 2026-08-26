import "server-only";

// Explicit AWS credential resolution, shared by every AWS client this pipeline constructs
// (Transcribe, S3, Bedrock, and the STS identity diagnostic) — the ONE place any of them may
// read credentials from. Deliberately NOT the AWS SDK's standard AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY environment variable names: Netlify treats those as reserved platform
// variables and refuses to let a site configure its own values for them. Serve's own values are
// named SERVE_AWS_ACCESS_KEY_ID / SERVE_AWS_SECRET_ACCESS_KEY instead, scoped to Functions +
// Runtime, Deploy Previews only, for this milestone.
//
// Every AWS client below is constructed with an EXPLICIT `credentials` object from this
// function — never left to the AWS SDK's default credential provider chain. That chain would
// silently resolve to whatever AWS_* variables happen to be present in the actual Lambda
// execution environment Netlify Functions run on, which is Netlify's own execution role, not
// this application's intended identity. Explicit credentials make it structurally impossible to
// accidentally authenticate as the wrong principal.

export interface ServeAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/** Fails closed: throws if the access key id is present without the secret, or vice versa, or
 * if neither is set. A half-configured pair is never treated as "no credentials, fall back to
 * the default chain" — that fallback is exactly the failure mode this function exists to
 * prevent. Never logs either value — only ever reports which of the two is missing, by name. */
export function getServeAwsCredentials(): ServeAwsCredentials {
  const accessKeyId = process.env.SERVE_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SERVE_AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId && !secretAccessKey) {
    throw new Error(
      "Missing SERVE_AWS_ACCESS_KEY_ID and SERVE_AWS_SECRET_ACCESS_KEY — required for any AWS call in the assessment pipeline (Transcribe, Bedrock, or the STS identity diagnostic). Not fabricated; configure both before selecting an AWS-backed provider."
    );
  }
  if (!accessKeyId) {
    throw new Error(
      "SERVE_AWS_SECRET_ACCESS_KEY is set but SERVE_AWS_ACCESS_KEY_ID is missing — both are required together. Refusing to fall back to the AWS SDK's default credential chain, which could silently authenticate as an unintended identity (Netlify's own Lambda execution role, not this application's)."
    );
  }
  if (!secretAccessKey) {
    throw new Error(
      "SERVE_AWS_ACCESS_KEY_ID is set but SERVE_AWS_SECRET_ACCESS_KEY is missing — both are required together. Refusing to fall back to the AWS SDK's default credential chain, which could silently authenticate as an unintended identity (Netlify's own Lambda execution role, not this application's)."
    );
  }

  return { accessKeyId, secretAccessKey };
}
