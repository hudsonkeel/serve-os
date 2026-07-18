"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Paperclip, X } from "lucide-react";
import { uploadRecruitingResume } from "@/lib/actions/recruiting";
import {
  recordConversationEvent,
  startConversationSession,
  submitCanonicalIntake,
} from "@/lib/actions/conversationTelemetry";
import type { RecruitingLeadRole } from "@/lib/supabase/types";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from "@/components/intake/FormField";

// ─── Role metadata ──────────────────────────────────────────────────────────

const ROLE_META: Record<
  RecruitingLeadRole,
  { label: string; tagline: string; description: string; cta: string }
> = {
  caregiver: {
    label: "Caregiver",
    tagline: "Care that feels personal.",
    description:
      "Full-time and part-time roles supporting residents inside senior living communities.",
    cta: "Apply Here",
  },
  managing_director: {
    label: "Managing Director",
    tagline: "Lead your market.",
    description:
      "Lead partnerships, caregiver teams, operations, and growth across a Serve market.",
    cta: "Express Interest",
  },
};

// ─── Step 1: Role selection ─────────────────────────────────────────────────

function RoleSelectStep({
  onSelect,
}: {
  onSelect: (role: RecruitingLeadRole) => void;
}) {
  const roles: RecruitingLeadRole[] = ["caregiver", "managing_director"];

  return (
    <div className="space-y-3 pb-6">
      <div>
        <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
          Select a Role
        </p>
        <h2 className="mt-1 font-serif text-2xl font-light text-navy">
          Where do you belong?
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {roles.map((role) => {
          const meta = ROLE_META[role];
          return (
            <div
              key={role}
              className="flex flex-col justify-between rounded-xl border border-ivory-border bg-ivory/40 p-3.5"
            >
              <div>
                <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
                  {meta.label}
                </p>
                <h3 className="mt-1.5 font-serif text-lg font-light leading-tight text-navy">
                  {meta.tagline}
                </h3>
                <p className="mt-1.5 font-sans text-xs leading-relaxed text-body">
                  {meta.description}
                </p>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => onSelect(role)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-navy/90"
                >
                  {meta.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Resume upload helpers ──────────────────────────────────────────────────

const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateResumeFile(file: File): string | null {
  if (file.size > MAX_RESUME_BYTES) return "File size must be under 5 MB.";
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_RESUME_EXTENSIONS.includes(ext)) {
    return "Please upload a PDF, DOC, or DOCX file.";
  }
  return null;
}

// ─── Resume upload control ──────────────────────────────────────────────────

function ResumeUpload({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputId = "resume-upload";

  if (file) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-ivory-border bg-ivory/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-gold-dark" />
          <div className="min-w-0">
            <p className="truncate font-sans text-sm text-body">{file.name}</p>
            <p className="font-sans text-xs text-muted">{formatBytes(file.size)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-3 shrink-0 rounded p-1 text-muted transition-colors hover:bg-ivory-warm hover:text-body"
          aria-label="Remove resume"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ivory-border bg-ivory/40 px-3 py-3 transition-colors hover:border-gold/40 hover:bg-ivory/70"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="font-sans text-sm text-muted">
        Attach resume <span className="text-xs">(PDF, DOC, DOCX — optional, max 5 MB)</span>
      </span>
      <input
        id={inputId}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          onChange(picked);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// ─── Step 2: Lead form ──────────────────────────────────────────────────────

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  // Caregiver fields
  zipCode: string;
  availability: string;
  experienceLevel: string;
  // Managing Director fields
  cityState: string;
  linkedinUrl: string;
  explorationTimeline: string;
  resumeFile: File | null;
  message: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  contact?: string;
  resumeFile?: string;
}

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  zipCode: "",
  availability: "",
  experienceLevel: "",
  cityState: "",
  linkedinUrl: "",
  explorationTimeline: "",
  resumeFile: null,
  message: "",
};

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.firstName.trim()) errors.firstName = "First name is required.";
  if (!form.lastName.trim()) errors.lastName = "Last name is required.";
  const hasPhone = form.phone.replace(/\D/g, "").length >= 10;
  const hasEmail = /\S+@\S+\.\S+/.test(form.email.trim());
  if (!hasPhone && !hasEmail) {
    errors.contact = "Please provide a phone number or email address.";
  }
  return errors;
}

function LeadFormStep({
  role,
  conversationSessionId,
  sessionKey,
  onSuccess,
  onBack,
}: {
  role: RecruitingLeadRole;
  conversationSessionId: string | null;
  sessionKey: string;
  onSuccess: (firstName: string) => void;
  onBack: () => void;
}) {
  const meta = ROLE_META[role];
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSubmitError(null);
    setErrors((prev) => {
      const next = { ...prev };
      if (patch.firstName !== undefined) delete next.firstName;
      if (patch.lastName !== undefined) delete next.lastName;
      if (patch.phone !== undefined || patch.email !== undefined)
        delete next.contact;
      return next;
    });
  };

  const handleSubmit = () => {
    const validation = validateForm(form);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    startTransition(async () => {
      let resumeFilename: string | undefined;

      if (form.resumeFile) {
        const fd = new FormData();
        fd.append("resume", form.resumeFile);
        const upload = await uploadRecruitingResume(fd);
        if (upload.error) {
          setSubmitError(upload.error);
          return;
        }
        resumeFilename = upload.filename;
      }

      const contactName = `${form.firstName} ${form.lastName}`.trim() || null;

      // Raw form_payload keys match lib/intake/envelope.ts's existing
      // employment-context reads exactly (role_interest, linkedin,
      // city-state, resume.filename, leadership-interest) — the same shape
      // the website's employment forms already produce.
      const result = await submitCanonicalIntake(
        {
          source: role === "caregiver" ? "serve_os_get_started_caregiver" : "serve_os_get_started_managing_director",
          intakeType: "employment_interest",
          contactName,
          contactPhone: form.phone || null,
          contactEmail: form.email || null,
          zip: form.zipCode || null,
          formPayload: {
            "form-name": "get-started-careers",
            "full-name": contactName,
            role_interest: role,
            linkedin: form.linkedinUrl || null,
            "city-state": form.cityState || null,
            resume: resumeFilename ? { filename: resumeFilename } : null,
            availability: form.availability || null,
            experience_level: form.experienceLevel || null,
            exploration_timeline: form.explorationTimeline || null,
            message: form.message || null,
          },
          sourceSubmissionId: sessionKey,
        },
        conversationSessionId
      );

      if (result.error) {
        setSubmitError(result.error);
        return;
      }

      onSuccess(form.firstName.trim());
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 font-sans text-xs text-muted transition-colors hover:text-body"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to roles
        </button>
        <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
          {meta.label}
        </p>
        <h2 className="mt-1 font-serif text-2xl font-light text-navy">
          Tell us about yourself.
        </h2>
      </div>

      {/* Required fields — shared by both roles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="First Name" error={errors.firstName}>
          <FormInput
            type="text"
            placeholder="Jane"
            value={form.firstName}
            onChange={(e) => update({ firstName: e.target.value })}
            hasError={!!errors.firstName}
          />
        </FormField>
        <FormField label="Last Name" error={errors.lastName}>
          <FormInput
            type="text"
            placeholder="Smith"
            value={form.lastName}
            onChange={(e) => update({ lastName: e.target.value })}
            hasError={!!errors.lastName}
          />
        </FormField>
        <FormField label="Phone" error={errors.contact}>
          <FormInput
            type="tel"
            placeholder="(214) 555-0000"
            value={form.phone}
            onChange={(e) => update({ phone: e.target.value })}
            hasError={!!errors.contact}
          />
        </FormField>
        <FormField label="Email">
          <FormInput
            type="email"
            placeholder="jane@example.com"
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
          />
        </FormField>
      </div>

      {/* Role-specific optional fields */}
      {role === "caregiver" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="ZIP Code">
            <FormInput
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="75001"
              value={form.zipCode}
              onChange={(e) =>
                update({ zipCode: e.target.value.replace(/\D/g, "") })
              }
            />
          </FormField>
          <FormField label="Availability">
            <FormSelect
              value={form.availability}
              onChange={(e) => update({ availability: e.target.value })}
              placeholder="Select..."
              options={[
                { value: "full_time", label: "Full-time" },
                { value: "part_time", label: "Part-time" },
                { value: "weekends_prn", label: "Weekends / PRN" },
                { value: "flexible", label: "Flexible" },
              ]}
            />
          </FormField>
          <FormField label="Experience">
            <FormSelect
              value={form.experienceLevel}
              onChange={(e) => update({ experienceLevel: e.target.value })}
              placeholder="Select..."
              options={[
                { value: "less_than_1", label: "Less than 1 year" },
                { value: "1_to_3", label: "1–3 years" },
                { value: "3_to_5", label: "3–5 years" },
                { value: "5_plus", label: "5+ years" },
              ]}
            />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <FormField label="City / State">
            <FormInput
              type="text"
              placeholder="Dallas, TX"
              value={form.cityState}
              onChange={(e) => update({ cityState: e.target.value })}
            />
          </FormField>

          <FormField label="When could you realistically begin exploring a Serve market opportunity?">
            <FormSelect
              value={form.explorationTimeline}
              onChange={(e) => update({ explorationTimeline: e.target.value })}
              placeholder="Select..."
              options={[
                { value: "immediately",        label: "Immediately" },
                { value: "within_30_days",     label: "Within 30 days" },
                { value: "1_to_3_months",      label: "1–3 months" },
                { value: "3_to_6_months",      label: "3–6 months" },
                { value: "future_exploratory", label: "Future / exploratory only" },
              ]}
            />
          </FormField>

          <FormField label="LinkedIn Profile">
            <FormInput
              type="url"
              placeholder="https://linkedin.com/in/..."
              value={form.linkedinUrl}
              onChange={(e) => update({ linkedinUrl: e.target.value })}
            />
          </FormField>

          <FormField label="Resume" error={errors.resumeFile}>
            <ResumeUpload
              file={form.resumeFile}
              onChange={(file) => {
                if (file) {
                  const err = validateResumeFile(file);
                  if (err) {
                    setErrors((prev) => ({ ...prev, resumeFile: err }));
                    return;
                  }
                  setErrors((prev) => { const next = { ...prev }; delete next.resumeFile; return next; });
                }
                update({ resumeFile: file });
              }}
            />
          </FormField>

          <FormField label="Tell us about your background">
            <FormTextarea
              placeholder="Share your leadership experience, what draws you to Serve, and which market you're interested in."
              value={form.message}
              onChange={(e) => update({ message: e.target.value })}
              rows={3}
            />
          </FormField>
        </div>
      )}

      {submitError && (
        <p className="font-sans text-sm text-red-500">{submitError}</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Submit"}
          {!isPending && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Confirmation ───────────────────────────────────────────────────

function ConfirmationStep({
  role,
  firstName,
  conversationSessionId,
  onStartOver,
}: {
  role: RecruitingLeadRole;
  firstName: string;
  conversationSessionId: string | null;
  onStartOver: () => void;
}) {
  const meta = ROLE_META[role];
  // Apploi redirect is only available for the caregiver role.
  // Managing Director uses "Express Interest" only — no external redirect.
  const apploiUrl =
    role === "caregiver"
      ? (process.env.NEXT_PUBLIC_APPLOI_CAREGIVER_URL ?? "")
      : "";

  // Recorded as conversation telemetry rather than a recruiting_leads
  // update (Scope J): the submission is now processed asynchronously by
  // the Serve Intake Intelligence Engine, so no recruiting_leads.id is
  // available synchronously at confirmation time to attach this to.
  const handleApploiClick = () => {
    if (conversationSessionId) {
      void recordConversationEvent(conversationSessionId, "step_completed", { stepKey: "apploi_redirect" });
    }
  };

  const bodyText =
    role === "managing_director"
      ? "Thanks — someone from Serve will follow up with you about leadership opportunities."
      : `Your ${meta.label.toLowerCase()} inquiry has been received. Our team will be in touch soon.`;

  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10">
        <Check className="h-6 w-6 text-gold-dark" />
      </div>

      <h2 className="mt-6 font-serif text-2xl font-light text-navy">
        Thank you.
      </h2>
      <p className="mt-2 max-w-xs font-sans text-sm leading-relaxed text-body">
        {bodyText}
      </p>

      {apploiUrl ? (
        <div className="mt-8 w-full max-w-xs space-y-3">
          <p className="font-sans text-xs text-muted">
            Ready to submit your official application?
          </p>
          <a
            href={apploiUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleApploiClick}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-6 py-3 font-sans text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-navy/90"
          >
            Continue to Official Application
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onStartOver}
        className="mt-6 font-sans text-xs text-muted transition-colors hover:text-body"
      >
        Start over
      </button>
    </div>
  );
}

// ─── Root export ────────────────────────────────────────────────────────────

type Step = "role-select" | "form" | "confirmation";

export function RecruitingPanel() {
  const [step, setStep] = useState<Step>("role-select");
  const [role, setRole] = useState<RecruitingLeadRole | null>(null);
  const [leadFirstName, setLeadFirstName] = useState("");
  const [conversationSessionId, setConversationSessionId] = useState<string | null>(null);
  // useState, not useRef — this value is read during render (passed to
  // LeadFormStep as a prop), and refs must never be read outside effects
  // or event handlers.
  const [sessionKey] = useState<string>(() => crypto.randomUUID());

  // Conversation telemetry only (Scope J) — never creates a Recruiting
  // Lead by itself; started once per mount, independent of ServeIntakeFlow's
  // own "care" session (that one only starts for mode === "care").
  useEffect(() => {
    if (conversationSessionId) return;
    startConversationSession({
      sessionKey,
      experienceType: "website_wizard_careers",
      source: "serve_os_get_started_careers",
      channelVersion: "v1",
    }).then((session) => {
      if (session) setConversationSessionId(session.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRoleSelect = (selected: RecruitingLeadRole) => {
    setRole(selected);
    setStep("form");
    if (conversationSessionId) {
      void recordConversationEvent(conversationSessionId, "step_completed", { stepKey: "role-select" });
    }
  };

  const handleFormSuccess = (firstName: string) => {
    setLeadFirstName(firstName);
    setStep("confirmation");
  };

  const handleStartOver = () => {
    setStep("role-select");
    setRole(null);
    setLeadFirstName("");
  };

  if (step === "role-select") {
    return <RoleSelectStep onSelect={handleRoleSelect} />;
  }

  if (step === "form" && role) {
    return (
      <LeadFormStep
        role={role}
        conversationSessionId={conversationSessionId}
        sessionKey={sessionKey}
        onSuccess={handleFormSuccess}
        onBack={() => setStep("role-select")}
      />
    );
  }

  if (step === "confirmation" && role) {
    return (
      <ConfirmationStep
        role={role}
        firstName={leadFirstName}
        conversationSessionId={conversationSessionId}
        onStartOver={handleStartOver}
      />
    );
  }

  return null;
}
