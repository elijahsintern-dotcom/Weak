export const DIMENSIONS = [
  'laterality',
  'grip',
  'attachment',
  'cablePath',
  'benchAngle',
  'position',
  'rom',
  'tempo',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
/** Dimension values keyed by dimension. A missing key means "standard". */
export type Dims = Partial<Record<Dimension, string>>;

export const DIMENSION_LABELS: Record<Dimension, string> = {
  laterality: 'Laterality',
  grip: 'Grip',
  attachment: 'Attachment',
  cablePath: 'Cable path',
  benchAngle: 'Bench angle',
  position: 'Position',
  rom: 'ROM',
  tempo: 'Tempo',
};

export const MUSCLES = [
  'chest',
  'front delts',
  'side delts',
  'rear delts',
  'lats',
  'upper back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'lower back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'smith'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other';

/** external = load is the weight lifted; bodyweight = load is added weight; assisted = load is assistance. */
export type LoadType = 'external' | 'bodyweight' | 'assisted';

export type SetType = 'working' | 'warmup' | 'drop' | 'myo' | 'failure' | 'partial';

export const SET_TYPE_SHORT: Record<SetType, string> = {
  working: '',
  warmup: 'W',
  drop: 'D',
  myo: 'M',
  failure: 'F',
  partial: 'P',
};

export interface Exercise {
  id: string;
  name: string;
  category: 'compound' | 'isolation';
  equipment: Equipment;
  primary: Muscle[];
  secondary: Muscle[];
  dims: Dimension[];
  loadType: LoadType;
  isCustom: boolean;
  archived?: boolean;
  createdAt: string;
  deletedAt?: string | null;
}

export interface DimensionValue {
  id: string;
  dimension: Dimension;
  label: string;
  order: number;
  isCustom: boolean;
}

export interface CableStack {
  name: string;
  incrementKg: number;
}

export interface GymProfile {
  id: string;
  name: string;
  barbellKg?: number | null;
  platesKg?: number[];
  dbMinKg?: number | null;
  dbMaxKg?: number | null;
  dbStepKg?: number | null;
  cableStacks?: CableStack[];
  notes?: string;
  archived?: boolean;
  createdAt: string;
  deletedAt?: string | null;
}

export interface Variant {
  id: string;
  exerciseId: string;
  dims: Dims;
  gymId: string;
  key: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  order: number;
  deletedAt?: string | null;
}

export interface Template {
  id: string;
  folderId: string | null;
  name: string;
  notes: string;
  order: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface TemplateItem {
  id: string;
  templateId: string;
  exerciseId: string;
  dims: Dims;
  order: number;
  supersetGroup: string | null;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  targetRir: number | null;
  restS: number | null;
  doubleProgression: boolean;
  logLR: boolean;
}

export interface Session {
  id: string;
  templateId: string | null;
  name: string;
  gymId: string;
  startedAt: string;
  endedAt: string | null;
  bodyweightKg: number | null;
  notes: string;
  source: 'app' | 'strong';
  deletedAt?: string | null;
}

export interface SessionExercise {
  id: string;
  sessionId: string;
  variantId: string;
  order: number;
  supersetGroup: string | null;
  notes: string;
  restS: number | null;
  logLR: boolean;
  /** Template item this came from, for target display and save-back. */
  templateItemId: string | null;
}

export interface SetRow {
  id: string;
  sessionId: string;
  sessionExerciseId: string;
  variantId: string;
  setIndex: number;
  setType: SetType;
  parentSetId: string | null;
  loadKg: number | null;
  reps: number | null;
  repsLeft: number | null;
  repsRight: number | null;
  rir: number | null;
  restS: number | null;
  completedAt: string | null;
  done: boolean;
  notes: string;
}

export interface BodyweightEntry {
  id: string;
  date: string;
  kg: number;
}

export interface ExerciseNote {
  id: string;
  exerciseId: string;
  /** 'personal' = free-text notes; 'science' = user edit of the bundled science note. */
  kind: 'personal' | 'science';
  markdown: string;
  bundledVersion: number | null;
  updatedAt: string;
}

export interface Settings {
  id: 'settings';
  defaultRestS: number;
  exportReminderDays: number;
  lastExportAt: string | null;
  lastGymId: string | null;
  defaultIncrementKg: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  defaultRestS: 120,
  exportReminderDays: 7,
  lastExportAt: null,
  lastGymId: null,
  defaultIncrementKg: 2.5,
};
