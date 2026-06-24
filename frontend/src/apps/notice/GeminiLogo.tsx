// The Gemini "spark" mark: a four-pointed star with Google's blue-purple-red
// gradient. Inline SVG so it needs no asset pipeline.
export function GeminiLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Gemini" role="img">
      <defs>
        <linearGradient id="notice-gemini-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#notice-gemini-grad)"
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
      />
    </svg>
  );
}
