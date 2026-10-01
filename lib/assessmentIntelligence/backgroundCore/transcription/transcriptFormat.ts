// AWS Transcribe output → structured turns → the durable assessment transcript (pure).
//
// Speaker labels are AWS's own anonymous labels (spk_0, spk_1, …). They are preserved exactly and
// are NEVER mapped to a role (resident, daughter, assessor, POA…) — nothing here can know who is
// speaking. Multi-run recordings are combined chronologically with an explicit, neutral boundary
// so the transcript never pretends an interrupted conversation was continuous. The output is
// plain text: it is the canonical intake_sources.transcript_text that the existing extraction
// pipeline (runExtractionPipelineForSession) consumes unchanged.

export interface TranscriptTurn {
  speaker: string | null;
  startSec: number | null;
  endSec: number | null;
  text: string;
}

export interface ParsedRunTranscript {
  turns: TranscriptTurn[];
  speakerLabels: boolean;
  speakerCount: number;
  durationSec: number | null;
}

interface TranscribeItem {
  type?: string;
  start_time?: string;
  end_time?: string;
  speaker_label?: string;
  alternatives?: { content?: string }[];
}

const SPEAKER_RE = /^spk_\d{1,2}$/;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Parses a Transcribe job's output JSON. Speaker per word comes from the item's own
 * speaker_label (current output format) or, for older outputs, from speaker_labels.segments by
 * matching each word's start time into a segment. Consecutive words from the same speaker become
 * one turn. Without speaker labels, the whole run is a single unlabeled turn. */
export function parseTranscribeOutput(json: unknown): ParsedRunTranscript | { error: string } {
  const results = (json as { results?: Record<string, unknown> } | null)?.results;
  if (!results || typeof results !== "object") return { error: "Transcription output has no results." };

  const items = Array.isArray(results.items) ? (results.items as TranscribeItem[]) : [];
  const plain = Array.isArray(results.transcripts)
    ? ((results.transcripts as { transcript?: string }[])[0]?.transcript ?? "").trim()
    : "";

  // Older outputs: speaker per time window.
  const segments = Array.isArray((results.speaker_labels as { segments?: unknown } | undefined)?.segments)
    ? ((results.speaker_labels as { segments: { speaker_label?: string; start_time?: string; end_time?: string }[] }).segments)
    : [];
  const speakerAt = (start: number | null): string | null => {
    if (start === null) return null;
    const seg = segments.find((s) => {
      const a = num(s.start_time);
      const b = num(s.end_time);
      return a !== null && b !== null && start >= a && start <= b;
    });
    return seg?.speaker_label && SPEAKER_RE.test(seg.speaker_label) ? seg.speaker_label : null;
  };

  if (items.length === 0) {
    const turns = plain ? [{ speaker: null, startSec: null, endSec: null, text: plain }] : [];
    return { turns, speakerLabels: false, speakerCount: 0, durationSec: null };
  }

  const turns: TranscriptTurn[] = [];
  let anySpeaker = false;
  let lastSpeaker: string | null | undefined;
  let maxEnd: number | null = null;
  for (const item of items) {
    const content = item.alternatives?.[0]?.content?.trim();
    if (!content) continue;
    if (item.type === "punctuation") {
      const current = turns[turns.length - 1];
      if (current) current.text += content;
      continue;
    }
    const start = num(item.start_time);
    const end = num(item.end_time);
    if (end !== null) maxEnd = maxEnd === null ? end : Math.max(maxEnd, end);
    const own = item.speaker_label && SPEAKER_RE.test(item.speaker_label) ? item.speaker_label : null;
    const speaker = own ?? speakerAt(start);
    if (speaker) anySpeaker = true;
    const current = turns[turns.length - 1];
    if (current && speaker === lastSpeaker) {
      current.text += ` ${content}`;
      if (end !== null) current.endSec = end;
    } else {
      turns.push({ speaker, startSec: start, endSec: end, text: content });
      lastSpeaker = speaker;
    }
  }
  const speakers = new Set(turns.map((t) => t.speaker).filter((s): s is string => Boolean(s)));
  return { turns, speakerLabels: anySpeaker, speakerCount: speakers.size, durationSec: maxEnd };
}

export function formatOffset(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatTurn(turn: TranscriptTurn): string {
  const tags = [turn.startSec !== null ? formatOffset(turn.startSec) : null, turn.speaker].filter(Boolean);
  return tags.length ? `[${tags.join(" ")}] ${turn.text}` : turn.text;
}

function describeGap(ms: number | null): string {
  if (ms === null) return "the length of the gap is not known";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `about ${sec} second${sec === 1 ? "" : "s"} were not recorded`;
  const min = Math.round(sec / 60);
  return `about ${min} minute${min === 1 ? "" : "s"} were not recorded`;
}

export interface RunTranscriptForCombination {
  order: number;
  transcript: ParsedRunTranscript;
  internalGapCount: number;
}

/** Deterministic combination: runs in `order`; one neutral boundary line between consecutive
 * runs (with the measured gap when the capture metadata provides one, otherwise "not known");
 * timestamps are offsets within each part. `gapsBeforeRunMs[i]` is the gap before the (i+2)th
 * run, i.e. between part i+1 and part i+2. */
export function combineRunTranscripts(runs: readonly RunTranscriptForCombination[], gapsBeforeRunMs: readonly (number | null)[] = []): string {
  const ordered = [...runs].sort((a, b) => a.order - b.order);
  const total = ordered.length;
  const anySpeakers = ordered.some((r) => r.transcript.speakerLabels);
  const lines: string[] = [];
  lines.push(
    `[Assessment conversation transcript — automatic speech-to-text${total > 1 ? `, recorded in ${total} parts because the recording was interrupted` : ""}.` +
      (anySpeakers ? " Speaker labels (spk_0, spk_1, …) are assigned automatically and do not identify who is speaking." : "") +
      " Times are offsets from the start of each part.]"
  );
  ordered.forEach((run, i) => {
    if (i > 0) {
      lines.push("");
      lines.push(`[Recording interrupted — ${describeGap(gapsBeforeRunMs[i - 1] ?? null)} before Part ${i + 1}.]`);
    }
    lines.push("");
    if (total > 1) lines.push(`[Part ${i + 1} of ${total}]`);
    if (run.internalGapCount > 0) {
      lines.push(`[Note: ${run.internalGapCount} short segment${run.internalGapCount === 1 ? "" : "s"} of audio in this part could not be saved and are missing.]`);
    }
    if (run.transcript.turns.length === 0) lines.push("[No speech was detected in this part.]");
    for (const turn of run.transcript.turns) lines.push(formatTurn(turn));
  });
  return lines.join("\n").trim();
}

/** True when the combined runs contain any recognized speech at all. */
export function hasRecognizedSpeech(runs: readonly { transcript: ParsedRunTranscript }[]): boolean {
  return runs.some((r) => r.transcript.turns.some((t) => t.text.trim().length > 0));
}
