import { db, getSettings, updateSettings } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import type { Dims, Exercise, Session, SessionExercise, SetRow, SetType, TemplateItem, Variant } from '../db/types';
import { dimsLabel, lastCompletedForVariant, lastUsedDims, resolveVariant } from '../db/variants';

export async function activeSession(): Promise<Session | undefined> {
  const all = await db.sessions.toArray();
  return all.find((s) => !s.endedAt && !s.deletedAt);
}

function blankSet(se: SessionExercise, index: number, setType: SetType = 'working'): SetRow {
  return {
    id: uuidv7(),
    sessionId: se.sessionId,
    sessionExerciseId: se.id,
    variantId: se.variantId,
    setIndex: index,
    setType,
    parentSetId: null,
    loadKg: null,
    reps: null,
    repsLeft: null,
    repsRight: null,
    rir: null,
    restS: null,
    completedAt: null,
    done: false,
    notes: '',
  };
}

export async function startSession(opts: { templateId: string | null; gymId: string; name?: string }): Promise<string> {
  const existing = await activeSession();
  if (existing) return existing.id;
  const tpl = opts.templateId ? await db.templates.get(opts.templateId) : undefined;
  const session: Session = {
    id: uuidv7(),
    templateId: tpl?.id ?? null,
    name: opts.name ?? tpl?.name ?? 'Workout',
    gymId: opts.gymId,
    startedAt: isoLocal(),
    endedAt: null,
    bodyweightKg: null,
    notes: '',
    source: 'app',
  };
  const lastBw = await db.bodyweight.orderBy('date').last();
  if (lastBw) session.bodyweightKg = lastBw.kg;
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.variants, db.exercises, db.templateItems], async () => {
    await db.sessions.add(session);
    if (tpl) {
      const items = (await db.templateItems.where('templateId').equals(tpl.id).toArray()).sort((a, b) => a.order - b.order);
      for (const it of items) {
        const ex = await db.exercises.get(it.exerciseId);
        if (!ex) continue;
        await addExerciseInner(session, ex, it.dims, it);
      }
    }
  });
  await updateSettings({ lastGymId: opts.gymId });
  return session.id;
}

async function addExerciseInner(session: Session, ex: Exercise, dims: Dims, item?: TemplateItem): Promise<SessionExercise> {
  const variant = await resolveVariant(ex, session.gymId, dims);
  const order = await db.sessionExercises.where('sessionId').equals(session.id).count();
  const se: SessionExercise = {
    id: uuidv7(),
    sessionId: session.id,
    variantId: variant.id,
    order,
    supersetGroup: item?.supersetGroup ?? null,
    notes: '',
    restS: item?.restS ?? null,
    logLR: item?.logLR ?? false,
    templateItemId: item?.id ?? null,
  };
  await db.sessionExercises.add(se);
  // Number of rows: template target, else last session's working-set count, else 3.
  let n = item?.targetSets ?? 0;
  if (!n) {
    const last = await lastCompletedForVariant(variant.id, session.id);
    if (last) {
      const prev = await db.sets.where('sessionId').equals(last.sessionId).filter((s) => s.variantId === variant.id && s.setType !== 'warmup' && !s.parentSetId).count();
      n = prev;
    }
  }
  if (!n) n = 3;
  await db.sets.bulkAdd(Array.from({ length: n }, (_, i) => blankSet(se, i)));
  return se;
}

/** Adds an exercise; without explicit dims it uses the variant you last trained (at this gym if possible). */
export async function addExercise(sessionId: string, exerciseId: string, dims?: Dims): Promise<void> {
  const session = await db.sessions.get(sessionId);
  const ex = await db.exercises.get(exerciseId);
  if (!session || !ex) return;
  if (!dims) dims = await lastUsedDims(exerciseId, session.gymId);
  const useDims = dims;
  await db.transaction('rw', [db.sessionExercises, db.sets, db.variants, db.sessions], () => addExerciseInner(session, ex, useDims));
}

/** Changes the variant of an exercise in the session (and its sets). */
export async function changeSessionExerciseDims(seId: string, dims: Dims): Promise<Variant | undefined> {
  const se = await db.sessionExercises.get(seId);
  if (!se) return;
  const session = await db.sessions.get(se.sessionId);
  const oldV = await db.variants.get(se.variantId);
  const ex = oldV ? await db.exercises.get(oldV.exerciseId) : undefined;
  if (!session || !ex) return;
  const v = await resolveVariant(ex, session.gymId, dims);
  await db.transaction('rw', [db.sessionExercises, db.sets], async () => {
    await db.sessionExercises.update(se.id, { variantId: v.id });
    await db.sets.where('sessionExerciseId').equals(se.id).modify({ variantId: v.id });
  });
  return v;
}

/** Changes the gym of a session, re-keying every exercise. */
export async function changeSessionGym(sessionId: string, gymId: string): Promise<void> {
  const ses = await db.sessionExercises.where('sessionId').equals(sessionId).toArray();
  await db.sessions.update(sessionId, { gymId });
  for (const se of ses) {
    const v = await db.variants.get(se.variantId);
    const ex = v ? await db.exercises.get(v.exerciseId) : undefined;
    if (!v || !ex) continue;
    const nv = await resolveVariant(ex, gymId, v.dims);
    await db.sessionExercises.update(se.id, { variantId: nv.id });
    await db.sets.where('sessionExerciseId').equals(se.id).modify({ variantId: nv.id });
  }
  await updateSettings({ lastGymId: gymId });
}

export async function addSet(seId: string, setType: SetType = 'working'): Promise<void> {
  const se = await db.sessionExercises.get(seId);
  if (!se) return;
  const sets = await db.sets.where('sessionExerciseId').equals(seId).toArray();
  const row = blankSet(se, sets.length, setType);
  if (setType === 'drop' || setType === 'myo') {
    const parent = [...sets].sort((a, b) => b.setIndex - a.setIndex).find((s) => s.setType !== 'drop' && s.setType !== 'myo' && !s.parentSetId);
    row.parentSetId = parent?.id ?? null;
  }
  await db.sets.add(row);
}

export async function deleteSet(setId: string): Promise<void> {
  const s = await db.sets.get(setId);
  if (!s) return;
  await db.transaction('rw', db.sets, async () => {
    await db.sets.delete(setId);
    const rest = (await db.sets.where('sessionExerciseId').equals(s.sessionExerciseId).toArray()).sort((a, b) => a.setIndex - b.setIndex);
    for (let i = 0; i < rest.length; i++) if (rest[i].setIndex !== i) await db.sets.update(rest[i].id, { setIndex: i });
    for (const r of rest) if (r.parentSetId === setId) await db.sets.update(r.id, { parentSetId: null });
  });
}

export async function removeSessionExercise(seId: string): Promise<void> {
  const se = await db.sessionExercises.get(seId);
  if (!se) return;
  await db.transaction('rw', [db.sessionExercises, db.sets], async () => {
    await db.sets.where('sessionExerciseId').equals(seId).delete();
    await db.sessionExercises.delete(seId);
    const rest = (await db.sessionExercises.where('sessionId').equals(se.sessionId).toArray()).sort((a, b) => a.order - b.order);
    for (let i = 0; i < rest.length; i++) if (rest[i].order !== i) await db.sessionExercises.update(rest[i].id, { order: i });
  });
}

export async function moveSessionExercise(seId: string, dir: -1 | 1): Promise<void> {
  const se = await db.sessionExercises.get(seId);
  if (!se) return;
  const list = (await db.sessionExercises.where('sessionId').equals(se.sessionId).toArray()).sort((a, b) => a.order - b.order);
  const i = list.findIndex((x) => x.id === seId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  await db.transaction('rw', db.sessionExercises, async () => {
    await db.sessionExercises.update(list[i].id, { order: j });
    await db.sessionExercises.update(list[j].id, { order: i });
  });
}

/** Links this exercise with the next one into a superset (or unlinks it). */
export async function toggleSupersetWithNext(seId: string): Promise<void> {
  const se = await db.sessionExercises.get(seId);
  if (!se) return;
  const list = (await db.sessionExercises.where('sessionId').equals(se.sessionId).toArray()).sort((a, b) => a.order - b.order);
  const i = list.findIndex((x) => x.id === seId);
  const next = list[i + 1];
  if (!next) return;
  if (se.supersetGroup && se.supersetGroup === next.supersetGroup) {
    // Unlink: the next exercise and everything after it leave the group.
    const g = se.supersetGroup;
    for (const x of list.slice(i + 1)) if (x.supersetGroup === g) await db.sessionExercises.update(x.id, { supersetGroup: null });
    const remaining = list.slice(0, i + 1).filter((x) => x.supersetGroup === g);
    if (remaining.length < 2) for (const x of remaining) await db.sessionExercises.update(x.id, { supersetGroup: null });
    return;
  }
  const g = se.supersetGroup ?? next.supersetGroup ?? uuidv7().slice(-6);
  await db.sessionExercises.update(se.id, { supersetGroup: g });
  await db.sessionExercises.update(next.id, { supersetGroup: g });
}

export async function discardSession(sessionId: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets], async () => {
    await db.sets.where('sessionId').equals(sessionId).delete();
    await db.sessionExercises.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export interface TemplateDiff {
  templateId: string;
  lines: string[];
  hasChanges: boolean;
}

/** Compares the finished session's exercises with its template. */
export async function diffWithTemplate(sessionId: string): Promise<TemplateDiff | null> {
  const session = await db.sessions.get(sessionId);
  if (!session?.templateId) return null;
  const tpl = await db.templates.get(session.templateId);
  if (!tpl || tpl.deletedAt) return null;
  const items = (await db.templateItems.where('templateId').equals(tpl.id).toArray()).sort((a, b) => a.order - b.order);
  const ses = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.order - b.order);
  const lines: string[] = [];
  const exName = async (id: string) => (await db.exercises.get(id))?.name ?? 'Exercise';
  const usedItems = new Set<string>();
  for (const se of ses) {
    const v = await db.variants.get(se.variantId);
    if (!v) continue;
    const item = se.templateItemId ? items.find((i) => i.id === se.templateItemId) : undefined;
    const name = await exName(v.exerciseId);
    const sets = await db.sets.where('sessionExerciseId').equals(se.id).filter((s) => s.setType !== 'warmup' && !s.parentSetId).count();
    if (!item) {
      lines.push(`Added: ${name} (${dimsLabel(v.dims)})`);
      continue;
    }
    usedItems.add(item.id);
    if (dimsLabel(item.dims) !== dimsLabel(v.dims)) lines.push(`${name}: variant ${dimsLabel(item.dims)} → ${dimsLabel(v.dims)}`);
    if (item.targetSets !== sets) lines.push(`${name}: sets ${item.targetSets} → ${sets}`);
    if (item.order !== se.order) lines.push(`${name}: moved to position ${se.order + 1}`);
    if ((item.supersetGroup ?? null) !== (se.supersetGroup ?? null) && (!!item.supersetGroup || !!se.supersetGroup)) lines.push(`${name}: superset changed`);
  }
  for (const it of items) if (!usedItems.has(it.id)) lines.push(`Removed: ${await exName(it.exerciseId)}`);
  return { templateId: tpl.id, lines, hasChanges: lines.length > 0 };
}

/** Rewrites the template's items from the session's exercises, keeping targets of matched items. */
export async function saveSessionToTemplate(sessionId: string): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session?.templateId) return;
  const tplId = session.templateId;
  const settings = await getSettings();
  const old = await db.templateItems.where('templateId').equals(tplId).toArray();
  const ses = (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.order - b.order);
  const newItems: TemplateItem[] = [];
  for (const se of ses) {
    const v = await db.variants.get(se.variantId);
    if (!v) continue;
    const prev = old.find((o) => o.id === se.templateItemId);
    const sets = await db.sets.where('sessionExerciseId').equals(se.id).filter((s) => s.setType !== 'warmup' && !s.parentSetId).count();
    newItems.push({
      id: prev?.id ?? uuidv7(),
      templateId: tplId,
      exerciseId: v.exerciseId,
      dims: v.dims,
      order: se.order,
      supersetGroup: se.supersetGroup,
      targetSets: sets || prev?.targetSets || 3,
      repMin: prev?.repMin ?? null,
      repMax: prev?.repMax ?? null,
      targetRir: prev?.targetRir ?? null,
      restS: se.restS ?? prev?.restS ?? settings.defaultRestS,
      doubleProgression: prev?.doubleProgression ?? false,
      logLR: se.logLR,
    });
  }
  await db.transaction('rw', [db.templateItems, db.templates], async () => {
    await db.templateItems.where('templateId').equals(tplId).delete();
    await db.templateItems.bulkAdd(newItems);
    await db.templates.update(tplId, { updatedAt: isoLocal() });
  });
}

/** Marks the session finished. Unfinished empty set rows are removed. */
export async function finishSession(sessionId: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sets, db.sessionExercises], async () => {
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
    const drop = sets.filter((s) => !s.done).map((s) => s.id);
    await db.sets.bulkDelete(drop);
    const ses = await db.sessionExercises.where('sessionId').equals(sessionId).toArray();
    for (const se of ses) {
      const left = (await db.sets.where('sessionExerciseId').equals(se.id).toArray()).sort((a, b) => a.setIndex - b.setIndex);
      if (!left.length) await db.sessionExercises.delete(se.id);
      else for (let i = 0; i < left.length; i++) if (left[i].setIndex !== i) await db.sets.update(left[i].id, { setIndex: i });
    }
    await db.sessions.update(sessionId, { endedAt: isoLocal() });
  });
}
