"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/auth/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.success) {
      router.replace("/");
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 w-full rounded-lg border border-ivory-border bg-white px-4 font-sans text-sm text-navy outline-none transition-colors placeholder:text-subtle focus:border-gold/60"
          placeholder="name@servecaregiving.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-gold-dark"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-lg border border-ivory-border bg-white px-4 font-sans text-sm text-navy outline-none transition-colors placeholder:text-subtle focus:border-gold/60"
          placeholder="Enter your password"
        />
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy px-5 font-sans text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign in"}
        {!pending && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
