/**
 * Sample sleeve artwork for the pressing catalogue.
 *
 * These are the real covers from the 7H catalogue — supplied as image files and
 * served from `public/artwork/samples/`. The same artwork is printed on the
 * jacket and cropped onto the centre label, so a sample always shows what the
 * plant will actually press.
 *
 * To add a release: drop a square image in `public/artwork/samples/` and add one
 * object below. Nothing else needs to change — the hero, the sample shelf and
 * the label crop all read from this list.
 */

export interface SleeveDesign {
  id: string;
  /** Cover title, shown on the shelf and used as the image alt text. */
  title: string;
  /** Credit line, when the release has one we can print. */
  artist?: string;
  /** One-line description of the artwork. */
  note: string;
  /** Square cover image, relative to the site root. */
  image: string;
  /** Text colour for anything drawn over the cover. */
  ink?: string;
}

export const SLEEVES: SleeveDesign[] = [
  {
    id: 'pearl-of-africa',
    title: 'Pearl of Africa',
    note: 'Newsprint collage — map, elephant, crested crane',
    image: '/artwork/samples/pearl-of-africa.jpg',
    ink: '#F4F4EF',
  },
  {
    id: 'with-the-gs',
    title: 'With the Gs',
    note: 'Polaroid-style portrait, hand-brushed mask',
    image: '/artwork/samples/with-the-gs.jpg',
    ink: '#F4F4EF',
  },
  {
    id: 'made-in-entebbe',
    title: 'Made in Entebbe',
    note: 'Block green type on hand-scuffed black',
    image: '/artwork/samples/made-in-entebbe.jpg',
    ink: '#5FBF4A',
  },
  {
    id: 'proof-of-life',
    title: 'Proof of Life',
    note: 'Boda ride through Kampala traffic',
    image: '/artwork/samples/proof-of-life.jpg',
    ink: '#F4F4EF',
  },
  {
    id: 'badman',
    title: 'Badman',
    note: 'Green-room session, redacted eyes',
    image: '/artwork/samples/badman.jpg',
    ink: '#F4F4EF',
  },
];

export const sleeveById = (id?: string) =>
  SLEEVES.find((sleeve) => sleeve.id === id) ?? SLEEVES[0];

interface ArtProps {
  /** Unique prefix, kept so the SVG stays cache-safe across mockups. */
  uid?: string;
  design: SleeveDesign;
  /** Draw in the sleeve's own frame or as a cropped centre label. */
  compact?: boolean;
}

/**
 * The artwork body. Render inside an `<svg>` (or a nested `<svg>` for a label)
 * with a 300×300 viewBox. The cover is drawn edge to edge and cropped by the
 * caller's clip path, so the jacket and the label are cut from the same image.
 */
export function SleeveArt({ design }: ArtProps) {
  return (
    <>
      <rect width="300" height="300" fill="#0D0D0C" />
      <image
        href={design.image}
        x="0"
        y="0"
        width="300"
        height="300"
        preserveAspectRatio="xMidYMid slice"
      />
    </>
  );
}
