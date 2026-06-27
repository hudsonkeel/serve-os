import { ServeIntakeFlow } from "@/components/intake/ServeIntakeFlow";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Begin Your Care Journey | Serve Caregiving",
  description:
    "Tell us about your situation and a Serve Care Advisor will follow up shortly.",
};

export default function GetStartedPage() {
  return (
    <div className="min-h-screen bg-ivory">
      {/* Minimal public header */}
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

      {/* Intake flow */}
      <main className="px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <ServeIntakeFlow />
        </div>
      </main>
    </div>
  );
}
