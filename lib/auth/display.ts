export interface CurrentUserDisplay {
  fullName: string;
  shortName: string;
  initials: string;
  roleLabel: string;
  email: string;
}

function titleCaseRole(role: string | null | undefined) {
  if (!role) return "User";
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNameParts(name: string) {
  return name.trim().split(/\s+/).filter(Boolean);
}

function initialsFromName(name: string) {
  const parts = getNameParts(name);
  const first = parts[0]?.charAt(0) ?? "";
  const last = (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.charAt(0) ?? "";
  return `${first}${last}`.toUpperCase() || "U";
}

function shortNameFromName(name: string) {
  return getNameParts(name)[0] || name;
}

export function buildCurrentUserDisplay(profile: {
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
} | null): CurrentUserDisplay {
  const email = profile?.email?.trim() || "Signed-in user";
  const fullName = profile?.full_name?.trim() || email;

  return {
    fullName,
    shortName: profile?.full_name ? shortNameFromName(fullName) : email,
    initials: profile?.full_name ? initialsFromName(fullName) : initialsFromName(email),
    roleLabel: titleCaseRole(profile?.role),
    email,
  };
}
