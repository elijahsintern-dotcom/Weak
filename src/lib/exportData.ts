import { db, TABLE_NAMES, type TableName, type WeakDB } from '../db/db';
import { isoLocal } from '../db/ids';
import { DIMENSIONS, type Exercise, type GymProfile, type Session, type SessionExercise, type Template, type Variant } from '../db/types';
import { toCsv } from './csv';
import { e1rm, effectiveLoad, setReps } from './metrics';

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.1.0';

export const CSV_COLUMNS = [
  'session_id',
  'session_start',
  'session_end',
  'session_name',
  'template',
  'gym',
  'exercise',
  'exercise_id',
  'variant_key',
  'laterality',
  'grip',
  'attachment',
  'cable_path',
  'bench_angle',
  'position',
  'rom',
  'tempo',
  'exercise_order',
  'superset_group',
  'set_index',
  'set_type',
  'parent_set_index',
  'load_kg',
  'bodyweight_kg',
  'total_load_kg',
  'reps',
  'reps_left',
  'reps_right',
  'rir',
  'e1rm_kg',
  'rest_s',
  'set_note',
  'exercise_note',
  'session_note',
] as const;


export interface CsvFilter {
  from?: string; // YYYY-MM-DD inclusive
  to?: string;
  exerciseIds?: string[];
  variantIds?: string[];
  gymIds?: string[];
}

const r1 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

export async function buildSetsCsv(filter: CsvFilter = {}, d: WeakDB = db): Promise<{ csv: string; rows: number }> {
  const [sessions, ses, sets, variants, exercises, gyms, templates] = await Promise.all([
    d.sessions.toArray(),
    d.sessionExercises.toArray(),
    d.sets.toArray(),
    d.variants.toArray(),
    d.exercises.toArray(),
    d.gyms.toArray(),
    d.templates.toArray(),
  ]);
  const sMap = new Map<string, Session>(sessions.map((s) => [s.id, s]));
  const seMap = new Map<string, SessionExercise>(ses.map((s) => [s.id, s]));
  const vMap = new Map<string, Variant>(variants.map((v) => [v.id, v]));
  const eMap = new Map<string, Exercise>(exercises.map((e) => [e.id, e]));
  const gMap = new Map<string, GymProfile>(gyms.map((g) => [g.id, g]));
  const tMap = new Map<string, Template>(templates.map((t) => [t.id, t]));
  const setIdx = new Map(sets.map((s) => [s.id, s.setIndex]));

  const out: (string | number | null)[][] = [];
  const sorted = sets
    .filter((s) => s.done)
    .sort((a, b) => {
      const sa = sMap.get(a.sessionId)?.startedAt ?? '';
      const sb = sMap.get(b.sessionId)?.startedAt ?? '';
      if (sa !== sb) return sa.localeCompare(sb);
      const oa = seMap.get(a.sessionExerciseId)?.order ?? 0;
      const ob = seMap.get(b.sessionExerciseId)?.order ?? 0;
      return oa - ob || a.setIndex - b.setIndex;
    });
  for (const s of sorted) {
    const sess = sMap.get(s.sessionId);
    const se = seMap.get(s.sessionExerciseId);
    const v = vMap.get(s.variantId);
    const ex = v ? eMap.get(v.exerciseId) : undefined;
    if (!sess || !se || !v || !ex || sess.deletedAt || !sess.endedAt) continue;
    const day = sess.startedAt.slice(0, 10);
    if (filter.from && day < filter.from) continue;
    if (filter.to && day > filter.to) continue;
    if (filter.exerciseIds?.length && !filter.exerciseIds.includes(ex.id)) continue;
    if (filter.variantIds?.length && !filter.variantIds.includes(v.id)) continue;
    if (filter.gymIds?.length && !filter.gymIds.includes(sess.gymId)) continue;
    const reps = setReps(s);
    const total = effectiveLoad(s.loadKg, ex.loadType, sess.bodyweightKg);
    out.push([
      sess.id,
      sess.startedAt,
      sess.endedAt,
      sess.name,
      sess.templateId ? tMap.get(sess.templateId)?.name ?? '' : '',
      gMap.get(sess.gymId)?.name ?? '',
      ex.name,
      ex.id,
      v.key,
      ...DIMENSIONS.map((dim) => v.dims[dim] ?? 'standard'),
      se.order + 1,
      se.supersetGroup,
      s.setIndex + 1,
      s.setType,
      s.parentSetId ? (setIdx.get(s.parentSetId) ?? 0) + 1 : null,
      s.loadKg,
      sess.bodyweightKg,
      r1(total),
      s.reps,
      s.repsLeft,
      s.repsRight,
      s.rir,
      r1(e1rm(total, reps, s.rir)),
      s.restS,
      s.notes || null,
      se.notes || null,
      sess.notes || null,
    ]);
  }
  return { csv: toCsv([...CSV_COLUMNS], out), rows: out.length };
}

export interface FullExport {
  schema_version: number;
  app_version: string;
  exported_at: string;
  tables: Record<TableName, unknown[]>;
}

export async function buildFullExport(d: WeakDB = db): Promise<FullExport> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const t of TABLE_NAMES) tables[t] = await d.table(t).toArray();
  return { schema_version: SCHEMA_VERSION, app_version: APP_VERSION, exported_at: isoLocal(), tables };
}

export function validateExport(data: unknown): FullExport {
  const x = data as FullExport;
  if (!x || typeof x !== 'object' || typeof x.schema_version !== 'number' || !x.tables) {
    throw new Error('Not a Weak export file.');
  }
  if (x.schema_version > SCHEMA_VERSION) {
    throw new Error(`This file is from a newer app version (schema ${x.schema_version}). Update the app first.`);
  }
  return x;
}

export function exportCounts(x: FullExport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TABLE_NAMES) out[t] = Array.isArray(x.tables[t]) ? x.tables[t].length : 0;
  return out;
}

/** Replace wipes every table first; merge upserts by id. */
export async function restoreExport(x: FullExport, mode: 'replace' | 'merge', d: WeakDB = db): Promise<void> {
  await d.transaction('rw', TABLE_NAMES.map((t) => d.table(t)), async () => {
    for (const t of TABLE_NAMES) {
      const rows = (x.tables[t] ?? []) as object[];
      if (mode === 'replace') await d.table(t).clear();
      if (rows.length) await d.table(t).bulkPut(rows);
    }
  });
}

/** Opens the Android share sheet when possible, otherwise downloads the file. */
export async function shareOrDownload(filename: string, content: string, mime: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([content], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export function dateStamp(d = new Date()): string {
  return isoLocal(d).slice(0, 10);
}
