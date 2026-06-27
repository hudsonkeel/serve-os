export type IntakePath = "care" | "careers" | "existing_client" | null;

export type IntakeSaveMilestone =
  | "contact_completed"
  | "relationship_completed"
  | "support_completed"
  | "timing_completed"
  | "referral_completed"
  | "intake_completed";

export interface IntakeFormData {
  path: IntakePath;

  // Care path
  zipCode: string;
  careFor:
    | ""
    | "myself"
    | "parent"
    | "spouse_partner"
    | "other_family"
    | "friend"
    | "neighbor"
    | "client_referral"
    | "professional_referral"
    | "someone_else";
  careRecipientFirstName: string;
  careRecipientLastName: string;
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
  careRecipientFirstName: "",
  careRecipientLastName: "",
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
