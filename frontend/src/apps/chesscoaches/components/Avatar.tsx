const sizes = {
  xs: 'w-4 h-4 text-[8px]',
  sm: 'w-5 h-5 text-xs',
  'sm+': 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-xs',
  'md+': 'w-9 h-9 text-sm',
  lg: 'w-10 h-10 text-sm',
  xl: 'w-14 h-14 text-xl',
  '2xl': 'w-16 h-16 text-2xl',
} as const;

type AvatarSize = keyof typeof sizes;

interface AvatarProps {
  name: string;
  picture?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, picture, size = 'lg', className = '' }: AvatarProps) {
  const sz = sizes[size];
  if (picture) return <img src={picture} alt="" className={`${sz} rounded-full ${className}`} />;
  return (
    <div className={`${sz} rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold flex-shrink-0 ${className}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
