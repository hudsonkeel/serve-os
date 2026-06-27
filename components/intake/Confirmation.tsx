const items = [
  "Your request has been received.",
  "A Serve Care Advisor will be notified.",
  "We’ll follow up as soon as possible.",
];

export function Confirmation() {
  return (
    <div className="space-y-6 py-4">
      {/* Check icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/12">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="h-6 w-6"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5 10.5L8.5 14L15 7"
            stroke="#C9A96E"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div>
        <h2 className="font-serif text-3xl font-light text-navy">Thank you.</h2>
        <p className="mt-1 font-serif text-lg font-light italic text-gold">
          We&rsquo;ve received your request.
        </p>
      </div>

      <p className="font-sans text-sm leading-relaxed text-body">
        A Serve Care Advisor will review your information and follow up shortly.
      </p>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 font-sans text-sm text-body">
            <span className="mt-0.5 h-4 w-4 shrink-0 text-gold">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
