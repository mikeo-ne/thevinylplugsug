/**
 * Sleeve artwork for the sample pressings.
 *
 * These are ORIGINAL designs drawn in the visual language of the classic East
 * African / Ugandan pressing era — sunburst labels, ochre and oxide palettes,
 * cut-out type, adinkra-inspired geometry — rather than photographs of real
 * records. Historic sleeves (Afrigo, Lutaaya, Wamala and the Kadongo Kamu
 * catalogue) are copyrighted, so they can only go on the site with permission
 * from the rights holders. When you have that, drop the scans in `public/artwork/`
 * and switch the sample's `art` to the image path — see `artworkFor()` below.
 *
 * Every design is pure SVG so it stays sharp on a 40px centre label and on a
 * 1200px product shot, and it renders identically on the server and the client.
 */

export interface SleeveDesign {
  id: string;
  title: string;
  artist: string;
  era: string;
  /** Text colour used on the sleeve, for contrast on the palette. */
  ink: string;
  /** Two-line caption for the sleeve shelf. */
  note: string;
}

export const SLEEVES: SleeveDesign[] = [
  {
    id: 'nile-beat',
    title: 'Nile Beat',
    artist: 'Kampala Horns',
    era: '1974 · sunburst sleeve',
    ink: '#F6E7C8',
    note: 'Ochre sunburst, cut-out horn section',
  },
  {
    id: 'amaka',
    title: 'Amaka',
    artist: 'Lakeside Strings',
    era: '1978 · cloth-print sleeve',
    ink: '#F4E4B8',
    note: 'Adinkra-inspired repeat, oxide ground',
  },
  {
    id: 'ekitibwa',
    title: 'Ekitibwa',
    artist: 'Masaka Roads',
    era: '1971 · Kadongo Kamu',
    ink: '#F0D9B5',
    note: 'Hand-lettered stack on terracotta',
  },
  {
    id: 'emizannyo',
    title: 'Emizannyo',
    artist: 'The Kampala Seven',
    era: '1981 · duotone sleeve',
    ink: '#EAF7E4',
    note: 'High-contrast duotone, night-club type',
  },
  {
    id: 'nalubaale',
    title: 'Nalubaale',
    artist: 'Victoria Sessions',
    era: '1969 · wave sleeve',
    ink: '#EAF6F2',
    note: 'Lake Victoria ripples, deep teal',
  },
  {
    id: 'nsenene',
    title: 'Nsenene',
    artist: 'Ente Club',
    era: '1976 · print-block sleeve',
    ink: '#FBE9C9',
    note: 'Block-printed stripe and roundel',
  },
];

export const sleeveById = (id?: string) =>
  SLEEVES.find((sleeve) => sleeve.id === id) ?? SLEEVES[0];

interface ArtProps {
  /** Unique prefix so gradients never collide when several sleeves are on screen. */
  uid: string;
  design: SleeveDesign;
  /** Draw in the sleeve's own frame (300×300) or as a cropped centre label. */
  compact?: boolean;
}

/**
 * The artwork body. Render inside an `<svg>` (or a nested `<svg>` for a label)
 * with a 300×300 viewBox.
 */
export function SleeveArt({ uid, design, compact = false }: ArtProps) {
  switch (design.id) {
    case 'amaka':
      return <AmakaArt uid={uid} design={design} compact={compact} />;
    case 'ekitibwa':
      return <EkitibwaArt uid={uid} design={design} compact={compact} />;
    case 'emizannyo':
      return <EmizannyoArt uid={uid} design={design} compact={compact} />;
    case 'nalubaale':
      return <NalubaaleArt uid={uid} design={design} compact={compact} />;
    case 'nsenene':
      return <NseneneArt uid={uid} design={design} compact={compact} />;
    default:
      return <NileBeatArt uid={uid} design={design} compact={compact} />;
  }
}

const type = { fontFamily: '"Space Grotesk", Inter, sans-serif' };
const mono = { fontFamily: 'Inter, sans-serif' };

/* ---------------------------------------------------------------- 1974 ---- */
function NileBeatArt({ uid, design, compact }: ArtProps) {
  const rays = Array.from({ length: 18 }, (_, index) => index);
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-nb`} cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="#F2B33D" />
          <stop offset="52%" stopColor="#B4551C" />
          <stop offset="100%" stopColor="#3E1B0C" />
        </radialGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${uid}-nb)`} />
      <g opacity="0.42" fill="#3E1B0C">
        {rays.map((ray) => (
          <path
            key={ray}
            d={`M150 150 L${150 + 210 * Math.cos((ray * Math.PI) / 9)} ${150 + 210 * Math.sin((ray * Math.PI) / 9)} L${150 + 210 * Math.cos((ray * Math.PI) / 9 + 0.09)} ${150 + 210 * Math.sin((ray * Math.PI) / 9 + 0.09)} Z`}
          />
        ))}
      </g>
      <circle cx="150" cy="150" r="74" fill="#F6E7C8" opacity="0.16" />
      <circle cx="150" cy="150" r="74" fill="none" stroke="#F6E7C8" strokeWidth="1.2" opacity="0.7" />
      {/* horn section, cut-out style */}
      <g stroke={design.ink} strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.92">
        <path d="M104 196c0-26 12-44 12-64" />
        <path d="M126 206c0-30 10-48 10-70" />
        <path d="M148 208c0-32 8-50 8-72" />
      </g>
      <g fill="#F6E7C8">
        <circle cx="104" cy="204" r="9" />
        <circle cx="126" cy="206" r="9" />
        <circle cx="148" cy="208" r="9" />
      </g>
      <text x="150" y="112" textAnchor="middle" {...type} fontWeight="700" fontSize="34" letterSpacing="-1.2" fill={design.ink}>
        NILE
      </text>
      <text x="150" y="140" textAnchor="middle" {...type} fontWeight="700" fontSize="34" letterSpacing="-1.2" fill={design.ink}>
        BEAT
      </text>
      {!compact && (
        <>
          <text x="150" y="163" textAnchor="middle" {...mono} fontSize="9" letterSpacing="4" fill={design.ink} opacity="0.85">
            KAMPALA HORNS
          </text>
          <text x="20" y="284" {...mono} fontSize="7.5" letterSpacing="2.4" fill={design.ink} opacity="0.7">
            7H SERIES · 1974
          </text>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 1978 ---- */
function AmakaArt({ uid, design, compact }: ArtProps) {
  const motifs = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const x = 30 + col * 60;
      const y = 30 + row * 60;
      motifs.push(
        <g key={`${row}-${col}`} transform={`translate(${x} ${y})`} opacity={(row + col) % 2 === 0 ? 0.95 : 0.5}>
          <path d="M0 0 L14 14 L0 28 L-14 14 Z" fill="none" stroke="#E3A81F" strokeWidth="1.6" />
          <circle cx="0" cy="14" r="3" fill="#E3A81F" />
          <path d="M-9 4 h18" stroke="#E3A81F" strokeWidth="1.2" opacity="0.7" />
        </g>,
      );
    }
  }
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-am`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#123A2C" />
          <stop offset="60%" stopColor="#0C2A20" />
          <stop offset="100%" stopColor="#071B14" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${uid}-am)`} />
      <g>{motifs}</g>
      <rect x="0" y="0" width="300" height="300" fill="#0C2A20" opacity="0.72" />
      <circle cx="150" cy="142" r="62" fill="none" stroke="#E3A81F" strokeWidth="2" />
      <circle cx="150" cy="142" r="52" fill="none" stroke="#E3A81F" strokeWidth="0.8" opacity="0.7" />
      <text x="150" y="150" textAnchor="middle" {...type} fontWeight="700" fontSize="30" letterSpacing="2" fill={design.ink}>
        AMAKA
      </text>
      {!compact && (
        <>
          <text x="150" y="172" textAnchor="middle" {...mono} fontSize="8" letterSpacing="3.4" fill="#E3A81F">
            LAKESIDE STRINGS
          </text>
          <path d="M30 236 h240" stroke="#E3A81F" strokeWidth="0.8" opacity="0.6" />
          <text x="30" y="254" {...mono} fontSize="7" letterSpacing="2.2" fill={design.ink} opacity="0.75">
            CLOTH-PRINT SLEEVE · 7H SERIES
          </text>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 1971 ---- */
function EkitibwaArt({ uid, design, compact }: ArtProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-ek`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#C9673A" />
          <stop offset="55%" stopColor="#8E3B1E" />
          <stop offset="100%" stopColor="#3F1608" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${uid}-ek)`} />
      <g fill="#F0D9B5" opacity="0.14">
        <circle cx="60" cy="70" r="46" />
        <circle cx="250" cy="210" r="70" />
      </g>
      <rect x="22" y="22" width="256" height="256" fill="none" stroke="#F0D9B5" strokeWidth="1" opacity="0.5" />
      <rect x="30" y="30" width="240" height="240" fill="none" stroke="#F0D9B5" strokeWidth="0.5" opacity="0.3" />
      <text x="150" y="126" textAnchor="middle" {...type} fontWeight="700" fontSize="42" letterSpacing="-1.6" fill={design.ink}>
        EKI
      </text>
      <text x="150" y="166" textAnchor="middle" {...type} fontWeight="700" fontSize="42" letterSpacing="-1.6" fill={design.ink}>
        TIBWA
      </text>
      <path d="M96 184 h108" stroke="#F0D9B5" strokeWidth="1.4" opacity="0.8" />
      {!compact && (
        <>
          <text x="150" y="206" textAnchor="middle" {...mono} fontSize="9" letterSpacing="3.6" fill={design.ink}>
            MASAKA ROADS
          </text>
          <text x="150" y="248" textAnchor="middle" {...mono} fontSize="7" letterSpacing="2.4" fill={design.ink} opacity="0.7">
            KADONGO KAMU · SIDE A
          </text>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 1981 ---- */
function EmizannyoArt({ uid, design, compact }: ArtProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-em`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0B2B33" />
          <stop offset="100%" stopColor="#04161B" />
        </linearGradient>
        <linearGradient id={`${uid}-em-figure`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22E0C8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0B7C86" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${uid}-em)`} />
      <circle cx="196" cy="104" r="58" fill="#22E0C8" opacity="0.16" />
      <circle cx="196" cy="104" r="58" fill="none" stroke="#22E0C8" strokeWidth="0.8" opacity="0.5" />
      {/* abstract duotone figure */}
      <path
        d="M104 300c0-58 16-92 44-116 12-10 16-26 8-38-8-13-4-28 10-33 15-5 30 4 32 19 2 13-7 23-6 34 1 12 12 18 24 24 20 10 30 30 30 52v58Z"
        fill={`url(#${uid}-em-figure)`}
      />
      <rect x="20" y="196" width="120" height="2" fill="#22E0C8" opacity="0.7" />
      <text x="22" y="72" {...type} fontWeight="700" fontSize="30" letterSpacing="-1" fill={design.ink}>
        EMIZ
      </text>
      <text x="22" y="102" {...type} fontWeight="700" fontSize="30" letterSpacing="-1" fill="#22E0C8">
        ANYO
      </text>
      {!compact && (
        <>
          <text x="22" y="124" {...mono} fontSize="8" letterSpacing="3.2" fill={design.ink} opacity="0.8">
            THE KAMPALA SEVEN
          </text>
          <text x="22" y="230" {...mono} fontSize="7" letterSpacing="2.2" fill={design.ink} opacity="0.65">
            7H SERIES · 1981 · 33⅓
          </text>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 1969 ---- */
function NalubaaleArt({ uid, design, compact }: ArtProps) {
  const rings = [26, 42, 58, 74, 90, 106, 122];
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-na`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B3B3A" />
          <stop offset="100%" stopColor="#041A1A" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${uid}-na)`} />
      {rings.map((radius, index) => (
        <circle
          key={radius}
          cx="150"
          cy="214"
          r={radius}
          fill="none"
          stroke="#9FE0D6"
          strokeWidth={index % 2 === 0 ? 1.4 : 0.7}
          opacity={0.5 - index * 0.045}
        />
      ))}
      <circle cx="150" cy="118" r="30" fill="#F2E2B8" opacity="0.9" />
      <path d="M120 214 h60" stroke="#F2E2B8" strokeWidth="1" opacity="0.5" />
      <text x="150" y="72" textAnchor="middle" {...type} fontWeight="700" fontSize="27" letterSpacing="1.2" fill={design.ink}>
        NALUBAALE
      </text>
      {!compact && (
        <>
          <text x="150" y="92" textAnchor="middle" {...mono} fontSize="7.5" letterSpacing="3.4" fill="#9FE0D6">
            VICTORIA SESSIONS
          </text>
          <text x="150" y="286" textAnchor="middle" {...mono} fontSize="7" letterSpacing="2.2" fill={design.ink} opacity="0.7">
            7H SERIES · 1969
          </text>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 1976 ---- */
function NseneneArt({ uid, design, compact }: ArtProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-ns`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2B1F4A" />
          <stop offset="100%" stopColor="#120B24" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${uid}-ns)`} />
      <g stroke="#E9A13B" strokeWidth="3" opacity="0.85">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <path key={index} d={`M0 ${58 + index * 36} H300`} opacity={0.25 + index * 0.05} />
        ))}
      </g>
      <circle cx="150" cy="150" r="64" fill="#120B24" stroke="#E9A13B" strokeWidth="2" />
      <circle cx="150" cy="150" r="56" fill="none" stroke="#E9A13B" strokeWidth="0.6" opacity="0.6" />
      <text x="150" y="144" textAnchor="middle" {...type} fontWeight="700" fontSize="24" letterSpacing="0.6" fill={design.ink}>
        NSENENE
      </text>
      <text x="150" y="164" textAnchor="middle" {...mono} fontSize="6.5" letterSpacing="2.6" fill="#E9A13B">
        ENTE CLUB
      </text>
      {!compact && (
        <>
          <text x="20" y="284" {...mono} fontSize="7" letterSpacing="2.2" fill={design.ink} opacity="0.7">
            7H SERIES · 1976 · BLOCK PRINT
          </text>
          <circle cx="262" cy="40" r="12" fill="#E9A13B" opacity="0.8" />
        </>
      )}
    </>
  );
}
