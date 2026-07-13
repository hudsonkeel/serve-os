import Link from "next/link";
import {
  Building2,
  Fingerprint,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  Users,
} from "lucide-react";
import { PageContainer } from "@/components/PageContainer";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { buildCurrentUserDisplay } from "@/lib/auth/display";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import {
  buildIntegrationDefinitions,
  INTEGRATION_STATUS_LABELS,
  type IntegrationStatus,
} from "./integrations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_TONE: Record<IntegrationStatus, BadgeTone> = {
  connected: "success",
  external_launch: "blue",
  planned: "gold",
  not_connected: "neutral",
};

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold-subtle">
          <Icon size={18} strokeWidth={1.5} className="text-gold-dark" />
        </div>
        <div>
          <h2 className="font-sans text-card-title font-semibold text-body">{title}</h2>
          <p className="mt-1 font-sans text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
        {label}
      </p>
      <p className="mt-0.5 font-sans text-base text-body">{value}</p>
    </div>
  );
}

function FutureCapabilities({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-dashed border-ivory-border bg-ivory p-4">
      <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Future capabilities
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="font-sans text-sm text-muted">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SettingsPage() {
  const [profile, community] = await Promise.all([
    getCurrentAuthorizedUser(),
    getCommunityMetrics(),
  ]);
  const currentUser = buildCurrentUserDisplay(profile);

  // Users & Roles, Organization & Communities, Workflow Configuration,
  // Integrations, and Governance & Audit are management-tier sections.
  // "Operations" is the frontline role — everything else in AUTH_ROLES
  // (admin, manager, executive) sees them. My Account is visible to everyone.
  const canViewManagement = profile?.role !== "operations" && profile?.role !== undefined;

  // Presence-only check — the key itself is never read into a client
  // response or rendered anywhere.
  const resendConnected = Boolean(process.env.RESEND_API_KEY);
  const integrations = buildIntegrationDefinitions({ resendConnected });

  return (
    <PageContainer title="Settings">
      <div className="mb-8">
        <h1 className="font-serif text-page-title font-light leading-tight text-body">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl font-sans text-base leading-relaxed text-body">
          Configure your account, organization, workflows, integrations, and governance.
        </p>
      </div>

      <div className="space-y-6">
        <SettingsSection
          icon={UserCircle}
          title="My Account"
          description="Your Serve OS identity and account security."
        >
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Field label="Name" value={currentUser.fullName} />
            <Field label="Email" value={currentUser.email} />
            <Field label="Role" value={currentUser.roleLabel} />
            <Field label="Timezone" value="Central Time (America/Chicago)" />
          </div>
          <div className="mt-5 border-t border-ivory-border pt-5">
            <Link
              href="/forgot-password"
              className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-5 font-sans text-button font-semibold text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
            >
              Reset Password
            </Link>
            <p className="mt-2 font-sans text-sm text-muted">
              Sends a secure reset link to {currentUser.email} using the existing password
              reset flow.
            </p>
          </div>
        </SettingsSection>

        {canViewManagement && (
          <>
            <SettingsSection
              icon={Users}
              title="Users & Roles"
              description="Manage who has access to Serve OS and what they can do."
            >
              <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
                <p className="font-sans text-sm font-medium text-body">
                  Administration setup pending
                </p>
                <p className="mt-1 font-sans text-sm text-muted">
                  User invitations and role management are not yet available from Serve OS.
                  Access is currently provisioned directly in Supabase.
                </p>
              </div>
              <div className="mt-4">
                <FutureCapabilities
                  items={[
                    "Invite user",
                    "Deactivate user",
                    "Assign role",
                    "Community access",
                    "Require password reset",
                    "Audit permission changes",
                    "Role-based session timeout",
                  ]}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              icon={Building2}
              title="Organization & Communities"
              description="Current organization and community context."
            >
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
                <Field label="Organization" value="Serve Caregiving" />
                <Field label="Community" value={community.communityName} />
                <Field label="Active Communities" value="1" />
                <Field label="Operational Timezone" value="Central Time (America/Chicago)" />
              </div>
              <div className="mt-4">
                <FutureCapabilities
                  items={[
                    "Organization identity",
                    "Community records",
                    "Operating hours",
                    "Service areas",
                    "Contact details",
                    "Branding",
                    "Community-specific rules",
                  ]}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              icon={SlidersHorizontal}
              title="Workflow Configuration"
              description="Rules that govern wellness, assessments, and escalation. Configuration coming later."
            >
              <FutureCapabilities
                items={[
                  "Wellness follow-up rules",
                  "Assessment intervals",
                  "Care-plan review intervals",
                  "Priority definitions",
                  "Escalation thresholds",
                  "Prospect statuses",
                  "Notification recipients",
                  "Communication requirements",
                ]}
              />
            </SettingsSection>

            <SettingsSection
              icon={Plug}
              title="Integrations"
              description="Every external system Serve OS connects to or launches — its role, what's actually connected today, and what's planned."
            >
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-sans text-base font-semibold text-body">
                          {integration.name}
                          {integration.expandedName && (
                            <span className="font-normal text-muted"> ({integration.expandedName})</span>
                          )}
                        </p>
                        <p className="mt-0.5 font-sans text-sm text-muted">
                          {integration.description}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[integration.status]}>
                        {INTEGRATION_STATUS_LABELS[integration.status]}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2.5 border-t border-ivory-border/70 pt-3 sm:grid-cols-2">
                      <Field label="Role" value={integration.role} />
                      <Field label="Source of truth" value={integration.sourceOfTruth} />
                      {integration.currentScope && integration.currentScope.length > 0 && (
                        <Field label="Current" value={integration.currentScope.join(" · ")} />
                      )}
                      {integration.futureScope && integration.futureScope.length > 0 && (
                        <Field label="Future" value={integration.futureScope.join(" · ")} />
                      )}
                      {integration.dataDirection && (
                        <Field label="Data direction" value={integration.dataDirection} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSection>

            <SettingsSection
              icon={ShieldCheck}
              title="Governance & Audit"
              description="Audit-readiness and change history across Serve OS."
            >
              <FutureCapabilities
                items={[
                  "Audit log",
                  "User access events",
                  "Rule changes",
                  "Integration sync history",
                  "Import history",
                  "Overridden recommendations",
                  "Policy and ruleset versions",
                ]}
              />
            </SettingsSection>
          </>
        )}

        {!canViewManagement && (
          <div className="rounded-xl border border-ivory-border bg-ivory p-6 text-center">
            <Fingerprint size={20} strokeWidth={1.5} className="mx-auto mb-2 text-subtle" />
            <p className="font-sans text-sm text-muted">
              Organization, workflow, integration, and governance settings are visible to
              managers and above.
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
