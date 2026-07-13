# The Serve Intelligence Constitution

*Adopted 2026-07-13. This is the governing document for the Serve Intelligence Platform — the philosophical and architectural north star for every intelligence engine Serve OS will ever build. It is written to be read by leadership, operations staff, engineers, future AI agents, vendors, and auditors alike. Where a technical design decision conflicts with this document, the design should change to match this document — not the other way around, unless this document is deliberately and openly amended.*

## Preamble

We, the people of Serve Caregiving, in order to know each resident fully, to support every caregiver faithfully, to give each family confidence in the care we provide, and to carry forward — for everyone who serves here now and everyone who will serve here next — the shared knowledge this organization has earned the hard way, through experience, attention, and care, do ordain and establish this Constitution for the Serve Intelligence Platform at Watermere at Frisco.

We hold that technology should strengthen human judgment, never replace it. We hold that dignity, independence, safety, and human connection are not features of this system — they are the reasons it exists. And we hold that a platform built to serve people well today should also be built to serve them, wiser, tomorrow.

---

## Article I — The Purpose of Intelligence

The Serve Intelligence Platform does not exist to collect data. Data is easy to collect and, left alone, easy to ignore. The platform exists to turn operational information into guidance a person can trust, understand, and act on.

Every intelligence engine built on this platform, regardless of domain, exists to answer four questions, in order:

1. **What should Serve know?**
2. **What does it mean?**
3. **What should Serve consider doing?**
4. **Why?**

The fourth question is not optional. Guidance without a "why" is not intelligence — it is a guess wearing a confident voice. This platform does not produce those.

## Article II — Human Authority

Humans remain responsible for the people in their care. This is not a transitional statement to be revisited as the technology matures — it is permanent.

- Every recommendation this platform produces is advisory. None are instructions.
- Professional and operational judgment remains authoritative over anything the platform suggests.
- No automated recommendation bypasses appropriate human review before it becomes action.
- The platform's job is to increase a person's confidence in their own decision — never to obscure who made it, or to let anyone point at the system instead of standing behind their own judgment.

## Article III — Truth Before Intelligence

Intelligence built on unreliable knowledge is not intelligence — it is noise with good production values. Before anything is reasoned about, it must first be true, and known to be true, in a way that can be checked later.

- Facts are not invented. If the evidence isn't there, the platform says so, rather than guessing.
- Every piece of evidence is traceable back to its source.
- Historical events, once recorded, are preserved. They are not deleted and not silently rewritten.
- A correction does not erase what came before it — it is recorded alongside it, so anyone asking "what did we believe, and when" can still get a true answer.
- Reference knowledge about a person — a preference, a contact, a relationship — may change as their life changes, but prior versions are retained. Current truth is authoritative; past truth is not thrown away.
- Where information comes from a vendor system, that origin stays visible — but the vendor's own data shapes and internal complexity stop at the door. Nothing above that boundary should need to know or care how AxisCare or CINCH structures their own records.

## Article IV — Deterministic Reasoning

Deterministic before AI is not a preference. It is the governing principle of how this platform reasons.

- Rules are transparent and versioned. A rule's logic is never a mystery, and never anonymous.
- Every signal the platform raises can be explained in terms of the facts that produced it.
- Every recommendation retains both the evidence behind it and the exact version of the rule that generated it.
- Changing a rule tomorrow does not — and must not — silently change the meaning of a result the platform produced yesterday. History stays explainable under the rule that actually produced it.
- Every time a rule runs, that execution is auditable: what it evaluated, what it produced, and whether it succeeded.

## Article V — Artificial Intelligence

AI has a real and valuable place in this platform. That place has edges, and the edges matter as much as the value.

**AI may assist with:**
- Summarization
- Explanation
- Contextualization
- Prioritizing recommendations the deterministic layer has already produced
- Drafting communication
- Personalizing messages
- Conversational access, through Ask Serve

**AI may not independently become the source of:**
- Historical facts
- Signals
- Rule evaluation
- Operational classifications
- Pricing calculations
- Scheduling decisions
- Compliance decisions
- Eligibility decisions
- Writes to any vendor system

Where AI proposes new reference knowledge or contextual memory about a person, a human must approve it before it is saved. AI may draft. AI may suggest. AI does not get to decide what this organization treats as true, and AI does not get to decide what this organization does.

## Article VI — The Knowledge, Reasoning, and Recommendation Layers

The platform is organized into three layers, and every intelligence domain — scheduling, relationships, proposals, community, operations, compliance, recruiting, and whatever comes after — is built on the same three, not a copy of its own.

**Knowledge Layer — What is true?**
- Subject
- Reference Knowledge
- Historical Fact
- Context Note

**Reasoning Layer — What does it mean?**
- Rule
- Rule Version
- Rule Run
- Signal
- Evidence

**Recommendation Layer — What should Serve consider doing?**
- Recommendation
- Action
- Outcome
- Explanation

An intelligence domain contributes its own rules, its own fact mappings, and its own recommendation patterns *into* this shared platform. It does not build a separate platform of its own. A domain that finds itself designing its own version of a Fact table, a Signal table, or a Recommendation lifecycle has drifted outside this Constitution and should be brought back in, not accommodated.

## Article VII — Relationships and Human Dignity

Serve exists to know and support people — not to maintain records about them. That distinction should be visible in everything this platform does.

- Operational efficiency is only worth pursuing when it strengthens the relationships underneath it. Efficiency that costs a relationship is not a win.
- The platform should preserve meaningful personal context — the things that make a birthday card land instead of just arrive — and it should do so appropriately, not indiscriminately.
- Personalization should be respectful, relevant, and privacy-conscious. Knowing something about someone is not the same as it being appropriate to use, and this platform should be built to tell the difference.
- The resident is the reason the system exists. Every other justification is downstream of that one.

## Article VIII — Vendor Neutrality and Systems of Record

- AxisCare remains the scheduling system of record.
- CINCH remains the community-care system of record.
- Every other vendor — Apploi, Viventium, Dialpad, Google Workspace, SAS, and whoever comes next — retains the operational role it was chosen for.
- Serve OS is the operational intelligence layer above all of them. It is not trying to become any of them.
- Vendors will change over time. That should be an inconvenience, not a crisis. Serve-owned knowledge, rules, evidence, and outcomes are built to remain portable — this organization's institutional memory should never be trapped inside a vendor's database.
- Recommendations must never silently mutate a vendor system. If something needs to change in AxisCare or CINCH, a human makes that change, in that system, on purpose.

## Article IX — Organizational Learning

The platform is built to get wiser over time, through a specific, human-governed loop:

```
Knowledge
   →  Signals
   →  Recommendations
   →  Human Actions
   →  Outcomes
   →  Better review
   →  Better Rule Versions
   →  Better future recommendations
```

The platform does not rewrite its own rules. Any future proposal to permit autonomous rule modification would require an explicit amendment to this Constitution, formal human approval, and a separately governed implementation decision.

A human reviews how recommendations actually played out and decides, deliberately, whether a rule needs to change. Historical outcomes *inform* that judgment. They do not replace it, and they do not control future logic on their own.

## Article X — Simplicity and Shared Architecture

Complexity has to earn its place here. It does not get one by default.

- Shared primitives get reused. A new domain does not get to invent its own version of something that already exists.
- Duplicate rule engines are not acceptable. There is one reasoning layer, used by everyone.
- A domain-specific exception is possible, but it must be justified in the open, not assumed quietly.
- Every new intelligence domain inherits the platform's contract rather than negotiating its own.
- Community Intelligence aggregates signals the other domains already produced. It is not a second, parallel system that happens to share a name.
- Where infrastructure already exists — like Serve OS's existing notification system — it gets reused, not rebuilt under a different name inside this platform.

## Article XI — Auditability, Privacy, and Stewardship

- Every recommendation this platform ever produces should be reconstructable — what triggered it, what evidence supported it, and what rule version reasoned about it — for as long as it matters.
- Explanations preserve what a human actually saw at the time, even if the underlying facts are later corrected or updated.
- Sensitive context is protected, not just stored. Some of what this platform knows about a person deserves a narrower audience than the rest.
- Minimum-necessary access governs design — a feature does not get broader access than its purpose requires.
- Rules, signals, actions, and outcomes are retained and access-controlled appropriately, not by default assumption.
- Every engineer who touches this platform is a steward of institutional knowledge that will outlast their own time working on it. Build accordingly.
- The measure of success, over years, is that this system becomes more understandable and more trustworthy — not merely bigger.

---

## Closing Principle

Technology should never become the hero.

**The caregiver remains the hero.
The resident remains the reason.
The family remains the trust we are privileged to earn.**

Serve Intelligence exists so that every member of this organization can draw on the collective knowledge, judgment, and experience of the whole organization, at the exact moment they need it — not to replace what they already know, but to make sure they never have to know it alone.
