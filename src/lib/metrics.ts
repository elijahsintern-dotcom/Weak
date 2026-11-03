import type { Exercise, Muscle, Session, SetRow } from '../db/types';

/** Total reps for a set: reps, or the lower of L/R when logged per side. */
export function setReps(s: Pick<SetRow, 'reps' | 'repsLeft' | 'repsRight'>): number | null {
  if (s.reps != null) return s.reps;
  if (s.repsLeft != null || s.repsRight != null) {
    const vals = [s.repsLeft, s.repsRight].filter((v): v is number => v != null);
    return Math.min(...vals);
  }
  return null;
}

/** Load that actually moved, accounting for bodyweight and assistance. Null when unknown. */
export function effectiveLoad(
  loadKg: number | null,
  loadType: Exercise['loadType'],
  bodyweightKg: number | null,
): number | null {
  if (loadType === 'external') return loadKg;
  if (bodyweightKg == null) return null;
  if (loadType === 'bodyweight') return bodyweightKg + (loadKg ?? 0);
  return bodyweightKg - (loadKg ?? 0);
}

/**
 * Epley e1RM on effective reps (reps + RIR). Only computed when effective reps <= 10,
 * because rep-based estimates lose accuracy at higher reps.
 */
export function e1rm(load: number | null, reps: number | null, rir: number | null): number | null {
  if (load == null || reps == null || reps < 1 || load <= 0) return null;
  const eff = reps + (rir ?? 0);
  if (eff > 10) return null;
  return load * (1 + eff / 30);
}

/** Counted as a hard set: done, not a warm-up, and not a drop/myo mini-set attached to a parent. */
export function isHardSet(s: Pick<SetRow, 'done' | 'setType' | 'parentSetId'>): boolean {
  return s.done && s.setType !== 'warmup' && s.parentSetId == null;
}

export function bestSet(sets: SetRow[]): SetRow | null {
  let best: SetRow | null = null;
  for (const s of sets) {
    if (!s.done || s.setType === 'warmup') continue;
    const r = setReps(s) ?? 0;
    const l = s.loadKg ?? 0;
    if (!best) best = s;
    else {
      const bl = best.loadKg ?? 0;
      const br = setReps(best) ?? 0;
      if (l > bl || (l === bl && r > br)) best = s;
    }
  }
  return best;
}

export function volumeLoad(sets: SetRow[]): number {
  return sets
    .filter((s) => s.done && s.setType !== 'warmup')
    .reduce((acc, s) => acc + (s.loadKg ?? 0) * (setReps(s) ?? 0), 0);
}

/** Monday 00:00 local of the week containing the date, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Weekly hard sets per muscle: 1.0 to each primary muscle, 0.5 to each secondary. */
export function weeklySetsPerMuscle(
  sets: SetRow[],
  sessionsById: Map<string, Session>,
  exerciseByVariant: Map<string, Exercise>,
): Map<string, Map<Muscle, number>> {
  const out = new Map<string, Map<Muscle, number>>();
  for (const s of sets) {
    if (!isHardSet(s)) continue;
    const sess = sessionsById.get(s.sessionId);
    const ex = exerciseByVariant.get(s.variantId);
    if (!sess || !ex || sess.deletedAt) continue;
    const wk = weekStart(sess.startedAt);
    let m = out.get(wk);
    if (!m) out.set(wk, (m = new Map()));
    for (const p of ex.primary) m.set(p, (m.get(p) ?? 0) + 1);
    for (const p of ex.secondary) m.set(p, (m.get(p) ?? 0) + 0.5);
  }
  return out;
}

export interface PR {
  sessionId: string;
  variantId: string;
  date: string;
  kind: 'e1rm' | 'load' | 'reps';
  value: number;
  detail: string;
}

/**
 * Walks a variant's sessions in date order, emitting PRs: best e1RM, heaviest load,
 * and most reps at a load at or above any previous load with that rep count.
 */
export function computePRs(
  sessions: { sessionId: string; date: string; sets: SetRow[] }[],
  variantId: string,
  loadType: Exercise['loadType'],
  bwBySession: Map<string, number | null>,
): PR[] {
  const prs: PR[] = [];
  let bestE1 = 0;
  let bestLoad = -Infinity;
  const repsAtLoad = new Map<number, number>();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((sess, idx) => {
    const work = sess.sets.filter((s) => s.done && s.setType !== 'warmup');
    if (!work.length) return;
    const first = idx === 0;
    let sE1 = 0;
    let sE1Set: SetRow | null = null;
    let sLoad = -Infinity;
    for (const s of work) {
      const reps = setReps(s);
      const load = effectiveLoad(s.loadKg, loadType, bwBySession.get(sess.sessionId) ?? null);
      const e = e1rm(load, reps, s.rir);
      if (e != null && e > sE1) {
        sE1 = e;
        sE1Set = s;
      }
      if (s.loadKg != null && reps && s.loadKg > sLoad) sLoad = s.loadKg;
    }
    if (!first && sE1 > bestE1 && sE1Set) {
      prs.push({ sessionId: sess.sessionId, variantId, date: sess.date, kind: 'e1rm', value: sE1, detail: `${fmtKg(Math.round(sE1 * 10) / 10)} kg e1RM (${fmtLoad(sE1Set.loadKg, loadType)} × ${setReps(sE1Set)})` });
    }
    if (!first && sLoad > bestLoad && Number.isFinite(sLoad)) {
      prs.push({ sessionId: sess.sessionId, variantId, date: sess.date, kind: 'load', value: sLoad, detail: `Heaviest: ${fmtLoad(sLoad, loadType)}${loadType === 'external' ? ' kg' : ''}` });
    }
    // Rep PR at a given load: more reps than ever done at that load or heavier.
    const repPRs: string[] = [];
    for (const s of work) {
      const reps = setReps(s);
      if (s.loadKg == null || !reps) continue;
      let prevBest = 0;
      for (const [l, r] of repsAtLoad) if (l >= s.loadKg && r > prevBest) prevBest = r;
      if (!first && prevBest > 0 && reps > prevBest) repPRs.push(`${fmtLoad(s.loadKg, loadType)}${loadType === 'external' ? ' kg' : ''} × ${reps}`);
    }
    if (repPRs.length) {
      prs.push({ sessionId: sess.sessionId, variantId, date: sess.date, kind: 'reps', value: 0, detail: `Rep PR: ${[...new Set(repPRs)].join(', ')}` });
    }
    bestE1 = Math.max(bestE1, sE1);
    bestLoad = Math.max(bestLoad, sLoad);
    for (const s of work) {
      const reps = setReps(s);
      if (s.loadKg == null || !reps) continue;
      repsAtLoad.set(s.loadKg, Math.max(repsAtLoad.get(s.loadKg) ?? 0, reps));
    }
  });
  return prs;
}

/** Load as written for a set: "60", or "BW", "BW+10", "BW−15" for bodyweight / assisted movements. */
export function fmtLoad(load: number | null, loadType: Exercise['loadType']): string {
  if (loadType === 'external') return load == null ? '–' : fmtKg(load);
  if (!load) return 'BW';
  return loadType === 'bodyweight' ? `BW+${fmtKg(load)}` : `BW−${fmtKg(load)}`;
}

export function fmtKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Double progression: every working set reached rep max while leaving at least the target RIR
 * (i.e. not by grinding harder than prescribed). RIR is ignored when either side is blank.
 */
export function shouldIncreaseLoad(
  sets: SetRow[],
  repMax: number | null,
  targetRir: number | null,
): boolean {
  if (repMax == null) return false;
  const work = sets.filter((s) => s.done && (s.setType === 'working' || s.setType === 'failure') && s.parentSetId == null);
  if (!work.length) return false;
  return work.every((s) => {
    const r = setReps(s);
    if (r == null || r < repMax) return false;
    if (targetRir != null && s.rir != null && s.rir < targetRir) return false;
    return true;
  });
}
