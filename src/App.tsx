import type { ReactNode } from 'react';
import { match, useRoute } from './router';
import { ToastHost } from './components/ui';
import { adjustTimer, stopTimer, useTimer } from './lib/timer';
import { fmtDuration } from './lib/format';
import { Home } from './screens/Home';
import { SessionScreen } from './screens/Session';
import { TemplateEdit, TemplatesScreen } from './screens/Templates';
import { ExerciseDetail, ExercisesScreen } from './screens/Exercises';
import { ProgressScreen } from './screens/Progress';
import { GymEdit, GymsScreen, SettingsScreen, ValuesScreen } from './screens/Settings';
import { DataScreen } from './screens/Data';
import { StrongImportScreen } from './screens/StrongImport';

const TABS: { path: string; label: string; icon: ReactNode }[] = [
  { path: '/', label: 'Workout', icon: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /> },
  { path: '/templates', label: 'Templates', icon: <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" /> },
  { path: '/exercises', label: 'Exercises', icon: <path d="M5 6h14M5 12h14M5 18h9" /> },
  { path: '/progress', label: 'Progress', icon: <path d="M4 19l5-6 4 3 7-9M15 7h5v5" /> },
  { path: '/settings', label: 'Settings', icon: <path d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /> },
];

function route(path: string): ReactNode {
  const [p, query = ''] = path.split('?');
  const qs = new URLSearchParams(query);
  let m: Record<string, string> | null;
  if ((m = match('/session/:id', p))) return <SessionScreen key={m.id} id={m.id} />;
  if (match('/templates', p)) return <TemplatesScreen />;
  if ((m = match('/templates/:id', p))) return <TemplateEdit key={m.id} id={m.id} />;
  if (match('/exercises', p)) return <ExercisesScreen />;
  if ((m = match('/exercises/:id', p))) return <ExerciseDetail key={m.id + query} id={m.id} variantParam={qs.get('variant') ?? undefined} />;
  if (match('/progress', p)) return <ProgressScreen />;
  if (match('/settings', p)) return <SettingsScreen />;
  if (match('/settings/gyms', p)) return <GymsScreen />;
  if ((m = match('/settings/gyms/:id', p))) return <GymEdit key={m.id} id={m.id} />;
  if (match('/settings/data', p)) return <DataScreen />;
  if (match('/settings/strong', p)) return <StrongImportScreen />;
  if (match('/settings/values', p)) return <ValuesScreen />;
  return <Home />;
}

function tabFor(path: string): string {
  const seg = '/' + (path.split('?')[0].split('/')[1] ?? '');
  if (seg === '/session' || seg === '/') return '/';
  return seg;
}

export default function App() {
  const path = useRoute();
  const active = tabFor(path);
  return (
    <div className="app">
      <main>{route(path)}</main>
      <RestTimerBar />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.path} href={`#${t.path}`} className={active === t.path ? 'on' : ''} aria-current={active === t.path ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.icon}
            </svg>
            {t.label}
          </a>
        ))}
      </nav>
      <ToastHost />
    </div>
  );
}

function RestTimerBar() {
  const { state, remainingMs } = useTimer();
  if (!state) return null;
  const done = remainingMs <= 0;
  const pct = Math.max(0, Math.min(100, (remainingMs / (state.durationS * 1000)) * 100));
  return (
    <div className={`timer-bar ${done ? 'done' : ''}`} role="timer" aria-live="off">
      {!done ? <div className="fill" style={{ width: `${pct}%` }} /> : null}
      <div className="inner">
        <span className="time">{done ? 'Go' : fmtDuration(remainingMs + 999)}</span>
        <span className="grow small ellipsis">{done ? `Rest over — ${state.label}` : `Rest · next: ${state.label}`}</span>
        {!done ? (
          <>
            <button className="icon-btn" onClick={() => adjustTimer(-15)} aria-label="Subtract 15 seconds">
              −15
            </button>
            <button className="icon-btn" onClick={() => adjustTimer(15)} aria-label="Add 15 seconds">
              +15
            </button>
          </>
        ) : null}
        <button className="icon-btn" onClick={stopTimer} aria-label="Dismiss timer">
          ✕
        </button>
      </div>
    </div>
  );
}
