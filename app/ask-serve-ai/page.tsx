import { PageContainer } from "@/components/PageContainer";
import { Sparkles } from "lucide-react";

const suggestedPrompts = [
  "Which residents may benefit from companionship?",
  "Who should we follow up with this week?",
  "Which residents have upcoming birthdays?",
  "Which residents may need transportation assistance?",
  "Who has not interacted with Serve recently?",
  "Which active prospects are ready for an assessment?",
  "Summarize the Serve relationship for Margaret Chen.",
  "Which residents have family members asking for follow-up?",
];

export default function AskServeAIPage() {
  return (
    <PageContainer title="Ask Serve AI">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy">
              <Sparkles size={24} strokeWidth={1.5} className="text-gold" />
            </div>
          </div>
          <h1 className="font-serif text-4xl font-light text-navy">Ask Serve AI</h1>
          <p className="mt-3 font-sans text-sm text-muted">
            Your intelligent partner for community relationship management.
            Ask about residents, prospects, or upcoming priorities.
          </p>
        </div>

        {/* Input area (placeholder) */}
        <div className="mb-8 rounded-xl border border-ivory-border bg-white p-1.5 shadow-card">
          <div className="flex items-center gap-3 px-4 py-3">
            <Sparkles size={16} strokeWidth={1.5} className="shrink-0 text-gold/60" />
            <p className="flex-1 font-sans text-sm text-subtle">
              Ask anything about your residents or community…
            </p>
            <span className="rounded-lg bg-navy px-4 py-2 font-sans text-xs font-medium text-white opacity-40">
              Ask
            </span>
          </div>
        </div>

        {/* Coming soon banner */}
        <div className="mb-8 rounded-xl border border-gold/30 bg-gold/5 px-5 py-4 text-center">
          <p className="font-sans text-sm font-medium text-gold-dark">Coming soon</p>
          <p className="mt-1 font-sans text-xs text-muted">
            Ask Serve AI will be trained on your resident records, interaction history, and
            community data to surface proactive insights and answer natural-language questions.
          </p>
        </div>

        {/* Suggested prompts */}
        <div>
          <p className="mb-4 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
            Suggested Prompts
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled
                className="cursor-default rounded-lg border border-ivory-border bg-white px-4 py-3 text-left font-sans text-sm text-body opacity-60 shadow-sm transition-all"
              >
                <span className="mr-2 text-gold/60">→</span>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
