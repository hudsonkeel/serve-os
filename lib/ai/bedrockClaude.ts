// Shared Amazon Bedrock / Claude client — the generic parts of what was
// previously duplicated only inside
// lib/assessmentIntelligence/backgroundCore/providers/bedrockClaudeProvider.ts,
// extracted so Ask Serve's answer synthesis (lib/askServe/answer/) can
// reuse the exact same approved client/model/region instead of
// duplicating AWS SDK boilerplate. Narrowly scoped on purpose — this is
// not a general AI-provider abstraction; both call sites are Bedrock
// Converse API + this one pinned Claude inference profile, nothing else.
//
// Region and model are pinned as constants, not read from an env var —
// this integration is approved for exactly one region and one inference
// profile (see docs/architecture/BEDROCK_CLAUDE_PROVIDER.md). Changing
// either is a deliberate code change, not a runtime config toggle.
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

export const BEDROCK_REGION = "us-east-1";
export const CLAUDE_MODEL_ID = "us.anthropic.claude-sonnet-4-6";

let cachedClient: BedrockRuntimeClient | null = null;

/** Explicit credential shape for the production Netlify path — the IAM
 *  user `serve-netlify-assessment-pipeline`'s access key, already scoped
 *  (via the `ServeAssessmentAWSPipelinePolicy` customer-managed policy)
 *  to exactly this inference profile. */
interface StaticBedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

// Matches this codebase's established "trim and treat blank as absent"
// convention for optional string env/field values (see e.g.
// lib/workforce/resolvers.ts, lib/workforce/axiscareFieldAllowlist.ts) —
// an env var set to "" or whitespace by a misconfigured Netlify context
// must be treated the same as unset, never as a present-but-empty value.
function nonBlank(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves which credential path getBedrockClient() should use:
 *   1. Both SERVE_AWS_ACCESS_KEY_ID and SERVE_AWS_SECRET_ACCESS_KEY set
 *      (Netlify Functions/Runtime, where these are the existing production
 *      variables for IAM user serve-netlify-assessment-pipeline) -> explicit
 *      static credentials.
 *   2. Neither set (local development, e.g. `aws login --profile
 *      serve-bedrock-dev`) -> undefined, so getBedrockClient() falls back to
 *      the AWS SDK's default credential provider chain exactly as before —
 *      local developers are never required to place long-lived AWS
 *      credentials in .env.local.
 *   3. Exactly one set -> a real misconfiguration (a typo'd/partially-copied
 *      env var, a half-applied Netlify config change). Never silently fall
 *      back to the default chain in this case (it would likely resolve no
 *      credentials at all in a Netlify Function, appearing to "work" through
 *      some unrelated fallback identity, or failing later with a confusing
 *      generic AWS SDK error far from the actual cause) and never construct
 *      a client with an incomplete credentials object (same problem, worse
 *      diagnostics) — fail immediately, server-side only, naming exactly
 *      which of the two variables is missing and never the value of
 *      whichever one is present.
 */
export function resolveBedrockCredentials(): StaticBedrockCredentials | undefined {
  const accessKeyId = nonBlank(process.env.SERVE_AWS_ACCESS_KEY_ID);
  const secretAccessKey = nonBlank(process.env.SERVE_AWS_SECRET_ACCESS_KEY);

  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }
  if (!accessKeyId && !secretAccessKey) {
    return undefined;
  }

  const missingVarName = accessKeyId ? "SERVE_AWS_SECRET_ACCESS_KEY" : "SERVE_AWS_ACCESS_KEY_ID";
  throw new Error(
    `Bedrock credential misconfiguration: ${missingVarName} is not set. SERVE_AWS_ACCESS_KEY_ID and SERVE_AWS_SECRET_ACCESS_KEY must either both be set together (production) or both be left unset (local development via the AWS default credential chain).`
  );
}

export function getBedrockClient(): BedrockRuntimeClient {
  if (cachedClient) return cachedClient;
  const credentials = resolveBedrockCredentials();
  cachedClient = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    // Omitted entirely (not just left undefined) when credentials is
    // undefined, so the AWS SDK's default credential provider chain
    // resolves them itself — same behavior as before this change.
    ...(credentials ? { credentials } : {}),
  });
  return cachedClient;
}

/** Test-only: clears the cached client so credential-selection tests can
 *  exercise getBedrockClient() under different env var states within one
 *  process. Never called from application code. */
export function __resetBedrockClientForTests(): void {
  cachedClient = null;
}

/** Minimal shape callers need from a Bedrock client — lets tests inject a
 *  plain mock object without any AWS SDK/network dependency. Deliberately
 *  not the full BedrockRuntimeClient type (its overloaded `send` collapses
 *  awkwardly through `Pick`). */
export interface BedrockConverseClient {
  send(command: ConverseCommand): Promise<ConverseCommandOutput>;
}

export function extractTextFromConverseResponse(response: ConverseCommandOutput): string {
  const content = response.output?.message?.content;
  if (!Array.isArray(content)) return "";
  const textBlock = content.find(
    (block): block is { text: string } => typeof block === "object" && block !== null && typeof (block as { text?: unknown }).text === "string"
  );
  return textBlock?.text ?? "";
}

export interface ConverseWithClaudeInput {
  system: string;
  user: string;
  client?: BedrockConverseClient;
}

/** One-shot Converse call: system + user text in, raw response text out.
 *  Callers own their own response parsing/validation — this function's
 *  only job is the Bedrock round-trip. A genuine provider-level failure
 *  (auth, network, throttling, invocation error) is never swallowed —
 *  it's rethrown with context and must never trigger a silent fallback. */
export async function converseWithClaude({ system, user, client = getBedrockClient() }: ConverseWithClaudeInput): Promise<string> {
  let response: ConverseCommandOutput;
  try {
    response = await client.send(
      new ConverseCommand({
        modelId: CLAUDE_MODEL_ID,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
      })
    );
  } catch (err) {
    throw new Error(
      `Bedrock Claude invocation failed (model=${CLAUDE_MODEL_ID}, region=${BEDROCK_REGION}): ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  return extractTextFromConverseResponse(response);
}
