import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import { MUSCLES, type Exercise, type Session } from '../db/types';
import { dimsLabel } from '../db/variants';
import { LineChart } from '../components/LineChart';
import { PageHead } from '../components/ui';
import { computePRs, weekStart, weeklySetsPerMuscle, type PR } from '../lib/metrics';
import { fmtDate, fmtNum, parseNum } from '../lib/format';

export function ProgressScreen() {
  const data = useLiveQuery(async () => {
    const [sessions, sets, variants, exercises, bw] = await Promise.all([
      db.sessions.toArray(),
      db.sets.toArray(),
      db.variants.toArray(),
      db.exercises.toArray(),
      db.bodyweight.orderBy('date').toArray(),
    ]);
    const live = sessions.filter((s) => s.endedAt && !s.deletedAt);
    const sById = new Map<string, Session>(live.map((s) => [s.id, s]));
    const exById = new Map<string, Exercise>(exercises.map((e) => [e.id, e]));
    const exByVariant = new Map<string, Exercise>();
    for (const v of variants) {
      const e = exById.get(v.exerciseId);
      if (e) exByVariant.set(v.id, e);
    }
    const doneSets = sets.filter((s) => s.done && sById.has(s.sessionId));
    const weekly = weeklySetsPerMuscle(doneSets, sById, exByVariant);

    // PR feed across variants
    const prs: (PR & { name: string; variant: string })[] = [];
    const byVariant = new Map<string, typeof doneSets>();
    for (const s of doneSets) {
      if (!byVariant.has(s.variantId)) byVariant.set(s.variantId, []);
      byVariant.get(s.variantId)!.push(s);
    }
    for (const v of variants) {
      const vs = byVariant.get(v.id);
      const ex = exById.get(v.exerciseId);
      if (!vs || !ex) continue;
      const sids = [...new Set(vs.map((s) => s.sessionId))];
      const list = sids.map((id) => ({ sessionId: id, date: sById.get(id)!.startedAt, sets: vs.filter((s) => s.sessionId === id) }));
      const bw = new Map(sids.map((id) => [id, sById.get(id)!.bodyweightKg]));
      for (const p of computePRs(list, v.id, ex.loadType, bw)) if (p.kind !== 'load') prs.push({ ...p, name: ex.name, variant: dimsLabel(v.dims) });
    }
    prs.sort((a, b) => b.date.localeCompare(a.date));
    return { weekly, prs: prs.slice(0, 30), bw };
  }, []);

  const thisWeek = weekStart(isoLocal());
  const [week, setWeek] = useState(thisWeek);
  const [bwInput, setBwInput] = useState('');

  if (!data) return null;
  const weeks = [...data.weekly.keys()].sort().reverse();
  if (!weeks.includes(thisWeek)) weeks.unshift(thisWeek);
  const counts = data.weekly.get(week) ?? new Map();
  const last4 = weeks.filter((w) => w < week).slice(0, 4);
  const avg = (m: string) => (last4.length ? last4.reduce((a, w) => a + (data.weekly.get(w)?.get(m as never) ?? 0), 0) / last4.length : null);
  const max = Math.max(10, ...MUSCLES.map((m) => counts.get(m) ?? 0));

  return (
    <div>
      <PageHead title="Progress" />
      <div className="page">
        <h2>Hard sets per muscle</h2>
        <p className="small muted">Working sets: 1 per primary muscle, 0.5 per secondary. Warm-ups excluded; a drop-set chain counts once.</p>
        <select value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">
          {weeks.slice(0, 26).map((w) => (
            <option key={w} value={w}>
              Week of {fmtDate(w + 'T00:00:00', { day: 'numeric', month: 'short', year: 'numeric' })}
              {w === thisWeek ? ' (this week)' : ''}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <div className="bars">
          {MUSCLES.map((m) => {
            const v = counts.get(m) ?? 0;
            const a = avg(m);
            return (
              <div key={m} style={{ display: 'contents' }}>
                <span className="muted">{m}</span>
                <span style={{ position: 'relative', height: 10 }}>
                  <span className="bar" style={{ display: 'block', width: `${(v / max) * 100}%`, opacity: v ? 1 : 0 }} />
                  {a != null ? <span title="4-week average" style={{ position: 'absolute', top: -3, bottom: -3, left: `${Math.min(100, (a / max) * 100)}%`, width: 2, background: 'var(--plate-yellow)' }} /> : null}
                </span>
                <span className="val">{fmtNum(v)}</span>
              </div>
            );
          })}
        </div>
        {last4.length ? <p className="small faint">Yellow mark: average of the previous {last4.length} weeks.</p> : null}

        <h2>Bodyweight</h2>
        <div className="row">
          <input inputMode="decimal" placeholder="kg" value={bwInput} onChange={(e) => setBwInput(e.target.value)} style={{ maxWidth: 120 }} />
          <button
            className="btn"
            disabled={parseNum(bwInput) == null}
            onClick={async () => {
              const kg = parseNum(bwInput);
              if (kg == null) return;
              await db.bodyweight.add({ id: uuidv7(), date: isoLocal(), kg });
              setBwInput('');
            }}
          >
            Log today
          </button>
        </div>
        <div className="spacer" />
        {data.bw.length ? <LineChart series={[{ name: 'Bodyweight', color: '#4a8fd9', points: data.bw.map((b) => ({ x: new Date(b.date).getTime(), y: b.kg })) }]} unit=" kg" /> : <p className="small muted">Bodyweight is used for weighted pull-ups, dips and push-ups.</p>}

        <h2>Recent PRs</h2>
        {data.prs.length ? (
          <div className="list">
            {data.prs.map((p, i) => (
              <div key={i} className="list-item">
                <span className="faint small" style={{ width: 54 }}>
                  {fmtDate(p.date, { day: 'numeric', month: 'short' })}
                </span>
                <div className="grow">
                  <div className="title">{p.name}</div>
                  <div className="sub">
                    {p.variant} — {p.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">PRs appear after your second workout of a variant.</div>
        )}
      </div>
    </div>
  );
}
