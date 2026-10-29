const items = [
  '140g black vinyl',
  'Splatter & colour pressings',
  'Gatefold sleeves',
  'Test press approval',
  'MTN MoMo & Airtel Money',
  'Mobineko · Taiwan',
  'Green Lakes · Lithuania',
  'GZ Media · Czechia',
  'Dr. Dub lathe cuts',
  'Freight to Kampala',
  'Tour-city delivery',
  'Mastering review',
];

export function Marquee() {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-[#0D0D0C] py-4">
      <div className="mask-fade-x flex">
        <div className="flex w-max animate-marquee items-center gap-8 pr-8">
          {row.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="flex shrink-0 items-center gap-8 text-[11px] font-medium uppercase tracking-[0.24em] text-muted"
            >
              {item}
              <span className="h-1 w-1 rounded-full bg-lime/60" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
