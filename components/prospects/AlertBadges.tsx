import { Prospect } from "@/lib/supabase/types";

interface AlertBadgesProps {
  prospect: Prospect;
}

export function AlertBadges({ prospect }: AlertBadgesProps) {
  const isHighPriority = prospect.start_timing === "immediately";
  const isMissingContact = !prospect.contact_phone && !prospect.contact_email;
  const isWebsiteInquiry = prospect.source === "website_intake";

  if (!isHighPriority && !isMissingContact && !isWebsiteInquiry) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {isHighPriority && (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 font-sans text-[11px] font-medium text-red-700">
          High Priority
        </span>
      )}
      {isMissingContact && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 font-sans text-[11px] font-medium text-amber-700">
          Missing Contact Info
        </span>
      )}
      {isWebsiteInquiry && (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 font-sans text-[11px] font-medium text-blue-700">
          New Website Inquiry
        </span>
      )}
    </div>
  );
}
