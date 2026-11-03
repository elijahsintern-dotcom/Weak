import { parseCsv } from './csv';
import type { Dims, SetType } from '../db/types';

export interface StrongSet {
  setType: SetType;
  /** Index into the exercise's set list of the parent set, for drop sets. */
  parentIndex: number | null;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  restS: number | null;
}

export interface StrongExercise {
  name: string;
  sets: StrongSet[];
  notes: string[];
}

export interface StrongWorkout {
  workoutNo: string;
  /** Local wall-clock time as written by Strong, e.g. 2026-02-03 21:38:02 */
  date: string;
  name: string;
  durationS: number | null;
  notes: string;
  exercises: StrongExercise[];
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Parses a Strong CSV export (semicolon or comma separated). */
export function parseStrongCsv(text: string): StrongWorkout[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => {
    const i = header.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
    return i;
  };
  const cWorkout = col('Workout #');
  const cDate = col('Date');
  const cName = col('Workout Name');
  const cDur = col('Duration');
  const cEx = col('Exercise Name');
  const cOrder = col('Set Order');
  const cWeight = col('Weight');
  const cReps = col('Reps');
  const cRpe = col('RPE');
  const cSecs = col('Seconds');
  const cNotes = col('Notes');
  const cWNotes = col('Workout Notes');
  if (cDate < 0 || cEx < 0 || cOrder < 0) throw new Error('This does not look like a Strong export (missing Date, Exercise Name or Set Order columns).');
  const weightIsLbs = cWeight >= 0 && /lbs/i.test(header[cWeight]);

  const workouts: StrongWorkout[] = [];
  const byKey = new Map<string, StrongWorkout>();
  for (const r of rows.slice(1)) {
    const date = r[cDate]?.trim();
    if (!date) continue;
    const key = `${cWorkout >= 0 ? r[cWorkout] : ''}|${date}`;
    let w = byKey.get(key);
    if (!w) {
      w = {
        workoutNo: cWorkout >= 0 ? r[cWorkout] : String(byKey.size + 1),
        date,
        name: cName >= 0 ? r[cName] ?? '' : '',
        durationS: cDur >= 0 ? num(r[cDur]) : null,
        notes: cWNotes >= 0 ? r[cWNotes] ?? '' : '',
        exercises: [],
      };
      byKey.set(key, w);
      workouts.push(w);
    }
    const exName = r[cEx]?.trim() ?? '';
    let ex = w.exercises.at(-1);
    if (!ex || ex.name !== exName) {
      ex = { name: exName, sets: [], notes: [] };
      w.exercises.push(ex);
    }
    const order = (r[cOrder] ?? '').trim();
    const note = cNotes >= 0 ? (r[cNotes] ?? '').trim() : '';
    if (/^rest timer$/i.test(order)) {
      const secs = cSecs >= 0 ? num(r[cSecs]) : null;
      const last = ex.sets.at(-1);
      if (last && secs != null) last.restS = secs;
      continue;
    }
    if (/^note$/i.test(order)) {
      if (note) ex.notes.push(note);
      continue;
    }
    let setType: SetType = 'working';
    if (/^w$/i.test(order)) setType = 'warmup';
    else if (/^d$/i.test(order)) setType = 'drop';
    else if (/^f$/i.test(order)) setType = 'failure';
    else if (!/^\d+$/.test(order)) continue;
    let parentIndex: number | null = null;
    if (setType === 'drop') {
      for (let i = ex.sets.length - 1; i >= 0; i--) {
        if (ex.sets[i].setType !== 'drop') {
          parentIndex = i;
          break;
        }
      }
    }
    let weight = cWeight >= 0 ? num(r[cWeight]) : null;
    if (weight != null && weightIsLbs) weight = Math.round(weight * 0.45359237 * 100) / 100;
    ex.sets.push({
      setType,
      parentIndex,
      weightKg: weight,
      reps: cReps >= 0 ? num(r[cReps]) : null,
      rpe: cRpe >= 0 ? num(r[cRpe]) : null,
      restS: null,
    });
    if (note) ex.notes.push(note);
  }
  // Drop exercises that only had rest-timer/note rows.
  for (const w of workouts) w.exercises = w.exercises.filter((e) => e.sets.length);
  return workouts.filter((w) => w.exercises.length);
}

/** Converts Strong's "YYYY-MM-DD HH:MM:SS" local time to a Date. */
export function strongDate(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

/** Infers cable path / laterality words from free-text notes. */
export function dimsFromNotes(notes: string[]): Dims {
  const t = ' ' + notes.join(' ').toLowerCase() + ' ';
  const out: Dims = {};
  if (/high to low|high-to-low|\bh\s*>\s*l\b/.test(t)) out.cablePath = 'High to low';
  else if (/low to high|low-to-high|\bl\s*>\s*h\b/.test(t)) out.cablePath = 'Low to high';
  else if (/\bmid\b/.test(t)) out.cablePath = 'Mid';
  if (/\bsa\b|single arm|single-arm|one arm|unilateral/.test(t)) out.laterality = 'Unilateral';
  return out;
}

/**
 * Picks the gym for a workout from note text: the single gym whose name (or alias) appears.
 * Returns null when none or several match, so the default gym is used.
 */
export function gymFromNotes(notes: string[], gyms: { id: string; matchWords: string[] }[]): string | null {
  const t = ' ' + notes.join(' ').toLowerCase() + ' ';
  const hits = gyms.filter((g) =>
    g.matchWords.some((w) => {
      const word = w.trim().toLowerCase();
      if (!word) return false;
      const re = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
      return re.test(t);
    }),
  );
  return hits.length === 1 ? hits[0].id : null;
}
