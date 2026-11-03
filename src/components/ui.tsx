import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { GymProfile } from '../db/types';
import { back } from '../router';

export function PageHead({ title, onBack, right }: { title: string; onBack?: boolean | (() => void); right?: ReactNode }) {
  return (
    <header className="page-head">
      {onBack ? (
        <button className="back" aria-label="Back" onClick={() => (typeof onBack === 'function' ? onBack() : back())}>
          ‹
        </button>
      ) : null}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title ? <h2>{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

let toastSet: ((s: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSet?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
    return () => {
      toastSet = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

const PLATE_COLORS = ['var(--plate-red)', 'var(--plate-blue)', 'var(--plate-yellow)', 'var(--plate-green)', 'var(--plate-white)'];

export function useGyms(includeArchived = false) {
  const gyms = useLiveQuery(() => db.gyms.toArray(), [], []);
  const all = gyms.filter((g) => !g.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const color = new Map(all.map((g, i) => [g.id, PLATE_COLORS[i % PLATE_COLORS.length]]));
  const byId = new Map(all.map((g) => [g.id, g]));
  return { gyms: includeArchived ? all : all.filter((g) => !g.archived), all, color, byId };
}

export function GymBadge({ gym, color }: { gym?: GymProfile; color?: string }) {
  return (
    <span className="gym-badge" style={{ ['--gym-color' as string]: color }}>
      {gym?.name ?? 'Unknown gym'}
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export const Icon = {
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
};
