import { db, type WeakDB } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import type { Dims, Exercise, GymProfile, Session, SessionExercise, SetRow } from '../db/types';
import { cleanDims, resolveVariant } from '../db/variants';
import { dimsFromNotes, gymFromNotes, strongDate, type StrongWorkout } from './strong';

export interface StrongMapping {
  /** Existing exercise id, or null to create a new custom exercise named `newName`. */
  exerciseId: string | null;
  newName?: string;
  dims: Dims;
}

export interface ImportOptions {
  mappings: Record<string, StrongMapping>;
  defaultGymId: string;
  /** Words per gym used to detect the gym from notes. */
  gymMatchWords: Record<string, string[]>;
  inferDimsFromNotes: boolean;
  /** Skip workouts whose start time already exists as a Strong-imported session. */
  skipDuplicates: boolean;
}

export interface ImportResult {
  sessions: number;
  sets: number;
  skipped: number;
  gymDetected: number;
  createdExercises: number;
}

export async function importStrong(
  workouts: StrongWorkout[],
  opts: ImportOptions,
  d: WeakDB = db,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, sets: 0, skipped: 0, gymDetected: 0, createdExercises: 0 };
  const gyms = (await d.gyms.toArray()).filter((g) => !g.deletedAt);
  const gymMatchers = gyms.map((g: GymProfile) => ({ id: g.id, matchWords: opts.gymMatchWords[g.id] ?? [g.name] }));

  await d.transaction(
    'rw',
    [d.exercises, d.variants, d.sessions, d.sessionExercises, d.sets],
    async () => {
      // Create custom exercises for unmapped names.
      const exById = new Map<string, Exercise>((await d.exercises.toArray()).map((e) => [e.id, e]));
      const exForName = new Map<string, Exercise>();
      for (const [name, m] of Object.entries(opts.mappings)) {
        if (m.exerciseId && exById.has(m.exerciseId)) {
          exForName.set(name, exById.get(m.exerciseId)!);
          continue;
        }
        const ex: Exercise = {
          id: uuidv7(),
          name: m.newName?.trim() || name,
          category: 'isolation',
          equipment: 'other',
          primary: [],
          secondary: [],
          dims: ['laterality', 'grip', 'position', 'rom', 'tempo'],
          loadType: 'external',
          isCustom: true,
          createdAt: isoLocal(),
        };
        await d.exercises.add(ex);
        exById.set(ex.id, ex);
        exForName.set(name, ex);
        result.createdExercises++;
      }

      const existingStarts = new Set(
        (await d.sessions.toArray()).filter((s) => s.source === 'strong' && !s.deletedAt).map((s) => s.startedAt),
      );

      for (const w of workouts) {
        const start = strongDate(w.date);
        const startedAt = isoLocal(start);
        if (opts.skipDuplicates && existingStarts.has(startedAt)) {
          result.skipped++;
          continue;
        }
        const allNotes = [w.notes, ...w.exercises.flatMap((e) => e.notes)].filter(Boolean);
        const detected = gymFromNotes(allNotes, gymMatchers);
        if (detected) result.gymDetected++;
        const gymId = detected ?? opts.defaultGymId;
        const session: Session = {
          id: uuidv7(start.getTime()),
          templateId: null,
          name: w.name || 'Workout',
          gymId,
          startedAt,
          endedAt: isoLocal(new Date(start.getTime() + (w.durationS ?? 0) * 1000)),
          bodyweightKg: null,
          notes: w.notes,
          source: 'strong',
        };
        await d.sessions.add(session);
        result.sessions++;

        let order = 0;
        for (const e of w.exercises) {
          const ex = exForName.get(e.name);
          if (!ex) continue;
          const m = opts.mappings[e.name];
          const noteDims = opts.inferDimsFromNotes ? dimsFromNotes(e.notes) : {};
          const dims = cleanDims({ ...(m?.dims ?? {}), ...noteDims }, ex.dims);
          const variant = await resolveVariant(ex, gymId, dims, d);
          const se: SessionExercise = {
            id: uuidv7(start.getTime()),
            sessionId: session.id,
            variantId: variant.id,
            order: order++,
            supersetGroup: null,
            notes: e.notes.join('\n'),
            restS: null,
            logLR: false,
            templateItemId: null,
          };
          await d.sessionExercises.add(se);
          const ids: string[] = [];
          const rows: SetRow[] = e.sets.map((s, i) => {
            const id = uuidv7(start.getTime());
            ids.push(id);
            return {
              id,
              sessionId: session.id,
              sessionExerciseId: se.id,
              variantId: variant.id,
              setIndex: i,
              setType: s.setType,
              parentSetId: null,
              loadKg: s.weightKg,
              reps: s.reps,
              repsLeft: null,
              repsRight: null,
              rir: s.rpe != null ? Math.max(0, 10 - s.rpe) : null,
              restS: s.restS,
              completedAt: null,
              done: true,
              notes: '',
            };
          });
          e.sets.forEach((s, i) => {
            if (s.parentIndex != null) rows[i].parentSetId = ids[s.parentIndex];
          });
          await d.sets.bulkAdd(rows);
          result.sets += rows.length;
        }
      }
    },
  );
  return result;
}

/**
 * Moves sessions in a date range (optionally only from one gym) to another gym,
 * re-keying every exercise to the matching variant at the new gym.
 */
export async function reassignGym(
  opts: { from: string; to: string; fromGymId: string | null; toGymId: string },
  d: WeakDB = db,
): Promise<number> {
  let moved = 0;
  await d.transaction('rw', [d.sessions, d.sessionExercises, d.sets, d.variants, d.exercises], async () => {
    const sessions = (await d.sessions.toArray()).filter((s) => {
      const day = s.startedAt.slice(0, 10);
      return !s.deletedAt && day >= opts.from && day <= opts.to && (!opts.fromGymId || s.gymId === opts.fromGymId) && s.gymId !== opts.toGymId;
    });
    for (const s of sessions) {
      await d.sessions.update(s.id, { gymId: opts.toGymId });
      const ses = await d.sessionExercises.where('sessionId').equals(s.id).toArray();
      for (const se of ses) {
        const v = await d.variants.get(se.variantId);
        if (!v) continue;
        const ex = await d.exercises.get(v.exerciseId);
        if (!ex) continue;
        const nv = await resolveVariant(ex, opts.toGymId, v.dims, d);
        await d.sessionExercises.update(se.id, { variantId: nv.id });
        await d.sets.where('sessionExerciseId').equals(se.id).modify({ variantId: nv.id });
      }
      moved++;
    }
  });
  return moved;
}
