"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWorkforceCommunityMembership } from "@/lib/actions/workforce";
import type { Community, WorkforceCommunityMembership, WorkforceCommunityMembershipStatus } from "@/lib/supabase/types";

const STATUS_LABELS: Record<WorkforceCommunityMembershipStatus, string> = {
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
  transferred: "Transferred",
};

const STATUS_STYLES: Record<WorkforceCommunityMembershipStatus, string> = {
  pending: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-ivory-warm text-muted",
  terminated: "bg-red-50 text-red-700",
  transferred: "bg-amber-50 text-amber-700",
};

interface MembershipFormState {
  membershipStatus: WorkforceCommunityMembershipStatus;
  roleType: string;
  startDate: string;
  endDate: string;
  isPrimaryCommunity: boolean;
  schedulerNotes: string;
  availabilityNotes: string;
  rationale: string;
}

function toFormState(m?: WorkforceCommunityMembership): MembershipFormState {
  return {
    membershipStatus: m?.membership_status ?? "pending",
    roleType: m?.role_type ?? "",
    startDate: m?.start_date ?? "",
    endDate: m?.end_date ?? "",
    isPrimaryCommunity: m?.is_primary_community ?? false,
    schedulerNotes: m?.scheduler_notes ?? "",
    availabilityNotes: m?.availability_notes ?? "",
    rationale: "",
  };
}

function MembershipEditor({
  workforceMemberId,
  communityId,
  initial,
  onDone,
}: {
  workforceMemberId: string;
  communityId: string;
  initial?: WorkforceCommunityMembership;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<MembershipFormState>(toFormState(initial));
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function runSave() {
    if ((form.membershipStatus === "terminated" || form.membershipStatus === "transferred") && !form.endDate) {
      setError("An end date is required for a terminated or transferred membership.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveWorkforceCommunityMembership({
        workforceMemberId,
        communityId,
        membershipStatus: form.membershipStatus,
        roleType: form.roleType.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isPrimaryCommunity: form.isPrimaryCommunity,
        schedulerNotes: form.schedulerNotes.trim() || null,
        availabilityNotes: form.availabilityNotes.trim() || null,
        rationale: form.rationale.trim() || null,
      });
      if (result.error) setError(result.error);
      else {
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ivory-border p-3">
      {error && <p className="font-sans text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-muted">
          Status
          <select
            value={form.membershipStatus}
            onChange={(e) => setForm({ ...form, membershipStatus: e.target.value as WorkforceCommunityMembershipStatus })}
            className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Role
          <input
            type="text"
            value={form.roleType}
            onChange={(e) => setForm({ ...form, roleType: e.target.value })}
            className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 self-end text-xs text-muted">
          <input
            type="checkbox"
            checked={form.isPrimaryCommunity}
            onChange={(e) => setForm({ ...form, isPrimaryCommunity: e.target.checked })}
          />
          Primary community
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Start date
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>
        <label className="text-xs text-muted">
          End date
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
          />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Scheduler notes
        <input
          type="text"
          value={form.schedulerNotes}
          onChange={(e) => setForm({ ...form, schedulerNotes: e.target.value })}
          className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>
      <label className="block text-xs text-muted">
        Availability notes
        <input
          type="text"
          value={form.availabilityNotes}
          onChange={(e) => setForm({ ...form, availabilityNotes: e.target.value })}
          className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>
      <label className="block text-xs text-muted">
        Rationale
        <input
          type="text"
          value={form.rationale}
          onChange={(e) => setForm({ ...form, rationale: e.target.value })}
          className="mt-1 w-full rounded-lg border border-ivory-border bg-surface px-2 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={runSave}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          Save Membership
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20">
          Cancel
        </button>
      </div>
    </div>
  );
}

// "Jessicah currently works at Watermere" — separate from the global
// canonical profile. See
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
export function CommunityMembershipsSection({
  workforceMemberId,
  memberships,
  communities,
  canManage,
}: {
  workforceMemberId: string;
  memberships: WorkforceCommunityMembership[];
  communities: Community[];
  canManage: boolean;
}) {
  const [editingCommunityId, setEditingCommunityId] = useState<string | null>(null);
  const [addingCommunityId, setAddingCommunityId] = useState("");

  const membershipByCommunity = new Map(memberships.map((m) => [m.community_id, m]));
  const unassignedCommunities = communities.filter((c) => !membershipByCommunity.has(c.id));

  return (
    <div className="space-y-3">
      {memberships.length === 0 && <p className="font-sans text-sm text-muted">No community memberships yet.</p>}
      {memberships.map((m) => {
        const community = communities.find((c) => c.id === m.community_id);
        return (
          <div key={m.id} className="rounded-lg border border-ivory-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-sans text-sm font-medium text-body">{community?.name ?? m.community_id}</p>
                <p className="font-sans text-xs text-muted">
                  {m.role_type ?? "No role set"}
                  {m.is_primary_community ? " · Primary Community" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${STATUS_STYLES[m.membership_status]}`}>
                  {STATUS_LABELS[m.membership_status]}
                </span>
                {canManage && editingCommunityId !== m.community_id && (
                  <button
                    type="button"
                    onClick={() => setEditingCommunityId(m.community_id)}
                    className="rounded-lg border border-ivory-border px-3 py-1 font-sans text-xs font-medium text-muted hover:border-navy/20"
                  >
                    Edit Membership
                  </button>
                )}
              </div>
            </div>
            {editingCommunityId === m.community_id && (
              <MembershipEditor
                workforceMemberId={workforceMemberId}
                communityId={m.community_id}
                initial={m}
                onDone={() => setEditingCommunityId(null)}
              />
            )}
          </div>
        );
      })}

      {canManage && unassignedCommunities.length > 0 && (
        <div className="rounded-lg border border-dashed border-ivory-border p-3">
          {addingCommunityId ? (
            <MembershipEditor
              workforceMemberId={workforceMemberId}
              communityId={addingCommunityId}
              onDone={() => setAddingCommunityId("")}
            />
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={addingCommunityId}
                onChange={(e) => setAddingCommunityId(e.target.value)}
                className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
              >
                <option value="">Add a community…</option>
                {unassignedCommunities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
