'use client';

import { useEffect, useRef, useState } from 'react';
import { CampaignDTO } from '@/lib/liveClient';

/**
 * Search-and-check multi-select for linking a product to one or more Meta
 * campaigns. A plain `<select multiple>` needs ctrl/cmd-click to pick more
 * than one option and has no search - painful once an ad account has more
 * than a handful of campaigns, so this rolls a small custom dropdown instead
 * of pulling in a component library for one field.
 */
export function CampaignMultiSelect({
  campaigns,
  selectedIds,
  onChange,
}: {
  campaigns: CampaignDTO[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const selected = campaigns.filter((c) => selectedIds.includes(c.externalCampaignId));
  const filtered = campaigns.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  return (
    <div ref={rootRef} className="relative w-56">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[34px] w-full flex-wrap items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-left text-xs text-ink-1 outline-none focus:border-teal"
      >
        {selected.length === 0 ? (
          <span className="text-ink-3">Select campaign(s)…</span>
        ) : (
          selected.map((c) => (
            <span
              key={c.externalCampaignId}
              className="inline-flex items-center gap-1 rounded bg-teal-tint px-1.5 py-0.5 text-[11px] font-semibold text-teal-strong"
            >
              {c.name}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(c.externalCampaignId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    toggle(c.externalCampaignId);
                  }
                }}
                className="cursor-pointer leading-none"
                aria-label={`Unlink ${c.name}`}
              >
                ×
              </span>
            </span>
          ))
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-border bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full border-b border-border px-2.5 py-2 text-xs text-ink-1 outline-none"
          />
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-ink-3">No campaigns match.</p>
            ) : (
              filtered.map((c) => (
                <label
                  key={c.externalCampaignId}
                  className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs text-ink-1 hover:bg-[#F1F5F9]"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.externalCampaignId)}
                    onChange={() => toggle(c.externalCampaignId)}
                    className="accent-teal"
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
