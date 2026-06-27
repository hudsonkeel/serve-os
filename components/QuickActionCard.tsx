import { LucideIcon } from "lucide-react";

interface QuickActionCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
}

export function QuickActionCard({ icon: Icon, label, description }: QuickActionCardProps) {
  return (
    <button type="button" className="group flex w-full cursor-pointer items-center gap-4 rounded-xl bg-white px-4 py-3.5 text-left shadow-card transition-all duration-200 hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 transition-colors duration-200 group-hover:bg-gold/20">
        <Icon size={15} strokeWidth={1.5} className="text-gold" />
      </div>
      <div className="min-w-0">
        <p className="font-sans text-sm font-medium text-navy">{label}</p>
        <p className="font-sans text-[11px] text-muted">{description}</p>
      </div>
    </button>
  );
}
