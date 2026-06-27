import { IntakeFormData, FormErrors } from "../../types";
import { FormField, FormInput } from "../../FormField";

interface ClientContactStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function ClientContactStep({ data, onChange, errors }: ClientContactStepProps) {
  return (
    <div className="space-y-5">
      <h2 className="font-serif text-xl font-light text-navy">
        Let&rsquo;s pull up your account.
      </h2>
      <p className="font-sans text-sm text-muted">
        Please provide your contact information so we can locate your care plan.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="First Name" error={errors.firstName}>
          <FormInput
            type="text"
            placeholder="Jane"
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            hasError={!!errors.firstName}
          />
        </FormField>
        <FormField label="Last Name" error={errors.lastName}>
          <FormInput
            type="text"
            placeholder="Smith"
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            hasError={!!errors.lastName}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Phone Number" error={errors.phone}>
          <FormInput
            type="tel"
            placeholder="(214) 555-0000"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            hasError={!!errors.phone}
          />
        </FormField>
        <FormField label="Email Address" error={errors.email}>
          <FormInput
            type="email"
            placeholder="jane@example.com"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            hasError={!!errors.email}
          />
        </FormField>
      </div>
    </div>
  );
}
