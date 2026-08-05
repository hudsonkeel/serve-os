// Source authority ranking — "which record do we trust more?" A small,
// explicit, hardcoded rank table rather than a database table: these are
// fixed engineering-known tiers, not end-user-editable data, matching how
// this codebase already hardcodes similarly fixed small vocabularies
// (e.g. lib/relationships/constants.ts's enums) rather than adding a
// configuration table for something that changes only when a new source
// system is integrated.
//
// Higher rank = more trusted. Ties are broken by history richness — see
// lib/residents/identity/canonicalRecommendation.ts — never by rank
// alone, since two records from the same source are equally trustworthy.
const SOURCE_AUTHORITY_RANK: Record<string, number> = {
  "human-confirmed": 100,
  "Watermere official roster": 90,
  serve_os_manual: 70,
  AxisCare: 50,
  Cinch: 50,
  "Watermere resident roster CSV": 20,
};

const DEFAULT_AUTHORITY_RANK = 10;

export function sourceAuthorityRank(sourceSystem: string | null): number {
  if (!sourceSystem) return DEFAULT_AUTHORITY_RANK;
  return SOURCE_AUTHORITY_RANK[sourceSystem] ?? DEFAULT_AUTHORITY_RANK;
}

export function sourceAuthorityLabel(sourceSystem: string | null): string {
  if (!sourceSystem) return "Unknown source";
  return sourceSystem in SOURCE_AUTHORITY_RANK ? sourceSystem : `${sourceSystem} (unranked — treated as low authority)`;
}
