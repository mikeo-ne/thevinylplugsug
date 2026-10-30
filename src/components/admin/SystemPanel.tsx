import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import type { AlertTestResult, SystemHealth, TelegramChats, TelegramWebhook } from '../../types';

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  slack: 'Slack',
  webhook: 'Webhook',
  plant: 'Pressing plant',
};

const CHANNEL_ICON: Record<string, 'mail' | 'whatsapp' | 'send' | 'hash' | 'factory' | 'bolt'> = {
  email: 'mail',
  whatsapp: 'whatsapp',
  telegram: 'send',
  slack: 'hash',
  plant: 'factory',
  webhook: 'bolt',
};

/**
 * System console: where the data lives, and whether alerts actually leave.
 *
 * Both questions used to be answered by reading environment variables on a
 * laptop. Here they are answered by the running system: the database driver
 * reports itself (and whether it survives a deploy), each alert channel lists the
 * variables it is missing, and "Send test alert" makes a real call so a provider
 * rejection shows up with the provider's own words.
 */
export function SystemPanel() {
  const { notify } = useToast();
  const [system, setSystem] = useState<SystemHealth | null>(null);
  const [testing, setTesting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [results, setResults] = useState<AlertTestResult[] | null>(null);
  const [telegram, setTelegram] = useState<TelegramChats | null>(null);
  const [findingChats, setFindingChats] = useState(false);
  const [webhook, setWebhook] = useState<TelegramWebhook | null>(null);
  const [switchingReplies, setSwitchingReplies] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSystem(await api.adminSystem());
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not read the system status.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * "Which chat id am I?" — Telegram never shows it in the app, and the manual
   * route is to open a JSON URL. This asks the bot directly and hands back the
   * ids to paste into TELEGRAM_CHAT_ID.
   */
  const findChats = async () => {
    setFindingChats(true);
    try {
      const found = await api.adminTelegramChats();
      setTelegram(found);
      if (found.status === 'ok' && found.chats.length > 0) {
        notify(`${found.chats.length} chat${found.chats.length === 1 ? '' : 's'} found.`, 'success');
      } else if (found.status === 'error') {
        notify(found.error ?? 'Telegram refused the lookup.', 'error');
      }
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not reach the Bot API.', 'error');
    } finally {
      setFindingChats(false);
    }
  };

  /** Turn the bot's replies on (register the webhook) or off again. */
  const toggleReplies = async () => {
    setSwitchingReplies(true);
    try {
      const enabled = webhook?.configured !== true;
      const result = enabled ? await api.adminEnableTelegramReplies() : await api.adminDisableTelegramReplies();
      setWebhook(result.info);
      setTelegram(null);
      notify(
        enabled
          ? 'Replies on — message the bot in Telegram and it will answer with your chat id.'
          : 'Replies off — Find chat id works again.',
        'success',
      );
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Telegram would not change the webhook.', 'error');
    } finally {
      setSwitchingReplies(false);
    }
  };

  const loadWebhook = useCallback(async () => {
    try {
      setWebhook(await api.adminTelegramWebhook());
    } catch {
      // The panel is still useful without it; the button reports its own errors.
    }
  }, []);

  useEffect(() => {
    if (system) void loadWebhook();
  }, [system, loadWebhook]);

  const copyChat = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      notify(`Copied ${id}.`, 'success');
    } catch {
      notify('Copy failed — select the id by hand.', 'error');
    }
  };

  const sendTests = async () => {
    setTesting(true);
    try {
      const { results: sent } = await api.adminTestAlerts();
      setResults(sent);
      const delivered = sent.filter((result) => result.status === 'delivered').length;
      const failed = sent.filter((result) => result.status === 'failed').length;
      const unconfigured = sent.filter((result) => result.status === 'unconfigured').length;
      if (delivered > 0) {
        notify(
          `${delivered} alert${delivered === 1 ? '' : 's'} delivered${
            unconfigured > 0 ? ` · ${unconfigured} channel${unconfigured === 1 ? '' : 's'} not set up yet` : ''
          }.`,
          'success',
        );
      }
      if (failed > 0 && delivered === 0) {
        notify('No channel could send — see the error beside each one.', 'error');
      }
      await load();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Could not send the test.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const { summary } = await api.adminRetryAlerts();
      notify(
        summary.attempted === 0
          ? 'Nothing left to retry.'
          : `${summary.delivered} of ${summary.attempted} retried alerts delivered.`,
        summary.failed > 0 ? 'error' : 'success',
      );
      await load();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Could not retry.', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const database = system?.database;
  const env = system?.alerts.env ?? [];
  const outbox = system?.alerts.outbox;

  return (
    <section className="panel mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-lime/10 text-lime">
            <Icon name="shield" size={13} />
          </span>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">System</h2>
          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">
            database &amp; alerts
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-bone"
        >
          <Icon name="refresh" size={12} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="border-b border-white/[0.07] px-4 py-3 text-[11.5px] text-red-300">{error}</p>
      )}

      <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
        {/* ------------------------------ database ------------------------------ */}
        <div className="bg-ink px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Database</span>
            {database && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  database.persistent
                    ? 'border-lime/30 bg-lime/[0.08] text-lime'
                    : 'border-amber-400/30 bg-amber-400/[0.08] text-amber-200'
                }`}
              >
                {database.persistent ? 'persistent' : 'resets on deploy'}
              </span>
            )}
          </div>

          <p className="mt-2 text-[13.5px] font-medium text-bone">{database?.label ?? 'Checking…'}</p>
          {database?.detail && <p className="mt-0.5 font-mono text-[10.5px] text-muted">{database.detail}</p>}
          {database?.error && <p className="mt-1 text-[11px] text-red-300">{database.error}</p>}

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Orders</dt>
              <dd className="num text-bone">{database?.counts?.orders ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Shop orders</dt>
              <dd className="num text-bone">{database?.counts?.shopOrders ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Alerts logged</dt>
              <dd className="num text-bone">{database?.counts?.events ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">Response</dt>
              <dd className="num text-bone">{database?.latencyMs != null ? `${database.latencyMs}ms` : '—'}</dd>
            </div>
          </dl>

          {database && !database.persistent && (
            <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-amber-100/90">
                Orders live on the function&rsquo;s own disk, so a redeploy or cold start clears them. Add a
                <span className="mx-1 font-mono text-[10.5px]">DATABASE_URL</span>
                in Vercel to keep them.
              </p>
            </div>
          )}
        </div>

        {/* ------------------------------- alerts ------------------------------- */}
        <div className="bg-ink px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Alerts</span>
            <button
              type="button"
              onClick={() => void sendTests()}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-full border border-lime/40 bg-lime/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-lime transition-opacity disabled:opacity-50"
            >
              <Icon name={testing ? 'spinner' : 'bolt'} size={11} className={testing ? 'animate-spin' : ''} />
              {testing ? 'Sending' : 'Send test alert'}
            </button>
          </div>

          <ul className="mt-3 space-y-2">
            {(system?.alerts.channels ?? []).map((channel) => {
              const channelEnv = env.find((entry) => entry.channel === channel.channel);
              const result = results?.find((entry) => entry.channel === channel.channel);
              return (
                <li key={channel.channel} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-bone">
                      <Icon name={CHANNEL_ICON[channel.channel] ?? 'bolt'} size={11} className="text-muted" />
                      {CHANNEL_LABEL[channel.channel] ?? channel.channel}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider ${
                        channel.live
                          ? 'bg-lime/[0.12] text-lime'
                          : 'bg-amber-400/[0.1] text-amber-200'
                      }`}
                    >
                      {channel.live ? 'live' : 'simulated'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-muted" title={channel.detail}>
                    {channel.detail}
                  </p>

                  {!channelEnv?.ready && channelEnv?.missing.length ? (
                    <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-amber-200/80">
                      missing {channelEnv.missing.join(', ')}
                    </p>
                  ) : null}

                  {channel.channel === 'telegram' && (
                    <div className="mt-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => void findChats()}
                          disabled={findingChats}
                          className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-bone disabled:opacity-40"
                        >
                          <Icon name={findingChats ? 'spinner' : 'search'} size={10} className={findingChats ? 'animate-spin' : ''} />
                          Find chat id
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleReplies()}
                          disabled={switchingReplies || !env.find((entry) => entry.channel === 'telegram')?.variables.find((variable) => variable.key === 'TELEGRAM_BOT_TOKEN')?.set}
                          title="Let the bot answer messages, so it can tell you your chat id in chat"
                          className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-bone disabled:opacity-30"
                        >
                          <Icon name={switchingReplies ? 'spinner' : 'bolt'} size={10} className={switchingReplies ? 'animate-spin' : ''} />
                          {webhook?.configured ? 'Replies on · switch off' : 'Enable replies'}
                        </button>
                      </div>
                      <p className="mt-1 text-[9px] leading-relaxed text-muted/70">
                        A bot only speaks when something listens. Replies on = message it and it answers with
                        your chat id; replies off = Find chat id reads Telegram directly.
                      </p>
                      {webhook && !webhook.configured && webhook.lastError && (
                        <p className="mt-1 text-[9px] leading-relaxed text-amber-200/80">
                          Telegram could not reach the webhook: {webhook.lastError}
                        </p>
                      )}

                      {telegram && (
                        <div className="mt-1.5 rounded-md border border-white/[0.07] bg-black/20 px-2 py-1.5">
                          {telegram.status === 'ok' && telegram.chats.length > 0 ? (
                            <>
                              <p className="text-[9.5px] text-muted">
                                {telegram.bot ?? 'The bot'} has heard from:
                              </p>
                              <ul className="mt-1 space-y-1">
                                {telegram.chats.map((chat) => (
                                  <li key={chat.id} className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[10px] text-bone/85">
                                      {chat.title ?? chat.type}
                                      {chat.username ? ` · ${chat.username}` : ''}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1">
                                      <code className="font-mono text-[10px] text-lime">{chat.id}</code>
                                      <button
                                        type="button"
                                        onClick={() => void copyChat(chat.id)}
                                        title={`Copy ${chat.id}`}
                                        className="text-muted transition-colors hover:text-bone"
                                      >
                                        <Icon name="copy" size={10} />
                                      </button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-1 text-[9px] leading-relaxed text-muted/80">
                                Paste it into TELEGRAM_CHAT_ID in Vercel, then redeploy.
                              </p>
                            </>
                          ) : (
                            <p className="text-[9.5px] leading-relaxed text-amber-200/80">
                              {telegram.error ?? telegram.hint ?? 'No chats yet.'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {result && (
                    <p
                      className={`mt-1 text-[10.5px] leading-relaxed ${
                        result.status === 'delivered'
                          ? 'text-lime'
                          : result.status === 'unconfigured'
                            ? 'text-amber-200'
                            : 'text-red-300'
                      }`}
                    >
                      {result.status === 'delivered'
                        ? `Test delivered${result.target ? ` → ${result.target}` : ''}`
                        : result.status === 'unconfigured'
                          ? `Not set up — ${result.error ?? 'add its variables in Vercel'}`
                          : `Test failed — ${result.error ?? 'unknown error'}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 text-[10.5px]">
            <span className="text-muted">
              Outbox: <span className="text-bone">{outbox?.counts.delivered ?? 0}</span> delivered
              {outbox?.counts.failed ? (
                <>
                  {' · '}
                  <span className="text-red-300">{outbox.counts.failed} failed</span>
                </>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => void retryFailed()}
              disabled={retrying || !outbox?.retryable}
              className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-bone disabled:opacity-40"
            >
              <Icon name={retrying ? 'spinner' : 'refresh'} size={11} className={retrying ? 'animate-spin' : ''} />
              Retry failed
            </button>
          </div>

          {outbox?.failures.length ? (
            <ul className="mt-2 space-y-1.5">
              {outbox.failures.slice(0, 3).map((failure) => (
                <li key={failure.id} className="rounded-lg border border-red-400/20 bg-red-400/[0.04] px-3 py-2">
                  <p className="text-[10.5px] text-red-200">
                    {CHANNEL_LABEL[failure.channel] ?? failure.channel} · {failure.orderId ?? 'test'} ·{' '}
                    {failure.attempts} attempt{failure.attempts === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5 break-words text-[10px] leading-relaxed text-red-300/80">{failure.error}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted">
                    {dateTime(failure.lastAttemptAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {system && !system.alerts.automaticRetry && (
            <p className="mt-2.5 text-[10px] leading-relaxed text-muted">
              Add <span className="font-mono">CRON_SECRET</span> and the daily cron retries failed alerts on its
              own.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
