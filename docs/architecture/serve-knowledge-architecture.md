# Serve Knowledge Architecture Inventory v0.1

**Type:** Enterprise Information Architecture — **not** governance, **not** a policy rewrite, **not** a compliance review
**Version:** 0.1
**Status:** Draft — Initial Inventory
**Classification:** Internal — Confidential
**Last Updated:** 2026-07-08

---

## What This Document Is

This is a catalog. It identifies every significant document currently used by Serve Caregiving — regardless of whether it lives in this repository, a sibling folder outside of it, or nowhere version-controlled at all — and classifies each one by type, architectural layer, canonicity, and where it should eventually live.

**Nothing here was rewritten, merged, deleted, improved, or turned into governance.** Where a document's content overlaps with another's, that overlap is *noted*, not resolved. This document becomes the master catalog Serve's future documentation migration is measured against — it does not perform that migration itself.

This is the third document in a three-part architecture series:

1. `docs/compliance/regulatory-registry/policy-coverage-matrix.md` — what regulatory requirements exist and how well Serve's documentation currently covers them.
2. `docs/architecture/serve-governance-crosswalk.md` — how those requirements will eventually flow through governance, playbooks, software, and AI.
3. **This document** — every piece of institutional knowledge Serve has, regardless of whether it was in scope for #1 or #2.

## A Note on Row Granularity

Two groups of near-duplicate files are catalogued as a single row rather than one row each, to keep this inventory useful rather than mechanically exhaustive:

- The **25 individual Texas PAS regulation files** (`Serve Drive Docs/Texas PAS/*.docx`) are one row, because they are verbatim-identical in content to the master "All Must Haves" document (confirmed by direct comparison while building the Coverage Matrix) — they are a redundant split of a single source, not 25 distinct pieces of knowledge.
- The **13 files of Background Eligibility Module 1** (`docs/governance/workforce/background-eligibility/`) are one row, because they already function as a single governed unit with its own internal index (`README.md`) — listing all 13 separately would inflate this catalog without adding information not already available in that module's own README.

Every other document below has a distinct role and gets its own row.

---

## Knowledge Inventory

| Document | Current Location | Document Type | Architectural Layer | Canonical Source? | Future Home | Status | Notes |
|---|---|---|---|---|---|---|---|
| Texas PAS Regulations — "All Must Haves" | `Serve Drive Docs/1.Regulations.All.Must Haves.docx` (external) | Regulatory Index | External Regulations | Yes | `docs/regulations/` | Needs Migration | Full text of all 28 TAC §558 A–D written-policy requirements in one document; already the de facto source used to build the Coverage Matrix. |
| Texas PAS Regulations — Individual Section Files (25 files) | `Serve Drive Docs/Texas PAS/` (external) | Regulation | External Regulations | No | `docs/regulations/archive/` | Duplicate | Verbatim-identical to the "All Must Haves" master document, split into 25 separate files. Redundant with the row above; migrating both is not recommended. |
| Serve Caregiving Policies & Procedures (draft) | `Serve Drive Docs/` (external) | Policy Manual | Organizational Knowledge | Yes | `docs/organizational-knowledge/`, then progressively superseded by `docs/governance/` section-by-section | Needs Migration | Comprehensive; organized by the same §558 numbering as the regulations. Contains internal duplication (Client Satisfaction Survey Policy appears twice — see Coverage Matrix). |
| Employee Orientation Presentation (6.14.2026) | `Serve Drive Docs/` (external) | Orientation | Organizational Knowledge | Partial | `docs/organizational-knowledge/training/` | Needs Migration | Sole existing source for HIPAA/HB300 and Personal Appearance Standards content — neither exists as a written policy elsewhere (see Coverage Matrix). |
| Hiring Process (6.22) | `Serve Drive Docs/` (external, non-standard file extension) | Playbook | Operational Playbook | Yes | `docs/playbooks/hiring-playbook.md` | Needs Migration | Only source naming the actual hiring tools/vendors (Apploi, Viventium, AxisCare, Sapphire, TULIP). Informal and unversioned; direct seed for the future Hiring Playbook named in the Governance Crosswalk. |
| Cultural Sensitivity & Diversity Training | `Serve Drive Docs/` (external) | Training | Organizational Knowledge | Yes | `docs/organizational-knowledge/training/` | Needs Migration | Soft-skills training; not tied to a specific §558 regulation. |
| Operational Readiness & Audit Preparedness Roadmap | `docs/architecture/` (in-repo, untracked) | Architecture | Architecture | Yes | `docs/architecture/` | Migrated (2026-07-12) | **The originating charter for this entire architecture series.** Its stated vision — Regulations → Operational Requirements → Evidence Collection → Serve OS → Operational Readiness → Audit Preparedness → Operational Intelligence — is the direct ancestor of the Dependency Graph in the Governance Crosswalk. |
| Background Eligibility Policy v0.1 Draft (.docx) | `docs/organizational-knowledge/archive/` (in-repo, untracked) | Policy Manual (draft) | Organizational Knowledge | Historical | `docs/organizational-knowledge/archive/` | Superseded, Migrated (2026-07-12) | Original seed for Background Eligibility Module 1; superseded in place per that module's own decision log. Moved out of `public/`, the web-servable static-assets folder — was not an appropriate location for an internal policy document regardless of governance status. |
| ARCHITECTURE.md | `serve-os/` root (tracked) | Architecture | Architecture | Yes | `docs/architecture/` or remain at root | Current | Serve OS's software architectural principles (operating-system model). Different subject from the regulatory Governance Crosswalk — complementary, not duplicate. |
| CHANGELOG.md | `serve-os/` root (tracked) | Reference | Software | Yes | Remain at root | Current | Software release log. |
| CURRENT_STATUS.md | `serve-os/` root (tracked) | Reference | Software | Yes | Remain at root | Current | Session-by-session working notes; ephemeral by nature. |
| DECISION_LOG.md | `serve-os/` root (tracked) | Decision Log | Software | Yes | Remain at root, or `docs/decisions/software/` | Current | Software engineering decision log. Same document *type* as, but distinct in *scope* from, the new governance `decision-log.md` inside Background Eligibility Module 1 — see Duplicate Knowledge Analysis. |
| ENVIRONMENT.md | `serve-os/` root (tracked) | Reference | Software | Yes | Remain at root | Current | Environment variable documentation. |
| MILESTONES.md | `serve-os/` root (tracked) | Reference | Software | Yes | Remain at root | Current | Product milestone log. |
| PRODUCTION_READINESS.md | `serve-os/` root (tracked) | Specification | Software | Yes | Remain at root, or `docs/architecture/` | Current | Production readiness checklist for the Serve OS application. |
| README.md | `serve-os/` root (tracked) | Reference | Software | Yes | Remain at root | Current | Standard Next.js boilerplate; not organization-specific content. |
| SERVE_BUILD_CONTEXT.md | `serve-os/` root (tracked) | Knowledge Base | Organizational Knowledge | Yes | `docs/organizational-knowledge/` | Current | General project/organizational context and history — the closest existing root document to a true organizational knowledge base. |
| VISION.md | `serve-os/` root (tracked) | Reference | Organizational Knowledge | Yes | `docs/organizational-knowledge/` | Current | Mission/vision statement for Serve OS as a product; adjacent to but distinct from the Workforce Governance Framework's own stated philosophy. |
| CARE_INQUIRY_ARCHITECTURE.md | `docs/architecture/` (untracked) | Architecture | Architecture | Yes | `docs/architecture/` | Migrated (2026-07-12) | Diagrams care-inquiry source channels. Filename typo ("ARCHITECHTURE") corrected during migration. |
| AGENTS.md / CLAUDE.md | `serve-os/` root (tracked) | Reference | Software | Yes | Remain at root (required by tooling convention) | Current | AI coding-agent instructions. `CLAUDE.md` is a one-line import of `AGENTS.md`. Not organizational knowledge in the governance sense. |
| Serve Workforce Governance Framework — README | `docs/governance/workforce/README.md` | Governance | Governance | Yes | Already at future home | Current | Top-level index for the Workforce Governance Framework. |
| Background Eligibility Module 1 (13 files) | `docs/governance/workforce/background-eligibility/` | Governance | Governance | Yes | Already at future home | Current | Version 0.1, pending legal and executive review. See that module's own `README.md` for the per-file breakdown. |
| Serve Compliance Coverage Matrix | `docs/compliance/regulatory-registry/policy-coverage-matrix.md` | Regulatory Index | Regulatory Registry | Yes | Already at future home | Current | Maps all 28 §558 requirements to current Serve documentation. |
| Serve Governance Crosswalk | `docs/architecture/serve-governance-crosswalk.md` | Architecture | Architecture | Yes | Already at future home | Current | Maps regulations through governance, playbooks, software, and AI capability. |
| Serve Knowledge Architecture Inventory (this document) | `docs/architecture/serve-knowledge-architecture.md` | Architecture | Architecture | Yes | Already at future home | Current | The master catalog itself. |

---

## 1. Current Knowledge Inventory Summary

**Total documents catalogued: 25** (representing more individual files where grouped — see "A Note on Row Granularity" above)

### By Architectural Layer

| Layer | Count |
|---|---|
| External Regulations | 2 |
| Regulatory Registry | 1 |
| Organizational Knowledge | 6 |
| Governance | 2 |
| Operational Playbook | 1 |
| Architecture | 5 |
| Operational Intelligence | 0 |
| Software | 8 |

**Notable finding:** the **Operational Intelligence** layer has zero documents. Nothing in Serve's current knowledge base describes AI-driven or automated operational capability — the entire layer is aspirational, named for the first time in the Governance Crosswalk's AI Capability Inventory. This is expected at this stage, not a gap to close urgently.

### By Document Type

| Type | Count |
|---|---|
| Reference | 7 |
| Architecture | 5 |
| Regulatory Index | 2 |
| Policy Manual | 2 |
| Governance | 2 |
| Regulation | 1 |
| Orientation | 1 |
| Playbook | 1 |
| Training | 1 |
| Decision Log | 1 |
| Knowledge Base | 1 |
| Specification | 1 |

### By Canonical Source Status

| Value | Count |
|---|---|
| Yes | 22 |
| No | 1 |
| Partial | 1 |
| Historical | 1 |

### By Status

| Status | Count |
|---|---|
| Current | 16 |
| Needs Migration | 7 |
| Duplicate | 1 |
| Superseded | 1 |

---

## 2. Migration Recommendations

### Should move into the repository

- ~~**Operational Readiness & Audit Preparedness Roadmap**~~ — done 2026-07-12: moved from `serve-os/documents/` to `docs/architecture/`. Still untracked pending commit.
- **Texas PAS "All Must Haves"** — the single source of regulatory truth should be version-controlled, not living in an external folder no tooling or teammate can reliably find.
- **Serve Caregiving Policies & Procedures (draft)** — Serve's actual current operating policy deserves the same durability as its governance successor.
- **Employee Orientation Presentation** and **Cultural Sensitivity & Diversity Training** — particularly the Orientation deck, since it is the sole source for HIPAA/HB300 and Personal Appearance content.
- **Hiring Process document** — the concrete operational detail it contains (actual vendor names, actual sequence) is exactly what the future Hiring Playbook and Background Eligibility Engine will need as their real-world starting point.
- ~~**CARE_INQUIRY_ARCHITECHTURE.md**~~ — done 2026-07-12: filename typo corrected to `CARE_INQUIRY_ARCHITECTURE.md` and moved from repo root into `docs/architecture/`. Still untracked pending commit.

### Should remain external (for now)

- Nothing reviewed here should remain *permanently* external — the recommendation above is that everything currently outside version control eventually comes in. The only near-term exception is the **25 individual Texas PAS section files**, which should not be migrated at all (see below), not because they should stay external, but because migrating a duplicate serves no purpose.

### Should be archived

- **25 individual Texas PAS regulation files** — redundant with the "All Must Haves" master document. If migrated at all, they belong in an archive subfolder, not as a second active copy of the same regulatory text.
- **Background Eligibility Policy v0.1 Draft (.docx)** — already superseded in place by Module 1. It has enduring value as a historical record of where the governance framework's substance originated (already captured in that module's `decision-log.md`), but its operative content should not be treated as current. It should also be moved out of `public/`, which is a web-servable folder, regardless of its archival status.

### Should become governance

None of the documents catalogued here are being converted into governance *by this document* — that determination and execution belongs to future, explicitly-chartered work (as Background Eligibility Module 1 already demonstrated for one slice of §558.245/246). What this inventory does establish is *which* documents are the right raw material for that future work:

- Serve Caregiving Policies & Procedures (draft) — the primary feedstock for every future governance module named in the Governance Crosswalk.
- Hiring Process document — feedstock specifically for the Hiring Playbook and the parts of Workforce Governance not yet covered by Background Eligibility Module 1.
- Employee Orientation Presentation — feedstock for a future Information Governance module (HIPAA/HB300) and the non-regulatory Personal Appearance standard.

---

## 3. Canonical Source Recommendations

For each major subject area, this is where a single source of truth should ultimately exist. Several of these already point at a document that exists today; others do not yet have a canonical home and currently exist only as training content or informal notes.

| Subject Area | Recommended Canonical Source | Exists Today? |
|---|---|---|
| Texas PAS regulatory text | `docs/regulations/` (migrated "All Must Haves") | Yes, externally |
| Regulatory coverage status | `docs/compliance/regulatory-registry/policy-coverage-matrix.md` | Yes, in-repo |
| Background eligibility classification | `docs/governance/workforce/background-eligibility/` | Yes, in-repo |
| General staffing/hiring policy | Serve Caregiving Policies & Procedures §245 (future: Workforce Governance) | Yes, externally (not yet governed) |
| Concrete hiring workflow/tooling | Hiring Process document (future: Hiring Playbook) | Yes, externally (informal) |
| Client care policy and rights | Serve Caregiving Policies & Procedures §281–283, §292–297 (future: Client Care Governance) | Yes, externally (not yet governed) |
| Emergency preparedness | Serve Caregiving Policies & Procedures §256 (future: Emergency Management) | Yes, externally (not yet governed) — already Serve's most complete section |
| Quality assurance / QAPI | Serve Caregiving Policies & Procedures §287 (future: Quality Governance) | Yes, externally, but internally duplicated (see below) |
| HIPAA / HB300 privacy | **No written policy exists anywhere.** Only training content in the Orientation deck. | No |
| Personal Appearance Standards | **No written policy exists anywhere.** Only referenced in Orientation and the Hiring Process checklist. | No |
| Software architecture (Serve OS itself) | `ARCHITECTURE.md` | Yes, in-repo |
| Regulatory/governance architecture roadmap | `docs/architecture/` (this series) | Yes, in-repo |
| Program vision and philosophy | Operational Readiness & Audit Preparedness Roadmap | Yes, in-repo (untracked) |

---

## 4. Duplicate Knowledge Analysis

| Overlap | Documents Involved | Nature of Duplication |
|---|---|---|
| Orientation vs. Policies | Employee Orientation Presentation ↔ Serve Caregiving Policies & Procedures | Bloodborne Pathogens/Universal Precautions content and Abuse/Neglect reporting content both appear in the P&P draft *and* the Orientation deck. This is largely healthy duplication (training reinforcing written policy) rather than a conflict — but neither document currently states which one is canonical. |
| Training vs. Policies | Cultural Sensitivity & Diversity Training ↔ Serve Caregiving Policies & Procedures §282 (Client Conduct/Rights) | Soft overlap only — the training's dignity/respect themes echo the Client Bill of Rights, but with no literal text duplication. Not a concern. |
| Regulations vs. Policy Manual | Texas PAS "All Must Haves" ↔ Serve Caregiving Policies & Procedures | Intentional and expected — the P&P draft is organized by the same §558 section numbers specifically so it can be read side-by-side with the regulation. Not a duplication problem; this is the pattern working as designed. |
| Policy Manual vs. Governance | Serve Caregiving Policies & Procedures §245 ("Not Hirable" criteria, citing Texas Health & Safety Code §250.006) ↔ Background Eligibility Module 1 (four-classification offense taxonomy) | **Two parallel, not-yet-reconciled disqualification standards for the same subject.** The P&P draft's "Not Hirable" list and Module 1's Eligible/Reviewable/Presumptive/Automatic Disqualification taxonomy were built independently and have not been cross-walked against each other. This was already flagged as a consolidation opportunity in the Coverage Matrix (item 9) and is repeated here because it is the clearest live example of Policy Manual vs. Governance divergence in Serve's current knowledge base. |
| Internal duplication within one document | Serve Caregiving Policies & Procedures — "Client Satisfaction Survey Policy" appears twice (once before §281, once within §287) | Already identified in the Coverage Matrix (§558.287 row) — flagged again here because it is a duplication *within* a single canonical source, which is a different (and in some ways more concerning) pattern than duplication *across* documents. |
| Decision log naming collision | `DECISION_LOG.md` (root, software engineering) ↔ `docs/governance/workforce/background-eligibility/decision-log.md` (governance) | Not a content duplication — the two logs track entirely different subjects. Flagged because the identical naming pattern (and identical document *type*) could cause confusion about which "decision log" a reader means, especially as more governance modules each accumulate their own decision log. Worth a naming convention decision (e.g., always qualifying which log — "Software Decision Log" vs. "Workforce Governance Decision Log") before a third one is created. |

---

## 5. Knowledge Architecture Diagram

```
External Regulations
   (Texas PAS "All Must Haves"; 25 individual section files —
    currently outside this repository entirely)
        |
        v
Compliance Registry
   (Serve Compliance Coverage Matrix — maps every regulatory
    requirement to current Serve documentation and a status)
        |
        v
Organizational Knowledge
   (Serve Caregiving Policies & Procedures; Employee Orientation;
    Hiring Process; Cultural Sensitivity Training; SERVE_BUILD_CONTEXT.md;
    VISION.md — the accumulated, not-yet-governed knowledge of how
    Serve actually operates today)
        |
        v
Governance
   (Serve Workforce Governance Framework; Background Eligibility
    Module 1 — the only layer, so far, where organizational knowledge
    has been formally reshaped into policy + playbook + software spec
    + AI decision model, together)
        |
        v
Operational Playbooks
   (Named in the Governance Crosswalk — Hiring Playbook, Incident
    Response Playbook, Client Admission Playbook, Emergency Response
    Playbook, QAPI Playbook, and others — none formally written yet;
    the Hiring Process document is the clearest existing seed for one)
        |
        v
Operational Intelligence
   (AI capabilities named in the Governance Crosswalk — detect expired
    certifications, predict survey deficiencies, generate audit packets,
    and others — currently zero documents exist at this layer; this is
    the top of the Operational Readiness Roadmap's own long-term vision,
    not yet begun)
        |
        v
Serve OS
   (The software system itself — ARCHITECTURE.md, PRODUCTION_READINESS.md,
    and the actual application in this repository — today serves
    resident/operational data, and does not yet implement any layer
    above Organizational Knowledge)
```

**Reading this diagram honestly:** most of Serve's actual knowledge today sits in the second layer (Organizational Knowledge) and is only beginning to move into the third (Governance), one module at a time — Background Eligibility is the only completed example. Every layer below Governance is either partially specified (Architecture) or entirely unbuilt (Operational Playbooks as formal documents, Operational Intelligence, and the governance-aware parts of Serve OS). That gap is not a criticism — it is the roadmap the Operational Readiness & Audit Preparedness Roadmap itself describes, and this inventory is the first complete accounting of how much of it remains.

## 6. Governance's Path Into Serve OS (added by ADR 0001)

`docs/architecture/decisions/0001-governance-knowledge-engine-phase-0.md`
establishes how the Governance layer above eventually becomes part of
"the governance-aware parts of Serve OS" this document flags as entirely
unbuilt: not as a new, parallel knowledge store, but as one more domain
(`"compliance"`) on top of the Intelligence Kernel already built at
`lib/intelligence/core/`. Governance documents themselves remain canonical
and un-duplicated — read directly, never copied into a database — with a
formal connection point (`EvidenceReference`'s `reference_knowledge` kind)
reserved for once Reference Knowledge is implemented kernel-wide (Phase E).
This section is additive; it does not change any finding, status, or
recommendation elsewhere in this inventory.
