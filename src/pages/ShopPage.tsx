import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { usd } from '../lib/format';
import { useRates } from '../store/RatesContext';
import { fallbackFxRate } from '../lib/pricing';
import { whatsappUrl } from '../lib/contact';
import { useBag } from '../store/BagContext';
import { useToast } from '../components/ui/Toast';
import { Icon } from '../components/ui/Icon';
import { Reveal } from '../components/ui/Reveal';
import { VinylMockup } from '../components/vinyl/VinylMockup';
import type { ShopConfig, ShopDeliveryOption, ShopRelease } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9][0-9\s()-]{6,19}$/;

const paymentLogos: Record<string, { label: string; className: string }> = {
  mtn_momo: { label: 'MTN', className: 'bg-[#FFCC00] text-black' },
  airtel_money: { label: 'airtel', className: 'bg-[#E40000] text-white' },
  card_bank: { label: 'VISA', className: 'bg-[#1A1F71] text-white' },
};

type Errors = Record<string, string>;

/**
 * The record shop.
 *
 * One page, no account: pick the records, say where they go, pay the way you
 * already pay for everything else in Kampala. Stock shown here is live, and the
 * server refuses an oversell even if this page has gone stale.
 */
export function ShopPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { notify } = useToast();
  const bag = useBag();

  const [shop, setShop] = useState<ShopConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deliveryId, setDeliveryId] = useState('kampala');
  const [payer, setPayer] = useState({ name: '', email: '', phone: '', address: '', city: 'Kampala', country: 'Uganda', notes: '' });
  const [method, setMethod] = useState('mtn_momo');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .shop()
      .then((data) => {
        if (cancelled) return;
        setShop(data);
        setMethod(data.paymentMethods[0]?.id ?? 'mtn_momo');
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // A shelf card on the landing page can point at one record: /shop?record=badman
  const wanted = params.get('record');
  useEffect(() => {
    if (!shop || !wanted) return;
    const target = document.getElementById(wanted);
    if (!target) return;
    const timer = window.setTimeout(
      () => target.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [shop, wanted]);

  const delivery: ShopDeliveryOption | undefined = useMemo(
    () => shop?.delivery.find((option) => option.id === deliveryId),
    [shop, deliveryId],
  );

  const detailed = shop ? bag.detailed(shop.releases) : [];
  const subtotal = shop ? bag.subtotal(shop.releases) : 0;
  // Nothing in the bag, nothing to ship — don't quote a delivery fee for air.
  const shipping = detailed.length > 0 ? delivery?.priceUsd ?? 0 : 0;
  const total = subtotal + shipping;
  const fxRate = shop?.fxRate ?? fallbackFxRate;
  const { note, setDestination } = useRates();
  // Shelf prices and the bag follow the switcher; a Uganda courier locks UGX.
  const shelfNote = (priceUsd: number) => note(priceUsd);
  const cartNote = note(total);

  const addToBag = (release: ShopRelease) => {
    const limit = Math.min(release.maxPerOrder, release.stock);
    if (limit < 1) {
      notify(`${release.title} is sold out — join the restock list on WhatsApp.`, 'error');
      return;
    }
    if (bag.quantityOf(release.id) + 1 > limit) {
      notify(
        release.stock <= release.maxPerOrder
          ? `Only ${release.stock} left of ${release.title}.`
          : `We cap each record at ${release.maxPerOrder} copies per order.`,
        'error',
      );
      return;
    }
    bag.add(release.id);
    notify(`${release.title} added to your bag.`, 'success');
  };

  const setQuantity = (release: ShopRelease, quantity: number) => {
    const limit = Math.min(release.maxPerOrder, release.stock);
    bag.setQuantity(release.id, Math.min(quantity, limit));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (bag.lines.length === 0) next.bag = 'Add at least one record.';
    if (payer.name.trim().length < 2) next.name = 'Tell us who the order is for.';
    if (!EMAIL_RE.test(payer.email.trim())) next.email = 'Enter a valid email — the receipt goes there.';
    if (!PHONE_RE.test(payer.phone.trim())) next.phone = 'Include your country code, e.g. +256 772 000 000.';
    if (delivery?.requiresAddress && payer.address.trim().length < 6) next.address = 'Add the full delivery address.';
    if (delivery?.requiresAddress && payer.city.trim().length < 2) next.city = 'Add the town or city.';
    if (delivery?.zone === 'international' && payer.country.trim().length < 2) next.country = 'Add the country.';
    return next;
  };

  const placeOrder = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.createShopOrder({
        buyer: {
          name: payer.name.trim(),
          email: payer.email.trim(),
          phone: payer.phone.trim(),
          notes: payer.notes.trim(),
        },
        // Send what is actually in the catalogue right now — a bag can outlive a
        // release being pulled, and the server re-prices from its own table anyway.
        items: detailed.map(({ release, quantity }) => ({ releaseId: release.id, quantity })),
        delivery: {
          id: deliveryId,
          address: payer.address.trim(),
          city: payer.city.trim(),
          country: payer.country.trim() || 'Uganda',
        },
        payment: { method, payerPhone: payer.phone.trim() },
      });
      bag.clear();
      notify(`Order ${result.order.id} placed — check your email for the receipt.`, 'success');
      navigate(`/shop/order/${result.order.id}`);
    } catch (failure) {
      if (failure instanceof ApiError) {
        setErrors(failure.fields ?? {});
        notify(failure.message, 'error');
        // A sold-out line means our shelf counts changed under us: refresh them.
        if (failure.status === 409) {
          api.shop().then(setShop).catch(() => undefined);
        }
      } else {
        notify('Could not place the order. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pb-20 pt-24">
      {/* ---------------------------------------------------------- hero ---- */}
      <section className="container-x">
        <Reveal>
          <div className="grid items-end gap-6 border-b border-white/[0.07] pb-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="eyebrow eyebrow-dot mb-4">The record shop</div>
              <h1 className="display text-balance text-[clamp(2.1rem,5vw,3.6rem)] font-semibold">
                Buy the records.
                <br />
                <span className="text-lime">Own the sound.</span>
              </h1>
              <p className="mt-4 max-w-lg text-[13.5px] leading-relaxed text-muted">
                The 7H catalogue, pressed overseas and stocked in Kampala. Pick a record, pay with
                MoMo, Airtel or card, and we courier it across town — or ship it tracked anywhere in
                the world. No account, no minimum order.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="chip">
                  <Icon name="truck" size={12} className="text-lime" /> Kampala delivery 1–2 days
                </span>
                <span className="chip">
                  <Icon name="globe" size={12} className="text-lime" /> Tracked worldwide
                </span>
                <span className="chip">
                  <Icon name="shield" size={12} className="text-lime" /> Real pressings, real stock
                </span>
              </div>
            </div>

            <div className="card flex items-center justify-between gap-4 p-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">In your bag</div>
                <div className="num mt-1.5 text-[26px] font-semibold leading-none text-bone">{bag.count}</div>
                <div className="mt-1 text-[11px] text-muted">
                  {bag.count === 1 ? 'record' : 'records'} · {usd(subtotal)}
                </div>
              </div>
              <a href="#checkout" className="btn-lime !px-4 !py-2.5 text-[12px]">
                Checkout
                <Icon name="arrow-right" size={14} />
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------ the shelf ---- */}
      <section id="shelf" className="container-x mt-10 scroll-mt-24">
        {loadError && (
          <div className="card p-6 text-center text-[13px] text-muted">
            The shop could not load. <button type="button" className="text-lime underline" onClick={() => window.location.reload()}>Try again</button>.
          </div>
        )}

        {!shop && !loadError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="card h-[330px] animate-pulse bg-white/[0.03]" />
            ))}
          </div>
        )}

        {shop && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shop.releases.map((release, index) => {
              const inBag = bag.quantityOf(release.id);
              return (
                <Reveal key={release.id} delay={index * 50}>
                  <article
                    id={release.id}
                    className="flex h-full scroll-mt-24 flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.02] p-3.5 transition-colors hover:border-lime/30">
                    <div className="relative overflow-hidden rounded-xl bg-black/30">
                      <VinylMockup
                        vinylTypeId={release.formatId}
                        sleeveId={release.sleeveId}
                        art={release.id}
                        className="aspect-[384/300] w-full"
                      />
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-bone/85 backdrop-blur-sm">
                        {release.format}
                      </span>
                      {release.soldOut ? (
                        <span className="absolute right-2 top-2 rounded-full bg-white/15 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-bone">
                          Sold out
                        </span>
                      ) : release.lowStock ? (
                        <span className="absolute right-2 top-2 rounded-full bg-lime px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-ink">
                          {release.stock} left
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-[14px] font-medium text-bone">{release.title}</h2>
                        <p className="mt-0.5 truncate text-[11px] text-muted">{release.note}</p>
                      </div>
                      <span className="shrink-0 text-right font-mono text-[9.5px] uppercase tracking-[0.1em] text-lime/80">
                        {release.release}
                      </span>
                    </div>

                    <ul className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] text-muted">
                      <li className="rounded-full border border-white/10 px-2 py-0.5">{release.weight}</li>
                      <li className="rounded-full border border-white/10 px-2 py-0.5">{release.colour}</li>
                      <li className="rounded-full border border-white/10 px-2 py-0.5">{release.sleeve}</li>
                    </ul>

                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      <div>
                        <div className="num text-[19px] font-semibold leading-none text-bone">
                          {usd(release.priceUsd)}
                        </div>
                        {shelfNote(release.priceUsd) && (
                          <div className="mt-1 text-[10.5px] text-muted">{shelfNote(release.priceUsd)}</div>
                        )}
                      </div>

                      {release.soldOut ? (
                        <a
                          href={whatsappUrl(`Hi 7H — tell me when ${release.title} (${release.release}) is back in stock.`)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-dark !px-3.5 !py-2 text-[11.5px]"
                        >
                          Restock list
                        </a>
                      ) : inBag > 0 ? (
                        <div className="flex items-center gap-1 rounded-full border border-lime/40 bg-lime/[0.08] p-1">
                          <button
                            type="button"
                            aria-label={`Remove one ${release.title}`}
                            onClick={() => setQuantity(release, inBag - 1)}
                            className="grid h-7 w-7 place-items-center rounded-full text-lime hover:bg-lime/15"
                          >
                            <Icon name="minus" size={13} />
                          </button>
                          <span className="num w-5 text-center text-[12.5px] font-semibold text-lime">{inBag}</span>
                          <button
                            type="button"
                            aria-label={`Add one ${release.title}`}
                            onClick={() => addToBag(release)}
                            disabled={inBag >= Math.min(release.maxPerOrder, release.stock)}
                            className="grid h-7 w-7 place-items-center rounded-full text-lime hover:bg-lime/15 disabled:opacity-30"
                          >
                            <Icon name="plus" size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToBag(release)}
                          className="btn-lime !px-3.5 !py-2 text-[11.5px]"
                        >
                          <Icon name="plus" size={13} />
                          Add
                        </button>
                      )}
                    </div>
                  </article>
                </Reveal>
              );
            })}

            {/* a quiet slot that points artists at the other door */}
            <Reveal delay={shop.releases.length * 50}>
              <article className="card flex h-full flex-col justify-between gap-4 border-dashed p-5">
                <div>
                  <div className="eyebrow mb-2">Your own record?</div>
                  <h2 className="text-[15px] font-medium text-bone">Press your own run, not one copy.</h2>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    The shop sells the catalogue. If you want 25 to 1,000 copies of your own music
                    pressed, quoted and freighted to Kampala — that is the configurator.
                  </p>
                </div>
                <Link to="/#configurator" className="btn-dark !px-4 !py-2.5 text-[12px]">
                  Price a pressing
                  <Icon name="arrow-right" size={14} />
                </Link>
              </article>
            </Reveal>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- checkout ---- */}
      <section id="checkout" className="container-x mt-14 scroll-mt-24">
        <Reveal>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow eyebrow-dot mb-3">Checkout</div>
              <h2 className="display text-[clamp(1.5rem,3vw,2.2rem)] font-semibold">Bag &amp; delivery</h2>
            </div>
            <a href="#shelf" className="hidden text-[12px] text-muted underline decoration-white/20 underline-offset-4 hover:text-lime sm:block">
              Keep shopping
            </a>
          </div>
        </Reveal>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          {/* bag + delivery */}
          <div className="space-y-5">
            <div className="panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">
                  Your bag {detailed.length > 0 && <span className="text-muted">· {bag.count}</span>}
                </h3>
                {detailed.length > 0 && (
                  <button type="button" onClick={bag.clear} className="text-[11px] text-muted hover:text-lime">
                    Clear
                  </button>
                )}
              </div>

              {detailed.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-muted">
                  Your bag is empty — add a record above.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {detailed.map(({ release, quantity, lineTotal }) => (
                    <li key={release.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <img
                        src={release.image}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-bone">{release.title}</div>
                        <div className="truncate text-[11px] text-muted">
                          {release.format} · {release.release}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 rounded-full border border-white/10 p-0.5">
                        <button
                          type="button"
                          aria-label={`Remove one ${release.title}`}
                          onClick={() => setQuantity(release, quantity - 1)}
                          className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-lime"
                        >
                          <Icon name="minus" size={12} />
                        </button>
                        <span className="num w-5 text-center text-[12px] text-bone">{quantity}</span>
                        <button
                          type="button"
                          aria-label={`Add one ${release.title}`}
                          onClick={() => addToBag(release)}
                          className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-lime"
                        >
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                      <div className="num w-16 shrink-0 text-right text-[13px] text-bone">{usd(lineTotal)}</div>
                    </li>
                  ))}
                </ul>
              )}
              {errors.bag && <p className="mt-2 text-[11.5px] text-red-400">{errors.bag}</p>}
            </div>

            <div className="panel p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">Delivery</h3>
              <div className="grid gap-2">
                {(shop?.delivery ?? []).map((option) => {
                  const active = option.id === deliveryId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setDeliveryId(option.id);
                        setDestination({
                          deliveryId: option.id,
                          zone: option.zone,
                          country: option.zone === 'international' ? payer.country : 'UG',
                          label: option.name,
                        });
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        active ? 'border-lime/55 bg-lime/[0.06]' : 'border-white/10 bg-black/20 hover:border-white/25'
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                          active ? 'border-lime bg-lime text-ink' : 'border-white/25 text-transparent'
                        }`}
                      >
                        <Icon name="check" size={10} strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`text-[13px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                            {option.name}
                          </span>
                          <span className="num shrink-0 text-[12px] text-bone/85">
                            {option.priceUsd === 0 ? 'Free' : usd(option.priceUsd)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{option.detail}</span>
                        <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-muted/70">{option.eta}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.delivery && <p className="mt-2 text-[11.5px] text-red-400">{errors.delivery}</p>}
            </div>
          </div>

          {/* details + payment */}
          <div className="space-y-5">
            <div className="panel p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">Who is it for?</h3>
              <div className="grid gap-3">
                <Field label="Name" error={errors.name}>
                  <input
                    className={`input ${errors.name ? 'input-error' : ''}`}
                    value={payer.name}
                    onChange={(event) => setPayer({ ...payer, name: event.target.value })}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Email" error={errors.email}>
                  <input
                    type="email"
                    className={`input ${errors.email ? 'input-error' : ''}`}
                    value={payer.email}
                    onChange={(event) => setPayer({ ...payer, email: event.target.value })}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </Field>
                <Field label="WhatsApp number" error={errors.phone}>
                  <input
                    type="tel"
                    className={`input ${errors.phone ? 'input-error' : ''}`}
                    value={payer.phone}
                    onChange={(event) => setPayer({ ...payer, phone: event.target.value })}
                    placeholder="+256 772 000 000"
                    autoComplete="tel"
                  />
                </Field>

                {delivery?.requiresAddress && (
                  <>
                    <Field label={delivery.zone === 'uganda' ? 'Delivery address' : 'Street address'} error={errors.address}>
                      <input
                        className={`input ${errors.address ? 'input-error' : ''}`}
                        value={payer.address}
                        onChange={(event) => setPayer({ ...payer, address: event.target.value })}
                        placeholder="Plot, street, area"
                        autoComplete="street-address"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Town / city" error={errors.city}>
                        <input
                          className={`input ${errors.city ? 'input-error' : ''}`}
                          value={payer.city}
                          onChange={(event) => setPayer({ ...payer, city: event.target.value })}
                          autoComplete="address-level2"
                        />
                      </Field>
                      <Field label="Country" error={errors.country}>
                        <input
                          className={`input ${errors.country ? 'input-error' : ''}`}
                          value={payer.country}
                          onChange={(event) => {
                            const country = event.target.value;
                            setPayer({ ...payer, country });
                            if (delivery?.zone === 'international' && country.trim().length > 1) {
                              setDestination({ zone: 'international', country, label: `delivery to ${country}` });
                            }
                          }}
                          autoComplete="country-name"
                        />
                      </Field>
                    </div>
                  </>
                )}

                {!delivery?.requiresAddress && (
                  <p className="rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[11.5px] leading-relaxed text-muted">
                    <Icon name="info" size={13} className="mr-1.5 inline text-lime" />
                    Collect at the Ntinda studio, Mon–Sat 09:00–19:00. Bring the order number — we
                    hold records for 14 days.
                  </p>
                )}

                <Field label="Note for the packer (optional)">
                  <input
                    className="input"
                    value={payer.notes}
                    onChange={(event) => setPayer({ ...payer, notes: event.target.value })}
                    placeholder="Gift wrap, landmark, delivery window…"
                  />
                </Field>
              </div>
            </div>

            <div className="panel p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">Payment</h3>
              <div className="grid gap-2">
                {(shop?.paymentMethods ?? []).map((option) => {
                  const active = option.id === method;
                  const badge = paymentLogos[option.id];
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setMethod(option.id)}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        active ? 'border-lime/55 bg-lime/[0.06]' : 'border-white/10 bg-black/20 hover:border-white/25'
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[7.5px] font-bold uppercase ${
                          badge?.className ?? 'bg-white/10 text-bone'
                        }`}
                      >
                        {badge?.label ?? 'PAY'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12.5px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                          {option.name}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-muted">{option.tagline}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.paymentMethod && <p className="mt-2 text-[11.5px] text-red-400">{errors.paymentMethod}</p>}
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Nothing is charged on this page. We send the payment prompt (or bank details) and pack
                the record as soon as it clears — usually the same day.
              </p>
            </div>

            <div className="panel p-4">
              <dl className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Records</dt>
                  <dd className="num text-bone">{usd(subtotal)}</dd>
                </div>
                {detailed.length > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">{delivery?.name ?? 'Delivery'}</dt>
                    <dd className="num text-bone">{shipping === 0 ? 'Free' : usd(shipping)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-white/[0.08] pt-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Total</dt>
                  <dd className="num text-[19px] font-semibold text-lime">{usd(total)}</dd>
                </div>
                {cartNote && <div className="text-right text-[11px] text-muted">{cartNote}</div>}
              </dl>

              <button
                type="button"
                onClick={placeOrder}
                disabled={submitting || bag.count === 0}
                className="btn-lime mt-4 w-full disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Icon name="spinner" size={15} className="animate-spin" /> Placing order…
                  </>
                ) : (
                  <>
                    Place order · {usd(total)}
                    <Icon name="arrow-right" size={15} />
                  </>
                )}
              </button>
              <p className="mt-2.5 text-center text-[10.5px] leading-relaxed text-muted">
                By ordering you accept that records ship after payment clears. Damaged in transit? We
                replace or refund — send a photo within 7 days.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11.5px] text-red-400">{error}</span>}
    </label>
  );
}
