import { useId } from 'react';

interface VinylDiscProps {
  size?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  spinning?: boolean;
  accent?: string;
  variant?: 'colored' | 'standard' | 'seven';
}

/**
 * Responsive, pure-SVG vinyl record. Scales to its container so the same
 * component works as a hero centrepiece and as a 90px quote-panel swatch.
 */
export function VinylDisc({
  size = 420,
  label = '7H',
  sublabel = 'MUSIC GROUP',
  className = '',
  spinning = true,
  accent = '#CCFF00',
  variant = 'colored',
}: VinylDiscProps) {
  const grooves = Array.from({ length: 12 }, (_, index) => 34 + index * 4.9);
  const isSeven = variant === 'seven';
  const labelRadius = isSeven ? 30 : 32;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `vinyl-${variant}-${uid}`;

  return (
    <div
      className={`relative aspect-square ${className}`}
      style={{ width: size, maxWidth: '100%' }}
      aria-hidden="true"
    >
      <div className="absolute inset-[6%] rounded-full bg-lime/10 blur-3xl" />
      <svg
        viewBox="0 0 200 200"
        className={`relative block h-full w-full ${spinning ? 'animate-spin-slow' : ''}`}
        style={{ filter: 'drop-shadow(0 24px 40px rgba(0,0,0,0.65))' }}
      >
        <defs>
          <radialGradient id={`${id}-body`} cx="38%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#2b2b28" />
            <stop offset="42%" stopColor="#121211" />
            <stop offset="78%" stopColor="#0a0a09" />
            <stop offset="100%" stopColor="#1c1c1a" />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="34%" stopColor="#ffffff" stopOpacity="0.01" />
            <stop offset="66%" stopColor="#ffffff" stopOpacity="0.015" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="32%" cy="26%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="100" r="98" fill={`url(#${id}-body)`} />
        <circle cx="100" cy="100" r="97" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.6" />

        {grooves.map((radius) => (
          <circle
            key={radius}
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.055)"
            strokeWidth="0.35"
          />
        ))}

        <circle cx="100" cy="100" r="97" fill={`url(#${id}-sheen)`} />
        <circle cx="100" cy="100" r="97" fill={`url(#${id}-glow)`} />

        <circle
          cx="100"
          cy="100"
          r={labelRadius}
          fill={accent}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="0.5"
        />
        <circle
          cx="100"
          cy="100"
          r={labelRadius - 4}
          fill="none"
          stroke="rgba(0,0,0,0.16)"
          strokeWidth="0.5"
        />

        <text
          x="100"
          y={sublabel ? 98 : 104}
          textAnchor="middle"
          fontFamily='"Space Grotesk", Inter, sans-serif'
          fontWeight="700"
          fontSize={isSeven ? '17' : '19'}
          letterSpacing="-0.6"
          fill="#121212"
        >
          {label}
        </text>
        {sublabel && (
          <text
            x="100"
            y="106"
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
            fontWeight="600"
            fontSize="4"
            letterSpacing="1.5"
            fill="rgba(18,18,18,0.66)"
          >
            {sublabel}
          </text>
        )}

        <circle cx="100" cy="100" r="3" fill="#121212" />
        <circle cx="100" cy="100" r="3" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" />
      </svg>
    </div>
  );
}
