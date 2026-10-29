type IconName =
  | 'arrow-right'
  | 'arrow-up-right'
  | 'check'
  | 'check-circle'
  | 'x'
  | 'upload'
  | 'file-audio'
  | 'file-image'
  | 'plus'
  | 'minus'
  | 'spinner'
  | 'whatsapp'
  | 'mail'
  | 'hash'
  | 'factory'
  | 'bolt'
  | 'copy'
  | 'refresh'
  | 'logout'
  | 'chevron-down'
  | 'chevron-right'
  | 'shield'
  | 'truck'
  | 'globe'
  | 'sparkle'
  | 'lock'
  | 'external'
  | 'alert'
  | 'trash'
  | 'search'
  | 'music'
  | 'printer'
  | 'eye'
  | 'menu';

const paths: Record<IconName, React.ReactNode> = {
  'arrow-right': <path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5" />,
  'arrow-up-right': <path d="M7 17 17 7m0 0h-7m7 0v7" />,
  check: <path d="m4.5 12.5 4.5 4.5L19.5 6.5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.2 2.7 2.6L16.2 9.4" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  upload: (
    <>
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3" />
    </>
  ),
  'file-audio': (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9.5 16.5v-2l3-1v2.5" />
      <circle cx="8.6" cy="16.6" r="1" />
      <circle cx="11.6" cy="16.1" r="1" />
    </>
  ),
  'file-image': (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <circle cx="9.5" cy="12.5" r="1.2" />
      <path d="m8 18 3.2-3.4 2.2 2 1.8-1.8L18 18" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  whatsapp: (
    <path d="M12.04 3a8.9 8.9 0 0 0-7.6 13.5L3 21l4.65-1.4A8.9 8.9 0 1 0 12.04 3Zm4.6 12.5c-.2.55-1.15 1.07-1.6 1.12-.42.05-.95.06-1.53-.1a9.7 9.7 0 0 1-3.6-2.3 10.6 10.6 0 0 1-1.93-2.8c-.2-.5-.2-1.02.03-1.45.18-.34.55-.82.86-.9.2-.06.42-.05.6-.04.17 0 .34.15.42.34l.7 1.6c.07.17.03.36-.07.5l-.4.5c-.1.13-.13.28-.05.44.28.55.7 1.05 1.2 1.48.4.35.87.63 1.38.83.17.07.33.03.45-.1l.5-.55c.13-.14.3-.18.47-.1l1.55.75c.18.09.23.23.2.43Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m4 8 6.6 4.6a2.4 2.4 0 0 0 2.8 0L20 8" />
    </>
  ),
  hash: <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />,
  factory: (
    <>
      <path d="M3 20V10l5 3V10l5 3V10l5 3v7z" />
      <path d="M3 20h18" />
      <path d="M7 20v-3.5M12 20v-3.5M17 20v-3.5" />
      <path d="M18 10V4h3v6" />
    </>
  ),
  bolt: <path d="M13 3 5 14h5l-1 7 8-11h-5z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.4" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.6 6.3" />
      <path d="M20 5v6h-6" />
    </>
  ),
  logout: (
    <>
      <path d="M15 5.5V4.5A2.5 2.5 0 0 0 12.5 2h-6A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h6a2.5 2.5 0 0 0 2.5-2.5v-1" />
      <path d="M10 12h11m0 0-3.5-3.5M21 12l-3.5 3.5" />
    </>
  ),
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  shield: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6z" />
      <path d="m8.8 12 2.3 2.3 4.1-4.3" />
    </>
  ),
  truck: (
    <>
      <path d="M2 6.5h11v10H2z" />
      <path d="M13 10h4.5l3.5 3.5v3H13z" />
      <circle cx="6.5" cy="18.5" r="1.8" />
      <circle cx="17" cy="18.5" r="1.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" />
      <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  external: (
    <>
      <path d="M13 4h7v7" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4.5A2.5 2.5 0 0 1 15.5 21h-9A2.5 2.5 0 0 1 4 18.5v-9A2.5 2.5 0 0 1 6.5 7H11" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 19.5H3z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6 7l1 12a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 19l1-12" />
      <path d="M10 11v5.5M14 11v5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6.5l11-2.5v11" />
      <circle cx="6.5" cy="18" r="2.7" />
      <circle cx="17.5" cy="15" r="2.7" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="3.5" y="8" width="17" height="8.5" rx="2" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}

export function Icon({ name, size = 20, strokeWidth = 1.6, filled = false, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export type { IconName };
