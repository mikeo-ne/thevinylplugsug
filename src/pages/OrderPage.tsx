import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDraft } from '../store/DraftContext';
import { useConfig } from '../hooks/useConfig';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { usd, ugx, bytes } from '../lib/format';
import { Icon } from '../components/ui/Icon';
import { Stepper } from '../components/order/Stepper';
import { FileDropzone } from '../components/order/FileDropzone';
import { OrderSummary } from '../components/order/OrderSummary';

type Errors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9][0-9\s()-]{6,19}$/;
const LINK_RE = /^https?:\/\/[^\s]+\.[^\s]{2,}$/i;

const paymentLogos: Record<string, { label: string; className: string }> = {
  mtn_momo: { label: 'MTN', className: 'bg-[#FFCC00] text-black' },
  airtel_money: { label: 'airtel', className: 'bg-[#E40000] text-white' },
  card_bank: { label: 'VISA', className: 'bg-[#1A1F71] text-white' },
};

export function OrderPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { config } = useConfig();
  const {
    configuration,
    client,
    setClient,
    files,
    setFiles,
    payment,
    setPayment,
    termsAccepted,
    setTerms,
    plantPreference,
    setPlantPreference,
    quote,
    reset,
  } = useDraft();

  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const method = useMemo(
    () => config.paymentMethods.find((item) => item.id === payment.method) ?? config.paymentMethods[0],
    [config.paymentMethods, payment.method],
  );

  const validateStep = (target: number): Errors => {
    const next: Errors = {};
    if (target === 1) {
      if (client.name.trim().length < 2) next.name = 'Enter the artist or label name.';
      if (!EMAIL_RE.test(client.email.trim())) next.email = 'Enter a valid email address.';
      if (!PHONE_RE.test(client.phone.trim())) next.phone = 'Include your country code, e.g. +256 772 000 000.';
      if (client.deliveryAddress.trim().length < 6) next.deliveryAddress = 'Add the full delivery address.';
      if (client.deliveryCity.trim().length < 2) next.deliveryCity = 'Add the delivery city.';
      if (client.deliveryType === 'international' && client.country.trim().length < 2) {
        next.country = 'Add the delivery country.';
      }
    }
    if (target === 2) {
      const audioLinkOk = files.audioLink.trim() === '' || LINK_RE.test(files.audioLink.trim());
      const artworkLinkOk = files.artworkLink.trim() === '' || LINK_RE.test(files.artworkLink.trim());
      if (!audioLinkOk) next.audioLink = 'Enter a full https:// link.';
      if (!artworkLinkOk) next.artworkLink = 'Enter a full https:// link.';
      if (files.audio.length === 0 && files.audioLink.trim() === '') {
        next.audio = 'Upload a master or paste a download link.';
      }
      if (files.artwork.length === 0 && files.artworkLink.trim() === '') {
        next.artwork = 'Upload the artwork or paste a download link.';
      }
    }
    if (target === 3 && !termsAccepted) {
      next.terms = 'Please accept the production terms to continue.';
    }
    return next;
  };

  const goNext = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      notify(Object.values(found)[0], 'error');
      return;
    }
    const nextStep = Math.min(4, step + 1);
    setStep(nextStep);
    setMaxStep((prev) => Math.max(prev, nextStep));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpTo = (target: number) => {
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    for (const target of [1, 2, 3]) {
      const found = validateStep(target);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        setStep(target);
        notify(Object.values(found)[0], 'error');
        return;
      }
    }

    setSubmitting(true);
    setErrors({});
    try {
      const result = await api.createOrder({
        client,
        configuration,
        payment,
        plantPreference,
        audioLink: files.audioLink,
        artworkLink: files.artworkLink,
        uploads: {
          audio: files.audio.map((file) => file.id),
          artwork: files.artwork.map((file) => file.id),
        },
        termsAccepted,
      });
      notify(`Order ${result.order.id} received — check your inbox for deposit instructions.`, 'success');
      reset();
      navigate(`/order/${result.order.id}`, { state: { fresh: true }, replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          setErrors(error.fields);
          const fieldStep = ['name', 'email', 'phone', 'deliveryAddress', 'deliveryCity', 'country'].some(
            (key) => key in error.fields!,
          )
            ? 1
            : ['audio', 'artwork', 'audioLink', 'artworkLink'].some((key) => key in error.fields!)
              ? 2
              : 3;
          setStep(fieldStep);
        }
        notify(error.message, 'error');
      } else {
        notify('Could not reach the order service. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateClient = (patch: Partial<typeof client>) => {
    setClient(patch);
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(patch).forEach((key) => delete next[key]);
      return next;
    });
  };

  return (
    <main className="relative min-h-screen pb-24 pt-28 sm:pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(204,255,0,0.07),transparent)]" />

      <div className="container-x relative">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow eyebrow-dot mb-3">Client portal</div>
            <h1 className="display text-[clamp(1.9rem,4vw,2.8rem)] font-semibold">
              Place your <span className="text-lime">pressing order</span>.
            </h1>
            <p className="mt-2.5 max-w-lg text-[13px] leading-relaxed text-muted">
              Four short steps. Your configuration and quote carry over from the configurator, and
              nothing is released to the plant before proof approval.
            </p>
          </div>
          <Link
            to="/#configurator"
            className="inline-flex items-center gap-2 text-[12px] text-muted transition-colors hover:text-lime"
          >
            <Icon name="refresh" size={14} />
            Change configuration
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:gap-8">
          <div>
            <Stepper current={step} completed={maxStep} onSelect={jumpTo} />

            <div key={step} className="panel animate-fade-up p-5 sm:p-7">
              {/* ---------------- step 1 ---------------- */}
              {step === 1 && (
                <div className="space-y-5">
                  <SectionTitle
                    title="Who are we pressing for?"
                    hint="We use these details for the invoice and plant spec sheet."
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Artist / Label name" error={errors.name} required>
                      <input
                        className={`field ${errors.name ? 'field-error' : ''}`}
                        value={client.name}
                        onChange={(event) => updateClient({ name: event.target.value })}
                        placeholder="e.g. Naledi Sound"
                        autoComplete="organization"
                      />
                    </Field>
                    <Field label="Contact email" error={errors.email} required>
                      <input
                        type="email"
                        className={`field ${errors.email ? 'field-error' : ''}`}
                        value={client.email}
                        onChange={(event) => updateClient({ email: event.target.value })}
                        placeholder="you@label.com"
                        autoComplete="email"
                      />
                    </Field>
                    <Field label="WhatsApp number" error={errors.phone} required>
                      <input
                        type="tel"
                        className={`field ${errors.phone ? 'field-error' : ''}`}
                        value={client.phone}
                        onChange={(event) => updateClient({ phone: event.target.value })}
                        placeholder="+256 772 000 000"
                        autoComplete="tel"
                      />
                    </Field>
                    <Field label="Preferred pressing plant" hint="Final assignment confirmed at proof stage.">
                      <select
                        className="field dark-select"
                        value={plantPreference}
                        onChange={(event) => setPlantPreference(event.target.value)}
                      >
                        {config.plants.map((plant) => (
                          <option key={plant.id} value={plant.id} className="bg-[#161615]">
                            {plant.name} — {plant.region}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div>
                    <span className="label">Delivery destination</span>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {[
                        {
                          id: 'uganda',
                          title: 'Uganda address',
                          body: 'Kampala or upcountry · freight & customs included',
                          icon: 'truck' as const,
                        },
                        {
                          id: 'international',
                          title: 'International tour city',
                          body: 'Deliver to a venue, hotel or forwarder abroad',
                          icon: 'globe' as const,
                        },
                      ].map((option) => {
                        const active = client.deliveryType === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              updateClient({
                                deliveryType: option.id as typeof client.deliveryType,
                                country:
                                  option.id === 'uganda'
                                    ? 'Uganda'
                                    : client.country === 'Uganda'
                                      ? ''
                                      : client.country,
                              });
                            }}
                            className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                              active
                                ? 'border-lime/60 bg-lime/[0.06]'
                                : 'border-white/10 bg-black/20 hover:border-white/25'
                            }`}
                          >
                            <Icon
                              name={option.icon}
                              size={17}
                              className={`mt-0.5 shrink-0 ${active ? 'text-lime' : 'text-muted'}`}
                            />
                            <span>
                              <span className={`block text-[13px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                                {option.title}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                                {option.body}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={client.deliveryType === 'uganda' ? 'Delivery address' : 'International delivery address'}
                      error={errors.deliveryAddress}
                      required
                      className="sm:col-span-2"
                    >
                      <input
                        className={`field ${errors.deliveryAddress ? 'field-error' : ''}`}
                        value={client.deliveryAddress}
                        onChange={(event) => updateClient({ deliveryAddress: event.target.value })}
                        placeholder={
                          client.deliveryType === 'uganda'
                            ? 'Plot 14 Bandali Rise, Bugolobi'
                            : 'O2 Academy, 16–18 Stoke Newington Rd'
                        }
                        autoComplete="street-address"
                      />
                    </Field>
                    <Field label="City / town" error={errors.deliveryCity} required>
                      <input
                        className={`field ${errors.deliveryCity ? 'field-error' : ''}`}
                        value={client.deliveryCity}
                        onChange={(event) => updateClient({ deliveryCity: event.target.value })}
                        placeholder={client.deliveryType === 'uganda' ? 'Kampala' : 'London'}
                      />
                    </Field>
                    <Field label="Country" error={errors.country} required={client.deliveryType === 'international'}>
                      <input
                        className={`field ${errors.country ? 'field-error' : ''}`}
                        value={client.country}
                        onChange={(event) => updateClient({ country: event.target.value })}
                        placeholder="Uganda"
                        autoComplete="country-name"
                      />
                    </Field>
                  </div>

                  <Field label="Notes for the plant" hint="Optional">
                    <textarea
                      rows={3}
                      className="field resize-none"
                      value={client.notes}
                      onChange={(event) => updateClient({ notes: event.target.value })}
                      placeholder="Deadlines, test-press requests, tour dates, colour references…"
                    />
                  </Field>
                </div>
              )}

              {/* ---------------- step 2 ---------------- */}
              {step === 2 && (
                <div className="space-y-6">
                  <SectionTitle
                    title="Masters & artwork"
                    hint="Files are stored privately and only shared with the plant."
                  />

                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[11.5px] leading-relaxed text-muted">
                    <Icon name="shield" size={13} className="mr-1.5 inline text-lime" />
                    We run a 24-hour technical check on every upload — sample rate, phase and print
                    bleed. Nothing is sent to the factory until you approve the proof.
                    <span className="mt-1.5 block text-muted/80">
                      Direct uploads are capped at {config.limits?.maxUploadMb ?? 80}MB per file; for
                      long masters, paste a WeTransfer or Drive link below.
                    </span>
                  </div>

                  <FileDropzone
                    kind="audio"
                    files={files.audio}
                    onAdd={(added) => setFiles({ audio: [...files.audio, ...added].slice(0, 4) })}
                    onRemove={(id) => setFiles({ audio: files.audio.filter((file) => file.id !== id) })}
                    link={files.audioLink}
                    onLinkChange={(value) => setFiles({ audioLink: value })}
                    linkError={errors.audioLink}
                    error={errors.audio}
                    maxMb={config.limits?.maxUploadMb ?? 80}
                  />

                  <div className="h-px bg-white/[0.07]" />

                  <FileDropzone
                    kind="artwork"
                    files={files.artwork}
                    onAdd={(added) => setFiles({ artwork: [...files.artwork, ...added].slice(0, 4) })}
                    onRemove={(id) => setFiles({ artwork: files.artwork.filter((file) => file.id !== id) })}
                    link={files.artworkLink}
                    onLinkChange={(value) => setFiles({ artworkLink: value })}
                    linkError={errors.artworkLink}
                    error={errors.artwork}
                    maxMb={config.limits?.maxUploadMb ?? 80}
                  />

                  {(files.audio.length > 0 || files.artwork.length > 0) && (
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Attached to this order
                      </div>
                      <ul className="space-y-1.5">
                        {[...files.audio, ...files.artwork].map((file) => (
                          <li key={file.id} className="flex items-center justify-between gap-3 text-[11.5px]">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="h-1 w-1 shrink-0 rounded-full bg-lime" />
                              <span className="truncate text-bone/85">{file.originalName}</span>
                            </span>
                            <span className="shrink-0 text-muted">{bytes(file.size)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- step 3 ---------------- */}
              {step === 3 && (
                <div className="space-y-6">
                  <SectionTitle
                    title="Payment method"
                    hint={`Deposit today: ${usd(quote.deposit, { cents: true })}`}
                  />

                  <div className="grid gap-2.5">
                    {config.paymentMethods.map((option) => {
                      const active = payment.method === option.id;
                      const badge = paymentLogos[option.id];
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPayment({ method: option.id })}
                          className={`flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-300 ${
                            active
                              ? 'border-lime/60 bg-lime/[0.06]'
                              : 'border-white/10 bg-black/20 hover:border-white/25'
                          }`}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10">
                            <span
                              className={`grid h-full w-full place-items-center rounded-full text-[8px] font-bold uppercase tracking-tight ${badge?.className ?? 'bg-white/10 text-bone'}`}
                            >
                              {badge?.label ?? <Icon name="shield" size={14} />}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[13.5px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                              {option.name}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted">{option.description}</span>
                          </span>
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                              active ? 'border-lime bg-lime text-ink' : 'border-white/20 text-transparent'
                            }`}
                          >
                            <Icon name="check" size={11} strokeWidth={3} />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {method && (
                    <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {method.currency === 'UGX' ? 'Pay to' : 'Settlement details'}
                        </span>
                        <span className="chip">{method.tagline}</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">Account name</div>
                          <div className="mt-0.5 text-[13px] text-bone">{method.accountName}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
                            {method.currency === 'UGX' ? 'Merchant number' : 'Bank / SWIFT'}
                          </div>
                          <div className="num mt-0.5 text-[13px] text-bone">{method.accountNumber}</div>
                        </div>
                      </div>

                      {method.fields.includes('payerPhone') ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Field label="Mobile money number">
                            <input
                              type="tel"
                              className="field py-3 text-[13px]"
                              value={payment.payerPhone}
                              onChange={(event) => setPayment({ payerPhone: event.target.value })}
                              placeholder={method.id === 'mtn_momo' ? '0772 000 000' : '0701 000 000'}
                            />
                          </Field>
                          <Field label="Name on the wallet">
                            <input
                              className="field py-3 text-[13px]"
                              value={payment.payerName}
                              onChange={(event) => setPayment({ payerName: event.target.value })}
                              placeholder={client.name || 'Registered wallet name'}
                            />
                          </Field>
                        </div>
                      ) : (
                        <p className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                          A pro-forma invoice with SWIFT details and a card payment link is issued by
                          email within one business hour of submitting this order. Card payments settle
                          in USD at the quoted rate.
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <span className="label">Production terms</span>
                    <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
                      <ul className="space-y-2 text-[11.5px] leading-relaxed text-muted">
                        {[
                          'Production initializes upon 50% deposit and proof approval.',
                          'Deposits are non-refundable once the plant has cut lacquers.',
                          'Artwork must be print-ready CMYK; reprints due to artwork errors are chargeable.',
                          'Balance is due before dispatch from the pressing plant.',
                        ].map((term) => (
                          <li key={term} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lime/60" />
                            {term}
                          </li>
                        ))}
                      </ul>

                      <label
                        className={`mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          errors.terms
                            ? 'border-red-500/40 bg-red-500/[0.05]'
                            : termsAccepted
                              ? 'border-lime/40 bg-lime/[0.06]'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(event) => {
                            setTerms(event.target.checked);
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.terms;
                              return next;
                            });
                          }}
                          className="peer sr-only"
                        />
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-all ${
                            termsAccepted
                              ? 'border-lime bg-lime text-ink'
                              : 'border-white/25 text-transparent'
                          }`}
                        >
                          <Icon name="check" size={12} strokeWidth={3.2} />
                        </span>
                        <span className="text-[12.5px] leading-relaxed text-bone/90">
                          I agree to the production terms.{' '}
                          <span className="text-lime">Production initializes upon 50% deposit and proof approval.</span>
                        </span>
                      </label>
                      {errors.terms && <p className="mt-1.5 text-[11px] text-red-300">{errors.terms}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- step 4 ---------------- */}
              {step === 4 && (
                <div className="space-y-6">
                  <SectionTitle
                    title="Review & checkout"
                    hint="One last look before we file the order."
                  />

                  <ReviewBlock title="Client & delivery" onEdit={() => jumpTo(1)}>
                    <ReviewRow label="Artist / Label" value={client.name} />
                    <ReviewRow label="Email" value={client.email} />
                    <ReviewRow label="WhatsApp" value={client.phone} />
                    <ReviewRow
                      label="Deliver to"
                      value={`${client.deliveryAddress}, ${client.deliveryCity}, ${client.country}`}
                      full
                    />
                    {client.notes && <ReviewRow label="Notes" value={client.notes} full />}
                  </ReviewBlock>

                  <ReviewBlock title="Configuration" onEdit={() => jumpTo(1)}>
                    <ReviewRow label="Format" value={quote.vinylType.name} />
                    <ReviewRow label="Quantity" value={`${quote.quantity} units`} />
                    <ReviewRow label="Packaging" value={quote.sleeve.name} />
                    <ReviewRow label="Plant" value={config.plants.find((p) => p.id === plantPreference)?.name ?? 'Mobineko'} />
                  </ReviewBlock>

                  <ReviewBlock title="Files" onEdit={() => jumpTo(2)}>
                    <div className="sm:col-span-2 space-y-2">
                      {[...files.audio, ...files.artwork].map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-[11.5px]"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon
                              name={file.kind === 'audio' ? 'file-audio' : 'file-image'}
                              size={13}
                              className="shrink-0 text-lime"
                            />
                            <span className="truncate text-bone/85">{file.originalName}</span>
                          </span>
                          <span className="shrink-0 text-muted">{bytes(file.size)}</span>
                        </div>
                      ))}
                      {files.audioLink && <ReviewRow label="Master link" value={files.audioLink} full />}
                      {files.artworkLink && <ReviewRow label="Artwork link" value={files.artworkLink} full />}
                    </div>
                  </ReviewBlock>

                  <ReviewBlock title="Payment" onEdit={() => jumpTo(3)}>
                    <ReviewRow label="Method" value={method?.name ?? '—'} />
                    <ReviewRow label="Deposit due" value={usd(quote.deposit, { cents: true })} />
                    <ReviewRow label="Balance on dispatch" value={usd(quote.balance, { cents: true })} />
                    <ReviewRow label="Turnkey total" value={usd(quote.total, { cents: true })} />
                  </ReviewBlock>

                  <div className="rounded-xl border border-lime/25 bg-lime/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <Icon name="shield" size={17} className="mt-0.5 shrink-0 text-lime" />
                      <div>
                        <div className="text-[12.5px] font-medium text-bone">
                          Submitting files your order — no charge is taken automatically.
                        </div>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                          Management confirms your deposit first, then sends the plant spec sheet and
                          proof. Your quoted total is{' '}
                          <span className="text-lime">{usd(quote.total, { cents: true })}</span> (
                          {ugx(quote.totals.total.ugx)}).
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- nav ---------------- */}
              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between">
                {step > 1 ? (
                  <button type="button" onClick={goBack} className="btn-dark w-full sm:w-auto">
                    <Icon name="arrow-right" size={15} className="rotate-180" />
                    Back
                  </button>
                ) : (
                  <Link to="/#configurator" className="btn-dark w-full sm:w-auto">
                    <Icon name="arrow-right" size={15} className="rotate-180" />
                    Back to quote
                  </Link>
                )}

                {step < 4 ? (
                  <button type="button" onClick={goNext} className="btn-lime group w-full sm:w-auto">
                    Continue
                    <Icon
                      name="arrow-right"
                      size={16}
                      strokeWidth={2}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="btn-lime group w-full sm:w-auto"
                  >
                    {submitting ? (
                      <>
                        <Icon name="spinner" size={16} className="animate-spin" />
                        Filing order…
                      </>
                    ) : (
                      <>
                        Place order · {usd(quote.deposit, { cents: true })} deposit
                        <Icon
                          name="arrow-right"
                          size={16}
                          strokeWidth={2}
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <Icon name="lock" size={12} className="text-lime/70" />
                Deposits held until proof sign-off
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="shield" size={12} className="text-lime/70" />
                Files never shared outside the plant
              </span>
              <a href="https://wa.me/256700411700" className="flex items-center gap-1.5 transition-colors hover:text-lime">
                <Icon name="whatsapp" size={12} filled />
                Need help? +256 700 411 700
              </a>
            </div>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <OrderSummary onEdit={jumpTo} />
          </div>
        </div>
      </div>

      {/* mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#131312]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-muted">Turnkey total</div>
            <div className="num text-[17px] font-semibold leading-tight text-bone">
              {usd(quote.total, { cents: true })}
            </div>
          </div>
          {step < 4 ? (
            <button type="button" onClick={goNext} className="btn-lime px-5 py-3 text-[13px]">
              Continue
              <Icon name="arrow-right" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn-lime px-5 py-3 text-[13px]"
            >
              {submitting ? <Icon name="spinner" size={15} className="animate-spin" /> : null}
              Place order
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.07] pb-4">
      <h2 className="text-[16px] font-medium text-bone">{title}</h2>
      <span className="text-[11px] text-muted">{hint}</span>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label flex items-center gap-1">
        {label}
        {required && <span className="text-lime">*</span>}
        {hint && <span className="ml-auto text-[10px] normal-case tracking-normal text-muted/70">{hint}</span>}
      </span>
      {children}
      {error && (
        <span className="mt-1.5 flex items-center gap-1 text-[11px] text-red-300">
          <Icon name="alert" size={11} />
          {error}
        </span>
      )}
    </label>
  );
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] text-muted underline decoration-white/20 underline-offset-2 transition-colors hover:text-lime"
        >
          Edit
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-0.5 break-words text-[12.5px] text-bone/90">{value}</div>
    </div>
  );
}
