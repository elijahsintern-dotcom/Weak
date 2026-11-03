import type { Dimension, Dims, Exercise, Variant } from './types';
import { DIMENSIONS } from './types';
import { db, type WeakDB } from './db';
import { isoLocal, uuidv7 } from './ids';

const norm = (v: string) => v.trim().toLowerCase();

/** Removes empty values and dimensions the exercise doesn't use. */
export function cleanDims(dims: Dims, applicable?: Dimension[]): Dims {
  const out: Dims = {};
  for (const d of DIMENSIONS) {
    const v = dims[d]?.trim();
    if (!v) continue;
    if (applicable && !applicable.includes(d)) continue;
    out[d] = v;
  }
  return out;
}

/** Deterministic key: exercise + gym + sorted non-standard dimension values. */
export function variantKey(exerciseId: string, gymId: string, dims: Dims): string {
  const parts = DIMENSIONS.filter((d) => dims[d]?.trim()).map((d) => `${d}=${norm(dims[d]!)}`);
  return `${exerciseId}|${gymId}|${parts.join(';')}`;
}

export async function resolveVariant(
  exercise: Pick<Exercise, 'id' | 'dims'>,
  gymId: string,
  dims: Dims,
  d: WeakDB = db,
): Promise<Variant> {
  const clean = cleanDims(dims, exercise.dims);
  const key = variantKey(exercise.id, gymId, clean);
  const existing = await d.variants.where('key').equals(key).first();
  if (existing) return existing;
  const v: Variant = { id: uuidv7(), exerciseId: exercise.id, dims: clean, gymId, key, createdAt: isoLocal() };
  await d.variants.add(v);
  return v;
}

export function dimsLabel(dims: Dims): string {
  const vals = DIMENSIONS.map((d) => dims[d]).filter(Boolean) as string[];
  return vals.length ? vals.join(' · ') : 'Standard';
}

export function dimsDiffCount(a: Dims, b: Dims): number {
  let n = 0;
  for (const d of DIMENSIONS) if (norm(a[d] ?? '') !== norm(b[d] ?? '')) n++;
  return n;
}

/**
 * Closest existing variant of the same exercise that has history, for reference when starting a new variant.
 * Score: fewest differing dimensions, then same gym, then most recent use.
 */
export async function closestVariantWithHistory(
  target: { exerciseId: string; gymId: string; dims: Dims; excludeVariantId?: string },
  d: WeakDB = db,
): Promise<{ variant: Variant; lastSessionId: string; lastDate: string } | null> {
  const candidates = (await d.variants.where('exerciseId').equals(target.exerciseId).toArray()).filter(
    (v) => v.id !== target.excludeVariantId,
  );
  let best: { variant: Variant; lastSessionId: string; lastDate: string; score: number } | null = null;
  for (const v of candidates) {
    const last = await lastCompletedForVariant(v.id, undefined, d);
    if (!last) continue;
    const score = dimsDiffCount(v.dims, target.dims) * 10 + (v.gymId === target.gymId ? 0 : 5);
    if (!best || score < best.score || (score === best.score && last.date > best.lastDate)) {
      best = { variant: v, lastSessionId: last.sessionId, lastDate: last.date, score };
    }
  }
  return best ? { variant: best.variant, lastSessionId: best.lastSessionId, lastDate: best.lastDate } : null;
}

/** Most recent finished session (excluding one) where this variant has at least one done set. */
export async function lastCompletedForVariant(
  variantId: string,
  excludeSessionId?: string,
  d: WeakDB = db,
): Promise<{ sessionId: string; date: string } | null> {
  const sets = await d.sets.where('variantId').equals(variantId).toArray();
  const sessionIds = [...new Set(sets.filter((s) => s.done && s.sessionId !== excludeSessionId).map((s) => s.sessionId))];
  if (!sessionIds.length) return null;
  const sessions = (await d.sessions.bulkGet(sessionIds)).filter(
    (s): s is NonNullable<typeof s> => !!s && !!s.endedAt && !s.deletedAt,
  );
  if (!sessions.length) return null;
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return { sessionId: sessions[0].id, date: sessions[0].startedAt };
}

/** Dimensions of the most recently trained variant of an exercise, preferring the given gym. */
export async function lastUsedDims(exerciseId: string, gymId?: string, d: WeakDB = db): Promise<Dims> {
  const variants = await d.variants.where('exerciseId').equals(exerciseId).toArray();
  let best: { dims: Dims; date: string; sameGym: boolean } | null = null;
  for (const v of variants) {
    const last = await lastCompletedForVariant(v.id, undefined, d);
    if (!last) continue;
    const sameGym = !!gymId && v.gymId === gymId;
    if (!best || (sameGym && !best.sameGym) || (sameGym === best.sameGym && last.date > best.date)) {
      best = { dims: v.dims, date: last.date, sameGym };
    }
  }
  return best?.dims ?? {};
}
