export type IntakePath = "care" | "careers" | "existing_client" | null;

export interface IntakeFormData {
  path: IntakePath;

  // Care path
  zipCode: string;
  careFor: "" | "myself" | "parent" | "spouse_partner" | "other_family";
  careRecipientFirst: string;
  careRecipientLast: string;
  supportType: "" | "home_care" | "concierge" | "geriatric" | "not_sure";
  startTiming: "" | "immediately" | "coming_weeks" | "future" | "not_sure";
  careNeeds: string;
  referralSource: string;
  referralOther: string;

  // Contact (shared by care + existing client)
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consentGiven: boolean;

  // Existing client
  community: string;
  communityOther: string;
  clientMessage: string;
}

export const initialFormData: IntakeFormData = {
  path: null,
  zipCode: "",
  careFor: "",
  careRecipientFirst: "",
  careRecipientLast: "",
  supportType: "",
  startTiming: "",
  careNeeds: "",
  referralSource: "",
  referralOther: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  consentGiven: false,
  community: "",
  communityOther: "",
  clientMessage: "",
};

export type FormErrors = Record<string, string>;
