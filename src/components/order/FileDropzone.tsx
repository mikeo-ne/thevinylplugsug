import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { bytes } from '../../lib/format';
import type { UploadedFile } from '../../types';
import { Icon } from '../ui/Icon';

interface FileDropzoneProps {
  kind: 'audio' | 'artwork';
  files: UploadedFile[];
  onAdd: (files: UploadedFile[]) => void;
  onRemove: (id: string) => void;
  link: string;
  onLinkChange: (value: string) => void;
  linkError?: string;
  error?: string;
}

const ACCEPT = {
  audio: '.wav,.aif,.aiff,.flac,.mp3,.m4a,.aac,audio/*',
  artwork: '.pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/*',
};

const COPY = {
  audio: {
    title: 'Master audio',
    hint: 'WAV / AIFF / FLAC, 24-bit preferred · up to 80MB per file',
    linkLabel: 'Or paste a master download link (WeTransfer, Drive, Dropbox)',
    linkPlaceholder: 'https://wetransfer.com/downloads/…',
    icon: 'file-audio' as const,
  },
  artwork: {
    title: 'Cover artwork',
    hint: 'Print-ready CMYK PDF, 300dpi, 3mm bleed · up to 80MB',
    linkLabel: 'Or paste an artwork link (Drive, Dropbox, Frame.io)',
    linkPlaceholder: 'https://drive.google.com/…',
    icon: 'file-image' as const,
  },
};

export function FileDropzone({
  kind,
  files,
  onAdd,
  onRemove,
  link,
  onLinkChange,
  linkError,
  error,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const copy = COPY[kind];

  const upload = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      setUploadError(null);

      const placeholders: Record<string, number> = {};
      incoming.forEach((file) => {
        placeholders[`${file.name}-${file.size}`] = 6;
      });
      setProgress((prev) => ({ ...prev, ...placeholders }));

      const timer = window.setInterval(() => {
        setProgress((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            if (next[key] < 88) next[key] = Math.min(88, next[key] + Math.random() * 16);
          });
          return next;
        });
      }, 260);

      try {
        const result = await api.upload(
          kind === 'audio' ? { audio: incoming, artwork: [] } : { audio: [], artwork: incoming },
        );
        window.clearInterval(timer);
        setProgress((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => (next[key] = 100));
          return next;
        });
        window.setTimeout(() => setProgress({}), 600);
        onAdd(result.uploads.filter((file) => file.kind === kind));
      } catch (uploadFailure) {
        window.clearInterval(timer);
        setProgress({});
        setUploadError(
          uploadFailure instanceof ApiError ? uploadFailure.message : 'Upload failed. Please try again.',
        );
      }
    },
    [kind, onAdd],
  );

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const tooBig = incoming.find((file) => file.size > 80 * 1024 * 1024);
    if (tooBig) {
      setUploadError(`"${tooBig.name}" is over 80MB. Use a download link instead.`);
      return;
    }
    void upload(incoming);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Icon name={copy.icon} size={17} className="text-lime" />
          <h3 className="text-[14px] font-medium text-bone">{copy.title}</h3>
        </div>
        <span className="text-[11px] text-muted">{copy.hint}</span>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${copy.title}`}
        className={`group relative cursor-pointer rounded-xl border border-dashed px-5 py-7 text-center transition-all duration-300 ${
          dragging
            ? 'border-lime bg-lime/[0.08]'
            : error
              ? 'border-red-500/50 bg-red-500/[0.04] hover:border-red-400'
              : 'border-white/15 bg-black/20 hover:border-lime/45 hover:bg-white/[0.03]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT[kind]}
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-lime transition-transform duration-300 group-hover:-translate-y-0.5">
          <Icon name="upload" size={18} />
        </span>
        <p className="text-[13px] text-bone">
          Drop {kind === 'audio' ? 'masters' : 'artwork'} here or{' '}
          <span className="text-lime underline decoration-lime/40 underline-offset-2">browse files</span>
        </p>
        <p className="mt-1 text-[11px] text-muted">
          {kind === 'audio' ? 'You can add up to 4 audio files' : 'Single PDF preferred for print'}
        </p>
      </div>

      {(uploadError || error) && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-red-300">
          <Icon name="alert" size={13} />
          {uploadError ?? error}
        </p>
      )}

      {Object.keys(progress).length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {Object.entries(progress).map(([key, value]) => (
            <li key={key} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="truncate">{key.split('-').slice(0, -1).join('-')}</span>
                <span className="num">{value < 100 ? `${Math.round(value)}%` : 'encrypted ✓'}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime transition-all duration-300"
                  style={{ width: `${value}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex animate-fade-up items-center gap-3 rounded-lg border border-lime/20 bg-lime/[0.05] px-3 py-2.5"
            >
              <Icon
                name={file.kind === 'audio' ? 'file-audio' : 'file-image'}
                size={16}
                className="shrink-0 text-lime"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-bone">{file.originalName}</p>
                <p className="text-[10.5px] text-muted">
                  {bytes(file.size)} · uploaded
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.originalName}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-red-300"
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3.5">
        <label className="mb-1.5 block text-[11px] text-muted" htmlFor={`${kind}-link`}>
          {copy.linkLabel}
        </label>
        <div className="relative">
          <Icon name="external" size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id={`${kind}-link`}
            type="url"
            value={link}
            onChange={(event) => onLinkChange(event.target.value)}
            placeholder={copy.linkPlaceholder}
            className={`field py-3 pl-9 text-[13px] ${linkError ? 'field-error' : ''}`}
          />
        </div>
        {linkError && <p className="mt-1 text-[11px] text-red-300">{linkError}</p>}
      </div>
    </div>
  );
}
