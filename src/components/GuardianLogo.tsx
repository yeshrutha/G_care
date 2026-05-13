import React from 'react';

export const GuardianLogo: React.FC<{ className?: string; white?: boolean }> = ({ className = '', white }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
      <path d="M20 3C12 3 5 10 5 18c0 14 15 20 15 20s15-6 15-20C35 10 28 3 20 3z"
        fill={white ? '#fff' : '#00B4A6'} stroke={white ? 'rgba(255,255,255,0.3)' : '#0F2D5C'} strokeWidth="1.5" />
      <path d="M10 20h6l2-6 4 12 3-8h5" fill="none" stroke={white ? '#00B4A6' : '#fff'}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span className={`font-display text-xl ${white ? 'text-primary-foreground' : 'text-navy'}`}>
      G Care
    </span>
  </div>
);
