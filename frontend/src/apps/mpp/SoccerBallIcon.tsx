import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

// lucide-react 0.561 ships no soccer ball, so this hand-rolled icon matches the
// lucide look (24x24, stroke=currentColor, round joins) for the MPP football.
export const SoccerBall = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, strokeWidth = 2, className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8l3.8 2.8-1.45 4.8h-4.7L8.2 10.8z" />
      <path d="M12 8V2.5" />
      <path d="M15.8 10.8l4.7-1.6" />
      <path d="M14.35 15.6l2.9 3.9" />
      <path d="M9.65 15.6l-2.9 3.9" />
      <path d="M8.2 10.8l-4.7-1.6" />
    </svg>
  ),
);
SoccerBall.displayName = 'SoccerBall';
