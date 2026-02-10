import React from 'react';
import { cn } from '@/utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple';
  removable?: boolean;
  onRemove?: () => void;
}

const variantStyles = {
  default: 'bg-bg-secondary text-text-secondary',
  blue: 'bg-accent-blue text-[#1A5276]',
  green: 'bg-accent-green text-[#2D6A2E]',
  yellow: 'bg-accent-yellow text-[#7D6608]',
  orange: 'bg-accent-orange text-[#8B4513]',
  red: 'bg-accent-red text-[#B71C1C]',
  purple: 'bg-accent-purple text-[#5B2C6F]',
};

export function Badge({ children, variant = 'default', removable, onRemove }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
      variantStyles[variant]
    )}>
      {children}
      {removable && (
        <button onClick={onRemove} className="ml-0.5 hover:opacity-70 transition-opacity" aria-label="Remove">
          ×
        </button>
      )}
    </span>
  );
}
