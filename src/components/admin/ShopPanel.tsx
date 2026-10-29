import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { usd, dateTime, initials } from '../../lib/format';
import { whatsappUrl } from '../../lib/contact';
import { Icon } from '../ui/Icon';
import { StatusPill } from '../ui/StatusPill';
import { useToast } from '../ui/Toast';
import type { AdminShop, AdminShopOrder } from '../../types';

const STATUSES = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;

/**
 * Shop console.
 *
 * The pressing pipeline and the retail shelf are different businesses, so this
 * panel is self-contained: it loads its own numbers, and every action here
 * (mark paid, move an order along, put stock back) refreshes only the shop.
 */
export function ShopPanel() {
  const { notify } = useToast();
  const [shop, setShop] = useState<AdminShop | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all' | 'awaiting'>('open');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(
    async (announce = false) => {
      try {
        const data = await api.adminShop();
        setShop(data);
        setDrafts(
          Object.fromEntries(data.stock.map((row) => [row.releaseId, String(row.stock)])),
        );
        if (announce) notify('Shop shelf refreshed.', 'success');
      } catch (failure) {
        notify(failure instanceof ApiError ? failure.message : 'Could not load the shop.', 'error');
      }
    },
    [notify],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, action: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await action();
      notify(done, 'success');
      await load();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Action failed. Try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const markPaid = (order: AdminShopOrder) =>
    act(
      `pay-${order.id}`,
      () => api.adminUpdateShopOrder(order.id, { paymentStatus: 'paid' }).then(() => undefined),
      `${order.id} marked paid — the packer can take it now.`,
    );

  const setStatus = (order: AdminShopOrder, status: string) =>
    act(
      `status-${order.id}`,
      () => api.adminUpdateShopOrder(order.id, { status }).then(() => undefined),
      status === 'cancelled'
        ? `${order.id} cancelled — records returned to the shelf.`
        : `${order.id} → ${status}.`,
    );

  const saveStock = (releaseId: string) =>
    act(
      `stock-${releaseId}`,
      () =>
        api
          .adminSetStock(releaseId, Number(drafts[releaseId] ?? 0))
          .then(() => undefined),
      'Stock updated.',
    );

  if (!shop) {
    return (
      <section className="panel mt-5 p-6">
        <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
      </section>
    );
  }

  const visible = shop.orders.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'awaiting') return order.payment.status !== 'paid' && order.status !== 'cancelled';
    return order.status !== 'delivered' && order.status !== 'cancelled';
  });

  return (
    <section className="panel mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">The shop</h2>
          <span className="rounded-full border border-lime/25 bg-lime/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-lime">
            {shop.summary.open} open · {shop.summary.recordsSold} sold
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(['open', 'awaiting', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium capitalize transition-colors ${
                filter === option ? 'bg-lime/15 text-lime' : 'text-muted hover:text-bone'
              }`}
            >
              {option === 'awaiting' ? 'unpaid' : option}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-1 grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted hover:text-lime"
            aria-label="Refresh shop"
          >
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>

      {/* numbers */}
      <div className="grid grid-cols-2 gap-2 border-b border-white/[0.07] px-4 py-3 sm:grid-cols-4">
        <ShopStat label="Revenue collected" value={usd(shop.summary.revenueUsd, { cents: false })} accent />
        <ShopStat label="Awaiting payment" value={String(shop.summary.awaitingPayment)} />
        <ShopStat label="Records on the shelf" value={String(shop.summary.unitsLeft)} />
        <ShopStat label="Orders to pack" value={String(shop.summary.open)} />
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr]">
        {/* orders */}
        <div className="border-b border-white/[0.07] lg:border-b-0 lg:border-r">
          <ul className="max-h-[430px] divide-y divide-white/[0.06] overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-4 py-10 text-center text-[12px] text-muted">
                No shop orders in this view yet. Fan purchases land here the moment they check out.
              </li>
            )}
            {visible.map((order) => {
              const paid = order.payment.status === 'paid';
              return (
                <li key={order.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-[9px] font-semibold text-muted">
                        {initials(order.buyer.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11.5px] text-bone">{order.id}</span>
                          <StatusPill status={order.status} dot={false} />
                          {!paid && order.status !== 'cancelled' && (
                            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-[0.1em] text-amber-200">
                              unpaid
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-[12.5px] text-bone/90">
                          {order.buyer.name} · {order.records} record{order.records === 1 ? '' : 's'}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted">
                          {order.items.map((item) => `${item.quantity} × ${item.title}`).join(', ')}
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-muted/80">
                          {order.delivery.name} · {dateTime(order.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-[13px] font-medium text-bone">{usd(order.total)}</div>
                      <div className="mt-0.5 text-[10px] text-muted">{order.payment.status}</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {!paid && order.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => markPaid(order)}
                        disabled={busy === `pay-${order.id}`}
                        className="flex items-center gap-1 rounded-full bg-lime px-2.5 py-1 text-[10.5px] font-semibold text-ink disabled:opacity-40"
                      >
                        <Icon name="check-circle" size={11} />
                        Mark paid
                      </button>
                    )}

                    <select
                      value={order.status}
                      onChange={(event) => setStatus(order, event.target.value)}
                      disabled={busy === `status-${order.id}`}
                      aria-label={`Status for ${order.id}`}
                      className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10.5px] text-bone focus:border-lime/50 focus:outline-none"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status} className="bg-[#161615]">
                          {status}
                        </option>
                      ))}
                    </select>

                    <a
                      href={whatsappUrl(
                        paid
                          ? `Hi ${order.buyer.name.split(' ')[0]} — your 7H order ${order.id} is confirmed and packing today.`
                          : `Hi ${order.buyer.name.split(' ')[0]} — 7H here about order ${order.id}. Send payment to confirm and we pack today.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] text-muted hover:border-lime/40 hover:text-lime"
                    >
                      <Icon name="whatsapp" size={11} filled />
                      {paid ? 'Update' : 'Payment reminder'}
                    </a>
                    <a
                      href={`mailto:${order.buyer.email}?subject=${encodeURIComponent(`7H order ${order.id}`)}`}
                      className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] text-muted hover:border-lime/40 hover:text-lime"
                    >
                      <Icon name="mail" size={11} />
                      Email
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* stock */}
        <div className="p-4">
          <h3 className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">
            Shelf stock
          </h3>
          <ul className="space-y-2">
            {shop.stock.map((row) => {
              const draft = drafts[row.releaseId] ?? String(row.stock);
              const dirty = draft !== String(row.stock);
              return (
                <li key={row.releaseId} className="flex items-center gap-2.5">
                  <img src={row.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] text-bone">{row.title}</div>
                    <div className="text-[10px] text-muted">
                      {row.release} · {row.sold} sold ·{' '}
                      {row.stock === 0 ? (
                        <span className="text-red-300">sold out</span>
                      ) : row.lowStock ? (
                        <span className="text-amber-200">{row.stock} left</span>
                      ) : (
                        <span>{row.stock} left</span>
                      )}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={draft}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [row.releaseId]: event.target.value }))
                    }
                    className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-right text-[11.5px] text-bone focus:border-lime/50 focus:outline-none"
                    aria-label={`Stock for ${row.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => saveStock(row.releaseId)}
                    disabled={!dirty || busy === `stock-${row.releaseId}`}
                    className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] font-medium text-bone transition-colors hover:bg-white/[0.14] disabled:opacity-30"
                  >
                    Save
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-muted/80">
            Stock decrements itself on every sale. Cancelling an order puts its records back; use
            Save here after a restock lands.
          </p>
        </div>
      </div>
    </section>
  );
}

function ShopStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${accent ? 'border-lime/20 bg-lime/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
      <div className="text-[8.5px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`num mt-1 text-[15px] font-semibold leading-none ${accent ? 'text-lime' : 'text-bone'}`}>
        {value}
      </div>
    </div>
  );
}
