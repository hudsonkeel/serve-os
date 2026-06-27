import { IntakeFormData, FormErrors } from "../../types";
import { FormField, FormInput } from "../../FormField";

interface ZipStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function ZipStep({ data, onChange, errors }: ZipStepProps) {
  return (
    <div>
      <h2 className="font-serif text-xl font-light text-navy">
        What&rsquo;s the ZIP code where care is needed?
      </h2>
      <p className="mt-1 font-sans text-sm text-muted">
        We use this to confirm we serve your area.
      </p>
      <div className="mt-6 max-w-xs">
        <FormField label="ZIP Code" error={errors.zipCode}>
          <FormInput
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="75001"
            value={data.zipCode}
            onChange={(e) => onChange({ zipCode: e.target.value.replace(/\D/g, "") })}
            hasError={!!errors.zipCode}
            autoFocus
          />
        </FormField>
      </div>
    </div>
  );
}
