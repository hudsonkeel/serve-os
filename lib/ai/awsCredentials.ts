// The one Serve convention for AWS credentials (Bedrock, Transcribe, S3).
//
// Serve's credentials are SERVE_AWS_ACCESS_KEY_ID / SERVE_AWS_SECRET_ACCESS_KEY — not the SDK's
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, which Netlify reserves and which, inside a Netlify
// Function, belong to Netlify's own execution role rather than Serve's IAM identity. So the
// AWS SDK default credential-provider chain must never be what a deployed Serve OS function
// silently authenticates with.
//
// Two modes:
//   allowDefaultChain: true  — both vars unset -> undefined (SDK default chain). Kept ONLY for
//                              the pre-existing Ask Serve local-development path (aws login
//                              --profile serve-bedrock-dev), unchanged.
//   allowDefaultChain: false — strict: both vars required. Used by the assessment pipeline
//                              (Transcribe, S3 staging, assessment extraction via Bedrock).
//                              A developer may opt in to the default chain locally with
//                              SERVE_AWS_ALLOW_DEFAULT_CREDENTIAL_CHAIN=true — never set on Netlify.
// Either mode fails closed when exactly one of the two vars is set, and never includes either
// value in an error message.

export const SERVE_AWS_REGION = "us-east-1";
export const ACCESS_KEY_VAR = "SERVE_AWS_ACCESS_KEY_ID";
export const SECRET_KEY_VAR = "SERVE_AWS_SECRET_ACCESS_KEY";
export const ALLOW_DEFAULT_CHAIN_VAR = "SERVE_AWS_ALLOW_DEFAULT_CREDENTIAL_CHAIN";

export interface ServeAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

type Env = Record<string, string | undefined>;

// "trim and treat blank as absent" — an env var set to "" or whitespace by a misconfigured
// Netlify context is treated the same as unset.
function nonBlank(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True only when a developer explicitly opted in to the SDK default chain for local work. */
export function isLocalDefaultChainOptIn(env: Env = process.env): boolean {
  return env[ALLOW_DEFAULT_CHAIN_VAR] === "true";
}

export function resolveServeAwsCredentials(options: { allowDefaultChain: boolean; label?: string }, env: Env = process.env): ServeAwsCredentials | undefined {
  const label = options.label ?? "AWS";
  const accessKeyId = nonBlank(env[ACCESS_KEY_VAR]);
  const secretAccessKey = nonBlank(env[SECRET_KEY_VAR]);

  if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey };

  if (!accessKeyId && !secretAccessKey) {
    if (options.allowDefaultChain) return undefined;
    throw new Error(
      `${label} credentials are not configured: ${ACCESS_KEY_VAR} and ${SECRET_KEY_VAR} must both be set. ` +
        `Serve OS never falls back to an ambient AWS identity here (set ${ALLOW_DEFAULT_CHAIN_VAR}=true only for local development).`
    );
  }

  const missingVarName = accessKeyId ? SECRET_KEY_VAR : ACCESS_KEY_VAR;
  throw new Error(
    `${label} credential misconfiguration: ${missingVarName} is not set. ${ACCESS_KEY_VAR} and ${SECRET_KEY_VAR} must either both be set together (production) or both be left unset (local development via the AWS default credential chain).`
  );
}

/** Strict resolution for the assessment pipeline (Transcribe, S3, assessment Bedrock
 * extraction): explicit credentials required unless a local developer opted in. */
export function resolveAssessmentPipelineAwsCredentials(env: Env = process.env, label = "AWS assessment pipeline"): ServeAwsCredentials | undefined {
  return resolveServeAwsCredentials({ allowDefaultChain: isLocalDefaultChainOptIn(env), label }, env);
}
