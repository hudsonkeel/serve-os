import { IntakeFormData, FormErrors } from "../../types";
import { FormField, FormInput } from "../../FormField";

const CONSENT_TEXT =
  "By submitting, I agree to the Terms of Service/Privacy Policy and consent to Serve Caregiving, LLC/affiliates/agents contacting me by email/phone/text via automatic telephone dialing system to provide a free care consultation/marketing communications. I do not need to provide this consent to receive any good/service. Message frequency will vary. Message & data rates may apply. You can reply STOP to opt-out of further messaging or HELP for help.";

interface ContactStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function ContactStep({ data, onChange, errors }: ContactStepProps) {
  return (
    <div className="space-y-5">
      <h2 className="font-serif text-xl font-light text-navy">
        How can we reach you?
      </h2>

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

      {/* Consent */}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
            checked={data.consentGiven}
            onChange={(e) => onChange({ consentGiven: e.target.checked })}
          />
          <span className="font-sans text-[11px] leading-relaxed text-muted">
            {CONSENT_TEXT}
          </span>
        </label>
        {errors.consentGiven && (
          <p className="font-sans text-xs text-red-500">{errors.consentGiven}</p>
        )}
      </div>
    </div>
  );
}
