// Data layer for the durable, human-set AxisCare client disposition
// override — see lib/integrations/axiscare/clientDisposition.ts and
// supabase/migrations/20260823000000_add_axiscare_client_disposition.sql.
import { createServerClient } from "../supabase/server.ts";
import type { AxisCareClientDisposition, AxisCareClientDispositionRow } from "../integrations/axiscare/clientDisposition.ts";

interface RawDispositionRow {
  id: string;
  axiscare_client_id: string;
  disposition: AxisCareClientDisposition;
  rationale: string;
  related_axiscare_client_id: string | null;
  related_person_note: string | null;
  set_by: string;
  set_at: string;
  created_at: string;
  updated_at: string;
}

function toDispositionRow(raw: RawDispositionRow): AxisCareClientDispositionRow {
  return {
    id: raw.id,
    axiscareClientId: raw.axiscare_client_id,
    disposition: raw.disposition,
    rationale: raw.rationale,
    relatedAxisCareClientId: raw.related_axiscare_client_id,
    relatedPersonNote: raw.related_person_note,
    setBy: raw.set_by,
    setAt: raw.set_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// Bulk read, keyed by AxisCare client id — the shape every reconciliation
// pass and sync script needs (one lookup, not N queries).
export async function getAxisCareClientDispositions(): Promise<Map<string, AxisCareClientDispositionRow>> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("axiscare_client_dispositions").select("*");

  if (error) {
    console.error("[getAxisCareClientDispositions]", { message: error.message });
    return new Map();
  }

  const rows = ((data as RawDispositionRow[] | null) ?? []).map(toDispositionRow);
  return new Map(rows.map((row) => [row.axiscareClientId, row]));
}

export async function setAxisCareClientDisposition(input: {
  axiscareClientId: string;
  disposition: AxisCareClientDisposition;
  rationale: string;
  actor: string;
  relatedAxisCareClientId?: string | null;
  relatedPersonNote?: string | null;
}): Promise<{ row?: AxisCareClientDispositionRow; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("set_axiscare_client_disposition", {
      p_axiscare_client_id: input.axiscareClientId,
      p_disposition: input.disposition,
      p_rationale: input.rationale,
      p_actor: input.actor,
      p_related_axiscare_client_id: input.relatedAxisCareClientId ?? null,
      p_related_person_note: input.relatedPersonNote ?? null,
    })
    .single();

  if (error || !data) {
    return { error: `Could not set AxisCare client disposition for ${input.axiscareClientId}: ${error?.message}` };
  }

  return { row: toDispositionRow(data as RawDispositionRow) };
}
