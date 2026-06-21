'use client';

import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { GROUP_EMOJIS, GROUP_COLORS } from '@huddle/validation';
import { groupEmojiFor, groupColorFor } from '@/lib/group-visuals';

/**
 * Admin-only group identity pickers (Phase 14): emoji + accent color +
 * cover photo. Posts `emoji`/`color` hidden inputs and a compressed
 * `cover` file alongside the rest of the edit form.
 */
export function GroupIdentityFields({
  groupId,
  storedEmoji,
  storedColor,
  coverUrl,
}: {
  groupId: string;
  storedEmoji: string | null;
  storedColor: string | null;
  coverUrl: string | null;
}) {
  const [emoji, setEmoji] = useState(() => groupEmojiFor(groupId, storedEmoji));
  const [color, setColor] = useState(() => groupColorFor(groupId, storedColor));
  const [preview, setPreview] = useState<string | null>(coverUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
      });
      const dt = new DataTransfer();
      dt.items.add(new File([compressed], file.name, { type: compressed.type }));
      if (fileRef.current) fileRef.current.files = dt.files;
      setPreview(URL.createObjectURL(compressed));
    } catch {
      // Fall back to the raw file already in the input.
      setPreview(URL.createObjectURL(file));
    }
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <legend className="px-1 text-sm font-semibold text-content">Group look</legend>

      <div>
        <span className="text-xs font-medium text-muted">Emoji</span>
        <input type="hidden" name="emoji" value={emoji} />
        <div role="radiogroup" aria-label="Group emoji" className="mt-2 flex flex-wrap gap-1.5">
          {GROUP_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={e === emoji}
              aria-label={`Emoji ${e}`}
              onClick={() => setEmoji(e)}
              className={`grid h-9 w-9 place-items-center rounded-lg text-lg transition ${
                e === emoji
                  ? 'bg-accent-100 ring-2 ring-accent-400'
                  : 'bg-surface-2 hover:bg-accent-100'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-xs font-medium text-muted">Accent color</span>
        <input type="hidden" name="color" value={color} />
        <div role="radiogroup" aria-label="Accent color" className="mt-2 flex flex-wrap gap-2">
          {GROUP_COLORS.map((cHex) => (
            <button
              key={cHex}
              type="button"
              role="radio"
              aria-checked={cHex === color}
              aria-label={`Color ${cHex}`}
              onClick={() => setColor(cHex)}
              style={{ background: cHex }}
              className={`h-8 w-8 rounded-full transition ${
                cHex === color ? 'ring-2 ring-content ring-offset-2 ring-offset-surface' : ''
              }`}
            />
          ))}
        </div>
      </div>

      <div>
        <span className="text-xs font-medium text-muted">Cover photo</span>
        <div className="mt-2 flex items-center gap-3">
          {preview ? (
            <img
              src={preview}
              alt=""
              aria-hidden
              className="h-12 w-20 rounded-lg object-cover"
              style={{ background: color }}
            />
          ) : (
            <div className="h-12 w-20 rounded-lg" style={{ background: color }} aria-hidden />
          )}
          <input
            ref={fileRef}
            id="cover-input"
            type="file"
            name="cover"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickFile}
            className="sr-only"
          />
          <label
            htmlFor="cover-input"
            className="cursor-pointer rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-content hover:bg-accent-100"
          >
            Choose cover photo
          </label>
        </div>
      </div>
    </fieldset>
  );
}
