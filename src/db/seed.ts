import type { Dimension, Dims, Equipment, Exercise, LoadType, Muscle } from './types';

export const SEED_DIMENSION_VALUES: Record<Dimension, string[]> = {
  laterality: ['Bilateral', 'Unilateral'],
  grip: ['Pronated', 'Supinated', 'Neutral', 'Mixed', 'Wide', 'Close'],
  attachment: ['V-handle', 'D-handle', 'Rope', 'Straight bar', 'EZ bar', 'Lat bar', 'Cuff'],
  cablePath: ['High to low', 'Mid', 'Low to high'],
  benchAngle: ['Flat', '15°', '30°', '45°', 'Incline', 'Decline'],
  position: ['Seated', 'Standing', 'Kneeling', 'Lying', 'Chest-supported', 'Overhead', 'Bent-over', '45° sled'],
  rom: ['Full', 'Lengthened partials'],
  tempo: [],
};

interface SeedEx {
  id: string;
  name: string;
  category: 'compound' | 'isolation';
  equipment: Equipment;
  primary: Muscle[];
  secondary?: Muscle[];
  dims: Dimension[];
  loadType?: LoadType;
}

const ALL: Dimension[] = ['rom', 'tempo'];
const CABLE: Dimension[] = ['laterality', 'attachment', ...ALL];

const SEED: SeedEx[] = [
  // Push
  { id: 'bench-press-barbell', name: 'Bench Press (Barbell)', category: 'compound', equipment: 'barbell', primary: ['chest'], secondary: ['front delts', 'triceps'], dims: ['benchAngle', 'grip', ...ALL] },
  { id: 'bench-press-dumbbell', name: 'Bench Press (Dumbbell)', category: 'compound', equipment: 'dumbbell', primary: ['chest'], secondary: ['front delts', 'triceps'], dims: ['benchAngle', 'laterality', 'grip', ...ALL] },
  { id: 'bench-press-smith', name: 'Bench Press (Smith)', category: 'compound', equipment: 'smith', primary: ['chest'], secondary: ['front delts', 'triceps'], dims: ['benchAngle', 'grip', ...ALL] },
  { id: 'chest-press-machine', name: 'Chest Press (Machine)', category: 'compound', equipment: 'machine', primary: ['chest'], secondary: ['front delts', 'triceps'], dims: ['laterality', 'grip', ...ALL] },
  { id: 'cable-fly', name: 'Cable Fly', category: 'isolation', equipment: 'cable', primary: ['chest'], secondary: ['front delts'], dims: ['cablePath', 'laterality', 'position', ...ALL] },
  { id: 'push-up', name: 'Push Up', category: 'compound', equipment: 'bodyweight', primary: ['chest'], secondary: ['front delts', 'triceps'], dims: ['grip', ...ALL], loadType: 'bodyweight' },
  { id: 'overhead-press-dumbbell', name: 'Overhead Press (Dumbbell)', category: 'compound', equipment: 'dumbbell', primary: ['front delts'], secondary: ['side delts', 'triceps'], dims: ['position', 'laterality', 'grip', ...ALL] },
  { id: 'overhead-press-barbell', name: 'Overhead Press (Barbell)', category: 'compound', equipment: 'barbell', primary: ['front delts'], secondary: ['side delts', 'triceps'], dims: ['position', 'grip', ...ALL] },
  { id: 'shoulder-press-machine', name: 'Shoulder Press (Machine)', category: 'compound', equipment: 'machine', primary: ['front delts'], secondary: ['side delts', 'triceps'], dims: ['laterality', 'grip', ...ALL] },
  { id: 'lateral-raise-cable', name: 'Lateral Raise (Cable)', category: 'isolation', equipment: 'cable', primary: ['side delts'], dims: ['laterality', 'attachment', 'position', 'cablePath', ...ALL] },
  { id: 'lateral-raise-dumbbell', name: 'Lateral Raise (Dumbbell)', category: 'isolation', equipment: 'dumbbell', primary: ['side delts'], dims: ['laterality', 'position', ...ALL] },
  { id: 'triceps-pushdown', name: 'Triceps Pushdown (Cable)', category: 'isolation', equipment: 'cable', primary: ['triceps'], dims: CABLE },
  { id: 'triceps-extension-cable', name: 'Triceps Extension (Cable)', category: 'isolation', equipment: 'cable', primary: ['triceps'], dims: ['position', ...CABLE] },
  // Pull
  { id: 'pull-up', name: 'Pull Up', category: 'compound', equipment: 'bodyweight', primary: ['lats'], secondary: ['upper back', 'biceps'], dims: ['grip', ...ALL], loadType: 'bodyweight' },
  { id: 'pull-up-assisted', name: 'Pull Up (Assisted)', category: 'compound', equipment: 'band', primary: ['lats'], secondary: ['upper back', 'biceps'], dims: ['grip', ...ALL], loadType: 'assisted' },
  { id: 'lat-pulldown-cable', name: 'Lat Pulldown (Cable)', category: 'compound', equipment: 'cable', primary: ['lats'], secondary: ['upper back', 'biceps'], dims: ['grip', ...CABLE] },
  { id: 'lat-pulldown-machine', name: 'Lat Pulldown (Machine)', category: 'compound', equipment: 'machine', primary: ['lats'], secondary: ['upper back', 'biceps'], dims: ['laterality', 'grip', ...ALL] },
  { id: 'seated-cable-row', name: 'Seated Cable Row', category: 'compound', equipment: 'cable', primary: ['upper back', 'lats'], secondary: ['rear delts', 'biceps'], dims: ['grip', ...CABLE] },
  { id: 'seated-row-machine', name: 'Seated Row (Machine)', category: 'compound', equipment: 'machine', primary: ['upper back', 'lats'], secondary: ['rear delts', 'biceps'], dims: ['laterality', 'grip', ...ALL] },
  { id: 'row-barbell', name: 'Barbell Row', category: 'compound', equipment: 'barbell', primary: ['upper back', 'lats'], secondary: ['rear delts', 'biceps', 'lower back'], dims: ['grip', 'position', ...ALL] },
  { id: 'row-dumbbell', name: 'Dumbbell Row', category: 'compound', equipment: 'dumbbell', primary: ['upper back', 'lats'], secondary: ['rear delts', 'biceps'], dims: ['laterality', 'position', 'benchAngle', 'grip', ...ALL] },
  { id: 'face-pull', name: 'Face Pull (Cable)', category: 'isolation', equipment: 'cable', primary: ['rear delts'], secondary: ['upper back', 'traps'], dims: ['position', ...CABLE] },
  { id: 'reverse-fly-dumbbell', name: 'Reverse Fly (Dumbbell)', category: 'isolation', equipment: 'dumbbell', primary: ['rear delts'], secondary: ['upper back'], dims: ['position', 'laterality', ...ALL] },
  { id: 'deadlift-barbell', name: 'Deadlift (Barbell)', category: 'compound', equipment: 'barbell', primary: ['glutes', 'hamstrings', 'lower back'], secondary: ['quads', 'traps', 'forearms'], dims: ['grip', ...ALL] },
  { id: 'deadlift-smith', name: 'Deadlift (Smith)', category: 'compound', equipment: 'smith', primary: ['glutes', 'hamstrings', 'lower back'], secondary: ['quads', 'traps', 'forearms'], dims: ['grip', ...ALL] },
  { id: 'biceps-curl-barbell', name: 'Biceps Curl (Barbell)', category: 'isolation', equipment: 'barbell', primary: ['biceps'], secondary: ['forearms'], dims: ['grip', ...ALL] },
  { id: 'biceps-curl-cable', name: 'Biceps Curl (Cable)', category: 'isolation', equipment: 'cable', primary: ['biceps'], secondary: ['forearms'], dims: ['grip', 'position', ...CABLE] },
  { id: 'biceps-curl-dumbbell', name: 'Biceps Curl (Dumbbell)', category: 'isolation', equipment: 'dumbbell', primary: ['biceps'], secondary: ['forearms'], dims: ['laterality', 'position', ...ALL] },
  { id: 'hammer-curl-dumbbell', name: 'Hammer Curl (Dumbbell)', category: 'isolation', equipment: 'dumbbell', primary: ['biceps', 'forearms'], dims: ['laterality', 'position', ...ALL] },
  { id: 'hammer-curl-cable', name: 'Hammer Curl (Cable)', category: 'isolation', equipment: 'cable', primary: ['biceps', 'forearms'], dims: CABLE },
  { id: 'preacher-curl-dumbbell', name: 'Preacher Curl (Dumbbell)', category: 'isolation', equipment: 'dumbbell', primary: ['biceps'], dims: ['laterality', ...ALL] },
  // Legs
  { id: 'squat-barbell', name: 'Squat (Barbell)', category: 'compound', equipment: 'barbell', primary: ['quads', 'glutes'], secondary: ['adductors', 'lower back'], dims: ['position', ...ALL] },
  { id: 'squat-smith', name: 'Squat (Smith)', category: 'compound', equipment: 'smith', primary: ['quads', 'glutes'], secondary: ['adductors'], dims: ['position', ...ALL] },
  { id: 'goblet-squat', name: 'Goblet Squat', category: 'compound', equipment: 'kettlebell', primary: ['quads', 'glutes'], secondary: ['adductors'], dims: ALL },
  { id: 'leg-press', name: 'Leg Press', category: 'compound', equipment: 'machine', primary: ['quads', 'glutes'], secondary: ['adductors'], dims: ['position', 'laterality', ...ALL] },
  { id: 'leg-extension', name: 'Leg Extension', category: 'isolation', equipment: 'machine', primary: ['quads'], dims: ['laterality', ...ALL] },
  { id: 'leg-curl', name: 'Leg Curl', category: 'isolation', equipment: 'machine', primary: ['hamstrings'], secondary: ['calves'], dims: ['position', 'laterality', ...ALL] },
  { id: 'calf-press-leg-press', name: 'Calf Press (Leg Press)', category: 'isolation', equipment: 'machine', primary: ['calves'], dims: ['position', ...ALL] },
  // Core
  { id: 'decline-crunch', name: 'Decline Crunch', category: 'isolation', equipment: 'bodyweight', primary: ['abs'], dims: ALL, loadType: 'bodyweight' },
  { id: 'sit-up', name: 'Sit Up', category: 'isolation', equipment: 'bodyweight', primary: ['abs'], dims: ALL, loadType: 'bodyweight' },
  { id: 'crunch-machine', name: 'Crunch (Machine)', category: 'isolation', equipment: 'machine', primary: ['abs'], dims: ALL },
  { id: 'cable-crunch', name: 'Cable Crunch', category: 'isolation', equipment: 'cable', primary: ['abs'], dims: ['position', ...CABLE] },
  { id: 'hanging-knee-raise', name: 'Knee Raise (Captain’s Chair)', category: 'isolation', equipment: 'bodyweight', primary: ['abs'], dims: ALL, loadType: 'bodyweight' },
];

export function seedExercises(createdAt: string): Exercise[] {
  return SEED.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    equipment: s.equipment,
    primary: s.primary,
    secondary: s.secondary ?? [],
    dims: s.dims,
    loadType: s.loadType ?? 'external',
    isCustom: false,
    createdAt,
  }));
}

/** Pre-filled mapping from Strong exercise names to a base exercise + dimensions. */
export const STRONG_MAP: Record<string, { exerciseId: string; dims?: Dims }> = {
  'Bench Press (Barbell)': { exerciseId: 'bench-press-barbell', dims: { benchAngle: 'Flat' } },
  'Incline Bench Press (Barbell)': { exerciseId: 'bench-press-barbell', dims: { benchAngle: 'Incline' } },
  'Incline Bench Press (Dumbbell)': { exerciseId: 'bench-press-dumbbell', dims: { benchAngle: 'Incline' } },
  'Bench Press (Dumbbell)': { exerciseId: 'bench-press-dumbbell', dims: { benchAngle: 'Flat' } },
  'Bench Press (Smith Machine)': { exerciseId: 'bench-press-smith', dims: { benchAngle: 'Flat' } },
  'Chest Press (Machine)': { exerciseId: 'chest-press-machine' },
  'Cable Crossover': { exerciseId: 'cable-fly' },
  'Push Up': { exerciseId: 'push-up' },
  'Seated Overhead Press (Dumbbell)': { exerciseId: 'overhead-press-dumbbell', dims: { position: 'Seated' } },
  'Overhead Press (Dumbbell)': { exerciseId: 'overhead-press-dumbbell', dims: { position: 'Standing' } },
  'Overhead Press (Barbell)': { exerciseId: 'overhead-press-barbell', dims: { position: 'Standing' } },
  'Shoulder Press (Machine)': { exerciseId: 'shoulder-press-machine' },
  'Lateral Raise (Cable)': { exerciseId: 'lateral-raise-cable' },
  'Lateral Raise (Dumbbell)': { exerciseId: 'lateral-raise-dumbbell' },
  'Triceps Pushdown (Cable - Straight Bar)': { exerciseId: 'triceps-pushdown', dims: { attachment: 'Straight bar' } },
  'Triceps Pushdown (Cable - Rope)': { exerciseId: 'triceps-pushdown', dims: { attachment: 'Rope' } },
  'Triceps Extension (Cable)': { exerciseId: 'triceps-extension-cable' },
  'Pull Up': { exerciseId: 'pull-up' },
  'Pull Up (Band)': { exerciseId: 'pull-up-assisted' },
  'Pull Up (Assisted)': { exerciseId: 'pull-up-assisted' },
  'Chin Up': { exerciseId: 'pull-up', dims: { grip: 'Supinated' } },
  'Lat Pulldown (Cable)': { exerciseId: 'lat-pulldown-cable' },
  'Lat Pulldown (Single Arm)': { exerciseId: 'lat-pulldown-cable', dims: { laterality: 'Unilateral' } },
  'Lat Pulldown (Machine)': { exerciseId: 'lat-pulldown-machine' },
  'Seated Row (Cable)': { exerciseId: 'seated-cable-row' },
  'Seated Row (Machine)': { exerciseId: 'seated-row-machine' },
  'Bent Over Row (Barbell)': { exerciseId: 'row-barbell', dims: { position: 'Bent-over' } },
  'Bent Over Row - Underhand (Barbell)': { exerciseId: 'row-barbell', dims: { position: 'Bent-over', grip: 'Supinated' } },
  'Bent Over One Arm Row (Dumbbell)': { exerciseId: 'row-dumbbell', dims: { laterality: 'Unilateral', position: 'Bent-over' } },
  'Incline Row (Dumbbell)': { exerciseId: 'row-dumbbell', dims: { position: 'Chest-supported', benchAngle: 'Incline' } },
  'Face Pull (Cable)': { exerciseId: 'face-pull', dims: { attachment: 'Rope' } },
  'Reverse Fly (Dumbbell)': { exerciseId: 'reverse-fly-dumbbell' },
  'Deadlift (Barbell)': { exerciseId: 'deadlift-barbell' },
  'Deadlift (Smith Machine)': { exerciseId: 'deadlift-smith' },
  'Bicep Curl (Barbell)': { exerciseId: 'biceps-curl-barbell' },
  'Bicep Curl (Cable)': { exerciseId: 'biceps-curl-cable' },
  'Bicep Curl (Dumbbell)': { exerciseId: 'biceps-curl-dumbbell' },
  'Hammer Curl (Dumbbell)': { exerciseId: 'hammer-curl-dumbbell' },
  'Hammer Curl (Cable)': { exerciseId: 'hammer-curl-cable', dims: { attachment: 'Rope' } },
  'Preacher Curl (Dumbbell)': { exerciseId: 'preacher-curl-dumbbell' },
  'Squat (Barbell)': { exerciseId: 'squat-barbell' },
  'Squat (Smith Machine)': { exerciseId: 'squat-smith' },
  'Goblet Squat (Kettlebell)': { exerciseId: 'goblet-squat' },
  'Seated Leg Press (Machine)': { exerciseId: 'leg-press', dims: { position: 'Seated' } },
  'Leg Press': { exerciseId: 'leg-press' },
  'Leg Extension (Machine)': { exerciseId: 'leg-extension' },
  'Lying Leg Curl (Machine)': { exerciseId: 'leg-curl', dims: { position: 'Lying' } },
  'Seated Leg Curl (Machine)': { exerciseId: 'leg-curl', dims: { position: 'Seated' } },
  'Calf Press on Seated Leg Press': { exerciseId: 'calf-press-leg-press', dims: { position: 'Seated' } },
  'Decline Crunch': { exerciseId: 'decline-crunch' },
  'Sit Up': { exerciseId: 'sit-up' },
  'Crunch (Machine)': { exerciseId: 'crunch-machine' },
  'Cable Crunch': { exerciseId: 'cable-crunch' },
  "Knee Raise (Captain's Chair)": { exerciseId: 'hanging-knee-raise' },
};
