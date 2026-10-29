import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, clearAdminToken, getAdminToken, setAdminToken } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { usd, ugx, dateTime, relativeTime, bytes, statusLabel } from '../lib/format';
import { CONTACT, whatsappUrl, mailtoUrl } from '../lib/contact';
import type { AdminOverview, Order, WebhookEvent } from '../types';
import { Icon, type IconName } from '../components/ui/Icon';
import { StatusPill } from '../components/ui/StatusPill';
import { Logo } from '../components/ui/Logo';

const channelIcon: Record<string, IconName> = {
  slack: 'hash',
  email: 'mail',
  whatsapp: 'whatsapp',
  plant: 'factory',
};

/** One-tap alert for management: prefilled WhatsApp text with the whole order. */
const orderBrief = (order: Order) => {
  const fileNames = [...(order.files?.audio ?? []), ...(order.files?.artwork ?? [])]
    .map((file) => file.originalName)
    .join(', ');
  return [
    `NEW ORDER · ${order.id}`,
    `${order.client.name} — ${order.client.email} — ${order.client.phone}`,
    `${order.configuration.quantity} × ${order.quote.vinylType.name} · ${order.quote.sleeve.name}`,
    `Turnkey ${usd(order.quote.total, { cents: true })} (${ugx(order.quote.totals.total.ugx)}) · deposit ${usd(order.quote.deposit, { cents: true })}`,
    `Deliver to ${order.client.deliveryAddress}, ${order.client.deliveryCity}, ${order.client.country}`,
    fileNames ? `Files: ${fileNames}` : 'Files: pending',
    `${window.location.origin}/order/${order.id}`,
  ].join('\n');
};

const filters = [
  { id: 'all', label: 'All orders' },
  { id: 'action', label: 'Needs action' },
  { id: 'forwarded', label: 'At plant' },
  { id: 'delivered', label: 'Delivered' },
];

export function AdminPage() {
  const { notify } = useToast();
  const [token, setToken] = useState<string | null>(getAdminToken());
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [showPayload, setShowPayload] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [forwardPlant, setForwardPlant] = useState('mobineko');

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.adminOverview();
        setOverview(data);
        setLastSync(new Date());
        setError(null);
        setSelectedId((prev) => prev ?? data.orders[0]?.id ?? null);
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401) {
          clearAdminToken();
          setToken(null);
          notify('Session expired. Sign in again.', 'error');
        } else if (!silent) {
          setError(failure instanceof ApiError ? failure.message : 'Could not load the console.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    if (!token) return;
    void loadOverview();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOverview(true);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [token, loadOverview]);

  const orders = overview?.orders ?? [];
  const filtered = useMemo(() => {
    if (filter === 'action') return orders.filter((order) => order.status === 'received' || order.payment.status === 'awaiting_deposit');
    if (filter === 'forwarded') return orders.filter((order) => ['forwarded', 'in_production', 'shipped'].includes(order.status));
    if (filter === 'delivered') return orders.filter((order) => order.status === 'delivered');
    return orders;
  }, [orders, filter]);

  const selected = orders.find((order) => order.id === selectedId) ?? filtered[0] ?? orders[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Action failed. Try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const markDeposit = (order: Order) =>
    runAction(`deposit-${order.id}`, async () => {
      await api.adminMarkDeposit(order.id, order.quote.deposit);
      notify(`Deposit marked paid for ${order.id}.`, 'success');
      await loadOverview(true);
    });

  const depositCleared = (order: Order) =>
    order.payment.status === 'deposit_paid' || order.payment.status === 'paid';

  const forward = (order: Order) =>
    runAction(`forward-${order.id}`, async () => {
      // The API refuses this too — the deposit is the gate, not the button.
      if (!depositCleared(order)) {
        notify(`Confirm the deposit for ${order.id} first — suppliers are only contacted after it clears.`, 'error');
        return;
      }
      await api.adminForward(order.id, forwardPlant);
      notify(`${order.id} forwarded to the plant.`, 'success');
      await loadOverview(true);
    });

  const updateStatus = (order: Order, status: string) =>
    runAction(`status-${order.id}`, async () => {
      await api.adminUpdateOrder(order.id, { status });
      notify(`Status updated to ${statusLabel(status)}.`, 'success');
      await loadOverview(true);
    });

  const retryEvent = (event: WebhookEvent) =>
    runAction(`retry-${event.id}`, async () => {
      await api.adminRetryEvent(event.id);
      notify('Webhook re-queued.', 'success');
      window.setTimeout(() => void loadOverview(true), 1600);
    });

  const testAlert = () =>
    runAction('test', async () => {
      await api.adminTestEvent();
      notify('Test alert fired to the ops channel.', 'success');
      window.setTimeout(() => void loadOverview(true), 1200);
    });

  const resetDemo = () =>
    runAction('reset', async () => {
      await api.adminReset();
      notify('Demo data restored.', 'success');
      setSelectedId(null);
      await loadOverview();
    });

  const sendToWhatsApp = (order: Order) => {
    window.open(whatsappUrl(orderBrief(order)), '_blank', 'noopener');
    notify('WhatsApp draft opened — pick a chat and send.', 'success');
  };

  const emailBrief = (order: Order) => {
    window.location.href = mailtoUrl(`New order ${order.id} — ${order.client.name}`, orderBrief(order));
  };

  const copyPayload = async (order: Order) => {
    try {
      await navigator.clipboard.writeText(order.plantPayloadText ?? '');
      notify('Plant payload copied to clipboard.', 'success');
    } catch {
      notify('Copy failed — select the payload manually.', 'error');
    }
  };

  if (!token) {
    return <LoginScreen onSuccess={(next) => { setAdminToken(next); setToken(next); }} />;
  }

  return (
    <main className="min-h-screen pb-20 pt-24">
      <div className="container-x">
        {/* header */}
        <div className="mb-6 flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="eyebrow eyebrow-dot">Operations console</span>
              <span className="flex items-center gap-1.5 rounded-full border border-lime/25 bg-lime/[0.08] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-lime">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
                live
              </span>
            </div>
            <h1 className="display mt-2 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold">
              Order pipeline
            </h1>
            <p className="mt-1.5 text-[12px] text-muted">
              Every submission alerts the desk. The production request only leaves for the plant once you confirm
              the deposit{' '}
              {overview?.automation?.autoForward ? '— sent automatically at that point' : '(auto-forward is off, so press Forward)'}.
              {lastSync && <> Synced {relativeTime(lastSync.toISOString())}.</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void loadOverview()} className="btn-dark text-[12px]" disabled={loading}>
              <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button type="button" onClick={testAlert} className="btn-dark text-[12px]" disabled={busy === 'test'}>
              <Icon name="bolt" size={14} className="text-lime" />
              Test alert
            </button>
            <button type="button" onClick={resetDemo} className="btn-dark text-[12px]" disabled={busy === 'reset'}>
              <Icon name="refresh" size={14} />
              Reset demo
            </button>
            <button
              type="button"
              onClick={() => {
                clearAdminToken();
                setToken(null);
                setOverview(null);
              }}
              className="btn-dark text-[12px]"
            >
              <Icon name="logout" size={14} />
              Sign out
            </button>
          </div>
        </div>

        {overview?.automation && (
          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            <PipelineChip
              title="Desk alerts"
              ok={Boolean(overview.notifications?.configured)}
              detail={
                overview.notifications?.configured
                  ? 'Email / WhatsApp fire on every order'
                  : 'Add RESEND_API_KEY or WHATSAPP_TOKEN'
              }
            />
            <PipelineChip
              title="Plant hand-off"
              ok={Boolean(overview.automation.plantEmail) && overview.automation.autoForward}
              detail={
                overview.automation.plantEmail
                  ? `Deposit-gated · ${overview.automation.autoForward ? 'auto-emailed when the deposit clears' : 'manual forward after the deposit'}`
                  : 'Set the PLANT_*_EMAIL variables + RESEND_API_KEY'
              }
            />
            <PipelineChip
              title="WhatsApp template"
              ok={Boolean(overview.notifications?.channels?.find((c) => c.channel === 'whatsapp')?.live)}
              detail={
                overview.notifications?.channels?.find((c) => c.channel === 'whatsapp')?.live
                  ? `${overview.automation.whatsappTemplate?.name ?? 'new_vinyl_order'} template`
                  : 'Meta Cloud API not configured'
              }
            />
          </div>
        )}

        {overview && !overview.notifications?.configured && (
          <div className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-amber-200">
              <Icon name="bolt" size={14} />
              Alerts are simulated — nothing is actually sent yet
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-100/70">
              Add <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10.5px]">SLACK_WEBHOOK_URL</code>,{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10.5px]">RESEND_API_KEY</code> or{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10.5px]">WHATSAPP_TOKEN</code> in
              Vercel → Settings → Environment Variables, or one{' '}
              <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10.5px]">NOTIFY_WEBHOOK_URL</code> for
              everything. Full setup: <span className="text-amber-100">DEPLOYMENT.md → Notifications</span>.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-[12px] text-red-200">
            <Icon name="alert" size={14} />
            {error}
            <button type="button" onClick={() => void loadOverview()} className="ml-auto underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        {/* stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Pipeline value" value={overview ? usd(overview.summary.pipelineValueUsd, { cents: false }) : '—'} accent />
          <Stat label="Orders" value={overview ? String(overview.summary.orders) : '—'} hint="all time" />
          <Stat label="Records" value={overview ? overview.summary.units.toLocaleString('en-US') : '—'} hint="units pressed" />
          <Stat label="Deposits in" value={overview ? usd(overview.summary.collectedUsd, { cents: false }) : '—'} />
          <Stat label="Needs action" value={overview ? String(overview.summary.awaitingAction) : '—'} hint="unreleased" />
          <Stat label="Open alerts" value={overview ? String(overview.summary.undeliveredEvents) : '—'} hint="webhooks" />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          {/* order list */}
          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">Orders</h2>
              <div className="flex flex-wrap gap-1">
                {filters.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
                      filter === option.id ? 'bg-lime/15 text-lime' : 'text-muted hover:text-bone'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="max-h-[560px] divide-y divide-white/[0.06] overflow-y-auto">
              {filtered.length === 0 && (
                <li className="px-4 py-10 text-center text-[12px] text-muted">No orders in this view yet.</li>
              )}
              {filtered.map((order) => {
                const active = selected?.id === order.id;
                const config = order.quote;
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        active ? 'bg-lime/[0.06]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono text-[11.5px] ${active ? 'text-lime' : 'text-bone'}`}>
                              {order.id}
                            </span>
                            {order.demo && (
                              <span className="rounded border border-white/10 px-1 py-px text-[8px] uppercase tracking-wider text-muted">
                                demo
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate text-[12.5px] text-bone/90">{order.client.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-muted">
                            {order.configuration.quantity} × {config.vinylType?.shortName ?? 'vinyl'} ·{' '}
                            {config.sleeve?.shortName ?? 'sleeve'}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="num text-[12.5px] font-medium text-bone">
                            {usd(order.quote.total, { cents: false })}
                          </div>
                          <div className="mt-1">
                            <StatusPill status={order.status} dot={false} />
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* detail */}
          <section className="panel overflow-hidden">
            {!selected ? (
              <div className="grid h-full min-h-[320px] place-items-center px-6 text-center">
                <div>
                  <Icon name="search" size={22} className="mx-auto text-muted" />
                  <p className="mt-3 text-[12px] text-muted">Select an order to inspect and forward it.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] tracking-wide text-bone">{selected.id}</span>
                      <StatusPill status={selected.status} />
                      <StatusPill status={selected.payment.status} dot={false} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted">
                      Filed {dateTime(selected.createdAt)} · {selected.client.deliveryType === 'uganda' ? 'Uganda delivery' : 'Tour-city delivery'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-muted">Turnkey</div>
                    <div className="num text-[18px] font-semibold leading-tight text-lime">
                      {usd(selected.quote.total, { cents: true })}
                    </div>
                    <div className="text-[10px] text-muted">{ugx(selected.quote.totals.total.ugx)}</div>
                  </div>
                </div>

                <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                  <Panel title="Client">
                    <Detail label="Artist / Label" value={selected.client.name} />
                    <Detail label="Email" value={selected.client.email} link={`mailto:${selected.client.email}`} />
                    <Detail
                      label="WhatsApp"
                      value={selected.client.phone}
                      link={`https://wa.me/${selected.client.phone.replace(/[^0-9]/g, '')}`}
                    />
                    <Detail
                      label="Deliver to"
                      value={`${selected.client.deliveryAddress}, ${selected.client.deliveryCity}, ${selected.client.country}`}
                    />
                    {selected.client.notes && <Detail label="Notes" value={selected.client.notes} />}
                  </Panel>

                  <Panel title="Package">
                    <Detail
                      label="Format"
                      value={`${selected.configuration.quantity} × ${selected.quote.vinylType?.name ?? ''}`}
                    />
                    <Detail label="Packaging" value={selected.quote.sleeve?.name ?? ''} />
                    <Detail
                      label="Plant"
                      value={
                        selected.quote.plant?.name ??
                        overview?.plants.find((plant) => plant.id === selected.plantPreference)?.name ??
                        selected.plantPreference ??
                        'Mobineko'
                      }
                    />
                    <Detail label="Per record" value={usd(selected.quote.perUnit, { cents: true })} />
                    <Detail
                      label="Money"
                      value={`Factory ${usd(selected.quote.factoryCost, { cents: true })} + fee ${usd(
                        selected.quote.managementFee,
                        { cents: true },
                      )}`}
                    />
                    <Detail label="Deposit" value={`${usd(selected.quote.deposit, { cents: true })} · ${statusLabel(selected.payment.status)}`} />
                  </Panel>

                  <Panel title="Files" className="sm:col-span-2">
                    <div className="space-y-1.5">
                      {[
                        ...(selected.files?.audio ?? []).map((file) => ({ ...file, kind: 'audio' as const })),
                        ...(selected.files?.artwork ?? []).map((file) => ({ ...file, kind: 'artwork' as const })),
                      ].map((file) => (
                        <a
                          key={file.id}
                          href={`/api/files/${file.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 transition-colors hover:border-lime/30"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon
                              name={file.kind === 'audio' ? 'file-audio' : 'file-image'}
                              size={13}
                              className="shrink-0 text-lime"
                            />
                            <span className="truncate text-[11.5px] text-bone/85">{file.originalName}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted">
                            {bytes(file.size)}
                            <Icon name="external" size={11} />
                          </span>
                        </a>
                      ))}
                      {selected.files?.audioLink && (
                        <a
                          href={selected.files.audioLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-1 text-[10.5px] text-lime/80 hover:text-lime"
                        >
                          <Icon name="external" size={11} /> Master link
                        </a>
                      )}
                      {selected.files?.artworkLink && (
                        <a
                          href={selected.files.artworkLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-1 text-[10.5px] text-lime/80 hover:text-lime"
                        >
                          <Icon name="external" size={11} /> Artwork link
                        </a>
                      )}
                      {!selected.files?.audio?.length &&
                        !selected.files?.artwork?.length &&
                        !selected.files?.audioLink &&
                        !selected.files?.artworkLink && (
                          <p className="px-1 text-[11px] text-muted">No files attached.</p>
                        )}
                    </div>
                  </Panel>
                </div>

                {/* actions */}
                <div className="border-t border-white/[0.07] bg-black/20 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => markDeposit(selected)}
                      disabled={busy === `deposit-${selected.id}` || selected.payment.status === 'deposit_paid'}
                      className="btn-dark text-[11.5px] disabled:opacity-40"
                    >
                      <Icon name="check-circle" size={13} className="text-lime" />
                      {selected.payment.status === 'deposit_paid' ? 'Deposit received' : 'Mark deposit paid'}
                    </button>

                    <div className="flex items-center overflow-hidden rounded-full border border-white/10">
                      <select
                        value={forwardPlant}
                        onChange={(event) => setForwardPlant(event.target.value)}
                        className="bg-transparent py-2 pl-3 pr-1 text-[11.5px] text-bone focus:outline-none"
                      >
                        {(overview?.plants ?? []).map((plant) => (
                          <option key={plant.id} value={plant.id} className="bg-[#161615]">
                            {plant.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => forward(selected)}
                        disabled={busy === `forward-${selected.id}` || !depositCleared(selected)}
                        title={
                          depositCleared(selected)
                            ? 'Send the production request to the plant'
                            : 'Confirm the deposit first — suppliers are only contacted after it clears'
                        }
                        className="flex items-center gap-1.5 bg-lime px-3.5 py-2 text-[11.5px] font-semibold text-ink transition-colors hover:bg-lime-soft disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-muted"
                      >
                        <Icon name="factory" size={13} />
                        {depositCleared(selected) ? 'Forward' : 'Deposit first'}
                      </button>
                    </div>

                    <select
                      value={selected.status}
                      onChange={(event) => updateStatus(selected, event.target.value)}
                      className="rounded-full border border-white/10 bg-transparent px-3 py-2 text-[11.5px] text-bone focus:outline-none"
                    >
                      {['received', 'confirmed', 'forwarded', 'in_production', 'shipped', 'delivered', 'cancelled'].map(
                        (status) => (
                          <option key={status} value={status} className="bg-[#161615]">
                            {statusLabel(status)}
                          </option>
                        ),
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={() => sendToWhatsApp(selected)}
                      className="btn-dark text-[11.5px]"
                      title={`Opens a WhatsApp draft to ${CONTACT.phone}`}
                    >
                      <Icon name="whatsapp" size={13} filled className="text-lime" />
                      Alert on WhatsApp
                    </button>

                    <button
                      type="button"
                      onClick={() => emailBrief(selected)}
                      className="btn-dark text-[11.5px]"
                      title={`Opens an email draft to ${CONTACT.email}`}
                    >
                      <Icon name="mail" size={13} className="text-lime" />
                      Email brief
                    </button>

                    <button
                      type="button"
                      onClick={() => copyPayload(selected)}
                      className="btn-dark ml-auto text-[11.5px]"
                    >
                      <Icon name="copy" size={13} />
                      Copy plant payload
                    </button>
                  </div>

                  {selected.plantHandoff && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                      <span className="uppercase tracking-[0.14em]">Plant hand-off</span>
                      <span className={selected.plantHandoff.status === 'delivered' ? 'text-lime' : 'text-amber-300'}>
                        {selected.plantHandoff.status}
                      </span>
                      <span>· {selected.plantHandoff.by === 'system' ? 'automatic' : 'manual'}</span>
                      <span>· {dateTime(selected.plantHandoff.at)}</span>
                      {selected.plantHandoff.error && (
                        <span className="text-red-300">· {selected.plantHandoff.error}</span>
                      )}
                    </p>
                  )}

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowPayload((prev) => !prev)}
                      className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:text-bone"
                    >
                      Payload forwarded to {overview?.plants.find((p) => p.id === (selected.plantPreference ?? 'mobineko'))?.name ?? 'plant'}
                      <Icon name="chevron-down" size={13} className={showPayload ? 'rotate-180' : ''} />
                    </button>
                    {showPayload && (
                      <pre className="mt-2.5 max-h-64 overflow-auto rounded-lg border border-white/[0.07] bg-black/40 p-3.5 font-mono text-[10.5px] leading-relaxed text-bone/75">
                        {selected.plantPayloadText ?? 'Payload generated when forwarded.'}
                      </pre>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* webhook log */}
        <section className="panel mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-lime/10 text-lime">
                <Icon name="bolt" size={13} />
              </span>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">
                Webhook alert log
              </h2>
              <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">
                {overview?.events.length ?? 0} events
              </span>
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  overview?.notifications?.configured
                    ? 'border-lime/30 bg-lime/[0.08] text-lime'
                    : 'border-amber-400/30 bg-amber-400/[0.08] text-amber-200'
                }`}
              >
                {overview?.notifications?.configured ? 'live delivery' : 'simulated'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.12em] text-muted">
              {(overview?.channels ?? []).map((channel) => (
                <span
                  key={channel.channel}
                  title={channel.detail ?? ''}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
                    channel.live
                      ? 'border-lime/30 bg-lime/[0.08] text-lime'
                      : 'border-white/10 text-muted'
                  }`}
                >
                  <Icon name={channelIcon[channel.channel] ?? 'bolt'} size={11} filled={channel.channel === 'whatsapp'} />
                  {channel.label}
                  <span className="text-[8px] font-semibold uppercase tracking-[0.1em] opacity-80">
                    {channel.live ? 'live' : 'sim'}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <ul className="max-h-[420px] divide-y divide-white/[0.05] overflow-y-auto">
            {(overview?.events ?? []).map((event) => {
              const pending = event.status !== 'delivered';
              return (
                <li key={event.id} className="group flex flex-wrap items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${
                      pending ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-lime/25 bg-lime/[0.08] text-lime'
                    }`}
                  >
                    <Icon name={channelIcon[event.channel] ?? 'bolt'} size={12} filled={event.channel === 'whatsapp'} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="font-mono text-[11px] text-lime/90">{event.orderId}</span>
                      <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted">{event.target}</span>
                      {event.mode === 'live' && (
                        <span className="rounded border border-lime/30 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-lime/80">
                          live
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-bone/80">{event.message}</p>
                    {event.status === 'failed' && event.error && (
                      <p className="mt-1 flex items-start gap-1.5 text-[10.5px] leading-snug text-red-300">
                        <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
                        {event.error}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div
                        className={`text-[9.5px] font-semibold uppercase tracking-[0.1em] ${
                          event.status === 'failed'
                            ? 'text-red-300'
                            : event.status === 'simulated'
                              ? 'text-muted'
                              : pending
                                ? 'text-amber-300'
                                : 'text-lime/80'
                        }`}
                      >
                        {statusLabel(event.status)}
                      </div>
                      <div className="text-[9.5px] text-muted">{relativeTime(event.createdAt)}</div>
                    </div>
                    {(pending || event.status === 'failed') && (
                      <button
                        type="button"
                        onClick={() => retryEvent(event)}
                        disabled={busy === `retry-${event.id}`}
                        className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-muted transition-colors hover:border-lime/40 hover:text-lime disabled:opacity-40"
                        aria-label="Retry webhook"
                      >
                        <Icon name="refresh" size={11} className={busy === `retry-${event.id}` ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {(overview?.events ?? []).length === 0 && (
              <li className="px-4 py-10 text-center text-[12px] text-muted">
                No alerts yet — place an order or fire a test alert.
              </li>
            )}
          </ul>
        </section>

        <p className="mt-4 flex items-center gap-2 text-[10.5px] text-muted">
          <Icon name="lock" size={11} className="text-lime/60" />
          Demo console · alerts are simulated locally, no third-party webhooks are dispatched.
        </p>
      </div>
    </main>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.adminLogin(passcode);
      onSuccess(result.token);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-5 py-24">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-40 [mask-image:radial-gradient(55%_55%_at_50%_40%,black,transparent)]" />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="panel p-7">
          <div className="mb-6 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-lime/25 bg-lime/[0.08] text-lime">
              <Icon name="lock" size={18} />
            </span>
            <h1 className="mt-4 font-display text-[22px] font-semibold tracking-tight">Operations console</h1>
            <p className="mt-1.5 text-[12px] text-muted">
              Restricted to 7H Music Group management. Enter your access code to view orders and the
              webhook log.
            </p>
          </div>

          <label className="block">
            <span className="label">Access code</span>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              className={`field text-center font-mono tracking-[0.3em] ${error ? 'field-error' : ''}`}
            />
          </label>

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-red-300">
              <Icon name="alert" size={12} />
              {error}
            </p>
          )}

          <button type="submit" disabled={busy || passcode.length === 0} className="btn-lime mt-5 w-full">
            {busy ? <Icon name="spinner" size={15} className="animate-spin" /> : <Icon name="lock" size={15} />}
            {busy ? 'Verifying…' : 'Enter console'}
          </button>

          <p className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <Icon name="lock" size={12} className="mt-0.5 shrink-0 text-lime/70" />
            <span>
              Codes are issued by 7H management and never shown here. Lost yours?{' '}
              <a
                href={mailtoUrl('Operations console access')}
                className="text-bone underline decoration-white/20 underline-offset-2 transition-colors hover:text-lime"
              >
                Ask for a reset
              </a>
              .
            </span>
          </p>
        </form>

        <p className="mt-5 text-center text-[11px] text-muted">
          Client?{' '}
          <a href="/order" className="text-bone underline decoration-white/20 underline-offset-2 hover:text-lime">
            Place an order instead
          </a>
        </p>
      </div>
    </main>
  );
}

function PipelineChip({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        ok ? 'border-lime/25 bg-lime/[0.05]' : 'border-white/[0.08] bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] ${
            ok ? 'bg-lime text-ink' : 'bg-white/10 text-muted'
          }`}
        >
          {ok ? 'auto' : 'off'}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">{detail}</p>
    </div>
  );
}

function Stat({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`card p-3.5 ${accent ? 'border-lime/20 bg-lime/[0.05]' : ''}`}>
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`num mt-1.5 text-[19px] font-semibold leading-none ${accent ? 'text-lime' : 'text-bone'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[9.5px] text-muted/80">{hint}</div>}
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/[0.07] bg-black/15 p-3.5 ${className}`}>
      <h3 className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Detail({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11.5px]">
      <span className="shrink-0 text-muted">{label}</span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="max-w-[70%] break-words text-right text-lime/90 underline decoration-lime/20 underline-offset-2 hover:text-lime"
        >
          {value}
        </a>
      ) : (
        <span className="max-w-[70%] break-words text-right text-bone/85">{value}</span>
      )}
    </div>
  );
}
