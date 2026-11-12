'use client';

import { useRef, useState } from 'react';
import { toDataUrl } from '@/app/(app)/sell/photos';
import { buttonClass } from '@/components/ui';

/** Pick or take photos; they are downsized to JPEG data URLs so they travel with the request. */
export function PhotoPicker({
  label,
  photos,
  onChange,
  max = 4,
}: {
  label: string;
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = [...photos];
      for (const file of Array.from(files)) {
        if (next.length >= max) break;
        next.push(await toDataUrl(file));
      }
      onChange(next);
    } catch {
      setError('That image could not be read. Try another photo.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((src, i) => (
            <li key={i} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${label} ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-foreground/70 text-xs text-background"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length < max && (
        <label className={buttonClass('secondary', 'md', 'cursor-pointer')}>
          {busy ? 'Reading…' : photos.length ? 'Add another photo' : 'Add photo'}
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => void add(e.target.files)}
          />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
