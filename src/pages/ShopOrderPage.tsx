import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { usd, ugx, dateTime } from '../lib/format';
import { whatsappUrl } from '../lib/contact';
import { Icon } from '../components/ui/Icon';
import { useToast } from '../components/ui/Toast';
import type { ShopOrder } from '../types';

const FLOW: { id: ShopOrder['status']; label: string; blurb: string }[] = [
  { id: 'placed', label: 'Order placed', blurb: 'We have it, and the desk has been pinged.' },
  { id: 'packed', label: 'Packed', blurb: 'Sleeved in a mailer, weight checked.' },
  { id: 'shipped', label: 'On its way', blurb: 'Courier has it — we send the tracking on WhatsApp.' },
  { id: 'delivered', label: 'Delivered', blurb: 'Enjoy it. Send us a photo of it spinning.' },
];

/**
 * The fan's own order page — the link in their receipt.
 *
 * Deliberately the whole customer service surface: what they bought, what it
 * costs, how to pay it, and where it is. No login: the order reference is the key.
 */
export function ShopOrderPage() {
  const { orderId = '' } = useParams();
  const { notify } = useToast();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getShopOrder(orderId)
      .then((data) => !cancelled && setOrder(data.order))
      .catch((failure) => {
        if (cancelled) return;
        setError(
          failure instanceof ApiError && failure.status === 404
            ? 'We could not find that order. Check the reference on your receipt.'
            : 'Could not load the order. Please try again.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notify(`${label} copied.`, 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify('Copy failed — long-press to select it.', 'error');
    }
  };

  if (error) {
    return (
      <main className="container-x pb-24 pt-32">
        <div className="panel mx-auto max-w-md p-8 text-center">
          <Icon name="alert" size={26} className="mx-auto text-muted" />
          <h1 className="mt-3 text-[17px] font-medium text-bone">Order not found</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{error}</p>
          <Link to="/shop" className="btn-dark mt-5 !px-5 !py-2.5 text-[12px]">
            Back to the shop
          </Link>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="container-x pb-24 pt-32">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="card h-28 animate-pulse bg-white/[0.03]" />
          <div className="card h-64 animate-pulse bg-white/[0.03]" />
        </div>
      </main>
    );
  }

  const paid = order.payment.status === 'paid';
  const cancelled = order.status === 'cancelled';
  const stageIndex = FLOW.findIndex((stage) => stage.id === order.status);
  const historyFor = (status: string) => order.statusHistory.find((entry) => entry.status === status);

  return (
    <main className="pb-20 pt-24">
      <div className="container-x">
        {/* header */}
        <div className="grid items-center gap-5 border-b border-white/[0.07] pb-7 sm:grid-cols-[1fr_auto]">
          <div>
            <div className="eyebrow eyebrow-dot mb-3">
              {cancelled ? 'Order cancelled' : paid ? 'Payment received' : 'Order placed'}
            </div>
            <h1 className="display text-[clamp(1.8rem,4vw,2.7rem)] font-semibold">
              {cancelled ? 'That order was cancelled' : `Thank you, ${order.buyer.name.split(' ')[0]}.`}
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
              {cancelled
                ? 'Nothing was charged, and the records went back on the shelf. Any questions, message the desk on WhatsApp.'
                : paid
                  ? `We have your ${order.records === 1 ? 'record' : 'records'} marked as paid and the packer has the slip. ${order.delivery.eta}.`
                  : `Your reference is ${order.id}. Pay below and we pack the same day — the receipt is already in your inbox.`}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => copy(order.id, 'Order number')}
              className="btn-dark !px-4 !py-2.5 text-[12px]"
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} className={copied ? 'text-lime' : undefined} />
              {copied ? 'Copied' : order.id}
            </button>
            <a
              href={whatsappUrl(
                paid
                  ? `Hi 7H — I paid for order ${order.id}. Here is my receipt.`
                  : `Hi 7H — I have a question about order ${order.id}.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="btn-lime !px-4 !py-2.5 text-[12px]"
            >
              <Icon name="whatsapp" size={14} filled />
              Message the desk
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          {/* what they bought */}
          <div className="space-y-5">
            <div className="panel p-4">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">
                {order.records} {order.records === 1 ? 'record' : 'records'}
              </h2>
              <ul className="divide-y divide-white/[0.06]">
                {order.items.map((item) => (
                  <li key={item.releaseId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] text-bone">{item.title}</div>
                      <div className="text-[11px] text-muted">
                        {item.release} · {item.quantity} × {usd(item.priceUsd)}
                      </div>
                    </div>
                    <div className="num shrink-0 text-[13px] text-bone">{usd(item.lineTotal)}</div>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 space-y-1.5 border-t border-white/[0.07] pt-3 text-[12.5px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Records</dt>
                  <dd className="num text-bone">{usd(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{order.delivery.name}</dt>
                  <dd className="num text-bone">{order.shipping === 0 ? 'Free' : usd(order.shipping)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-white/[0.07] pt-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Total</dt>
                  <dd className="text-right">
                    <span className="num block text-[18px] font-semibold text-lime">{usd(order.total)}</span>
                    <span className="text-[10.5px] text-muted">{ugx(order.totals.total.ugx)}</span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* progress */}
            {!cancelled && (
              <div className="panel p-4">
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">Where it is</h2>
                <ol className="space-y-3">
                  {FLOW.map((stage, index) => {
                    const reached = stageIndex >= index;
                    const entry = historyFor(stage.id);
                    const isCurrent = stageIndex === index;
                    return (
                      <li key={stage.id} className="flex gap-3">
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] ${
                            reached
                              ? 'border-lime bg-lime text-ink'
                              : 'border-white/15 text-muted'
                          }`}
                        >
                          {reached ? <Icon name="check" size={11} strokeWidth={3} /> : index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className={`text-[12.5px] ${isCurrent ? 'text-lime' : reached ? 'text-bone' : 'text-muted'}`}>
                            {stage.label}
                            {entry && <span className="ml-2 text-[10.5px] text-muted">{dateTime(entry.at)}</span>}
                          </div>
                          <div className="text-[11px] leading-relaxed text-muted">{stage.blurb}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>

          {/* paying + delivery */}
          <div className="space-y-5">
            {!cancelled && !paid && (
              <div className="panel border-lime/25 bg-lime/[0.04] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lime">Pay for it</h2>
                  <span className="rounded-full bg-black/40 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted">
                    awaiting payment
                  </span>
                </div>
                <div className="mt-3">
                  <div className="num text-[24px] font-semibold leading-none text-bone">{ugx(order.totals.total.ugx)}</div>
                  <div className="mt-1 text-[11.5px] text-muted">{usd(order.total)} at today's rate</div>
                </div>

                <div className="mt-3 space-y-2 text-[12px]">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2">
                    <span className="text-muted">Method</span>
                    <span className="text-bone">{order.payment.methodName}</span>
                  </div>
                  {order.payment.accountNumber && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2">
                      <span className="text-muted">{order.payment.accountName}</span>
                      <button
                        type="button"
                        onClick={() => copy(order.payment.accountNumber ?? '', 'Payment number')}
                        className="flex items-center gap-1.5 font-mono text-[11.5px] text-lime"
                      >
                        {order.payment.accountNumber}
                        <Icon name="copy" size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2">
                    <span className="text-muted">Quote this reference</span>
                    <span className="font-mono text-[11.5px] text-bone">{order.payment.reference ?? order.id}</span>
                  </div>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  {order.payment.method === 'card_bank'
                    ? 'Reply to your receipt email and we send the invoice with bank or card details. Nothing ships until it clears.'
                    : 'Approve the prompt on your phone, then send us the confirmation on WhatsApp so we can pack immediately.'}
                </p>
                <a
                  href={whatsappUrl(
                    `Hi 7H — paying ${ugx(order.totals.total.ugx)} for order ${order.id} (${order.payment.reference ?? order.id}).`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-lime mt-3 w-full text-[12.5px]"
                >
                  <Icon name="whatsapp" size={14} filled />
                  Send payment confirmation
                </a>
              </div>
            )}

            {paid && !cancelled && (
              <div className="panel border-lime/25 bg-lime/[0.05] p-4">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-lime">
                  <Icon name="check-circle" size={15} />
                  Payment received
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                  {order.payment.methodName} · {usd(order.total)}. {order.delivery.eta}.
                </p>
              </div>
            )}

            <div className="panel p-4">
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone">Delivery</h2>
              <div className="text-[12.5px] text-bone">{order.delivery.name}</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {order.delivery.requiresAddress
                  ? `${order.delivery.address}, ${order.delivery.city}, ${order.delivery.country}`
                  : 'Ntinda studio, Kampala — Mon–Sat 09:00–19:00'}
              </p>
              <p className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-muted/80">{order.delivery.eta}</p>
              {order.notes && (
                <p className="mt-2 border-t border-white/[0.07] pt-2 text-[11.5px] italic text-muted">“{order.notes}”</p>
              )}
              <p className="mt-2 text-[10.5px] text-muted/70">Placed {dateTime(order.createdAt)}</p>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-2 text-[12px] text-bone">
                <Icon name="truck" size={14} className="text-lime" />
                Packed in a rigid mailer
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Records ship outside the sleeve to stop seam splits. Damaged in transit? Send a photo
                within 7 days and we replace or refund.
              </p>
              <Link to="/shop" className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-lime hover:underline">
                Keep shopping
                <Icon name="arrow-right" size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
