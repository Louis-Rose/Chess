import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateColor = 'purple' | 'blue' | 'emerald';

const RING: Record<EmptyStateColor, string> = {
  purple: 'bg-purple-600/10',
  blue: 'bg-blue-600/10',
  emerald: 'bg-emerald-600/10',
};

const ICON: Record<EmptyStateColor, string> = {
  purple: 'text-purple-400',
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
};

interface EmptyStateProps {
  icon: LucideIcon;
  color: EmptyStateColor;
  title: string;
  subtitle?: string;
  titleClassName?: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, color, title, subtitle, titleClassName = 'text-slate-200 text-lg whitespace-pre-line', children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className={`w-16 h-16 rounded-full ${RING[color]} flex items-center justify-center mb-4`}>
        <Icon className={`w-8 h-8 ${ICON[color]}`} />
      </div>
      <p className={titleClassName}>{title}</p>
      {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
      {children}
    </div>
  );
}
