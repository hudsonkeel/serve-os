"use server";

import { cookies } from "next/headers";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { CURRENT_COMMUNITY_COOKIE, AUTH_COOKIE_OPTIONS } from "@/lib/auth/constants";
import { isValidCommunitySelection } from "@/lib/auth/communityScope";
import { listCommunities } from "@/lib/data/communities";

export interface SetCurrentCommunityResult {
  error?: string;
}

// The one write path for the current-community cookie. Validates the
// requested value against the caller's own resolved role/community
// before ever setting anything — the selector UI offering only valid
// choices is a convenience, not the actual boundary; this action is.
export async function setCurrentCommunityAction(
  requestedCommunityId: string
): Promise<SetCurrentCommunityResult> {
  const profile = await getCurrentAuthorizedUser();
  if (!profile) {
    return { error: "You must be signed in to change communities." };
  }

  const communities = await listCommunities();
  const activeCommunityIds = new Set(communities.map((c) => c.id));

  const valid = isValidCommunitySelection({
    requestedCommunityId,
    role: profile.role,
    activeCommunityIds,
  });

  if (!valid) {
    return { error: "That community isn't available to select." };
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_COMMUNITY_COOKIE, requestedCommunityId, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });

  return {};
}
