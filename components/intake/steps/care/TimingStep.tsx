import { IntakeFormData, FormErrors } from "../../types";
import { OptionCard } from "../../OptionCard";
import { FormField, FormTextarea } from "../../FormField";

const timingOptions = [
  { value: "immediately",   label: "Immediately" },
  { value: "coming_weeks",  label: "In the coming weeks" },
  { value: "future",        label: "Planning for the future" },
  { value: "not_sure",      label: "Not sure" },
] as const;

interface TimingStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function TimingStep({ data, onChange, errors }: TimingStepProps) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-serif text-xl font-light text-navy">
          When are you hoping to start receiving care?
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {timingOptions.map((o) => (
            <OptionCard
              key={o.value}
              label={o.label}
              selected={data.startTiming === o.value}
              onClick={() => onChange({ startTiming: o.value })}
            />
          ))}
        </div>
        {errors.startTiming && (
          <p className="mt-2 font-sans text-xs text-red-500">{errors.startTiming}</p>
        )}
      </div>

      <FormField label="Tell us about your care needs." error={errors.careNeeds}>
        <FormTextarea
          placeholder="Share anything that would help us understand the situation — daily routines, specific challenges, level of support needed, or anything else on your mind."
          value={data.careNeeds}
          onChange={(e) => onChange({ careNeeds: e.target.value })}
          hasError={!!errors.careNeeds}
        />
      </FormField>
    </div>
  );
}
