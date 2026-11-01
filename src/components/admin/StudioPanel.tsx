import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { usd } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Icon } from '../ui/Icon';
import type { Order } from '../../types';

/**
 * The studio side.
 *
 * Most orders are agreed on the phone and then typed in by the artist, which is
 * backwards: the desk already knows the run size, the jacket and the plant. This
 * panel builds the order *for* the client — priced by the same engine, invoiced
 * immediately as a provisional invoice, and held as a **draft** until the client
 * confirms.
 *
 * A draft is not a commitment. No alerts fire, the invoice says provisional, and
 * the deposit gate still stands between a draft and a plant.
 */

const FORMATS = [
  { id: 'lp_standard', label: '12" LP · black' },
  { id: 'lp_colored', label: '12" LP · colour' },
  { id: 'seven_single', label: '7" single' },
];

const SLEEVES = [
  { id: 'standard', label: 'Standard jacket' },
  { id: 'gatefold', label: 'Gatefold' },
  { id: 'inner', label: 'Printed inner' },
];

const QUANTITIES = [1, 25, 50, 100, 250, 500, 1000];

export function StudioPanel() {
  const { notify } = useToast();
  const [drafts, setDrafts] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    country: 'Uganda',
    quantity: '250',
    vinylTypeId: 'lp_standard',
    sleeveId: 'standard',
    tracklist: '',
    note: '',
    audioLink: '',
    artworkLink: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await api.adminOverview();
      setDrafts(overview.orders.filter((order) => order.status === 'draft'));
    } catch {
      /* the console is already reporting outages elsewhere */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const create = async () => {
    setBusy('create');
    try {
      const result = await api.adminCreateDraft({
        client: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          country: form.country.trim() || 'Uganda',
          notes: form.note.trim() || undefined,
        },
        configuration: {
          quantity: Number(form.quantity),
          vinylTypeId: form.vinylTypeId,
          sleeveId: form.sleeveId,
        },
        tracklist: form.tracklist.trim() || undefined,
        note: form.note.trim() || undefined,
        audioLink: form.audioLink.trim() || undefined,
        artworkLink: form.artworkLink.trim() || undefined,
      });
      notify(
        `${result.invoice.number} drafted for ${result.order.client.name} — ${usd(result.order.quote.total, { cents: true })}.`,
        'success',
      );
      setOpen(false);
      setForm((prev) => ({ ...prev, name: '', email: '', phone: '', tracklist: '', note: '', audioLink: '', artworkLink: '' }));
      await load();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Could not build that draft.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const release = async (order: Order) => {
    setBusy(order.id);
    try {
      await api.adminUpdateOrder(order.id, { status: 'received' });
      notify(`${order.id} is now a live order — the client can be asked for the deposit.`, 'success');
      await load();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Could not move that draft.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel p-5" id="studio">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-bone">
            <Icon name="music" className="h-4 w-4 text-lime" />
            Studio desk
          </h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-muted">
            Build an order for a client you agreed it with on the phone. It is priced on the same
            engine the site uses, invoiced immediately as a provisional invoice, and held as a draft
            until the client confirms — no alerts, no plant, no commitment.
          </p>
        </div>
        <button type="button" className="btn-lime !px-3.5 !py-2 text-[12px]" onClick={() => setOpen((prev) => !prev)}>
          <Icon name={open ? 'minus' : 'plus'} className="h-3.5 w-3.5" />
          {open ? 'Close' : 'New draft order'}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Artist or label</span>
            <input
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
              placeholder="e.g. Kizza Roots"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Email</span>
            <input
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
              placeholder="artist@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">WhatsApp</span>
            <input
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
              placeholder="+256 772 000 000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Country</span>
            <input
              value={form.country}
              onChange={(event) => set('country', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Run size</span>
            <select
              value={form.quantity}
              onChange={(event) => set('quantity', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
            >
              {QUANTITIES.map((quantity) => (
                <option key={quantity} value={quantity}>
                  {quantity.toLocaleString('en-US')}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Format</span>
            <select
              value={form.vinylTypeId}
              onChange={(event) => set('vinylTypeId', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
            >
              {FORMATS.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Sleeve</span>
            <select
              value={form.sleeveId}
              onChange={(event) => set('sleeveId', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
            >
              {SLEEVES.map((sleeve) => (
                <option key={sleeve.id} value={sleeve.id}>
                  {sleeve.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Master link (optional)</span>
            <input
              value={form.audioLink}
              onChange={(event) => set('audioLink', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
              placeholder="https://drive.google.com/…"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Tracklist</span>
            <textarea
              value={form.tracklist}
              onChange={(event) => set('tracklist', event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
              placeholder="A1 … 3:42&#10;A2 … 4:05"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Desk note</span>
            <input
              value={form.note}
              onChange={(event) => set('note', event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-bone focus:border-lime/50 focus:outline-none"
              placeholder="Agreed on WhatsApp, 12 Nov — gatefold, colour, ships March"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              className="btn-lime !px-4 !py-2 text-[12px]"
              onClick={() => void create()}
              disabled={busy === 'create'}
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              {busy === 'create' ? 'Building…' : 'Create draft'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
        ) : drafts.length === 0 ? (
          <p className="text-[12px] text-muted">No drafts. Anything built here appears until the client confirms it.</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-bone">
                    {order.client.name}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{order.id}</span>
                  </div>
                  <div className="text-[10.5px] text-muted">
                    {order.configuration.quantity.toLocaleString('en-US')} ×{' '}
                    {order.quote.vinylType?.shortName ?? order.configuration.vinylTypeId} ·{' '}
                    {order.quote.sleeve?.shortName ?? order.configuration.sleeveId} ·{' '}
                    {usd(order.quote.total, { cents: true })} · provisional invoice{' '}
                    {order.invoice?.number ?? 'issued'}
                  </div>
                </div>
                <a
                  href={`/api/admin/orders/${encodeURIComponent(order.id)}/invoice`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] text-muted hover:border-lime/40 hover:text-lime"
                >
                  <Icon name="printer" size={11} />
                  Invoice
                </a>
                <button
                  type="button"
                  onClick={() => void release(order)}
                  disabled={busy === order.id}
                  className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] font-medium text-bone hover:bg-white/[0.14] disabled:opacity-40"
                >
                  {busy === order.id ? 'Moving…' : 'Client confirmed'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
