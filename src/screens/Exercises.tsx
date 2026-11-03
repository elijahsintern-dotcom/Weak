import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import { MUSCLES, SET_TYPE_SHORT, type Exercise, type Muscle, type Session, type SetRow, type Variant } from '../db/types';
import { dimsLabel } from '../db/variants';
import { ExerciseForm } from '../components/ExercisePicker';
import { LineChart, SERIES_COLORS, type Series } from '../components/LineChart';
import { GymBadge, PageHead, Seg, Sheet, toast, useGyms } from '../components/ui';
import { computePRs, e1rm, effectiveLoad, fmtKg, fmtLoad, setReps, volumeLoad } from '../lib/metrics';
import { fmtDate } from '../lib/format';
import { navigate } from '../router';

export function ExercisesScreen() {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | ''>('');
  const [creating, setCreating] = useState(false);
  const data = useLiveQuery(async () => {
    const [ex, variants, sets] = await Promise.all([db.exercises.toArray(), db.variants.toArray(), db.sets.toArray()]);
    const exOfVariant = new Map(variants.map((v) => [v.id, v.exerciseId]));
    const used = new Map<string, Set<string>>();
    for (const s of sets) {
      if (!s.done) continue;
      const e = exOfVariant.get(s.variantId);
      if (!e) continue;
      if (!used.has(e)) used.set(e, new Set());
      used.get(e)!.add(s.sessionId);
    }
    return { ex: ex.filter((e) => !e.deletedAt), used };
  }, []);
  const list = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.ex
      .filter((e) => !t || e.name.toLowerCase().includes(t))
      .filter((e) => !muscle || e.primary.includes(muscle) || e.secondary.includes(muscle))
      .sort((a, b) => (data.used.get(b.id)?.size ?? 0) - (data.used.get(a.id)?.size ?? 0) || a.name.localeCompare(b.name));
  }, [data, q, muscle]);

  return (
    <div>
      <PageHead
        title="Exercises"
        right={
          <button className="btn small" onClick={() => setCreating(true)}>
            New
          </button>
        }
      />
      <div className="page">
        <div className="row">
          <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ width: 130 }} value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle | '')} aria-label="Filter by muscle">
            <option value="">All muscles</option>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="spacer" />
        <div className="list">
          {list.map((e) => (
            <a key={e.id} className="list-item" href={`#/exercises/${e.id}`}>
              <div className="grow">
                <div className="title">{e.name}</div>
                <div className="sub">
                  {e.primary.join(', ') || 'No muscles set'}
                  {data?.used.get(e.id)?.size ? ` · ${data.used.get(e.id)!.size} ${data.used.get(e.id)!.size === 1 ? 'workout' : 'workouts'}` : ''}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
      <Sheet open={creating} onClose={() => setCreating(false)} title="New exercise">
        <ExerciseForm
          onCancel={() => setCreating(false)}
          onSaved={(ex) => {
            setCreating(false);
            navigate(`/exercises/${ex.id}`);
          }}
        />
      </Sheet>
    </div>
  );
}

type Metric = 'e1rm' | 'best' | 'reps' | 'volume';

interface VariantStats {
  variant: Variant;
  sessions: { session: Session; sets: SetRow[] }[];
}

export function ExerciseDetail({ id, variantParam }: { id: string; variantParam?: string }) {
  const { byId, color } = useGyms(true);
  const data = useLiveQuery(async () => {
    const ex = await db.exercises.get(id);
    if (!ex) return null;
    const variants = await db.variants.where('exerciseId').equals(id).toArray();
    const stats: VariantStats[] = [];
    for (const v of variants) {
      const sets = (await db.sets.where('variantId').equals(v.id).toArray()).filter((s) => s.done);
      const sids = [...new Set(sets.map((s) => s.sessionId))];
      const sess = (await db.sessions.bulkGet(sids)).filter((s): s is Session => !!s && !!s.endedAt && !s.deletedAt);
      if (!sess.length) continue;
      stats.push({
        variant: v,
        sessions: sess
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .map((s) => ({ session: s, sets: sets.filter((x) => x.sessionId === s.id).sort((a, b) => a.setIndex - b.setIndex) })),
      });
    }
    stats.sort((a, b) => b.sessions[0].session.startedAt.localeCompare(a.sessions[0].session.startedAt));
    const notes = await db.notes.where('exerciseId').equals(id).toArray();
    return { ex, stats, notes };
  }, [id]);

  const [tab, setTab] = useState<'progress' | 'history' | 'notes'>('progress');
  const [selected, setSelected] = useState<string | 'all' | null>(variantParam ?? null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const [editing, setEditing] = useState(false);

  if (data === undefined) return null;
  if (data === null)
    return (
      <div>
        <PageHead title="Exercise" onBack />
        <div className="page empty">Exercise not found.</div>
      </div>
    );
  const { ex, stats, notes } = data;
  const sel = selected && (selected === 'all' || stats.some((s) => s.variant.id === selected)) ? selected : stats[0]?.variant.id ?? null;
  const m: Metric = metric ?? (ex.category === 'compound' ? 'e1rm' : 'best');
  const shown = sel === 'all' ? stats : stats.filter((s) => s.variant.id === sel);

  const variantName = (v: Variant) => `${dimsLabel(v.dims)} · ${byId.get(v.gymId)?.name ?? '?'}`;

  return (
    <div>
      <PageHead
        title={ex.name}
        onBack
        right={
          <button className="icon-btn" aria-label="Edit exercise" onClick={() => setEditing(true)}>
            ✎
          </button>
        }
      />
      <div className="page">
        <p className="small muted">
          {ex.primary.join(', ')}
          {ex.secondary.length ? ` · also ${ex.secondary.join(', ')}` : ''}
        </p>
        <Seg value={tab} onChange={setTab} options={[['progress', 'Progress'], ['history', 'History'], ['notes', 'Notes']]} />

        {tab !== 'notes' ? (
          stats.length ? (
            <>
              <h3>Variant</h3>
              <div className="list">
                {stats.length > 1 ? (
                  <button className="list-item" onClick={() => setSelected('all')} aria-pressed={sel === 'all'}>
                    <div className="grow title">All variants</div>
                    {sel === 'all' ? <span>✓</span> : null}
                  </button>
                ) : null}
                {stats.map((s) => (
                  <button key={s.variant.id} className="list-item" onClick={() => setSelected(s.variant.id)} aria-pressed={sel === s.variant.id}>
                    <div className="grow">
                      <div className="title">{dimsLabel(s.variant.dims)}</div>
                      <div className="sub row">
                        <GymBadge gym={byId.get(s.variant.gymId)} color={color.get(s.variant.gymId)} />
                        <span>
                          {s.sessions.length} {s.sessions.length === 1 ? 'workout' : 'workouts'} · last {fmtDate(s.sessions[0].session.startedAt, { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                    {sel === s.variant.id ? <span>✓</span> : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty" style={{ marginTop: 12 }}>
              No logged sets yet.
            </div>
          )
        ) : null}

        {tab === 'progress' && stats.length ? (
          <>
            <div className="spacer" />
            <Seg
              value={m}
              onChange={setMetric}
              options={[
                ['e1rm', 'e1RM'],
                ['best', 'Best set'],
                ['reps', 'Reps at load'],
                ['volume', 'Volume'],
              ]}
            />
            <div className="spacer" />
            <LineChart series={buildSeries(shown, m, ex, variantName)} unit={m === 'reps' ? ' reps' : ' kg'} />
            <p className="small faint">
              {m === 'e1rm' && 'Epley on reps + RIR; sets above 10 effective reps are left out.'}
              {m === 'best' && 'Heaviest working set each workout.'}
              {m === 'reps' && 'Most reps achieved at each load, one line per load.'}
              {m === 'volume' && 'Load × reps over working sets.'}
            </p>
            {sel !== 'all' && shown[0] ? <PRList stat={shown[0]} ex={ex} /> : null}
          </>
        ) : null}

        {tab === 'history' && stats.length ? (
          <>
            <h3>Workouts</h3>
            {shown
              .flatMap((s) => s.sessions.map((x) => ({ ...x, variant: s.variant })))
              .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
              .map(({ session, sets, variant }) => (
                <a key={session.id + variant.id} className="hist-session" href={`#/session/${session.id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                  <div className="row small muted">
                    <span className="grow">{fmtDate(session.startedAt)}</span>
                    {sel === 'all' ? <span>{dimsLabel(variant.dims)}</span> : null}
                  </div>
                  <div className="sets-line">
                    {sets
                      .filter((s) => s.setType !== 'warmup')
                      
                      .map((s) => `${ex.loadType === 'external' ? (s.loadKg != null ? fmtKg(s.loadKg) : '–') : fmtLoad(s.loadKg, ex.loadType)}×${setReps(s) ?? '–'}${SET_TYPE_SHORT[s.setType] ? SET_TYPE_SHORT[s.setType] : ''}`)
                      .join('  ')}
                  </div>
                </a>
              ))}
          </>
        ) : null}

        {tab === 'notes' ? <NotesTab ex={ex} notes={notes} /> : null}
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit exercise">
        <ExerciseForm initial={ex} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
        {ex.isCustom ? (
          <button
            className="btn danger block"
            style={{ marginTop: 10 }}
            onClick={async () => {
              if (!confirm(`Delete ${ex.name}? Logged sets stay in your history and exports.`)) return;
              await db.exercises.update(ex.id, { deletedAt: isoLocal() });
              navigate('/exercises', true);
            }}
          >
            Delete exercise
          </button>
        ) : null}
      </Sheet>
    </div>
  );
}

function buildSeries(stats: VariantStats[], m: Metric, ex: Exercise, name: (v: Variant) => string): Series[] {
  if (m === 'reps') {
    // One line per load for the selected variant(s); top 5 most-used loads.
    const byLoad = new Map<number, { x: number; y: number }[]>();
    for (const st of stats)
      for (const { session, sets } of st.sessions) {
        const best = new Map<number, number>();
        for (const s of sets) {
          if (s.setType === 'warmup' || s.loadKg == null) continue;
          const r = setReps(s);
          if (r != null) best.set(s.loadKg, Math.max(best.get(s.loadKg) ?? 0, r));
        }
        for (const [l, r] of best) {
          if (!byLoad.has(l)) byLoad.set(l, []);
          byLoad.get(l)!.push({ x: new Date(session.startedAt).getTime(), y: r });
        }
      }
    return [...byLoad.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .sort((a, b) => a[0] - b[0])
      .map(([l, pts], i) => ({ name: `${fmtKg(l)} kg`, color: SERIES_COLORS[i % SERIES_COLORS.length], points: pts }));
  }
  return stats.map((st, i) => ({
    name: name(st.variant),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: st.sessions
      .map(({ session, sets }) => {
        const work = sets.filter((s) => s.setType !== 'warmup');
        let y: number | null = null;
        if (m === 'volume') y = Math.round(volumeLoad(work));
        else if (m === 'best') {
          const loads = work.map((s) => s.loadKg).filter((x): x is number => x != null);
          y = loads.length ? Math.max(...loads) : null;
        } else {
          const vals = work.map((s) => e1rm(effectiveLoad(s.loadKg, ex.loadType, session.bodyweightKg), setReps(s), s.rir)).filter((x): x is number => x != null);
          y = vals.length ? Math.round(Math.max(...vals) * 10) / 10 : null;
        }
        return y == null ? null : { x: new Date(session.startedAt).getTime(), y };
      })
      .filter((p): p is { x: number; y: number } => !!p),
  }));
}

function PRList({ stat, ex }: { stat: VariantStats; ex: Exercise }) {
  const prs = computePRs(
    stat.sessions.map((s) => ({ sessionId: s.session.id, date: s.session.startedAt, sets: s.sets })),
    stat.variant.id,
    ex.loadType,
    new Map(stat.sessions.map((s) => [s.session.id, s.session.bodyweightKg])),
  );
  const work = stat.sessions.flatMap((s) => s.sets.filter((x) => x.setType !== 'warmup').map((x) => ({ s: x, bw: s.session.bodyweightKg })));
  let bestE1: { v: number; s: SetRow } | null = null;
  let heaviest: SetRow | null = null;
  for (const { s, bw } of work) {
    const v = e1rm(effectiveLoad(s.loadKg, ex.loadType, bw), setReps(s), s.rir);
    if (v != null && (!bestE1 || v > bestE1.v)) bestE1 = { v, s };
    if (s.loadKg != null && (!heaviest || s.loadKg > (heaviest.loadKg ?? 0))) heaviest = s;
  }
  return (
    <>
      <h3>Records</h3>
      <div className="list">
        {bestE1 ? (
          <div className="list-item">
            <div className="grow">Best e1RM</div>
            <div className="num">
              {fmtKg(Math.round(bestE1.v * 10) / 10)} kg <span className="faint small">({fmtKg(bestE1.s.loadKg ?? 0)} × {setReps(bestE1.s)})</span>
            </div>
          </div>
        ) : null}
        {heaviest ? (
          <div className="list-item">
            <div className="grow">Heaviest set</div>
            <div className="num">
              {fmtKg(heaviest.loadKg ?? 0)} kg × {setReps(heaviest)}
            </div>
          </div>
        ) : null}
      </div>
      {prs.length ? (
        <>
          <h3>PR history</h3>
          <div className="list">
            {[...prs].reverse().slice(0, 12).map((p, i) => (
              <div key={i} className="list-item small">
                <span className="faint" style={{ width: 80 }}>
                  {fmtDate(p.date, { day: 'numeric', month: 'short' })}
                </span>
                <span className="grow">{p.detail}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function NotesTab({ ex, notes }: { ex: Exercise; notes: { id: string; kind: 'personal' | 'science'; markdown: string }[] }) {
  const personal = notes.find((n) => n.kind === 'personal');
  const [draft, setDraft] = useState(personal?.markdown ?? '');
  return (
    <>
      <h3>Notes</h3>
      <textarea
        value={draft}
        placeholder="Cues that work for you, machine settings, seat height…"
        style={{ minHeight: 200 }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          db.notes
            .put({ id: personal?.id ?? uuidv7(), exerciseId: ex.id, kind: 'personal', markdown: draft, bundledVersion: null, updatedAt: isoLocal() })
            .then(() => toast('Notes saved'))
        }
      />
    </>
  );
}
