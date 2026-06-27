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

function LeftPanel() {
  return (
    <div className="flex h-full flex-col justify-between gap-8 lg:pr-4">
      <div>
        <Logo width={108} />
        <h1 className="mt-8 font-serif text-4xl font-light leading-tight text-white lg:text-[2.5rem]">
          Tell Us How We Can Serve You
        </h1>
        <p className="mt-4 max-w-sm font-sans text-sm leading-relaxed text-white/72">
          We&rsquo;ll learn a little about your situation so we can connect you
          with the right care.
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
}: {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
  completed: boolean;
  saving: boolean;
  onContinue: () => void;
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
    <section className="rounded-xl border border-gold/30 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark">
            Contact
          </p>
          <h2 className="mt-1 font-serif text-2xl font-light text-navy">
            Where should we reach you?
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

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="First Name" error={errors.firstName}>
          <FormInput
            type="text"
            placeholder="Jane"
            value={data.firstName}
            onChange={(event) => onChange({ firstName: event.target.value })}
            hasError={!!errors.firstName}
          />
        </FormField>
        <FormField label="Last Name" error={errors.lastName}>
          <FormInput
            type="text"
            placeholder="Smith"
            value={data.lastName}
            onChange={(event) => onChange({ lastName: event.target.value })}
            hasError={!!errors.lastName}
          />
        </FormField>
        <FormField label="Phone" error={errors.phone}>
          <FormInput
            type="tel"
            placeholder="(214) 555-0000"
            value={data.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            hasError={!!errors.phone}
          />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <FormInput
            type="email"
            placeholder="jane@example.com"
            value={data.email}
            onChange={(event) => onChange({ email: event.target.value })}
            hasError={!!errors.email}
          />
        </FormField>
        <div className="sm:max-w-[12rem]">
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

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          disabled={saving}
          className="rounded-lg bg-gold px-5 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </section>
  );
}

export function ServeIntakeFlow() {
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

  if (submitted) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-0">
        <div className="rounded-2xl bg-navy p-7 lg:col-span-2 lg:rounded-none lg:rounded-l-2xl lg:p-8">
          <LeftPanel />
        </div>
        <div className="lg:col-span-3">
          <div className="h-full rounded-2xl bg-white p-7 shadow-card lg:rounded-none lg:rounded-r-2xl lg:p-8">
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-0">
      <div className="rounded-2xl bg-navy p-7 lg:col-span-2 lg:rounded-none lg:rounded-l-2xl lg:p-8">
        <LeftPanel />
      </div>

      <div className="lg:col-span-3">
        <div className="h-full rounded-2xl bg-white p-5 shadow-card sm:p-7 lg:rounded-none lg:rounded-r-2xl lg:p-8">
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
        </div>
      </div>
    </div>
  );
}
