"use client";

import { useState, useTransition } from "react";
import {
  IntakeFormData,
  IntakePath,
  FormErrors,
  initialFormData,
} from "./types";
import { insertProspect } from "@/lib/actions/intake";
import { PathSelector } from "./steps/PathSelector";
import { ZipStep } from "./steps/care/ZipStep";
import { CareForStep } from "./steps/care/CareForStep";
import { TimingStep } from "./steps/care/TimingStep";
import { ReferralStep } from "./steps/care/ReferralStep";
import { ContactStep } from "./steps/care/ContactStep";
import { CareersScreen } from "./steps/CareersScreen";
import { ClientContactStep } from "./steps/client/ClientContactStep";
import { ClientCommunityStep } from "./steps/client/ClientCommunityStep";
import { Confirmation } from "./Confirmation";
import { StepNav } from "./StepNav";
import { Logo } from "@/components/Logo";

/* ─── Validation ─── */
function validate(
  step: number,
  path: IntakePath,
  data: IntakeFormData
): FormErrors {
  const e: FormErrors = {};

  if (step === 0) {
    if (!path) e.path = "Please select one of the options above.";
    return e;
  }

  if (path === "care") {
    if (step === 1) {
      if (!data.zipCode.trim()) e.zipCode = "ZIP code is required.";
      else if (!/^\d{5}$/.test(data.zipCode.trim()))
        e.zipCode = "Please enter a valid 5-digit ZIP code.";
    }
    if (step === 2) {
      if (!data.careFor) e.careFor = "Please select who the care is for.";
      if (data.careFor && data.careFor !== "myself") {
        if (!data.careRecipientFirst.trim())
          e.careRecipientFirst = "First name is required.";
        if (!data.careRecipientLast.trim())
          e.careRecipientLast = "Last name is required.";
      }
      if (!data.supportType) e.supportType = "Please select a type of support.";
    }
    if (step === 3) {
      if (!data.startTiming) e.startTiming = "Please select when you hope to start.";
    }
    if (step === 4) {
      if (!data.referralSource) e.referralSource = "Please let us know how you heard about us.";
      if (data.referralSource === "Other" && !data.referralOther.trim())
        e.referralOther = "Please provide more details.";
    }
    if (step === 5) {
      if (!data.firstName.trim()) e.firstName = "First name is required.";
      if (!data.lastName.trim()) e.lastName = "Last name is required.";
      if (!data.phone.trim()) e.phone = "Phone number is required.";
      if (!data.email.trim()) e.email = "Email address is required.";
      else if (!/\S+@\S+\.\S+/.test(data.email))
        e.email = "Please enter a valid email address.";
      if (!data.consentGiven) e.consentGiven = "Please agree to the terms to continue.";
    }
  }

  if (path === "existing_client") {
    if (step === 1) {
      if (!data.firstName.trim()) e.firstName = "First name is required.";
      if (!data.lastName.trim()) e.lastName = "Last name is required.";
      if (!data.phone.trim()) e.phone = "Phone number is required.";
      if (!data.email.trim()) e.email = "Email address is required.";
      else if (!/\S+@\S+\.\S+/.test(data.email))
        e.email = "Please enter a valid email address.";
    }
    if (step === 2) {
      if (!data.community) e.community = "Please select your community.";
      if (data.community === "other" && !data.communityOther.trim())
        e.communityOther = "Please tell us where you live.";
      if (!data.clientMessage.trim()) e.clientMessage = "Please tell us how we can help.";
    }
  }

  return e;
}

/* ─── Left panel copy ─── */
function LeftPanel() {
  return (
    <div className="flex flex-col justify-center lg:pr-8">
      <div className="mb-7">
        <Logo width={120} />
      </div>
      <p className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-gold/70">
        Serving North Texas Families
      </p>
      <h1 className="mt-3 font-serif text-4xl font-light leading-tight text-white lg:text-[2.75rem]">
        Begin Your Care Journey
      </h1>
      <p className="mt-4 font-serif text-lg font-light italic leading-snug text-white/80">
        Tell us a little about your situation, and a Serve Care Advisor will follow up shortly.
      </p>
      <p className="mt-5 font-sans text-sm leading-relaxed text-white/55">
        Whether you need a quick check-in, scheduled concierge support, or help planning
        next steps, we&rsquo;ll help you find the right starting point.
      </p>

      {/* Divider */}
      <div className="my-8 h-px w-12 bg-gold/30" />

      {/* Contact block */}
      <div>
        <p className="font-sans text-xs text-white/45">Prefer to talk with someone?</p>
        <a
          href="tel:+12148318384"
          className="mt-1 flex items-center gap-2 font-sans text-sm font-medium text-gold/90 transition-colors hover:text-gold"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3.5 w-3.5"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 2.5C2 2.5 3 1 4.5 1C5.5 1 6 2 6.5 3L7 4.5C7.5 5.5 7 6 6.5 6.5C6 7 5.5 7.5 6.5 9C7.5 10.5 9 11.5 10 11.5C11 11.5 11.5 11 12 10.5L13.5 9.5C14.5 9 15 9.5 15 10.5C15 12 13.5 13 13.5 13C13.5 13 12 15 9.5 14C7 13 3.5 9.5 2.5 7C1.5 4.5 2 2.5 2 2.5Z"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Call Serve Caregiving
        </a>
        <p className="mt-0.5 font-sans text-sm text-white/60">(214) 831-8384</p>
      </div>
    </div>
  );
}

/* ─── Progress indicator ─── */
function StepProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i < current ? "w-6 bg-gold" : i === current - 1 ? "w-6 bg-gold" : "w-3 bg-ivory-warm"
            }`}
          />
        ))}
      </div>
      <span className="font-sans text-[11px] text-muted">
        Step {current} of {total}
      </span>
    </div>
  );
}

/* ─── Main component ─── */
export function ServeIntakeFlow() {
  const [formData, setFormData] = useState<IntakeFormData>(initialFormData);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const path = formData.path;

  const update = (updates: Partial<IntakeFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    // Clear errors for changed fields
    const cleared = Object.fromEntries(
      Object.keys(updates).map((k) => [k, ""])
    );
    setErrors((prev) => ({ ...prev, ...cleared }));
  };

  const handleNext = () => {
    const errs = validate(step, path, formData);
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setStep(0);
    setErrors({});
    setSubmitted(false);
    setSubmitError(null);
  };

  const handleSubmit = () => {
    const errs = validate(step, path, formData);
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await insertProspect(formData);
      if (result.error) {
        setSubmitError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  };

  /* ─── Render step content ─── */
  function renderContent() {
    // Confirmation
    if (submitted) {
      return (
        <>
          <Confirmation />
          <div className="mt-8">
            <button
              type="button"
              onClick={handleReset}
              className="font-sans text-xs text-muted transition-colors hover:text-body"
            >
              Start a new request →
            </button>
          </div>
        </>
      );
    }

    // Step 0: path selector
    if (step === 0) {
      return (
        <>
          <PathSelector
            selected={path}
            onSelect={(p) => update({ path: p })}
            error={errors.path}
          />
          <StepNav
            onNext={() => {
              if (!path) {
                setErrors({ path: "Please select one of the options above." });
                return;
              }
              if (path === "careers") {
                setStep(1);
              } else {
                setStep(1);
              }
            }}
            nextLabel="Continue →"
            showBack={false}
          />
        </>
      );
    }

    // Careers path
    if (path === "careers") {
      return <CareersScreen onBack={handleReset} />;
    }

    // Care path
    if (path === "care") {
      const totalSteps = 5;
      const isLastStep = step === totalSteps;

      return (
        <>
          <StepProgress current={step} total={totalSteps} />
          {step === 1 && <ZipStep data={formData} onChange={update} errors={errors} />}
          {step === 2 && <CareForStep data={formData} onChange={update} errors={errors} />}
          {step === 3 && <TimingStep data={formData} onChange={update} errors={errors} />}
          {step === 4 && <ReferralStep data={formData} onChange={update} errors={errors} />}
          {step === 5 && <ContactStep data={formData} onChange={update} errors={errors} />}
          {submitError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {submitError}
            </p>
          )}
          <StepNav
            onBack={handleBack}
            onNext={isLastStep ? handleSubmit : handleNext}
            nextLabel={isLastStep ? "Submit Request" : "Continue →"}
            submitting={isPending}
          />
        </>
      );
    }

    // Existing client path
    if (path === "existing_client") {
      const totalSteps = 2;
      const isLastStep = step === totalSteps;

      return (
        <>
          <StepProgress current={step} total={totalSteps} />
          {step === 1 && (
            <ClientContactStep data={formData} onChange={update} errors={errors} />
          )}
          {step === 2 && (
            <ClientCommunityStep data={formData} onChange={update} errors={errors} />
          )}
          {submitError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {submitError}
            </p>
          )}
          <StepNav
            onBack={step === 1 ? handleReset : handleBack}
            onNext={isLastStep ? handleSubmit : handleNext}
            nextLabel={isLastStep ? "Send Message" : "Continue →"}
            submitting={isPending}
          />
        </>
      );
    }

    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-0">
      {/* ─── Left panel ─── */}
      <div className="rounded-2xl bg-navy p-10 lg:col-span-2 lg:rounded-none lg:rounded-l-2xl">
        <LeftPanel />
      </div>

      {/* ─── Right: form card ─── */}
      <div className="lg:col-span-3">
        <div className="h-full rounded-2xl bg-white p-8 shadow-card lg:rounded-none lg:rounded-r-2xl lg:p-10">
          {/* Logo — only shown on initial path-selector screen */}
          {!submitted && step === 0 && (
            <div className="mb-6">
              <Logo variant="transparent" width={90} />
            </div>
          )}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
