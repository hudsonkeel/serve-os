import { Fragment } from "react";
import { Check } from "lucide-react";
import { FormField, FormInput, FormTextarea } from "./FormField";
import { OptionCard } from "./OptionCard";
import {
  FormErrors,
  IntakeFormData,
  IntakeSaveMilestone,
} from "./types";

const careForOptions = [
  { value: "myself", label: "Myself" },
  { value: "parent", label: "A parent" },
  { value: "spouse_partner", label: "A spouse / partner" },
  { value: "other_family", label: "Another family member" },
  { value: "friend", label: "Friend" },
  { value: "neighbor", label: "Neighbor" },
  { value: "client_referral", label: "Client referral" },
  { value: "professional_referral", label: "Professional referral" },
  { value: "someone_else", label: "Someone else" },
] as const;

const supportOptions = [
  { value: "home_care", label: "Home Care" },
  { value: "concierge", label: "Scheduled Concierge Support" },
  { value: "geriatric", label: "Geriatric Care Management" },
  { value: "not_sure", label: "I'm Not Sure" },
] as const;

const timingOptions = [
  { value: "immediately", label: "Immediately" },
  { value: "coming_weeks", label: "In the coming weeks" },
  { value: "future", label: "Planning for the future" },
  { value: "not_sure", label: "Not sure" },
] as const;

const referralOptions = [
  "Friend or Family Referral",
  "Healthcare Provider Referral",
  "Community Referral",
  "Insurance Provider",
  "Online Search",
  "AI Search / ChatGPT",
  "Wealth or Financial Advisor",
  "Geriatric Care Manager",
  "Social Media",
  "Online Advertisement",
  "Other",
];

type CompletedMilestones = Partial<Record<IntakeSaveMilestone, boolean>>;
export type IntakeConversationStep =
  | "relationship"
  | "support"
  | "timing"
  | "notes"
  | "referral"
  | "submit";

interface ProgressiveCareConversationProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
  completed: CompletedMilestones;
  savingMilestone: IntakeSaveMilestone | null;
  activeStep: IntakeConversationStep;
  onSelect: (
    milestone: IntakeSaveMilestone,
    updates: Partial<IntakeFormData>,
    nextStep: IntakeConversationStep
  ) => void;
  onLocalAdvance: (
    updates: Partial<IntakeFormData>,
    nextStep: IntakeConversationStep
  ) => void;
  onRecipientNameContinue: () => void;
  onNotesContinue: () => void;
}

function Acknowledgement({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg bg-ivory px-4 py-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-subtle text-gold-dark">
        <Check className="h-3 w-3" />
      </span>
      <p className="font-sans text-sm leading-relaxed text-body">{children}</p>
    </div>
  );
}

function QuestionBlock({
  title,
  saving,
  children,
}: {
  title: string;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gold/30 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-serif text-2xl font-light leading-tight text-navy">
          {title}
        </h2>
        {saving && (
          <span className="shrink-0 font-sans text-xs text-muted">
            Saving...
          </span>
        )}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function relationshipAcknowledgement(value: IntakeFormData["careFor"]) {
  if (value === "myself") return "Thank you. We'll focus this around you.";
  if (value === "parent") return "We're glad you're helping your parent.";
  if (value === "spouse_partner")
    return "We understand. We'll make sure we understand what your partner needs.";
  if (value === "other_family")
    return "Thank you for looking out for your family member.";
  if (value === "friend") return "That's kind of you. We'll learn what would help them most.";
  if (value === "neighbor") return "Thank you for looking out for your neighbor.";
  if (value === "client_referral")
    return "Thank you. We'll handle the referral thoughtfully.";
  if (value === "professional_referral")
    return "Thank you. We'll treat the professional referral with care.";
  if (value === "someone_else")
    return "Thank you. We'll make sure we understand who needs support.";
  return "We'll make sure we understand who needs support.";
}

function recipientAcknowledgement(data: IntakeFormData) {
  const firstName = data.careRecipientFirstName.trim();
  if (!firstName) return "We'll make sure we understand who needs support.";
  return `We're hopeful we can serve ${firstName} well.`;
}

function supportAcknowledgement(value: IntakeFormData["supportType"]) {
  if (value === "home_care")
    return "Perfect. We'll help determine the right level of care.";
  if (value === "concierge")
    return "Perfect. We'll help shape the right kind of day-to-day support.";
  if (value === "geriatric")
    return "Understood. We'll help bring the whole care picture into focus.";
  if (value === "not_sure")
    return "That's completely fine. We'll help determine the right level of care.";
  return "Perfect. We'll help determine the right level of care.";
}

function timingAcknowledgement(value: IntakeFormData["startTiming"]) {
  if (value === "immediately") return "We'll prioritize this conversation.";
  if (value === "coming_weeks")
    return "Good to know. We'll help you plan thoughtfully.";
  if (value === "future")
    return "Planning ahead is a strong first step.";
  if (value === "not_sure")
    return "That's okay. We can help you think through timing.";
  return "We'll help you think through timing.";
}

export function ProgressiveCareConversation({
  data,
  onChange,
  errors,
  completed,
  savingMilestone,
  activeStep,
  onSelect,
  onLocalAdvance,
  onRecipientNameContinue,
  onNotesContinue,
}: ProgressiveCareConversationProps) {
  const showRecipientNameCapture =
    activeStep === "relationship" && data.careFor && data.careFor !== "myself";

  return (
    <div className="space-y-3">
      {completed.relationship_completed && data.careFor === "myself" && (
        <Acknowledgement>
          {relationshipAcknowledgement(data.careFor)}
        </Acknowledgement>
      )}

      {activeStep === "relationship" && (
        <QuestionBlock
          title="Who are we helping today?"
          saving={savingMilestone === "relationship_completed"}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {careForOptions.map((option) => (
              <Fragment key={option.value}>
                <OptionCard
                  label={option.label}
                  selected={data.careFor === option.value}
                  onClick={() => {
                    if (option.value === "myself") {
                      onSelect(
                        "relationship_completed",
                        {
                          careFor: option.value,
                          careRecipientFirstName: data.firstName,
                          careRecipientLastName: data.lastName,
                        },
                        "support"
                      );
                      return;
                    }

                    onChange({
                      careFor: option.value,
                      careRecipientFirstName: "",
                      careRecipientLastName: "",
                    });
                  }}
                />
                {showRecipientNameCapture && data.careFor === option.value && (
                  <div className="rounded-lg border border-ivory-border bg-ivory/60 p-4 sm:col-span-2">
                    <h3 className="font-serif text-xl font-light text-navy">
                      What is their name?
                    </h3>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField
                        label="First Name"
                        error={errors.careRecipientFirstName}
                      >
                        <FormInput
                          type="text"
                          placeholder="First name"
                          value={data.careRecipientFirstName}
                          onChange={(event) =>
                            onChange({
                              careRecipientFirstName: event.target.value,
                            })
                          }
                          hasError={!!errors.careRecipientFirstName}
                        />
                      </FormField>
                      <FormField
                        label="Last Name"
                        error={errors.careRecipientLastName}
                      >
                        <FormInput
                          type="text"
                          placeholder="Last name"
                          value={data.careRecipientLastName}
                          onChange={(event) =>
                            onChange({
                              careRecipientLastName: event.target.value,
                            })
                          }
                          hasError={!!errors.careRecipientLastName}
                        />
                      </FormField>
                    </div>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={onRecipientNameContinue}
                        disabled={savingMilestone === "relationship_completed"}
                        className="rounded-lg bg-gold px-5 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingMilestone === "relationship_completed"
                          ? "Saving..."
                          : "Continue"}
                      </button>
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
          {errors.careFor && (
            <p className="mt-2 font-sans text-xs text-red-500">
              {errors.careFor}
            </p>
          )}
        </QuestionBlock>
      )}

      {completed.relationship_completed &&
        data.careFor !== "myself" &&
        (data.careRecipientFirstName || data.careRecipientLastName) && (
          <Acknowledgement>{recipientAcknowledgement(data)}</Acknowledgement>
        )}

      {completed.support_completed && data.supportType && (
        <Acknowledgement>
          {supportAcknowledgement(data.supportType)}
        </Acknowledgement>
      )}

      {activeStep === "support" && (
        <QuestionBlock
          title="What type of support are you looking for?"
          saving={savingMilestone === "support_completed"}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {supportOptions.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                selected={data.supportType === option.value}
                onClick={() =>
                  onSelect(
                    "support_completed",
                    { supportType: option.value },
                    "timing"
                  )
                }
              />
            ))}
          </div>
          {errors.supportType && (
            <p className="mt-2 font-sans text-xs text-red-500">
              {errors.supportType}
            </p>
          )}
        </QuestionBlock>
      )}

      {data.startTiming && activeStep !== "timing" && (
        <Acknowledgement>
          {timingAcknowledgement(data.startTiming)}
        </Acknowledgement>
      )}

      {activeStep === "timing" && (
        <QuestionBlock title="When were you hoping to begin?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {timingOptions.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                selected={data.startTiming === option.value}
                onClick={() =>
                  onLocalAdvance({ startTiming: option.value }, "notes")
                }
              />
            ))}
          </div>
          {errors.startTiming && (
            <p className="mt-2 font-sans text-xs text-red-500">
              {errors.startTiming}
            </p>
          )}
        </QuestionBlock>
      )}

      {completed.timing_completed && (
        <Acknowledgement>
          {data.careNeeds.trim()
            ? "Thank you. This gives us helpful context before we reach out."
            : "Thank you. We can talk through the details together."}
        </Acknowledgement>
      )}

      {activeStep === "notes" && (
        <QuestionBlock
          title="Can you tell us a little more about what's happening?"
          saving={savingMilestone === "timing_completed"}
        >
          <FormField label="Care Notes" error={errors.careNeeds}>
            <FormTextarea
              placeholder="Share routines, concerns, recent changes, or the kind of help that would bring relief."
              value={data.careNeeds}
              onChange={(event) => onChange({ careNeeds: event.target.value })}
              hasError={!!errors.careNeeds}
            />
          </FormField>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onNotesContinue}
              disabled={savingMilestone === "timing_completed"}
              className="rounded-lg bg-gold px-5 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingMilestone === "timing_completed"
                ? "Saving..."
                : "Continue"}
            </button>
          </div>
        </QuestionBlock>
      )}

      {completed.referral_completed && data.referralSource && (
        <Acknowledgement>
          Thank you. We&rsquo;ll include that with your request.
        </Acknowledgement>
      )}

      {activeStep === "referral" && (
        <QuestionBlock
          title="How did you hear about Serve?"
          saving={savingMilestone === "referral_completed"}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {referralOptions.map((option) => (
              <OptionCard
                key={option}
                label={option}
                selected={data.referralSource === option}
                onClick={() =>
                  onSelect(
                    "referral_completed",
                    { referralSource: option, referralOther: "" },
                    "submit"
                  )
                }
              />
            ))}
          </div>
          {errors.referralSource && (
            <p className="mt-2 font-sans text-xs text-red-500">
              {errors.referralSource}
            </p>
          )}
        </QuestionBlock>
      )}
    </div>
  );
}
