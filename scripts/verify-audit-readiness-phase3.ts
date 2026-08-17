// Live, read-only verification for Audit Readiness v0.1 Phase 3 (the
// Dashboard) — proves the composition layer runs against real data and
// reports what it actually found, since this page has no writes to
// self-clean (unlike Phase 1A/2's scripts).
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-audit-readiness-phase3.ts
import { getAuditReadinessDashboardData, rankIssues } from "../lib/compliance/auditReadinessDashboard.ts";

async function main() {
  // getAuditReadinessDashboardData() now takes the audit-eligible active-
  // client population as a parameter, resolved via
  // getAuditEligibleActiveClientResidents() (lib/data/residentServeRelationships.ts)
  // — that pipeline has real @/-alias/extensionless imports and cannot run
  // under this standalone script. This pre-existing Phase 3 script's job
  // is Workforce/Emergency Preparedness/cross-domain composition, already
  // covered below without Client Readiness data; Client Readiness's own
  // live population is verified separately by
  // scripts/verify-client-readiness-phaseB.ts and the real dashboard page.
  const data = await getAuditReadinessDashboardData([]);

  console.log("== Domains ==");
  for (const domain of data.domains) {
    console.log(`${domain.label}: configured=${domain.configured}, requirements=${domain.requirementCount}, subjects=${domain.subjectCount}`);
    if (domain.configured) {
      for (const [status, count] of Object.entries(domain.statusCounts)) {
        if (count > 0) console.log(`  ${status}: ${count}`);
      }
    }
  }

  console.log("\n== Needs Attention (top 5) ==");
  for (const issue of rankIssues(data.domains).slice(0, 5)) {
    console.log(`${issue.status} — ${issue.requirementName} — ${issue.subjectLabel} — ${issue.subjectHref}`);
  }

  console.log(`\n== Corrective Actions: ${data.correctiveActions.length} open ==`);
  const bySource = data.correctiveActions.reduce<Record<string, number>>((acc, a) => {
    acc[a.source] = (acc[a.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(bySource);

  console.log(`\n== Recent Documents: ${data.recentDocuments.length} ==`);
}

main().catch((err) => {
  console.error("Phase 3 verification crashed:", err);
  process.exit(1);
});
