"use server";

import { createServerClient } from "@/lib/supabase/server";
import {
  RecruitingLeadInsert,
  RecruitingLeadRole,
  RecruitingLeadStatus,
} from "@/lib/supabase/types";
import { emitEvent } from "@/lib/notifications";

export interface RecruitingLeadFormData {
  roleInterest: RecruitingLeadRole;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  // Caregiver
  zipCode?: string;
  availability?: string;
  experienceLevel?: string;
  certificationLicense?: string;
  // Managing Director
  cityState?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  resumeFilename?: string;
  resumeUploadedAt?: string;
  explorationTimeline?: string;
  // Shared
  message?: string;
}

function hasMinimumIdentity(data: RecruitingLeadFormData): boolean {
  const hasPhone = data.phone.replace(/\D/g, "").length >= 10;
  const hasEmail = /\S+@\S+\.\S+/.test(data.email.trim());
  return Boolean(data.firstName.trim() && data.lastName.trim() && (hasPhone || hasEmail));
}

function buildFormFields(data: RecruitingLeadFormData, completedAt: string) {
  return {
    first_name: data.firstName.trim() || null,
    last_name: data.lastName.trim() || null,
    phone: data.phone.trim() || null,
    email: data.email.trim().toLowerCase() || null,
    zip_code: data.zipCode?.trim() || null,
    city_state: data.cityState?.trim() || null,
    availability: data.availability || null,
    experience_level: data.experienceLevel || null,
    certification_license: data.certificationLicense?.trim() || null,
    linkedin_url: data.linkedinUrl?.trim() || null,
    resume_url: data.resumeUrl?.trim() || null,
    resume_filename: data.resumeFilename?.trim() || null,
    resume_uploaded_at: data.resumeUploadedAt || null,
    exploration_timeline: data.explorationTimeline || null,
    message: data.message?.trim() || null,
    raw_submission: { ...data } as Record<string, unknown>,
    form_completed_at: completedAt,
  };
}

function buildLeadInsertRow(
  data: RecruitingLeadFormData,
  completedAt: string
): RecruitingLeadInsert {
  return {
    role_interest: data.roleInterest,
    source: "website",
    status: "new",
    ...buildFormFields(data, completedAt),
  };
}

function buildLeadUpdateRow(data: RecruitingLeadFormData, completedAt: string) {
  return buildFormFields(data, completedAt);
}

export async function saveRecruitingLead(
  data: RecruitingLeadFormData
): Promise<{ id?: string; error?: string; notificationWarning?: string }> {
  const supabase = createServerClient();

  if (!data.roleInterest) {
    return { error: "Role selection is required." };
  }

  if (!hasMinimumIdentity(data)) {
    return {
      error: "Please provide your name and either a phone number or email address.",
    };
  }

  const now = new Date().toISOString();
  const normalizedEmail = data.email.trim().toLowerCase();

  if (normalizedEmail && /\S+@\S+\.\S+/.test(normalizedEmail)) {
    const { data: existing, error: lookupError } = await supabase
      .from("recruiting_leads")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("role_interest", data.roleInterest)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (lookupError) {
      console.error("[saveRecruitingLead:lookup]", lookupError);
    }

    if (existing?.id) {
      const { data: updated, error } = await supabase
        .from("recruiting_leads")
        .update(buildLeadUpdateRow(data, now))
        .eq("id", existing.id)
        .select("id")
        .single();

      if (error) {
        console.error("[saveRecruitingLead:update]", error);
        return { error: "Something went wrong. Please try again." };
      }

      return { id: updated.id };
    }
  }

  const { data: inserted, error } = await supabase
    .from("recruiting_leads")
    .insert(buildLeadInsertRow(data, now))
    .select("id")
    .single();

  if (error) {
    console.error("[saveRecruitingLead:insert]", error);
    return {
      error:
        process.env.NODE_ENV === "development"
          ? `Supabase insert failed: ${error.message}`
          : "Something went wrong. Please try again.",
    };
  }

  // Awaited (not fire-and-forget): in Netlify's serverless runtime, the function's
  // execution context can be frozen the instant a response is returned, which
  // silently kills any unawaited background promise — including this email send.
  // The database insert above is already complete, so this cannot block it.
  let notificationOk = true;
  try {
    const result = await emitEvent({
      type:
        data.roleInterest === "caregiver"
          ? "recruiting_lead.caregiver_created"
          : "recruiting_lead.md_created",
      payload: {
        leadId: inserted.id,
        role: data.roleInterest,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone || undefined,
        email: data.email || undefined,
        zipCode: data.zipCode,
        cityState: data.cityState,
        availability: data.availability,
        experienceLevel: data.experienceLevel,
        linkedinUrl: data.linkedinUrl,
        resumeUrl: data.resumeUrl,
        resumeFilename: data.resumeFilename,
        explorationTimeline: data.explorationTimeline,
        message: data.message,
      },
    });
    notificationOk = result.ok;
  } catch (err) {
    console.error("[saveRecruitingLead] Notification dispatch threw:", err);
    notificationOk = false;
  }

  if (!notificationOk) {
    console.warn(
      `[saveRecruitingLead] Lead ${inserted.id} saved, but the notification email may not have been delivered.`
    );
  }

  return {
    id: inserted.id,
    notificationWarning: notificationOk
      ? undefined
      : "Lead saved, but the notification email may not have been delivered.",
  };
}

export async function markApploiRedirect(
  leadId: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("recruiting_leads")
    .update({ apploi_redirected_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    console.error("[markApploiRedirect]", error);
    return { error: "Could not record redirect." };
  }

  return {};
}

export async function updateRecruitingLeadStatus(
  id: string,
  status: RecruitingLeadStatus
): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("recruiting_leads")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("[updateRecruitingLeadStatus]", error);
    return { error: "Could not update status." };
  }

  return {};
}

const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;
const ALLOWED_RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadRecruitingResume(
  formData: FormData
): Promise<{ url?: string; filename?: string; uploadedAt?: string; error?: string }> {
  const file = formData.get("resume");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file provided." };
  }

  if (file.size > MAX_RESUME_BYTES) {
    return { error: "File size must be under 5 MB." };
  }

  const ext = ("." + file.name.split(".").pop()).toLowerCase();
  const mimeOk = ALLOWED_RESUME_MIME_TYPES.has(file.type);
  const extOk = (ALLOWED_RESUME_EXTENSIONS as readonly string[]).includes(ext);

  if (!mimeOk && !extOk) {
    return { error: "Please upload a PDF, DOC, or DOCX file." };
  }

  const supabase = createServerClient();
  const uid = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `md/${uid}-${safeName}`;

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("recruiting-resumes")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadRecruitingResume]", uploadError);
    return { error: "Could not upload resume. Please try again." };
  }

  const { data: urlData } = supabase.storage
    .from("recruiting-resumes")
    .getPublicUrl(storagePath);

  return {
    url: urlData.publicUrl,
    filename: file.name,
    uploadedAt: new Date().toISOString(),
  };
}
