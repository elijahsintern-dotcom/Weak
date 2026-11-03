import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyweightEntry,
  DimensionValue,
  Exercise,
  ExerciseNote,
  Folder,
  GymProfile,
  Session,
  SessionExercise,
  SetRow,
  Settings,
  Template,
  TemplateItem,
  Variant,
} from './types';
import { DEFAULT_SETTINGS, DIMENSIONS } from './types';
import { SEED_DIMENSION_VALUES, seedExercises } from './seed';
import { isoLocal, uuidv7 } from './ids';

export class WeakDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  dimensionValues!: EntityTable<DimensionValue, 'id'>;
  gyms!: EntityTable<GymProfile, 'id'>;
  variants!: EntityTable<Variant, 'id'>;
  folders!: EntityTable<Folder, 'id'>;
  templates!: EntityTable<Template, 'id'>;
  templateItems!: EntityTable<TemplateItem, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sessionExercises!: EntityTable<SessionExercise, 'id'>;
  sets!: EntityTable<SetRow, 'id'>;
  bodyweight!: EntityTable<BodyweightEntry, 'id'>;
  notes!: EntityTable<ExerciseNote, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'weak') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name',
      dimensionValues: 'id, dimension',
      gyms: 'id, name',
      variants: 'id, &key, exerciseId, gymId',
      folders: 'id, order',
      templates: 'id, folderId, order',
      templateItems: 'id, templateId',
      sessions: 'id, startedAt, endedAt, gymId, templateId',
      sessionExercises: 'id, sessionId, variantId',
      sets: 'id, sessionId, sessionExerciseId, variantId',
      bodyweight: 'id, date',
      notes: 'id, exerciseId',
      settings: 'id',
    });
  }
}

export const db = new WeakDB();

export const TABLE_NAMES = [
  'exercises',
  'dimensionValues',
  'gyms',
  'variants',
  'folders',
  'templates',
  'templateItems',
  'sessions',
  'sessionExercises',
  'sets',
  'bodyweight',
  'notes',
  'settings',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

/** Seeds the exercise library, dimension values and settings on first run; adds new seed exercises on later runs. */
export async function initDb(d: WeakDB = db): Promise<void> {
  await d.transaction('rw', [d.exercises, d.dimensionValues, d.settings], async () => {
    const now = isoLocal();
    const existing = new Set((await d.exercises.toCollection().primaryKeys()) as string[]);
    const missing = seedExercises(now).filter((e) => !existing.has(e.id));
    if (missing.length) await d.exercises.bulkAdd(missing);

    if ((await d.dimensionValues.count()) === 0) {
      const rows: DimensionValue[] = [];
      for (const dim of DIMENSIONS) {
        SEED_DIMENSION_VALUES[dim].forEach((label, i) =>
          rows.push({ id: uuidv7(), dimension: dim, label, order: i, isCustom: false }),
        );
      }
      await d.dimensionValues.bulkAdd(rows);
    }
    if (!(await d.settings.get('settings'))) await d.settings.put(DEFAULT_SETTINGS);
  });
}

export async function getSettings(d: WeakDB = db): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await d.settings.get('settings')) ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>, d: WeakDB = db): Promise<void> {
  const cur = await getSettings(d);
  await d.settings.put({ ...cur, ...patch, id: 'settings' });
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}
