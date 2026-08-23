"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createRelationship } from "@/lib/actions/relationships";

interface AddToProspectPipelineMenuItemProps {
  residentId: string;
  residentName: string;
  communityName: string | null;
  contactName: string;
  contactRelationship: string;
  contactPhone: string;
  contactEmail: string;
  className?: string;
  onDone?: () => void;
}

// The exact createRelationship() call StartRelationshipCard's "Start
// Relationship" button used to make (same relationshipType/stage/
// sourceType/defaults), relocated into a one-click More-menu item per the
// action-hierarchy correction — this is CRM prospect-pipeline tracking,
// not "the relationship" itself (see the investigation this correction
// followed). The optional owner/first-action fields that button's inline
// form also offered are not reproduced here (a popover menu item isn't
// the place for a multi-field form); create_relationship() already treats
// both as optional, so omitting them changes nothing about the record
// that gets created beyond those two fields being blank, exactly as
// leaving them blank in the old form already did.
export function AddToProspectPipelineMenuItem({
  residentId,
  residentName,
  communityName,
  contactName,
  contactRelationship,
  contactPhone,
  contactEmail,
  className,
  onDone,
}: AddToProspectPipelineMenuItemProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createRelationship({
        relationshipType: "resident_prospect",
        stage: "new_inquiry",
        displayName: `${residentName} — Prospect`,
        residentId,
        communityName: communityName ?? undefined,
        primaryContactName: contactName,
        primaryContactRelationship: contactRelationship,
        primaryContactPhone: contactPhone,
        primaryContactEmail: contactEmail,
        ownerLabel: "",
        priority: "normal",
        sourceType: "resident_page",
        firstActionTitle: "",
        firstActionType: "follow_up",
        firstActionDueAt: "",
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={isPending} className={className}>
        <UserPlus size={17} strokeWidth={1.75} />
        {isPending ? "Adding…" : "Add to Prospect Pipeline"}
      </button>
      {error && <p className="px-4 pb-2 font-sans text-xs text-danger-text">{error}</p>}
    </div>
  );
}
