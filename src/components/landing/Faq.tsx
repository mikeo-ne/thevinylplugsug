import { useState } from 'react';
import { Reveal } from '../ui/Reveal';
import { Icon } from '../ui/Icon';
import { whatsappUrl } from '../../lib/contact';

const faqs = [
  {
    q: 'What does the 25% management fee actually cover?',
    a: 'Everything between you and the press: mastering review, artwork pre-flight for CMYK and bleed, plant negotiation and scheduling, proof handling, freight booking, customs brokerage and last-mile delivery in Kampala. It is calculated on the landed factory cost, not on the retail value.',
  },
  {
    q: 'When do I pay, and how much?',
    a: 'A 50% deposit starts production once the plant proof is approved. The balance is due when the records are packed and cleared for shipping. Deposits can be paid by MTN MoMo, Airtel Money, or international card / SWIFT transfer.',
  },
  {
    q: 'What files do you need from me?',
    a: '24-bit WAV masters (or a lossless download link) and print-ready artwork as a CMYK PDF with 3mm bleed, 300dpi, fonts outlined. We run a technical check and send back a report within 24 hours — artwork resubmission is free.',
  },
  {
    q: 'Is shipping to Uganda included?',
    a: 'Yes. Freight to Kampala and customs brokerage are included in the quoted turnkey price. International tour-city delivery is a flat quoted add-on determined at checkout, based on the city and delivery window.',
  },
  {
    q: 'What happens if the pressing is faulty?',
    a: 'Every run is compared against the approved proof. Warps, off-centre pressings, label misprints and print deviations outside industry tolerance are re-pressed at the plant\u2019s cost. That is the practical meaning of "zero risk".',
  },
  {
    q: 'How long does it really take?',
    a: 'Allow 7–11 weeks after proof approval, depending on format and plant queue. Test pressings add 2–3 weeks for colour and gatefold jobs. We share a live order status in the admin console and by WhatsApp.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 py-20 lg:py-28">
      <div className="container-x grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <div className="eyebrow eyebrow-dot mb-4">Questions</div>
          <h2 className="display max-w-xs text-balance text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold">
            Straight answers, <span className="text-lime">no vinyl-speak</span>.
          </h2>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            Still unsure about spec sheets or freight? Message the client desk — we answer within
            business hours, EAT.
          </p>
          <a
            href={whatsappUrl()}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost mt-7"
          >
            <Icon name="whatsapp" size={16} filled />
            Ask on WhatsApp
          </a>
        </Reveal>

        <Reveal delay={80}>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {faqs.map((faq, index) => {
              const isOpen = open === index;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start justify-between gap-6 py-5 text-left transition-colors hover:text-lime"
                  >
                    <span className={`text-[14.5px] font-medium leading-snug ${isOpen ? 'text-lime' : 'text-bone'}`}>
                      {faq.q}
                    </span>
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
                        isOpen ? 'rotate-180 border-lime/40 text-lime' : 'border-white/15 text-muted'
                      }`}
                    >
                      <Icon name="chevron-down" size={13} />
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isOpen ? 'grid-rows-[1fr] pb-5 opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <p className="overflow-hidden pr-10 text-[13px] leading-relaxed text-muted">{faq.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
