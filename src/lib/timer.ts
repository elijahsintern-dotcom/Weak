import { useEffect, useState } from 'react';

/** Rest timer state, persisted so it survives the app being killed. Times are epoch ms. */
export interface TimerState {
  endAt: number;
  durationS: number;
  label: string;
}

const KEY = 'weak.restTimer';
let state: TimerState | null = load();
let notified = false;
const subs = new Set<() => void>();

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  subs.forEach((f) => f());
}

export function startTimer(durationS: number, label: string): void {
  state = { endAt: Date.now() + durationS * 1000, durationS, label };
  notified = false;
  save();
}

export function adjustTimer(deltaS: number): void {
  if (!state) return;
  state = { ...state, endAt: state.endAt + deltaS * 1000, durationS: Math.max(1, state.durationS + deltaS) };
  if (state.endAt <= Date.now()) state = null;
  save();
}

export function stopTimer(): void {
  state = null;
  save();
}

export function useTimer(): { state: TimerState | null; remainingMs: number } {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    const id = window.setInterval(f, 250);
    return () => {
      subs.delete(f);
      window.clearInterval(id);
    };
  }, []);
  const remainingMs = state ? state.endAt - Date.now() : 0;
  if (state && remainingMs <= 0) {
    if (!notified) {
      notified = true;
      void timerDone(state.label);
    }
    // Keep showing "done" for 3 s, then clear.
    if (remainingMs < -3000) {
      state = null;
      save();
    }
  }
  return { state, remainingMs };
}

async function timerDone(label: string) {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* ignore */
  }
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      const body = `Rest over — ${label}`;
      if (reg) await reg.showNotification('Weak', { body, tag: 'rest', silent: false });
      else new Notification('Weak', { body });
    }
  } catch {
    /* ignore */
  }
}
