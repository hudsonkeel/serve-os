import { IntakePath } from "../types";
import { OptionCard } from "../OptionCard";

const options: { value: NonNullable<IntakePath>; label: string; description: string }[] = [
  {
    value: "care",
    label: "I am looking for home care",
    description: "For yourself, a parent, a spouse, or another loved one.",
  },
  {
    value: "careers",
    label: "I am interested in a career at Serve Caregiving",
    description: "View open positions and learn about joining our team.",
  },
  {
    value: "existing_client",
    label: "I am an existing client",
    description: "Reach out to your care team or ask a question.",
  },
];

interface PathSelectorProps {
  selected: IntakePath;
  onSelect: (path: NonNullable<IntakePath>) => void;
  error?: string;
}

export function PathSelector({ selected, onSelect, error }: PathSelectorProps) {
  return (
    <div>
      <h2 className="font-serif text-xl font-light text-navy">
        What best describes how we can help you?
      </h2>
      <div className="mt-5 space-y-2.5">
        {options.map((o) => (
          <OptionCard
            key={o.value}
            label={o.label}
            description={o.description}
            selected={selected === o.value}
            onClick={() => onSelect(o.value)}
          />
        ))}
      </div>
      {error && <p className="mt-3 font-sans text-xs text-red-500">{error}</p>}
    </div>
  );
}
