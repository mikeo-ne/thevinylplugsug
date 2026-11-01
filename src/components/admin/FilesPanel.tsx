import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { humanBytes } from '../../lib/upload';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';

type FilesPayload = Awaited<ReturnType<typeof api.adminFiles>>;

/**
 * Every uploaded master and artwork, filed the way it is stored.
 *
 * The question "where do our uploads live?" used to have no answer inside the
 * app: bytes sat on a function instance's disk and the only way to see a file was
 * to already know its order. This lists them by folder
 * (`orders/<id>/audio`, `inbox/<month>/artwork`), with size, checksum, storage
 * backend and a download that works from anywhere.
 */
export function FilesPanel() {
  const { notify } = useToast();
  const [data, setData] = useState<FilesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminFiles());
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not read the file store.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string, name: string) => {
    setBusy(id);
    try {
      await api.adminDeleteFile(id);
      notify(`Deleted ${name}.`, 'success');
      await load();
    } catch (failure) {
      notify(failure instanceof ApiError ? failure.message : 'Could not delete that file.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}/api/files/${id}/download`;
    try {
      await navigator.clipboard.writeText(url);
      notify('Download link copied.', 'success');
    } catch {
      notify(url, 'success');
    }
  };

  const storage = data?.storage;
  const counts = data?.counts;

  return (
    <section className="panel mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-lime/10 text-lime">
            <Icon name="file-audio" size={13} />
          </span>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">File store</h2>
          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">
            {counts?.files ?? 0} files · {humanBytes(counts?.bytes ?? 0)}
          </span>
          {storage && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                storage.durable ? 'bg-lime/[0.12] text-lime' : 'bg-amber-400/[0.1] text-amber-200'
              }`}
              title={storage.label}
            >
              {storage.durable ? 'durable' : 'ephemeral'}
            </span>
          )}
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

      {error && <p className="border-b border-white/[0.07] px-4 py-3 text-[11.5px] text-red-300">{error}</p>}

      <div className="px-4 py-3 text-[10.5px] leading-relaxed text-muted">
        {storage ? (
          <>
            Bytes live in <span className="text-bone">{storage.label}</span>
            {storage.durable ? (
              <> — a redeploy does not lose them.</>
            ) : (
              <> — this instance's disk, so a redeploy does clear them. Add a Postgres <code className="font-mono text-[10px]">DATABASE_URL</code> to keep every master.</>
            )}{' '}
            Files are uploaded in {humanBytes(data?.limits.chunkBytes ?? 0)} slices, up to{' '}
            {data?.limits.maxUploadMb ?? '—'}MB each.
          </>
        ) : (
          'Reading storage…'
        )}
      </div>

      {data?.groups.length ? (
        <ul className="max-h-[420px] overflow-y-auto border-t border-white/[0.06]">
          {data.groups.map((group) => {
            const expanded = open === group.folder;
            return (
              <li key={group.folder} className="border-b border-white/[0.05] last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : group.folder)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={11} className="shrink-0 text-muted" />
                    <code className="truncate font-mono text-[11px] text-bone/85">{group.folder}</code>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted">
                    {group.files.length} · {humanBytes(group.bytes)}
                  </span>
                </button>

                {expanded && (
                  <ul className="space-y-1 bg-black/20 px-4 pb-2.5">
                    {group.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-2.5 py-1.5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon
                            name={file.kind === 'audio' ? 'file-audio' : 'file-image'}
                            size={12}
                            className="shrink-0 text-lime"
                          />
                          <span className="truncate text-[11px] text-bone/85">{file.originalName}</span>
                          {file.status !== 'complete' && (
                            <span className="rounded bg-amber-400/10 px-1 py-px text-[8.5px] uppercase tracking-wider text-amber-200">
                              {file.status ?? 'unknown'}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5 text-[9.5px] text-muted">
                          <span className="num">{humanBytes(file.size)}</span>
                          <span className="hidden sm:inline">{dateTime(file.createdAt)}</span>
                          {file.sha256 && (
                            <span className="hidden font-mono md:inline" title={`sha256 ${file.sha256}`}>
                              {file.sha256.slice(0, 8)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void copyLink(file.id)}
                            className="uppercase tracking-[0.1em] hover:text-bone"
                            title="Copy a permanent download link"
                          >
                            link
                          </button>
                          <a
                            href={`/api/files/${file.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-lime/80 hover:text-lime"
                            title="Download"
                          >
                            <Icon name="external" size={11} />
                          </a>
                          <button
                            type="button"
                            onClick={() => void remove(file.id, file.originalName)}
                            disabled={busy === file.id}
                            className="text-red-300/70 hover:text-red-300 disabled:opacity-40"
                            title="Delete the file and its bytes"
                          >
                            <Icon name={busy === file.id ? 'spinner' : 'trash'} size={11} className={busy === file.id ? 'animate-spin' : ''} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-white/[0.06] px-4 py-6 text-center text-[11.5px] text-muted">
          No files yet — a client upload on the order form lands here.
        </p>
      )}
    </section>
  );
}
