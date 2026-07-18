"use server";

import { createServerClient } from "@/lib/supabase/server";
import { RecruitingLeadStatus } from "@/lib/supabase/types";

// Operational recruiting-lead actions — Scope J (Production Intake
// Unification) removed this file's former intake write path
// (saveRecruitingLead(), which inserted directly into `recruiting_leads`
// from `/get-started?mode=careers`). Recruiting leads are now created
// exclusively by the Serve Intake Intelligence Engine's recruiting
// classification (lib/actions/intakeEngine.ts), triggered by a canonical
// `intake_submissions` row — see docs/integrations/
// WEBSITE_TO_SERVE_INTAKE_CONTRACT.md. Everything below is genuinely
// operational (status workflow, file storage), not intake.

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
