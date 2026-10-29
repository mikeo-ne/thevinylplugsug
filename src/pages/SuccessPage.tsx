import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useConfig } from '../hooks/useConfig';
import { useToast } from '../components/ui/Toast';
import { dateTime, relativeTime, usd, ugx, statusLabel } from '../lib/format';
import type { Order, WebhookEvent } from '../types';
import { Icon, type IconName } from '../components/ui/Icon';
import { StatusPill } from '../components/ui/StatusPill';

const channelIcon: Record<string, IconName> = {
  slack: 'hash',
  email: 'mail',
  whatsapp: 'whatsapp',
  plant: 'factory',
};

const nextSteps = [
  {
    title: 'Deposit verification',
    body: 'Management confirms your 50% deposit and issues a receipt by email and WhatsApp.',
    eta: 'Within 2 business hours',
  },
  {
    title: 'Plant spec sheet',
    body: 'Your configuration and file links are forwarded to the pressing plant for scheduling.',
    eta: 'Same business day',
  },
  {
    title: 'Digital proof',
    body: 'We send the plant proof for your written approval. Nothing is pressed before you sign off.',
    eta: '5–7 days',
  },
  {
    title: 'Production & delivery',
    body: 'Pressing, packing, freight, customs clearance and last-mile delivery to your address.',
    eta: '7–11 weeks',
  },
];

export function SuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { config } = useConfig();
  const { notify } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!orderId) return;

    const load = async (initial: boolean) => {
      try {
        const result = await api.getOrder(orderId);
        if (!active) return;
        setOrder(result.order);
        setEvents(result.events ?? []);
        setError(null);
      } catch (failure) {
        if (!active) return;
        if (initial) setError(failure instanceof ApiError ? failure.message : 'Could not load this order.');
      } finally {
        if (active && initial) setLoading(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => void load(false), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orderId]);

  const method = order ? config.paymentMethods.find((item) => item.id === order.payment.method) : null;

  const copyOrderId = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.id);
      notify('Order ID copied — keep it for your records.', 'success');
    } catch {
      notify('Copy failed. Select the order ID manually.', 'error');
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center pt-24">
        <div className="flex flex-col items-center gap-4 text-muted">
          <Icon name="spinner" size={26} className="animate-spin text-lime" />
          <p className="text-[12px] uppercase tracking-[0.18em]">Retrieving your order</p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="grid min-h-screen place-items-center px-5 pt-24">
        <div className="panel max-w-md p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300">
            <Icon name="alert" size={20} />
          </span>
          <h1 className="mt-5 font-display text-xl font-semibold">Order not found</h1>
          <p className="mt-2 text-[13px] text-muted">
            {error ?? 'We could not find an order with that reference. Check the ID in your email.'}
          </p>
          <Link to="/order" className="btn-lime mt-6">
            Start a new order
          </Link>
        </div>
      </main>
    );
  }

  const quote = order.quote;

  return (
    <main className="relative min-h-screen pb-24 pt-28 sm:pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(55%_100%_at_50%_0%,rgba(204,255,0,0.10),transparent)]" />

      <div className="container-x relative">
        {/* confirmation header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="relative mx-auto mb-6 grid h-20 w-20 place-items-center">
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-lime/40" />
            <span className="absolute inset-2 rounded-full border border-lime/25" />
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-lime text-ink shadow-[0_0_50px_rgba(204,255,0,0.35)]">
              <Icon name="check" size={26} strokeWidth={3} />
            </span>
          </div>

          <div className="eyebrow eyebrow-dot mb-4 justify-center">Order received</div>
          <h1 className="display text-balance text-[clamp(2rem,4.6vw,3.2rem)] font-semibold">
            Your pressing is <span className="text-lime">in the queue</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[13.5px] leading-relaxed text-muted">
            Thanks, {order.client.name.split(' ')[0]}. Management has been alerted and will confirm your
            deposit within two business hours. Keep the order ID below — it's how we track your run.
          </p>

          <div className="mt-7 inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/[0.04] py-2 pl-5 pr-2">
            <span className="font-mono text-[15px] tracking-[0.14em] text-bone">{order.id}</span>
            <button
              type="button"
              onClick={copyOrderId}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.07] text-muted transition-colors hover:bg-lime hover:text-ink"
              aria-label="Copy order ID"
            >
              <Icon name="copy" size={14} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted">
            <StatusPill status={order.payment.status} />
            <span>Filed {dateTime(order.createdAt)}</span>
            <span className="h-3 w-px bg-white/15" />
            <span>Plant: {config.plants.find((p) => p.id === order.plantPreference)?.name ?? 'Mobineko'}</span>
          </div>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* deposit instructions */}
          <div className="space-y-5">
            <div className="panel overflow-hidden">
              <div className="border-b border-white/[0.07] bg-lime/[0.06] px-5 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime">
                    Deposit instructions · 50%
                  </h2>
                  <Icon name="lock" size={15} className="text-lime/70" />
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num text-[30px] font-semibold leading-none text-bone">
                    {usd(quote.deposit, { cents: true })}
                  </span>
                  <span className="text-[12px] text-muted">{ugx(quote.totals.deposit.ugx)}</span>
                </div>
              </div>

              <div className="p-5">
                {method && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Payment method</div>
                        <div className="mt-0.5 text-[13.5px] text-bone">{method.name}</div>
                      </div>
                      <StatusPill status={order.payment.status} />
                    </div>

                    <div className="grid gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-4 sm:grid-cols-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-muted">Account name</div>
                        <div className="mt-0.5 text-[12.5px] text-bone">{method.accountName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
                          {method.currency === 'UGX' ? 'Merchant number' : 'Bank / SWIFT'}
                        </div>
                        <div className="num mt-0.5 text-[12.5px] text-bone">{method.accountNumber}</div>
                      </div>
                      {order.payment.reference && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">Reference</div>
                          <div className="num mt-0.5 text-[12.5px] text-lime">{order.payment.reference}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-muted">Quote reference</div>
                        <div className="num mt-0.5 text-[12.5px] text-bone">{order.id}</div>
                      </div>
                    </div>

                    <p className="text-[11.5px] leading-relaxed text-muted">
                      {order.payment.method === 'mtn_momo' && (
                        <>
                          Dial <span className="text-bone">*165*3#</span>, choose “Pay Merchant” and enter the
                          merchant number above with reference <span className="text-bone">{order.id}</span>.
                        </>
                      )}
                      {order.payment.method === 'airtel_money' && (
                        <>
                          Dial <span className="text-bone">*185*9#</span>, select “Pay Bill” and use reference{' '}
                          <span className="text-bone">{order.id}</span>.
                        </>
                      )}
                      {order.payment.method === 'card_bank' && (
                        <>
                          A pro-forma invoice with a card link and SWIFT instructions is on its way to{' '}
                          <span className="text-bone">{order.client.email}</span>.
                        </>
                      )}{' '}
                      Once paid, WhatsApp the receipt to management and your order moves to proofing.
                    </p>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <a
                        href={`https://wa.me/256700411700?text=${encodeURIComponent(
                          `Hi 7H Music Group — I've sent the deposit for order ${order.id} (${usd(quote.deposit, { cents: true })}).`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-lime flex-1"
                      >
                        <Icon name="whatsapp" size={16} filled />
                        Send deposit receipt
                      </a>
                      <Link to="/#configurator" className="btn-ghost flex-1">
                        Configure another run
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* notification simulator */}
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">
                    Management alerts
                  </h2>
                  <p className="mt-1 text-[11px] text-muted">
                    Simulated webhook fan-out triggered by your order.
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
                  live
                </span>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {events.length === 0 && (
                  <li className="px-5 py-6 text-center text-[12px] text-muted">Fanning out alerts…</li>
                )}
                {events.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 px-5 py-3.5">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                        event.status === 'delivered'
                          ? 'border-lime/30 bg-lime/10 text-lime'
                          : 'border-white/12 bg-white/[0.04] text-muted'
                      }`}
                    >
                      <Icon name={channelIcon[event.channel] ?? 'bolt'} size={13} filled={event.channel === 'whatsapp'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[12px] font-medium text-bone">
                          {event.channel === 'plant' ? 'Pressing plant' : event.channel.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted">{relativeTime(event.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{event.target}</p>
                    </div>
                    <span
                      className={`mt-0.5 shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${
                        event.status === 'delivered' ? 'text-lime/80' : 'text-muted'
                      }`}
                    >
                      {statusLabel(event.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* order detail */}
          <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div className="panel p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">Your package</h2>
              <div className="mt-4 space-y-2.5 text-[12.5px]">
                <SummaryRow label="Format" value={quote.vinylType?.name ?? String(order.configuration.vinylTypeId)} />
                <SummaryRow label="Quantity" value={`${order.configuration.quantity} units`} />
                <SummaryRow label="Packaging" value={quote.sleeve?.name ?? String(order.configuration.sleeveId)} />
                <SummaryRow
                  label="Delivery"
                  value={`${order.client.deliveryCity}, ${order.client.country}`}
                />
                <SummaryRow label="Per record" value={usd(quote.perUnit, { cents: true })} />
              </div>

              <div className="my-4 h-px bg-white/[0.07]" />

              <dl className="space-y-2 text-[12.5px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Factory cost</dt>
                  <dd className="num text-bone/85">{usd(quote.factoryCost, { cents: true })}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Management fee · 25%</dt>
                  <dd className="num text-bone/85">{usd(quote.managementFee, { cents: true })}</dd>
                </div>
                <div className="flex justify-between border-t border-white/[0.07] pt-2">
                  <dt className="text-bone">Turnkey total</dt>
                  <dd className="num font-medium text-lime">{usd(quote.total, { cents: true })}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Balance on dispatch</dt>
                  <dd className="num text-bone/85">{usd(quote.balance, { cents: true })}</dd>
                </div>
              </dl>
            </div>

            <div className="panel overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">What happens next</h2>
              </div>
              <ol className="divide-y divide-white/[0.06]">
                {nextSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-3 px-5 py-3.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/12 font-mono text-[9px] text-muted">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[12.5px] font-medium text-bone">{step.title}</span>
                        <span className="text-[10px] uppercase tracking-[0.1em] text-lime/70">{step.eta}</span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2 text-[11px] text-muted">
              <Link to="/" className="flex items-center gap-1.5 transition-colors hover:text-lime">
                <Icon name="arrow-right" size={12} className="rotate-180" />
                Back to home
              </Link>
              <Link to="/admin" className="flex items-center gap-1.5 transition-colors hover:text-lime">
                <Icon name="eye" size={12} />
                See how this order appears in the admin console
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="max-w-[62%] text-right text-bone">{value}</span>
    </div>
  );
}
