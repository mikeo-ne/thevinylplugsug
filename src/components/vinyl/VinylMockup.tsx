import { useId } from 'react';
import { SleeveArt, sleeveById } from './sleeveArt';

export type VinylColorway = 'black' | 'splatter' | 'clear';

interface VinylMockupProps {
  /** Catalogue id: `lp_standard`, `lp_colored` or `seven_single`. */
  vinylTypeId: string;
  /** Catalogue id: `standard`, `gatefold` or `inner`. */
  sleeveId?: string;
  /** Slow rotation for product shots (CSS disables it for reduced-motion users). */
  spin?: boolean;
  className?: string;
  label?: string;
  /** Sleeve design id from `sleeveArt.ts` — printed on the jacket and the label. */
  art?: string;
}

/**
 * A product render of an actual pressing: jacket (or gatefold / printed inner)
 * with the record slid halfway out, drawn as one scalable SVG.
 *
 * Built from the same catalogue ids the quote uses, so what a client sees here
 * is exactly what they configured — compound colour, jacket style, 12" vs 7"
 * proportions and label size. Real sizes: a 12" record is 300mm against a
 * 312mm jacket; a 7" is 175mm with a proportionally much larger label.
 */
export function VinylMockup({
  vinylTypeId,
  sleeveId = 'standard',
  spin = false,
  className = '',
  label = '7H',
  art,
}: VinylMockupProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `mk-${raw}`;
  const design = art ? sleeveById(art) : null;

  const isSingle = vinylTypeId === 'seven_single';
  const colorway: VinylColorway =
    vinylTypeId === 'lp_colored' ? 'splatter' : vinylTypeId === 'lp_standard' ? 'black' : 'clear';
  const isGatefold = sleeveId === 'gatefold';
  const hasInner = sleeveId === 'inner';

  // geometry ------------------------------------------------------------------
  // A sleeve is square — 312mm against a 300mm record. Keeping it square means
  // a cover prints edge to edge with no crop, exactly as the plant imposes it.
  const jacketW = isSingle ? 148 : 196;
  const jacketH = jacketW;
  const jacketX = isSingle ? 46 : 38;
  const jacketY = 150 - jacketH / 2;
  // The record is slightly smaller than its sleeve — 300mm in a 312mm jacket,
  // 175mm in a 185mm 7" sleeve — so the disc never pokes past the board.
  const recordR = Math.round(jacketW * 0.48);
  const recordCx = jacketX + jacketW + (isSingle ? 34 : 26);
  const recordCy = isSingle ? 154 : 150;
  const labelR = isSingle ? 26 : 34;

  const body =
    colorway === 'splatter'
      ? `url(#${id}-splatter)`
      : colorway === 'clear'
        ? `url(#${id}-clear)`
        : `url(#${id}-black)`;

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox="0 0 384 300" className="h-full w-full">
        <defs>
          <radialGradient id={`${id}-black`} cx="38%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#33332f" />
            <stop offset="45%" stopColor="#161614" />
            <stop offset="100%" stopColor="#080807" />
          </radialGradient>
          <radialGradient id={`${id}-clear`} cx="36%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#59683f" />
            <stop offset="55%" stopColor="#243120" />
            <stop offset="100%" stopColor="#0f1a0d" />
          </radialGradient>
          <radialGradient id={`${id}-splatter`} cx="36%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#E4FF7A" />
            <stop offset="48%" stopColor="#CCFF00" />
            <stop offset="100%" stopColor="#7BA400" />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="36%" stopColor="#ffffff" stopOpacity="0.015" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.11" />
          </linearGradient>
          <linearGradient id={`${id}-jacket`} x1="0" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#26261f" />
            <stop offset="46%" stopColor="#171715" />
            <stop offset="100%" stopColor="#0c0c0b" />
          </linearGradient>
          <linearGradient id={`${id}-spine`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <circle cx={recordCx} cy={recordCy} r={recordR - 1} />
          </clipPath>
          <clipPath id={`${id}-label`}>
            <circle cx={recordCx} cy={recordCy} r={labelR} />
          </clipPath>
          <clipPath id={`${id}-jacket`}>
            <rect x={jacketX} y={jacketY} width={jacketW} height={jacketH} rx="3.5" />
          </clipPath>
        </defs>

        {/* cast shadow */}
        <ellipse cx={jacketX + jacketW / 2 + 34} cy={278} rx={jacketW * 0.7} ry="7" fill="#000" opacity="0.4" />

        {/* record, behind the front panel */}
        <g className={spin ? 'vinyl-spin' : ''} style={{ transformOrigin: `${recordCx}px ${recordCy}px` }}>
          <circle cx={recordCx} cy={recordCy} r={recordR} fill={body} />

          {colorway === 'splatter' && (
            <g clipPath={`url(#${id}-clip)`}>
              <g transform={`translate(${recordCx - 100} ${recordCy - 100}) scale(${recordR / 100})`}>
                {SPLATTER.map((dot, index) => (
                  <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.c} opacity={dot.o} />
                ))}
              </g>
            </g>
          )}

          {GROOVES.map((ratio) => (
            <circle
              key={ratio}
              cx={recordCx}
              cy={recordCy}
              r={recordR * ratio}
              fill="none"
              stroke={colorway === 'splatter' ? 'rgba(18,18,18,0.18)' : 'rgba(255,255,255,0.07)'}
              strokeWidth="0.5"
            />
          ))}

          <circle cx={recordCx} cy={recordCy} r={recordR} fill={`url(#${id}-sheen)`} />
          <circle
            cx={recordCx}
            cy={recordCy}
            r={recordR - 0.6}
            fill="none"
            stroke="rgba(255,255,255,0.13)"
            strokeWidth="0.8"
          />

          {/* centre label — the sleeve art printed at label size */}
          {design && (
          <g clipPath={`url(#${id}-label)`}>
            <svg
              x={recordCx - labelR}
              y={recordCy - labelR}
              width={labelR * 2}
              height={labelR * 2}
              viewBox="0 0 300 300"
              preserveAspectRatio="xMidYMid slice"
            >
              <SleeveArt uid={`${id}-lab`} design={design} compact />
            </svg>
          </g>
          )}
          {!design && <circle cx={recordCx} cy={recordCy} r={labelR} fill="#CCFF00" />}
          {!design && (
            <text
              x={recordCx}
              y={recordCy + (isSingle ? 5 : 6)}
              textAnchor="middle"
              fontFamily='"Space Grotesk", Inter, sans-serif'
              fontWeight="700"
              fontSize={isSingle ? 19 : 20}
              letterSpacing="-0.6"
              fill="#121212"
            >
              {label}
            </text>
          )}
          <circle
            cx={recordCx}
            cy={recordCy}
            r={labelR}
            fill="none"
            stroke="rgba(0,0,0,0.28)"
            strokeWidth="0.7"
          />
          <circle
            cx={recordCx}
            cy={recordCy}
            r={labelR - 3}
            fill="none"
            stroke="rgba(0,0,0,0.14)"
            strokeWidth="0.5"
          />
          <circle cx={recordCx} cy={recordCy} r="2.8" fill="#0b0b0a" />
          <circle cx={recordCx} cy={recordCy} r="1.2" fill="#2a2a27" />
        </g>

        {/* gatefold: the opened second panel peeking out behind */}
        {isGatefold && (
          <g>
            <rect
              x={jacketX - 20}
              y={jacketY + 10}
              width={jacketW}
              height={jacketH}
              rx="3"
              fill={`url(#${id}-jacket)`}
            />
            <rect
              x={jacketX - 20}
              y={jacketY + 10}
              width={jacketW}
              height={jacketH}
              rx="3"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
            />
          </g>
        )}

        {/* printed inner sleeve: white inner sleeve behind the jacket */}
        {hasInner && (
          <g>
            <rect
              x={jacketX - 12}
              y={jacketY + 8}
              width={jacketW - 10}
              height={jacketH - 12}
              rx="2"
              fill="#E9E9E0"
            />
            <circle
              cx={jacketX + jacketW / 2 - 12}
              cy={jacketY + jacketH / 2 + 4}
              r={isSingle ? 22 : 30}
              fill="none"
              stroke="rgba(18,18,18,0.2)"
              strokeWidth="1"
            />
            <circle
              cx={jacketX + jacketW / 2 - 12}
              cy={jacketY + jacketH / 2 + 4}
              r="4"
              fill="rgba(18,18,18,0.35)"
            />
          </g>
        )}

        {/* front panel */}
        <g>
          <rect x={jacketX} y={jacketY} width={jacketW} height={jacketH} rx="3.5" fill={`url(#${id}-jacket)`} />
          <rect
            x={jacketX}
            y={jacketY}
            width={jacketW}
            height={jacketH}
            rx="3.5"
            fill="none"
            stroke="rgba(255,255,255,0.13)"
          />
          <rect x={jacketX} y={jacketY} width="7" height={jacketH} fill={`url(#${id}-spine)`} />

          {/* sleeve artwork, printed full-bleed inside the jacket edge */}
          {design && (
          <g clipPath={`url(#${id}-jacket)`}>
            <svg
              x={jacketX}
              y={jacketY}
              width={jacketW}
              height={jacketH}
              viewBox="0 0 300 300"
              preserveAspectRatio="xMidYMid slice"
            >
              <SleeveArt uid={`${id}-art`} design={design} />
            </svg>
            {/* print sheen across the board */}
            <rect
              x={jacketX}
              y={jacketY}
              width={jacketW}
              height={jacketH}
              fill={`url(#${id}-sheen)`}
              opacity="0.5"
            />
          </g>
          )}
          {!design && (
            <>
              <rect
                x={jacketX + 12}
                y={jacketY + 12}
                width={jacketW - 24}
                height={jacketH - 24}
                rx="2"
                fill="none"
                stroke="rgba(204,255,0,0.16)"
              />
              <circle
                cx={jacketX + jacketW - 36}
                cy={jacketY + 46}
                r={isSingle ? 22 : 30}
                fill="none"
                stroke="rgba(204,255,0,0.26)"
                strokeWidth="1"
              />
              <text
                x={jacketX + 14}
                y={jacketY + 34}
                fontFamily="Inter, sans-serif"
                fontSize={isSingle ? '5' : '6.2'}
                letterSpacing="2.2"
                fill="rgba(244,244,239,0.55)"
              >
                7H MUSIC GROUP
              </text>
              <text
                x={jacketX + 14}
                y={jacketY + (isSingle ? 62 : 68)}
                fontFamily='"Space Grotesk", Inter, sans-serif'
                fontWeight="700"
                fontSize={isSingle ? 17 : 21}
                letterSpacing="-0.5"
                fill="#F4F4EF"
              >
                {isSingle ? '45' : 'LP'}
              </text>
              <text
                x={jacketX + 14}
                y={jacketY + (isSingle ? 78 : 86)}
                fontFamily="Inter, sans-serif"
                fontSize={isSingle ? 8 : 10}
                letterSpacing="1.3"
                fill="#CCFF00"
              >
                {isSingle ? 'RPM' : isGatefold ? 'GATEFOLD' : hasInner ? 'INNER' : 'SIDE A'}
              </text>
            </>
          )}
          <rect
            x={jacketX + 0.5}
            y={jacketY + 0.5}
            width={jacketW - 1}
            height={jacketH - 1}
            rx="3.5"
            fill="none"
            stroke="rgba(255,255,255,0.14)"
          />
        </g>
      </svg>
    </div>
  );
}

// Grooves as fractions of the record radius so 7" and 12" share one drawing.
const GROOVES = [0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4];

/**
 * Hand-placed splatter for the colour pressing. Data, not Math.random, so the
 * server and the browser always render the identical disc.
 */
const SPLATTER = [
  { x: 18, y: 34, r: 7, c: '#121212', o: 0.5 },
  { x: 62, y: 16, r: 4, c: '#121212', o: 0.38 },
  { x: 44, y: 66, r: 9, c: '#0f1200', o: 0.26 },
  { x: 96, y: 52, r: 5.5, c: '#121212', o: 0.46 },
  { x: 30, y: 100, r: 6, c: '#121212', o: 0.3 },
  { x: 110, y: 96, r: 3.5, c: '#121212', o: 0.42 },
  { x: 74, y: 128, r: 8, c: '#0f1200', o: 0.22 },
  { x: 132, y: 28, r: 4.5, c: '#121212', o: 0.4 },
  { x: 150, y: 84, r: 6.5, c: '#121212', o: 0.28 },
  { x: 128, y: 140, r: 5, c: '#121212', o: 0.34 },
  { x: 176, y: 46, r: 3.5, c: '#121212', o: 0.46 },
  { x: 16, y: 150, r: 4, c: '#121212', o: 0.28 },
  { x: 90, y: 178, r: 6, c: '#0f1200', o: 0.22 },
  { x: 160, y: 168, r: 4, c: '#121212', o: 0.28 },
];
