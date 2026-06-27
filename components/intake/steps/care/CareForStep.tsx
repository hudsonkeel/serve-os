import { IntakeFormData, FormErrors } from "../../types";
import { OptionCard } from "../../OptionCard";
import { FormField, FormInput } from "../../FormField";

const careForOptions = [
  { value: "myself",        label: "Myself" },
  { value: "parent",        label: "A parent" },
  { value: "spouse_partner",label: "A spouse / partner" },
  { value: "other_family",  label: "Another family member" },
] as const;

const supportOptions = [
  { value: "home_care",  label: "Home Care" },
  { value: "concierge",  label: "Scheduled Concierge Support" },
  { value: "geriatric",  label: "Geriatric Care Management" },
  { value: "not_sure",   label: "I'm Not Sure" },
] as const;

const recipientLabel: Record<string, string> = {
  parent:        "Your Parent",
  spouse_partner: "Your Spouse / Partner",
  other_family:  "Your Family Member",
};

interface CareForStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function CareForStep({ data, onChange, errors }: CareForStepProps) {
  const needsName = data.careFor && data.careFor !== "myself";
  const nameLabel = needsName ? recipientLabel[data.careFor] : "";

  return (
    <div className="space-y-7">
      {/* Who is the care for */}
      <div>
        <h2 className="font-serif text-xl font-light text-navy">Who is the care for?</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {careForOptions.map((o) => (
            <OptionCard
              key={o.value}
              label={o.label}
              selected={data.careFor === o.value}
              onClick={() =>
                onChange({ careFor: o.value, careRecipientFirst: "", careRecipientLast: "" })
              }
            />
          ))}
        </div>
        {errors.careFor && (
          <p className="mt-2 font-sans text-xs text-red-500">{errors.careFor}</p>
        )}
      </div>

      {/* Conditional name fields */}
      {needsName && (
        <div>
          <p className="mb-3 font-sans text-sm font-medium text-body">
            {nameLabel}&rsquo;s Name
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name" error={errors.careRecipientFirst}>
              <FormInput
                type="text"
                placeholder="Jane"
                value={data.careRecipientFirst}
                onChange={(e) => onChange({ careRecipientFirst: e.target.value })}
                hasError={!!errors.careRecipientFirst}
              />
            </FormField>
            <FormField label="Last Name" error={errors.careRecipientLast}>
              <FormInput
                type="text"
                placeholder="Smith"
                value={data.careRecipientLast}
                onChange={(e) => onChange({ careRecipientLast: e.target.value })}
                hasError={!!errors.careRecipientLast}
              />
            </FormField>
          </div>
        </div>
      )}

      {/* Support type */}
      <div>
        <p className="mb-3 font-serif text-xl font-light text-navy">
          What type of support are you looking for?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {supportOptions.map((o) => (
            <OptionCard
              key={o.value}
              label={o.label}
              selected={data.supportType === o.value}
              onClick={() => onChange({ supportType: o.value })}
            />
          ))}
        </div>
        {errors.supportType && (
          <p className="mt-2 font-sans text-xs text-red-500">{errors.supportType}</p>
        )}
      </div>
    </div>
  );
}
