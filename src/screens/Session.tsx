import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db/db';
import { isoLocal } from '../db/ids';
import type { Exercise, SessionExercise, SetRow, SetType, TemplateItem, Variant } from '../db/types';
import { SET_TYPE_SHORT } from '../db/types';
import { closestVariantWithHistory, dimsLabel, lastCompletedForVariant } from '../db/variants';
import { DimsEditor } from '../components/DimsEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { GymPicker } from '../components/GymPicker';
import { GymBadge, Icon, PageHead, Sheet, toast, useGyms } from '../components/ui';
import {
  addExercise,
  addSet,
  changeSessionExerciseDims,
  changeSessionGym,
  deleteSet,
  diffWithTemplate,
  discardSession,
  finishSession,
  moveSessionExercise,
  removeSessionExercise,
  saveSessionToTemplate,
  toggleSupersetWithNext,
  type TemplateDiff,
} from '../lib/sessionOps';
import { computePRs, fmtKg, fmtLoad, setReps, shouldIncreaseLoad, type PR } from '../lib/metrics';
import { fmtDateTime, fmtDuration, fmtNum, parseNum } from '../lib/format';
import { startTimer } from '../lib/timer';
import { navigate } from '../router';

interface PrevInfo {
  sets: SetRow[];
  date: string | null;
  ref: { label: string; date: string; sets: SetRow[] } | null;
  increase: boolean;
  hasHistory: boolean;
}

const fmtSet = (s: SetRow, loadType: Exercise['loadType'] = 'external') => {
  const reps = s.reps != null ? `${s.reps}` : s.repsLeft != null || s.repsRight != null ? `${s.repsLeft ?? '–'}/${s.repsRight ?? '–'}` : '–';
  return `${loadType === 'external' ? (s.loadKg != null ? fmtKg(s.loadKg) : '–') : fmtLoad(s.loadKg, loadType)} × ${reps}${SET_TYPE_SHORT[s.setType] ? ' ' + SET_TYPE_SHORT[s.setType] : ''}`;
};

export function SessionScreen({ id }: { id: string }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return null;
    const ses = (await db.sessionExercises.where('sessionId').equals(id).toArray()).sort((a, b) => a.order - b.order);
    const sets = await db.sets.where('sessionId').equals(id).toArray();
    const variants = new Map<string, Variant>((await db.variants.bulkGet(ses.map((s) => s.variantId))).filter(Boolean).map((v) => [v!.id, v!]));
    const exercises = new Map<string, Exercise>((await db.exercises.toArray()).map((e) => [e.id, e]));
    const items = new Map<string, TemplateItem>((await db.templateItems.toArray()).map((t) => [t.id, t]));
    return { session, ses, sets, variants, exercises, items };
  }, [id]);
  const settings = useLiveQuery(() => getSettings(), []);
  const { byId, color } = useGyms(true);

  const variantIds = data ? data.ses.map((s) => `${s.id}:${s.variantId}`).join(',') : '';
  const prev = useLiveQuery(async () => {
    const out = new Map<string, PrevInfo>();
    if (!data) return out;
    for (const se of data.ses) {
      const v = data.variants.get(se.variantId);
      if (!v) continue;
      const last = await lastCompletedForVariant(v.id, id);
      const sets = last
        ? (await db.sets.where('sessionId').equals(last.sessionId).toArray()).filter((s) => s.variantId === v.id && s.done).sort((a, b) => a.setIndex - b.setIndex)
        : [];
      let ref: PrevInfo['ref'] = null;
      if (!last) {
        const c = await closestVariantWithHistory({ exerciseId: v.exerciseId, gymId: v.gymId, dims: v.dims, excludeVariantId: v.id });
        if (c) {
          const rs = (await db.sets.where('sessionId').equals(c.lastSessionId).toArray()).filter((s) => s.variantId === c.variant.id && s.done).sort((a, b) => a.setIndex - b.setIndex);
          const g = await db.gyms.get(c.variant.gymId);
          ref = { label: `${dimsLabel(c.variant.dims)} at ${g?.name ?? 'another gym'}`, date: c.lastDate, sets: rs };
        }
      }
      const item = se.templateItemId ? data.items.get(se.templateItemId) : undefined;
      const increase = !!item?.doubleProgression && shouldIncreaseLoad(sets, item.repMax, item.targetRir);
      out.set(se.id, { sets, date: last?.date ?? null, ref, increase, hasHistory: !!last });
    }
    return out;
  }, [variantIds, id]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isActive = !!data?.session && !data.session.endedAt;
  useWakeLock(isActive);

  const [picker, setPicker] = useState(false);
  const [variantFor, setVariantFor] = useState<SessionExercise | null>(null);
  const [menuFor, setMenuFor] = useState<SessionExercise | null>(null);
  const [setMenu, setSetMenu] = useState<SetRow | null>(null);
  const [gymSheet, setGymSheet] = useState(false);
  const [diff, setDiff] = useState<TemplateDiff | null>(null);
  const [summary, setSummary] = useState<PR[] | null>(null);

  if (data === undefined) return null;
  if (data === null)
    return (
      <div>
        <PageHead title="Workout" onBack />
        <div className="page empty">This workout no longer exists.</div>
      </div>
    );
  const { session, ses, sets, variants, exercises, items } = data;

  const setsFor = (seId: string) => sets.filter((s) => s.sessionExerciseId === seId).sort((a, b) => a.setIndex - b.setIndex);

  const tick = async (se: SessionExercise, s: SetRow, prevSet?: SetRow) => {
    if (s.done) {
      await db.sets.update(s.id, { done: false, completedAt: null });
      return;
    }
    const patch: Partial<SetRow> = { done: true, completedAt: isoLocal() };
    if (s.loadKg == null && prevSet?.loadKg != null) patch.loadKg = prevSet.loadKg;
    if (se.logLR) {
      if (s.repsLeft == null && s.repsRight == null) {
        if (prevSet?.repsLeft != null || prevSet?.repsRight != null) {
          patch.repsLeft = prevSet.repsLeft;
          patch.repsRight = prevSet.repsRight;
        } else if (prevSet?.reps != null) {
          patch.repsLeft = prevSet.reps;
          patch.repsRight = prevSet.reps;
        } else return toast('Enter reps first');
      }
    } else if (s.reps == null) {
      if (prevSet && setReps(prevSet) != null) patch.reps = setReps(prevSet);
      else return toast('Enter reps first');
    }
    await db.sets.update(s.id, patch);
    // Rest timer: skip until the last exercise of a superset.
    const group = se.supersetGroup ? ses.filter((x) => x.supersetGroup === se.supersetGroup) : [];
    const lastInGroup = !group.length || group[group.length - 1].id === se.id;
    if (isActive && lastInGroup) {
      const ex = exercises.get(variants.get(se.variantId)?.exerciseId ?? '');
      startTimer(se.restS ?? settings?.defaultRestS ?? 120, ex?.name ?? 'next set');
    }
  };

  const finish = async () => {
    const undone = sets.filter((s) => !s.done && (s.loadKg != null || s.reps != null)).length;
    const doneCount = sets.filter((s) => s.done).length;
    if (!doneCount) {
      if (confirm('No sets are ticked. Discard this workout?')) {
        await discardSession(session.id);
        navigate('/', true);
      }
      return;
    }
    if (undone && !confirm(`${undone} set(s) have values but aren't ticked. They will be removed. Finish anyway?`)) return;
    await finishSession(session.id);
    const d = await diffWithTemplate(session.id);
    const prs = await prsForSession(session.id);
    if (d?.hasChanges) {
      setDiff(d);
      setSummary(prs);
    } else setSummary(prs);
  };

  const elapsed = (session.endedAt ? new Date(session.endedAt).getTime() : now) - new Date(session.startedAt).getTime();

  return (
    <div>
      <PageHead
        title={session.endedAt ? session.name : fmtDuration(elapsed)}
        onBack={() => navigate('/')}
        right={
          isActive ? (
            <button className="btn go" onClick={finish}>
              Finish
            </button>
          ) : null
        }
      />
      <div className="page">
        <div className="row wrap" style={{ gap: 12 }}>
          {isActive ? (
            <input className="grow" aria-label="Workout name" value={session.name} onChange={(e) => db.sessions.update(session.id, { name: e.target.value })} style={{ fontWeight: 600 }} />
          ) : (
            <span className="muted">
              {fmtDateTime(session.startedAt)} · {fmtDuration(elapsed)}
            </span>
          )}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="icon-btn" style={{ fontSize: 14, width: 'auto', padding: '0 4px' }} onClick={() => setGymSheet(true)} aria-label="Change gym">
            <GymBadge gym={byId.get(session.gymId)} color={color.get(session.gymId)} />
          </button>
          <span className="grow" />
          <label className="row small muted">
            Bodyweight
            <NumInput value={session.bodyweightKg} onCommit={(v) => db.sessions.update(session.id, { bodyweightKg: v })} style={{ width: 70 }} placeholder="kg" />
          </label>
        </div>

        {ses.map((se, idx) => {
          const v = variants.get(se.variantId);
          const ex = v ? exercises.get(v.exerciseId) : undefined;
          if (!v || !ex) return null;
          const p = prev?.get(se.id);
          const item = se.templateItemId ? items.get(se.templateItemId) : undefined;
          const rows = setsFor(se.id);
          const inSS = !!se.supersetGroup;
          const prevInGroup = idx > 0 && inSS && ses[idx - 1].supersetGroup === se.supersetGroup;
          const prevSets = p?.sets ?? [];
          return (
            <section key={se.id} className={`ex-card ${inSS ? 'ss' : ''} ${prevInGroup ? 'mid' : ''}`} aria-label={ex.name}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="ex-name">
                    <a href={`#/exercises/${ex.id}?variant=${v.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {ex.name}
                    </a>
                  </div>
                  <button className="variant-btn" onClick={() => setVariantFor(se)}>
                    {dimsLabel(v.dims)} <span className="faint">✎</span>
                  </button>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {p && !p.hasHistory ? <span className="tag new">New variant</span> : null}
                    {p?.increase ? <span className="tag up">Increase load</span> : null}
                    {item ? (
                      <span className="small muted">
                        Target {item.targetSets} × {item.repMin ?? '?'}
                        {item.repMax && item.repMax !== item.repMin ? `–${item.repMax}` : ''}
                        {item.targetRir != null ? ` @ RIR ${item.targetRir}` : ''}
                      </span>
                    ) : null}
                    {inSS ? <span className="small" style={{ color: '#9cc4ef' }}>Superset</span> : null}
                  </div>
                </div>
                <button className="icon-btn" aria-label={`${ex.name} options`} onClick={() => setMenuFor(se)}>
                  ⋯
                </button>
              </div>
              {p?.ref ? (
                <div className="ref-box">
                  For reference — {p.ref.label}, {new Date(p.ref.date).toLocaleDateString()}: {p.ref.sets.map((x) => fmtSet(x, ex.loadType)).join(', ')}
                </div>
              ) : null}
              {se.notes ? <p className="small muted">{se.notes}</p> : null}
              <table className="sets">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>Set</th>
                    <th>Previous</th>
                    <th style={{ width: 64 }}>{ex.loadType === 'bodyweight' ? '+kg' : ex.loadType === 'assisted' ? 'Assist kg' : 'kg'}</th>
                    {se.logLR ? (
                      <>
                        <th style={{ width: 46 }}>L</th>
                        <th style={{ width: 46 }}>R</th>
                      </>
                    ) : (
                      <th style={{ width: 56 }}>Reps</th>
                    )}
                    <th style={{ width: 44 }}>RIR</th>
                    <th style={{ width: 40 }}>
                      <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
                        Done
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => {
                    const ps = prevSets[i];
                    const workingNo = rows.slice(0, i + 1).filter((r) => r.setType !== 'warmup' && !r.parentSetId).length;
                    return (
                      <tr key={s.id} className={`${s.done ? 'done' : ''} ${s.parentSetId ? 'child' : ''}`}>
                        <td>
                          <button className="set-type" data-t={s.setType} onClick={() => setSetMenu(s)} aria-label={`Set ${i + 1} type ${s.setType}`}>
                            {SET_TYPE_SHORT[s.setType] || workingNo}
                          </button>
                        </td>
                        <td className="prev">{ps ? fmtSet(ps, ex.loadType) : '—'}</td>
                        <td>
                          <NumInput value={s.loadKg} placeholder={ps?.loadKg != null ? fmtKg(ps.loadKg) : ''} onCommit={(val) => db.sets.update(s.id, { loadKg: val })} decimal />
                        </td>
                        {se.logLR ? (
                          <>
                            <td>
                              <NumInput className="lr" value={s.repsLeft} placeholder={ps ? String(ps.repsLeft ?? ps.reps ?? '') : ''} onCommit={(val) => db.sets.update(s.id, { repsLeft: val, reps: null })} />
                            </td>
                            <td>
                              <NumInput className="lr" value={s.repsRight} placeholder={ps ? String(ps.repsRight ?? ps.reps ?? '') : ''} onCommit={(val) => db.sets.update(s.id, { repsRight: val, reps: null })} />
                            </td>
                          </>
                        ) : (
                          <td>
                            <NumInput value={s.reps} placeholder={ps && setReps(ps) != null ? String(setReps(ps)) : ''} onCommit={(val) => db.sets.update(s.id, { reps: val })} />
                          </td>
                        )}
                        <td>
                          <NumInput className="rir" value={s.rir} placeholder={item?.targetRir != null ? String(item.targetRir) : ''} onCommit={(val) => db.sets.update(s.id, { rir: val })} />
                        </td>
                        <td>
                          <button className="tick" aria-label={s.done ? 'Mark not done' : 'Mark done'} aria-pressed={s.done} onClick={() => tick(se, s, ps)}>
                            {Icon.check}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="ex-actions">
                <button className="btn small grow" onClick={() => addSet(se.id)}>
                  + Add set
                </button>
              </div>
            </section>
          );
        })}

        <div className="spacer" />
        <button className="btn block" onClick={() => setPicker(true)}>
          + Add exercise
        </button>
        <div className="spacer" />
        {isActive ? (
          <button
            className="btn danger block"
            onClick={async () => {
              if (confirm('Discard this workout? Nothing from it will be saved.')) {
                await discardSession(session.id);
                navigate('/', true);
              }
            }}
          >
            Discard workout
          </button>
        ) : (
          <button
            className="btn danger block"
            onClick={async () => {
              if (confirm('Delete this workout from your history?')) {
                await discardSession(session.id);
                navigate('/', true);
              }
            }}
          >
            Delete workout
          </button>
        )}
        <div style={{ height: 80 }} />
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={async (ex) => {
          setPicker(false);
          await addExercise(session.id, ex.id);
        }}
      />

      <VariantSheet
        se={variantFor}
        variant={variantFor ? variants.get(variantFor.variantId) : undefined}
        exercise={variantFor ? exercises.get(variants.get(variantFor.variantId)?.exerciseId ?? '') : undefined}
        onClose={() => setVariantFor(null)}
      />

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? exercises.get(variants.get(menuFor.variantId)?.exerciseId ?? '')?.name : ''}>
        {menuFor ? <ExerciseMenu se={menuFor} isLast={ses[ses.length - 1]?.id === menuFor.id} isFirst={ses[0]?.id === menuFor.id} defaultRest={settings?.defaultRestS ?? 120} onDone={() => setMenuFor(null)} ses={ses} /> : null}
      </Sheet>

      <Sheet open={!!setMenu} onClose={() => setSetMenu(null)} title="Set">
        {setMenu ? <SetMenu s={setMenu} onDone={() => setSetMenu(null)} /> : null}
      </Sheet>

      <Sheet open={gymSheet} onClose={() => setGymSheet(false)} title="Change gym">
        <p className="small muted">Every exercise in this workout moves to the matching variant at the new gym.</p>
        <GymPicker
          value={session.gymId}
          onChange={async (g) => {
            await changeSessionGym(session.id, g);
            setGymSheet(false);
          }}
        />
      </Sheet>

      <Sheet open={!!diff} onClose={() => setDiff(null)} title="Save changes to template?">
        {diff ? (
          <>
            <ul className="small">
              {diff.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <div className="row">
              <button className="btn grow" onClick={() => setDiff(null)}>
                Keep template
              </button>
              <button
                className="btn primary grow"
                onClick={async () => {
                  await saveSessionToTemplate(session.id);
                  toast('Template updated');
                  setDiff(null);
                }}
              >
                Save to template
              </button>
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet
        open={!diff && summary != null}
        onClose={() => {
          setSummary(null);
          navigate('/', true);
        }}
        title="Workout saved"
      >
        {summary ? (
          <>
            {summary.length ? (
              <div className="list">
                {summary.map((p, i) => (
                  <div key={i} className="list-item">
                    <span className="tag pr">PR</span>
                    <div className="grow">
                      <div className="title">{exercises.get(variants.get(p.variantId)?.exerciseId ?? '')?.name}</div>
                      <div className="sub">
                        {dimsLabel(variants.get(p.variantId)?.dims ?? {})} — {p.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No new PRs this time.</p>
            )}
            <div className="spacer" />
            <button
              className="btn primary block"
              onClick={() => {
                setSummary(null);
                navigate('/', true);
              }}
            >
              Done
            </button>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

async function prsForSession(sessionId: string): Promise<PR[]> {
  const session = await db.sessions.get(sessionId);
  if (!session) return [];
  const mine = await db.sets.where('sessionId').equals(sessionId).toArray();
  const vids = [...new Set(mine.map((s) => s.variantId))];
  const out: PR[] = [];
  for (const vid of vids) {
    const v = await db.variants.get(vid);
    const ex = v ? await db.exercises.get(v.exerciseId) : undefined;
    if (!v || !ex) continue;
    const all = await db.sets.where('variantId').equals(vid).toArray();
    const sids = [...new Set(all.map((s) => s.sessionId))];
    const sess = (await db.sessions.bulkGet(sids)).filter((s): s is NonNullable<typeof s> => !!s && !!s.endedAt && !s.deletedAt && s.startedAt <= session.startedAt);
    const bw = new Map(sess.map((s) => [s.id, s.bodyweightKg]));
    const prs = computePRs(
      sess.map((s) => ({ sessionId: s.id, date: s.startedAt, sets: all.filter((x) => x.sessionId === s.id) })),
      vid,
      ex.loadType,
      bw,
    );
    out.push(...prs.filter((p) => p.sessionId === sessionId));
  }
  return out;
}

function VariantSheet({ se, variant, exercise, onClose }: { se: SessionExercise | null; variant?: Variant; exercise?: Exercise; onClose: () => void }) {
  const [dims, setDims] = useState(variant?.dims ?? {});
  useEffect(() => setDims(variant?.dims ?? {}), [variant?.id]);
  return (
    <Sheet open={!!se} onClose={onClose} title={exercise ? `${exercise.name} variant` : 'Variant'}>
      {exercise ? (
        <>
          <p className="small muted">Each combination has its own history and PRs.</p>
          <DimsEditor exercise={exercise} dims={dims} onChange={setDims} />
          <button
            className="btn primary block"
            onClick={async () => {
              if (se) await changeSessionExerciseDims(se.id, dims);
              onClose();
            }}
          >
            Use this variant
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

function ExerciseMenu({ se, ses, isFirst, isLast, defaultRest, onDone }: { se: SessionExercise; ses: SessionExercise[]; isFirst: boolean; isLast: boolean; defaultRest: number; onDone: () => void }) {
  const [notes, setNotes] = useState(se.notes);
  const [rest, setRest] = useState(String(se.restS ?? defaultRest));
  const idx = ses.findIndex((x) => x.id === se.id);
  const linked = !isLast && !!se.supersetGroup && ses[idx + 1]?.supersetGroup === se.supersetGroup;
  return (
    <div className="stack">
      <div className="row">
        <button className="btn grow" disabled={isFirst} onClick={() => moveSessionExercise(se.id, -1).then(onDone)}>
          Move up
        </button>
        <button className="btn grow" disabled={isLast} onClick={() => moveSessionExercise(se.id, 1).then(onDone)}>
          Move down
        </button>
      </div>
      <button className="btn block" disabled={isLast} onClick={() => toggleSupersetWithNext(se.id).then(onDone)}>
        {linked ? 'Unlink superset with next' : 'Superset with next exercise'}
      </button>
      <label className="check">
        <input type="checkbox" checked={se.logLR} onChange={(e) => db.sessionExercises.update(se.id, { logLR: e.target.checked })} />
        Log left and right reps separately
      </label>
      <label className="field">
        <span>Rest timer (seconds)</span>
        <input inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} onBlur={() => db.sessionExercises.update(se.id, { restS: parseNum(rest) })} />
      </label>
      <label className="field">
        <span>Notes for this exercise</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => db.sessionExercises.update(se.id, { notes })} />
      </label>
      <button
        className="btn danger block"
        onClick={async () => {
          if (confirm('Remove this exercise and its sets from the workout?')) {
            await removeSessionExercise(se.id);
            onDone();
          }
        }}
      >
        Remove exercise
      </button>
    </div>
  );
}

const SET_TYPES: [SetType, string][] = [
  ['working', 'Working'],
  ['warmup', 'Warm-up'],
  ['failure', 'Failure'],
  ['drop', 'Drop set'],
  ['myo', 'Myo-rep'],
  ['partial', 'Partials'],
];

function SetMenu({ s, onDone }: { s: SetRow; onDone: () => void }) {
  const [note, setNote] = useState(s.notes);
  const setType = async (t: SetType) => {
    let parentSetId: string | null = null;
    if (t === 'drop' || t === 'myo') {
      const sibs = (await db.sets.where('sessionExerciseId').equals(s.sessionExerciseId).toArray()).sort((a, b) => b.setIndex - a.setIndex);
      parentSetId = sibs.find((x) => x.setIndex < s.setIndex && x.setType !== 'drop' && x.setType !== 'myo' && !x.parentSetId)?.id ?? null;
    }
    await db.sets.update(s.id, { setType: t, parentSetId });
    onDone();
  };
  return (
    <div className="stack">
      <div className="chips">
        {SET_TYPES.map(([t, label]) => (
          <button key={t} className={`chip ${s.setType === t ? 'on' : ''}`} onClick={() => setType(t)}>
            {label}
          </button>
        ))}
      </div>
      <p className="small muted">Drop and myo-rep sets count toward weekly volume as part of the set before them.</p>
      <label className="field">
        <span>Set note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => db.sets.update(s.id, { notes: note })} />
      </label>
      <button
        className="btn danger block"
        onClick={async () => {
          await deleteSet(s.id);
          onDone();
        }}
      >
        Delete set
      </button>
    </div>
  );
}

/** Numeric input that keeps a local draft so decimals like "22." can be typed. */
export function NumInput({
  value,
  onCommit,
  placeholder,
  decimal,
  className,
  style,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  decimal?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [draft, setDraft] = useState(value == null ? '' : fmtNum(value, 2));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value == null ? '' : fmtNum(value, 2));
  }, [value, focused]);
  const commit = useMemo(
    () => (s: string) => {
      const n = parseNum(s);
      if (s.trim() === '' || n != null) onCommit(n);
    },
    [onCommit],
  );
  return (
    <input
      className={className}
      style={style}
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        commit(e.target.value);
      }}
    />
  );
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const req = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* denied or unsupported */
      }
      if (cancelled) void lock?.release();
    };
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [active]);
}
