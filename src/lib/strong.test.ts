import { describe, expect, it } from 'vitest';
import { dimsFromNotes, gymFromNotes, parseStrongCsv } from './strong';
import { e1rm, shouldIncreaseLoad } from './metrics';
import { variantKey } from '../db/variants';
import type { SetRow } from '../db/types';

const SAMPLE = [
  '"Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";"Distance (meters)";"Seconds";"Notes";"Workout Notes"',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Bench Press (Barbell)";"W";"40.0";"8";"";"";"";"";""',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Bench Press (Barbell)";"1";"60.0";"8";"8";"";"";"";""',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Bench Press (Barbell)";"Rest Timer";"";"";"";"";"120";"";""',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Bench Press (Barbell)";"F";"60.0";"6";"";"";"";"";""',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Bench Press (Barbell)";"D";"40.0";"6";"";"";"";"";""',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Cable Crossover";"Note";"";"";"";"";"";"SA l>h home 7.5";""',
  '"1";"2026-02-03 21:38:02";"Push";"533";"Cable Crossover";"1";"7.5";"12";"";"";"";"";""',
  '"2";"2026-02-05 08:00:00";"Pull";"600";"Pull Up";"1";"0.0";"5";"";"";"";"Downtown gym";""',
].join('\n');

describe('parseStrongCsv', () => {
  const w = parseStrongCsv(SAMPLE);
  it('groups workouts and exercises', () => {
    expect(w).toHaveLength(2);
    expect(w[0].exercises.map((e) => e.name)).toEqual(['Bench Press (Barbell)', 'Cable Crossover']);
  });
  it('maps set types, rest timers and drop-set parents', () => {
    const bench = w[0].exercises[0].sets;
    expect(bench.map((s) => s.setType)).toEqual(['warmup', 'working', 'failure', 'drop']);
    expect(bench[1].restS).toBe(120);
    expect(bench[1].rpe).toBe(8);
    expect(bench[3].parentIndex).toBe(2);
  });
  it('collects notes from Note rows and set rows', () => {
    expect(w[0].exercises[1].notes).toEqual(['SA l>h home 7.5']);
    expect(w[1].exercises[0].notes).toEqual(['Downtown gym']);
  });
});

describe('note inference', () => {
  it('reads cable path and laterality', () => {
    expect(dimsFromNotes(['SA l>h home 7.5'])).toEqual({ cablePath: 'Low to high', laterality: 'Unilateral' });
    expect(dimsFromNotes(['High to low'])).toEqual({ cablePath: 'High to low' });
    expect(dimsFromNotes(['Mid - downtown gym'])).toEqual({ cablePath: 'Mid' });
  });
  it('picks a gym only when exactly one matches', () => {
    const gyms = [
      { id: 'home', matchWords: ['home'] },
      { id: 'dt', matchWords: ['downtown'] },
    ];
    expect(gymFromNotes(['Low to high home gym'], gyms)).toBe('home');
    expect(gymFromNotes(['Prev at home 40. Downtown 27.2 ?harder'], gyms)).toBeNull();
    expect(gymFromNotes(['Grip?'], gyms)).toBeNull();
  });
});

describe('metrics', () => {
  it('e1RM uses reps + RIR and caps at 10 effective reps', () => {
    expect(e1rm(100, 5, 0)).toBeCloseTo(116.67, 1);
    expect(e1rm(100, 5, 2)).toBeCloseTo(123.33, 1);
    expect(e1rm(100, 9, 2)).toBeNull();
  });
  it('double progression needs every working set at rep max without grinding past target RIR', () => {
    const mk = (reps: number, rir: number | null): SetRow => ({
      id: '', sessionId: '', sessionExerciseId: '', variantId: '', setIndex: 0, setType: 'working', parentSetId: null,
      loadKg: 50, reps, repsLeft: null, repsRight: null, rir, restS: null, completedAt: null, done: true, notes: '',
    });
    expect(shouldIncreaseLoad([mk(12, 2), mk(12, 2)], 12, 2)).toBe(true);
    expect(shouldIncreaseLoad([mk(12, 2), mk(11, 1)], 12, 2)).toBe(false);
    expect(shouldIncreaseLoad([mk(12, 0)], 12, 2)).toBe(false);
    expect(shouldIncreaseLoad([mk(12, null)], 12, 2)).toBe(true);
  });
});

describe('variantKey', () => {
  it('is order- and case-insensitive and ignores blanks', () => {
    const a = variantKey('row', 'g1', { laterality: 'Unilateral', attachment: 'D-handle' });
    const b = variantKey('row', 'g1', { attachment: 'd-handle ', laterality: 'unilateral', grip: '' });
    expect(a).toBe(b);
    expect(variantKey('row', 'g2', { laterality: 'Unilateral', attachment: 'D-handle' })).not.toBe(a);
  });
});
