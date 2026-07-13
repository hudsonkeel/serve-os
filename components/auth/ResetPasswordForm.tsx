"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

type SubmitState = "idle" | "preparing" | "submitting" | "success" | "error";
type RecoveryResult = { ok: true } | { ok: false; message: string };

function createBrowserAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
      },
    }
  );
}

function recoveryParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return params;
}

function clearRecoveryParamsFromUrl() {
  window.history.replaceState(null, document.title, window.location.pathname);
}

async function prepareRecoverySession(): Promise<RecoveryResult> {
  const supabase = createBrowserAuthClient();
  const params = recoveryParams();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");

  if (errorCode || errorDescription) {
    return {
      ok: false,
      message:
        errorCode === "otp_expired"
          ? "This reset link is invalid or has expired. Send yourself a new reset link and use the newest email."
          : errorDescription?.replace(/\+/g, " ") ||
            "This reset link could not be used.",
    };
  }

  await supabase.auth.initialize();

  let currentSession = (await supabase.auth.getSession()).data.session;

  if (!currentSession && code) {
    const { data, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError || !data.session) {
      console.error("[auth:reset-password:exchange]", exchangeError);
      return {
        ok: false,
        message: "This reset link is invalid or has expired.",
      };
    }
    currentSession = data.session;
  }

  if (!currentSession && tokenHash) {
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (verifyError || !data.session) {
      console.error("[auth:reset-password:verify]", verifyError);
      return {
        ok: false,
        message: "This reset link is invalid or has expired.",
      };
    }
    currentSession = data.session;
  }

  if (!currentSession && accessToken && refreshToken) {
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError || !data.session) {
      console.error("[auth:reset-password:set-session]", sessionError);
      return {
        ok: false,
        message: "This reset link is invalid or has expired.",
      };
    }
    currentSession = data.session;
  }

  if (!currentSession) {
    return {
      ok: false,
      message: "Open the password reset link from your email to continue.",
    };
  }

  return { ok: true };
}

export function ResetPasswordForm() {
  const router = useRouter();
  const recoveryPromiseRef = useRef<Promise<RecoveryResult> | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<SubmitState>("preparing");
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setStatus("preparing");
    setSessionReady(false);
    setError(null);

    recoveryPromiseRef.current ??= prepareRecoverySession();
    recoveryPromiseRef.current
      .then((result) => {
        if (!isMounted) return;

        if (result.ok) {
          clearRecoveryParamsFromUrl();
          setSessionReady(true);
          setStatus("idle");
          return;
        }

        setSessionReady(false);
        setStatus("error");
        setError(result.message);
      })
      .catch((recoveryError) => {
        console.error("[auth:reset-password:prepare]", recoveryError);
        if (!isMounted) return;
        setSessionReady(false);
        setStatus("error");
        setError("We could not prepare this reset link. Please try again.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!status || status !== "success") return;

    const timeout = window.setTimeout(() => {
      router.replace("/login");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setStatus("error");
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus("error");
      setError("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    const supabase = createBrowserAuthClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setStatus("error");
      setSessionReady(false);
      setError("Your reset session expired. Open the reset link from your email again.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("[auth:reset-password:update]", updateError);
      setStatus("error");
      setError("We could not update your password. Please try the reset link again.");
      return;
    }

    await supabase.auth.signOut();
    setStatus("success");
  }

  const disabled =
    !sessionReady || status === "preparing" || status === "submitting";
  const showPasswordFields = sessionReady && status !== "success";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status === "preparing" && (
        <p className="rounded-lg border border-ivory-border bg-ivory px-3 py-2 font-sans text-sm text-muted">
          Preparing your reset link...
        </p>
      )}

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
          Your password has been updated. Redirecting to sign in...
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      {showPasswordFields && (
        <>
          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark"
            >
              New Password
            </label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-4 font-sans text-sm text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60"
              placeholder="At least 8 characters"
              disabled={disabled}
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark"
            >
              Confirm Password
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-ivory-border bg-surface px-4 font-sans text-sm text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60"
              placeholder="Re-enter your new password"
              disabled={disabled}
            />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy px-5 font-sans text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "submitting" ? "Updating..." : "Update password"}
            {status !== "submitting" && <ArrowRight className="h-4 w-4" />}
          </button>
        </>
      )}

      <Link
        href="/login"
        className="block text-center font-sans text-xs text-muted underline-offset-4 transition-colors hover:text-body hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
