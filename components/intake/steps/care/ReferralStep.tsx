import { IntakeFormData, FormErrors } from "../../types";
import { OptionCard } from "../../OptionCard";
import { FormField, FormInput } from "../../FormField";

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

interface ReferralStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function ReferralStep({ data, onChange, errors }: ReferralStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-light text-navy">
          How did you hear about us?
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {referralOptions.map((option) => (
            <OptionCard
              key={option}
              label={option}
              selected={data.referralSource === option}
              onClick={() => onChange({ referralSource: option, referralOther: "" })}
            />
          ))}
        </div>
        {errors.referralSource && (
          <p className="mt-2 font-sans text-xs text-red-500">{errors.referralSource}</p>
        )}
      </div>

      {data.referralSource === "Other" && (
        <FormField label="Please tell us how you heard about us." error={errors.referralOther}>
          <FormInput
            type="text"
            placeholder="Tell us more…"
            value={data.referralOther}
            onChange={(e) => onChange({ referralOther: e.target.value })}
            hasError={!!errors.referralOther}
            autoFocus
          />
        </FormField>
      )}
    </div>
  );
}
