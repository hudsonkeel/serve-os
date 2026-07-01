"use client";

import { useState, useTransition } from "react";
import { Check, Edit3, Phone } from "lucide-react";
import { saveProspectDraft } from "@/lib/actions/intake";
import { Logo } from "@/components/Logo";
import { Confirmation } from "./Confirmation";
import { FormField, FormInput } from "./FormField";
import {
  IntakeConversationStep,
  ProgressiveCareConversation,
} from "./ProgressiveCareConversation";
import {
  FormErrors,
  initialFormData,
  IntakeFormData,
  IntakeSaveMilestone,
} from "./types";
import { RecruitingPanel } from "./steps/RecruitingPanel";

const CONSENT_TEXT =
  "I agree to the Terms of Service/Privacy Policy and consent to Serve Caregiving contacting me by email, phone, or text about a free care consultation. Message frequency varies. Message and data rates may apply.";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type CompletedMilestones = Partial<Record<IntakeSaveMilestone, boolean>>;

function createInitialData(): IntakeFormData {
  return {
    ...initialFormData,
    path: "care",
  };
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function hasContactMethod(data: IntakeFormData) {
  return phoneDigits(data.phone).length >= 10 || isValidEmail(data.email);
}

function validateMilestone(
  milestone: IntakeSaveMilestone,
  data: IntakeFormData
): FormErrors {
  const errors: FormErrors = {};

  if (milestone === "contact_completed") {
    if (!data.firstName.trim()) errors.firstName = "First name is required.";
    if (!data.lastName.trim()) errors.lastName = "Last name is required.";
    if (!hasContactMethod(data))
      errors.phone = "Please enter a valid phone number or email address.";
    if (data.email.trim() && !isValidEmail(data.email))
      errors.email = "Please enter a valid email address.";
    if (!/^\d{5}$/.test(data.zipCode.trim()))
      errors.zipCode = "Please enter a valid 5-digit ZIP code.";
  }

  if (milestone === "relationship_completed" && !data.careFor) {
    errors.careFor = "Please select who the care is for.";
  }

  if (
    milestone === "relationship_completed" &&
    data.careFor &&
    data.careFor !== "myself"
  ) {
    if (!data.careRecipientFirstName.trim()) {
      errors.careRecipientFirstName = "First name is required.";
    }
    if (!data.careRecipientLastName.trim()) {
      errors.careRecipientLastName = "Last name is required.";
    }
  }

  if (milestone === "support_completed" && !data.supportType) {
    errors.supportType = "Please select a type of support.";
  }

  if (milestone === "timing_completed") {
    if (!data.startTiming) {
      errors.startTiming = "Please select when you hope to start.";
    }
  }

  if (milestone === "referral_completed" && !data.referralSource) {
    errors.referralSource = "Please let us know how you heard about us.";
  }

  if (milestone === "intake_completed") {
    const milestones: IntakeSaveMilestone[] = [
      "contact_completed",
      "relationship_completed",
      "support_completed",
      "timing_completed",
      "referral_completed",
    ];

    for (const step of milestones) {
      Object.assign(errors, validateMilestone(step, data));
    }

    if (!data.consentGiven)
      errors.consentGiven = "Please agree to the terms to continue.";
  }

  return errors;
}

const LEFT_PANEL_CONTENT = {
  care: {
    headline: "Tell Us How We Can Serve You",
    subtext:
      "We'll learn a little about your situation so we can connect you with the right care.",
  },
  careers: {
    headline: "Build a Career Worth Having",
    subtext:
      "Tell us about yourself and we'll connect you with the right opportunity.",
  },
} as const;

function LeftPanel({ mode }: { mode: "care" | "careers" }) {
  const { headline, subtext } = LEFT_PANEL_CONTENT[mode];
  return (
    <div className="flex h-full flex-col justify-between gap-8 lg:pr-4">
      <div>
        <div className="mb-8">
          <Logo width={108} />
        </div>
        <h1 className="font-serif text-4xl font-light leading-tight text-white lg:text-[2.5rem]">
          {headline}
        </h1>
        <p className="mt-4 max-w-sm font-sans text-sm leading-relaxed text-white/72">
          {subtext}
        </p>
      </div>

      <div className="border-t border-white/10 pt-6">
        <p className="font-sans text-xs text-white/45">
          Prefer to speak with someone?
        </p>
        <a
          href="tel:+12148318384"
          className="mt-2 inline-flex items-center gap-2 font-sans text-sm font-medium text-gold/90 transition-colors hover:text-gold"
        >
          <Phone className="h-3.5 w-3.5" />
          Call Serve Caregiving
        </a>
        <a
          href="tel:+12148318384"
          className="mt-1 block font-sans text-sm text-white/70 transition-colors hover:text-white"
        >
          (214) 831-8384
        </a>
      </div>
    </div>
  );
}

function SaveStatusLine({ saveStatus }: { saveStatus: SaveStatus }) {
  const statusText: Record<SaveStatus, string> = {
    idle: "",
    saving: "Saving...",
    saved: "",
    error: "We could not save just now",
  };

  if (saveStatus === "idle" || saveStatus === "saved") {
    return null;
  }

  return (
    <p
      className={`mb-5 text-right font-sans text-xs ${
        saveStatus === "error" ? "text-red-500" : "text-muted"
      }`}
      aria-live="polite"
    >
      {statusText[saveStatus]}
    </p>
  );
}

function ContactSection({
  data,
  onChange,
  errors,
  completed,
  saving,
  onContinue,
  isEmbed = false,
}: {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
  completed: boolean;
  saving: boolean;
  onContinue: () => void;
  isEmbed?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const showFields = editing || !completed;

  if (!showFields) {
    const contact = data.phone || data.email;

    return (
      <div className="flex gap-3 rounded-lg bg-ivory px-4 py-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-subtle text-gold-dark">
          <Check className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm leading-relaxed text-body">
            Thanks, {data.firstName}. We&rsquo;ll reach out at{" "}
            <span className="font-medium text-navy">{contact}</span>.
          </p>
          <p className="mt-1 font-sans text-xs text-muted">
            Serving ZIP code {data.zipCode}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ivory-border bg-white text-muted transition-colors hover:border-gold/50 hover:text-navy"
          aria-label="Edit contact details"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <section
      className={`rounded-xl border border-gold/30 bg-white shadow-card ${
        isEmbed ? "p-3.5" : "p-5"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
            Contact
          </p>
          <h2
            className={`mt-1 font-serif font-light text-navy ${
              isEmbed ? "text-xl" : "text-2xl"
            }`}
          >
            How can we reach you?
          </h2>
        </div>
        {completed && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-subtle text-gold-dark"
            aria-label="Done editing contact details"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className={`grid grid-cols-1 ${
          isEmbed ? "sm:grid-cols-6" : "sm:grid-cols-2"
        } ${
          isEmbed ? "mt-3 gap-2.5" : "mt-5 gap-3"
        }`}
      >
        <div className={isEmbed ? "sm:col-span-2" : ""}>
          <FormField label="First Name" error={errors.firstName}>
            <FormInput
              type="text"
              placeholder="Jane"
              value={data.firstName}
              onChange={(event) => onChange({ firstName: event.target.value })}
              hasError={!!errors.firstName}
            />
          </FormField>
        </div>
        <div className={isEmbed ? "sm:col-span-2" : ""}>
          <FormField label="Last Name" error={errors.lastName}>
            <FormInput
              type="text"
              placeholder="Smith"
              value={data.lastName}
              onChange={(event) => onChange({ lastName: event.target.value })}
              hasError={!!errors.lastName}
            />
          </FormField>
        </div>
        <div className={isEmbed ? "sm:col-span-2" : ""}>
          <FormField label="Phone" error={errors.phone}>
            <FormInput
              type="tel"
              placeholder="(214) 555-0000"
              value={data.phone}
              onChange={(event) => onChange({ phone: event.target.value })}
              hasError={!!errors.phone}
            />
          </FormField>
        </div>
        <div className={isEmbed ? "sm:col-span-3" : ""}>
          <FormField label="Email" error={errors.email}>
            <FormInput
              type="email"
              placeholder="jane@example.com"
              value={data.email}
              onChange={(event) => onChange({ email: event.target.value })}
              hasError={!!errors.email}
            />
          </FormField>
        </div>
        <div className={isEmbed ? "sm:col-span-2" : "sm:max-w-[12rem]"}>
          <FormField label="ZIP Code" error={errors.zipCode}>
            <FormInput
              type="text"
              inputMode="numeric"
              maxLength={5}
              placeholder="75001"
              value={data.zipCode}
              onChange={(event) =>
                onChange({ zipCode: event.target.value.replace(/\D/g, "") })
              }
              hasError={!!errors.zipCode}
            />
          </FormField>
        </div>
      </div>

      <div className={`${isEmbed ? "mt-3" : "mt-5"} flex justify-end`}>
        <button
          type="button"
          onClick={onContinue}
          disabled={saving}
          className={`rounded-lg bg-gold font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50 ${
            isEmbed ? "px-5 py-2" : "px-5 py-2.5"
          }`}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </section>
  );
}

function ServeHeart({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2.7 L3.5 10.3 L1 15.8 L1 32.6 L8.5 44 L32 62 L40 70.1 L47 81.5 L49.5 89.1 L50 98.9 L52.5 99.5 L72.5 79.3 L92.5 51.6 L99.5 32.1 L99.5 21.7 L97 13.6 L88.5 3.3 L81.5 0 L72.5 0 L65.5 3.3 L57 13.6 L53 24.5 L47 10.9 L37.5 2.7 L29.5 0 L20 0 Z" />
    </svg>
  );
}

function ServePersonMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="50" cy="27" r="21" />
      <path d="M4 96C4 63 20 54 50 54 80 54 96 63 96 96Z" />
    </svg>
  );
}

function RelationshipSelector({
  mode,
  onSelect,
  isEmbed = false,
}: {
  mode: "care" | "careers";
  onSelect: (newMode: "care" | "careers") => void;
  isEmbed?: boolean;
}) {
  const tiles: {
    key: "care" | "careers";
    mark: typeof ServeHeart;
    title: string;
    subtitle: string;
    nextStep: string;
  }[] = [
    {
      key: "care",
      mark: ServeHeart,
      title: "I need care",
      subtitle: "For myself or someone I love",
      nextStep: "A Care Advisor will reach out to learn about your situation.",
    },
    {
      key: "careers",
      mark: ServePersonMark,
      title: "Join Our Team",
      subtitle: "As a caregiver or managing director",
      nextStep: "Our team will follow up about the right opportunity for you.",
    },
  ];

  return (
    <div className={isEmbed ? "mb-3 md:mb-2" : "mb-8"}>
      <div className={`${isEmbed ? "mb-3" : "mb-6"} text-center`}>
        <h2
          className={`font-serif font-light text-navy ${
            isEmbed ? "text-2xl" : "text-3xl"
          }`}
        >
          How can we help you today?
        </h2>
        <div className="mx-auto mt-3 h-px w-9 bg-gold/50" />
      </div>

      <div className={`grid grid-cols-2 ${isEmbed ? "gap-3" : "gap-4"}`}>
        {tiles.map(({ key, mark: Mark, title, subtitle, nextStep }) => {
          const isActive = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`group flex flex-col items-center border text-center transition-all duration-200 ${
                isActive
                  ? "border-gold/20 bg-white shadow-card"
                  : "border-transparent bg-ivory/40 shadow-sm hover:-translate-y-0.5 hover:border-gold/20 hover:bg-white hover:shadow-card"
              } ${
                isEmbed
                  ? "rounded-xl px-4 pb-5 pt-5"
                  : "rounded-2xl px-6 pb-10 pt-12"
              }`}
            >
              <Mark
                className={`transition-colors duration-200 ${
                  isActive
                    ? "text-[#C8A15A]"
                    : "text-[#C8A15A]/35 group-hover:text-[#C8A15A]/60"
                } ${isEmbed ? "h-12 w-12" : "h-20 w-20"}`}
              />
              <p
                className={`font-serif font-light leading-snug text-navy ${
                  isEmbed ? "mt-3 text-xl" : "mt-8 text-2xl"
                }`}
              >
                {title}
              </p>
              <p
                className={`mt-2 font-sans leading-relaxed text-body ${
                  isEmbed ? "text-[11px]" : "text-xs"
                }`}
              >
                {subtitle}
              </p>
              <p
                className={`font-sans leading-relaxed text-muted ${
                  isEmbed ? "mt-2" : "mt-3"
                } ${isEmbed ? "text-[11px]" : "text-xs"}`}
              >
                {nextStep}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ServeIntakeFlow({
  initialMode = "care",
  isEmbed = false,
}: {
  initialMode?: "care" | "careers";
  isEmbed?: boolean;
}) {
  const [mode, setMode] = useState<"care" | "careers">(initialMode);
  const [formData, setFormData] = useState<IntakeFormData>(createInitialData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [completed, setCompleted] = useState<CompletedMilestones>({});
  const [activeStep, setActiveStep] =
    useState<IntakeConversationStep>("relationship");
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [savingMilestone, setSavingMilestone] =
    useState<IntakeSaveMilestone | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (updates: Partial<IntakeFormData>) => {
    setFormData((previous) => ({ ...previous, ...updates }));
    setSubmitError(null);
    const cleared = Object.fromEntries(Object.keys(updates).map((key) => [key, ""]));
    setErrors((previous) => ({ ...previous, ...cleared }));
  };

  const switchMode = (newMode: "care" | "careers") => {
    if (newMode === mode) return;
    setFormData(createInitialData());
    setErrors({});
    setSubmitted(false);
    setSubmitError(null);
    setSaveStatus("idle");
    setCompleted({});
    setActiveStep("relationship");
    setProspectId(null);
    setSavingMilestone(null);
    setMode(newMode);
  };

  const persistMilestone = (
    milestone: IntakeSaveMilestone,
    nextData: IntakeFormData = formData,
    nextStep?: IntakeConversationStep
  ) => {
    const nextErrors = validateMilestone(milestone, nextData);
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    setSaveStatus("saving");
    setSavingMilestone(milestone);
    setSubmitError(null);

    startTransition(async () => {
      const result = await saveProspectDraft(nextData, milestone, prospectId);
      setSavingMilestone(null);

      if (result.error) {
        setSubmitError(result.error);
        setSaveStatus("error");
        return;
      }

      if (result.id) {
        setProspectId(result.id);
      }

      setCompleted((previous) => ({ ...previous, [milestone]: true }));
      setSaveStatus("saved");

      if (nextStep) {
        setActiveStep(nextStep);
      }

      if (milestone === "intake_completed") {
        setSubmitted(true);
      }
    });
  };

  const advanceLocally = (
    updates: Partial<IntakeFormData>,
    nextStep: IntakeConversationStep
  ) => {
    update(updates);
    setActiveStep(nextStep);
  };

  const handleNotesContinue = () => {
    persistMilestone("timing_completed", formData, "referral");
  };

  const handleRecipientNameContinue = () => {
    persistMilestone("relationship_completed", formData, "support");
  };

  const handleReset = () => {
    setFormData(createInitialData());
    setErrors({});
    setSubmitted(false);
    setSubmitError(null);
    setSaveStatus("idle");
    setCompleted({});
    setActiveStep("relationship");
    setProspectId(null);
    setSavingMilestone(null);
  };

  const shellClass = isEmbed
    ? "serve-embed-card mx-auto grid grid-cols-1 items-stretch overflow-hidden rounded-[1.25rem] border border-white/20 bg-white shadow-[0_24px_80px_rgb(20_32_48_/_0.24)] md:grid-cols-5"
    : "grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-0";
  const leftPanelClass = isEmbed
    ? "serve-embed-left bg-navy p-6 sm:p-7 md:col-span-2 lg:p-8"
    : "rounded-2xl bg-navy p-7 lg:col-span-2 lg:rounded-none lg:rounded-l-2xl lg:p-8";
  const rightPanelClass = isEmbed
    ? "serve-embed-right flex min-w-0 md:col-span-3"
    : "min-w-0 lg:col-span-3";
  const contentClass = isEmbed
    ? "serve-embed-content flex min-h-full w-full flex-col bg-white p-5"
    : "h-full rounded-2xl bg-white p-5 shadow-card sm:p-7 lg:rounded-none lg:rounded-r-2xl lg:p-8";

  if (submitted) {
    return (
      <div className={shellClass}>
        <div className={leftPanelClass}>
          <LeftPanel mode={mode} />
        </div>
        <div className={rightPanelClass}>
          <div className={contentClass}>
            <Confirmation />
            <button
              type="button"
              onClick={handleReset}
              className="mt-8 font-sans text-xs text-muted transition-colors hover:text-body"
            >
              Start a new conversation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={leftPanelClass}>
        <LeftPanel mode={mode} />
      </div>

      <div className={rightPanelClass}>
        <div className={contentClass}>
          <RelationshipSelector
            mode={mode}
            onSelect={switchMode}
            isEmbed={isEmbed}
          />

          {mode === "careers" ? (
            <RecruitingPanel />
          ) : (
            <>
              <SaveStatusLine saveStatus={saveStatus} />

              <div className="space-y-3">
                <ContactSection
                  data={formData}
                  onChange={update}
                  errors={errors}
                  completed={Boolean(completed.contact_completed)}
                  saving={savingMilestone === "contact_completed"}
                  onContinue={() =>
                    persistMilestone("contact_completed", formData, "relationship")
                  }
                  isEmbed={isEmbed}
                />

                {completed.contact_completed && (
                  <ProgressiveCareConversation
                    data={formData}
                    onChange={update}
                    errors={errors}
                    completed={completed}
                    savingMilestone={savingMilestone}
                    activeStep={activeStep}
                    onSelect={(milestone, updates, nextStep) => {
                      const nextData = { ...formData, ...updates };
                      setFormData(nextData);
                      persistMilestone(milestone, nextData, nextStep);
                    }}
                    onLocalAdvance={advanceLocally}
                    onRecipientNameContinue={handleRecipientNameContinue}
                    onNotesContinue={handleNotesContinue}
                  />
                )}

                {activeStep === "submit" && (
                  <section className="rounded-xl border border-gold/30 bg-white p-5 shadow-card">
                    <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
                      Connect
                    </p>
                    <h2 className="mt-1 font-serif text-2xl font-light text-navy">
                      May we connect you with Serve?
                    </h2>

                    <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-ivory-border bg-ivory/60 p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
                        checked={formData.consentGiven}
                        onChange={(event) => update({ consentGiven: event.target.checked })}
                      />
                      <span className="font-sans text-xs leading-relaxed text-muted">
                        {CONSENT_TEXT}
                      </span>
                    </label>
                    {errors.consentGiven && (
                      <p className="mt-2 font-sans text-xs text-red-500">
                        {errors.consentGiven}
                      </p>
                    )}
                    {errors.careNeeds && (
                      <p className="mt-2 font-sans text-xs text-red-500">
                        {errors.careNeeds}
                      </p>
                    )}

                    {submitError && (
                      <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
                        {submitError}
                      </p>
                    )}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-sans text-sm text-muted">
                        We&rsquo;ll use this to make the first conversation more helpful.
                      </p>
                      <button
                        type="button"
                        onClick={() => persistMilestone("intake_completed")}
                        disabled={isPending}
                        className="rounded-lg bg-gold px-6 py-3 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending ? "Saving..." : "Connect With Serve"}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
