import type { Metadata } from "next";
import { ServeIntakeFlow } from "@/components/intake/ServeIntakeFlow";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Begin Your Care Journey | Serve Caregiving",
  description:
    "Tell us about your situation and a Serve Care Advisor will follow up shortly.",
};

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const initialMode = mode === "careers" ? "careers" : "care";

  return (
    <div className="min-h-screen bg-ivory">
      <header className="border-b border-ivory-border bg-white px-8 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Logo variant="transparent" width={110} />
          <a
            href="tel:+12148318384"
            className="font-sans text-sm text-muted transition-colors hover:text-gold"
          >
            (214) 831-8384
          </a>
        </div>
      </header>

      <main className="px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <ServeIntakeFlow initialMode={initialMode} />
        </div>
      </main>
    </div>
  );
}
