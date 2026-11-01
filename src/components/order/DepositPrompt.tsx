import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { depositWhatsAppLink, ussdCodeFor, ussdDialUrl } from '../../lib/handoff';
import { Icon } from '../ui/Icon';
import type { DepositIntent, Order, PaymentMethod } from '../../types';

/**
 * "Ask my phone to pay" — the deposit step, without the dialling.
 *
 * The old flow printed a merchant number and a *165*3# instruction and hoped. This
 * sends a real collection request to the wallet approach number on the order, then
 * polls the provider until it answers. Every state is spelled out:
 *
 *   ready → pending (approve on your phone) → successful → confirmed by the desk
 *                                          ↘ failed (request another)
 *
 * `unconfigured` is its own state, not an error: the desk has not connected a
 * wallet API yet, so the component falls back to the manual instructions without
 * pretending anything was sent.
 */
export function DepositPrompt({
  order,
  method,
  onChanged,
}: {
  order: Order;
  method: PaymentMethod | null;
  onChanged?: () => void;
}) {
  const provider = order.payment?.method === 'airtel_money' ? 'airtel_money' : 'mtn_momo';
  const walletable = method?.id === 'mtn_momo' || method?.id === 'airtel_money';
  const depositUgx = order.quote?.totals?.deposit?.ugx ?? 0;
  const feeUgx = Math.ceil(depositUgx * 0.005);

  const [phone, setPhone] = useState(order.payment?.payerPhone ?? order.client?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<DepositIntent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; missing?: string[] } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const timer = useRef<number | null>(null);

  const paid = ['deposit_paid', 'paid'].includes(order.payment?.status ?? '');

  const stopPolling = () => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const poll = (intentId: string) => {
    stopPolling();
    timer.current = window.setInterval(async () => {
      try {
        const result = await api.depositStatus(order.id, intentId);
        setIntent(result.intent);
        setNotice(result.next);
        if (result.intent.status !== 'pending') {
          stopPolling();
          onChanged?.();
        }
      } catch {
        // A failed poll is not a failed payment; the next tick asks again.
      }
    }, 5000);
  };

  const request = async () => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await api.requestDeposit(order.id, { provider, payerPhone: phone });
      setIntent(result.intent);
      setNotice(result.message ?? 'Approve the prompt on your phone.');
      poll(result.intent.id);
    } catch (error) {
      stopPolling();
      if (error instanceof ApiError) {
        const payload = (error as ApiError & { payload?: { missing?: string[] } }).payload;
        setFailure({ message: error.message, missing: payload?.missing });
        // 503 = no wallet API connected. Say so once, then show the manual path.
        if (error.status === 503) setShowManual(true);
      } else {
        setFailure({ message: 'Could not reach the payment service. Try again, or dial the merchant number.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const statusTone =
    intent?.status === 'successful'
      ? 'text-lime'
      : intent?.status === 'failed'
        ? 'text-red-300'
        : 'text-amber-200';

  return (
    <div className="space-y-3">
      {walletable && !paid && (
        <div className="rounded-xl border border-lime/25 bg-lime/[0.05] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lime">
                Pay by {provider === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money'} prompt
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                We send a payment request to your wallet — approve it on your phone and the deposit is
                recorded. No dialling, no reference to mistype.
              </p>
            </div>
            <Icon name="bolt" size={15} className="mt-0.5 shrink-0 text-lime/70" />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                Mobile money number
              </span>
              <input
                type="tel"
                className="field mt-1 py-2.5 text-[13px]"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={provider === 'mtn_momo' ? '0772 000 000' : '0701 000 000'}
                disabled={Boolean(intent)}
              />
            </label>
            <button
              type="button"
              onClick={() => void request()}
              disabled={busy || Boolean(intent && intent.status === 'pending')}
              className="btn-lime h-[42px] px-4 text-[12px] disabled:opacity-50"
            >
              <Icon name={busy ? 'spinner' : 'send'} size={14} className={busy ? 'animate-spin' : ''} />
              {busy ? 'Sending' : intent ? 'Request again' : 'Send payment prompt'}
            </button>
          </div>

          <p className="mt-2 text-[10.5px] text-muted/80">
            Deposit UGX {depositUgx.toLocaleString('en-US')} · wallet fee about UGX{' '}
            {feeUgx.toLocaleString('en-US')} (0.5%, charged by the network)
          </p>

          {intent && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                  Request {intent.reference ?? intent.id}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${statusTone}`}>
                  {intent.status === 'pending'
                    ? 'waiting for approval'
                    : intent.status === 'successful'
                      ? order.payment?.status === 'deposit_paid'
                        ? 'deposit recorded'
                        : 'paid — awaiting desk'
                      : 'not completed'}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-bone/80">
                {notice ??
                  (intent.status === 'pending'
                    ? 'Approve the prompt on your phone — it expires in about 90 seconds.'
                    : intent.error ?? '')}
              </p>
              {intent.status === 'pending' && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                  <Icon name="spinner" size={11} className="animate-spin" />
                  Checking with {provider === 'mtn_momo' ? 'MTN' : 'Airtel'} every few seconds…
                </p>
              )}
            </div>
          )}

          {failure && (
            <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5">
              <p className="text-[11.5px] leading-relaxed text-amber-100/90">{failure.message}</p>
              {failure.missing?.length ? (
                <p className="mt-1 font-mono text-[10px] text-amber-200/70">
                  missing {failure.missing.join(', ')}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowManual((value) => !value)}
                className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-amber-200 underline underline-offset-2"
              >
                {showManual ? 'Hide' : 'Pay by hand instead'}
              </button>
            </div>
          )}
        </div>
      )}

      {(showManual || !walletable || paid) && walletable && !paid && (
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
          <span className="text-bone">Paying by hand:</span>{' '}
          {provider === 'mtn_momo' ? (
            <>
              dial <span className="text-bone">{ussdCodeFor('mtn_momo')}</span> → Pay Merchant →{' '}
              <span className="num text-bone">{method?.accountNumber}</span>, reference{' '}
              <span className="text-bone">{order.id}</span>.
            </>
          ) : (
            <>
              dial <span className="text-bone">{ussdCodeFor('airtel_money')}</span> → Pay Bill →{' '}
              <span className="num text-bone">{method?.accountNumber}</span>, reference{' '}
              <span className="text-bone">{order.id}</span>.
            </>
          )}{' '}
          Then send the receipt on WhatsApp and management records it.

          {/* A tel: link means the client taps once instead of retyping a code that
              their dialler cannot parse once the # is stripped. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              className="btn-ghost h-8 px-2.5 text-[11px]"
              href={ussdDialUrl(ussdCodeFor(provider))}
            >
              <Icon name="send" size={12} />
              Open {ussdCodeFor(provider)}
            </a>
            <a
              className="btn-ghost h-8 px-2.5 text-[11px]"
              href={depositWhatsAppLink(order)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="whatsapp" size={12} />
              Message the desk
            </a>
          </div>
        </div>
      )}

      {/* Paid, or prompt approved: the receipt goes into the chat the desk reads. */}
      {(paid || intent?.status === 'successful') && (
        <a
          className="btn-ghost h-9 px-3 text-[11.5px]"
          href={depositWhatsAppLink(order, { paid: true })}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="whatsapp" size={13} />
          Send proof of payment on WhatsApp
        </a>
      )}
    </div>
  );
}
