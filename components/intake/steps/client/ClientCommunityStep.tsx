import { IntakeFormData, FormErrors } from "../../types";
import { FormField, FormSelect, FormTextarea, FormInput } from "../../FormField";

// NOT CURRENTLY LIVE — this component is not imported by
// components/intake/ServeIntakeFlow.tsx (the actual live flow behind
// app/get-started), which submits community: null unconditionally. Kept
// current for whenever it (or an equivalent step in the live flow) is
// wired back in — see this phase's checkpoint report for the real,
// currently-live gap and the companion-repository work it likely
// requires. Values match communities.code exactly (Phase E/F completion,
// section 5) so a canonical resolution step downstream has something
// real to map against, rather than another free-text label.
const communityOptions = [
  { value: "watermere_frisco", label: "Watermere at Frisco" },
  { value: "watermere_firewheel", label: "Watermere at Firewheel" },
  { value: "watermere_mckinney", label: "Watermere at McKinney" },
  { value: "frisco_lakes", label: "Frisco Lakes" },
  { value: "heritage_ranch", label: "Heritage Ranch" },
  { value: "other", label: "Other / Direct Private Home" },
];

interface ClientCommunityStepProps {
  data: IntakeFormData;
  onChange: (updates: Partial<IntakeFormData>) => void;
  errors: FormErrors;
}

export function ClientCommunityStep({ data, onChange, errors }: ClientCommunityStepProps) {
  return (
    <div className="space-y-5">
      <h2 className="font-serif text-xl font-light text-navy">How can we help?</h2>

      <FormField label="Which community do you live in?" error={errors.community}>
        <FormSelect
          options={communityOptions}
          placeholder="Select your community"
          value={data.community}
          onChange={(e) => onChange({ community: e.target.value, communityOther: "" })}
          hasError={!!errors.community}
        />
      </FormField>

      {data.community === "other" && (
        <FormField label="Where do you live?" error={errors.communityOther}>
          <FormInput
            type="text"
            placeholder="City, community, or neighborhood"
            value={data.communityOther}
            onChange={(e) => onChange({ communityOther: e.target.value })}
            hasError={!!errors.communityOther}
            autoFocus
          />
        </FormField>
      )}

      <FormField label="How can we help?" error={errors.clientMessage}>
        <FormTextarea
          placeholder="Let us know what you need — a schedule change, a question about your care plan, or anything else on your mind."
          value={data.clientMessage}
          onChange={(e) => onChange({ clientMessage: e.target.value })}
          hasError={!!errors.clientMessage}
        />
      </FormField>
    </div>
  );
}
