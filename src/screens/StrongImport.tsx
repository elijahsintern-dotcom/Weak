import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { STRONG_MAP } from '../db/seed';
import type { Dims, Exercise } from '../db/types';
import { dimsLabel } from '../db/variants';
import { DimsEditor } from '../components/DimsEditor';
import { GymPicker, createGym } from '../components/GymPicker';
import { PageHead, Sheet, useGyms } from '../components/ui';
import { parseStrongCsv, type StrongWorkout } from '../lib/strong';
import { importStrong, type ImportResult, type StrongMapping } from '../lib/importStrong';

export function StrongImportScreen() {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const { gyms } = useGyms();
  const [workouts, setWorkouts] = useState<StrongWorkout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<Record<string, StrongMapping>>({});
  const [defaultGym, setDefaultGym] = useState<string | null>(null);
  const [words, setWords] = useState<Record<string, string>>({});
  const [infer, setInfer] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [newGym, setNewGym] = useState('');

  const exById = useMemo(() => new Map<string, Exercise>(exercises.map((e) => [e.id, e])), [exercises]);

  const names = useMemo(() => {
    if (!workouts) return [];
    const count = new Map<string, number>();
    for (const w of workouts) for (const e of w.exercises) count.set(e.name, (count.get(e.name) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [workouts]);

  const gymWords = (gid: string, name: string) => words[gid] ?? name.toLowerCase();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      const w = parseStrongCsv(await f.text());
      if (!w.length) throw new Error('No workouts found in this file.');
      setWorkouts(w);
      const m: Record<string, StrongMapping> = {};
      for (const ex of w.flatMap((x) => x.exercises)) {
        if (m[ex.name]) continue;
        const pre = STRONG_MAP[ex.name];
        m[ex.name] = pre ? { exerciseId: pre.exerciseId, dims: pre.dims ?? {} } : { exerciseId: null, newName: ex.name, dims: {} };
      }
      setMappings(m);
    } catch (e) {
      setError((e as Error).message);
      setWorkouts(null);
    }
  };

  const run = async () => {
    if (!workouts || !defaultGym) return;
    setBusy(true);
    try {
      const gw: Record<string, string[]> = {};
      for (const g of gyms) gw[g.id] = gymWords(g.id, g.name).split(',').map((s) => s.trim()).filter(Boolean);
      const r = await importStrong(workouts, { mappings, defaultGymId: defaultGym, gymMatchWords: gw, inferDimsFromNotes: infer, skipDuplicates: skipDup });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const totalSets = workouts?.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0) ?? 0;
  const editingEx = editing ? exById.get(mappings[editing]?.exerciseId ?? '') : undefined;

  return (
    <div>
      <PageHead title="Import from Strong" onBack />
      <div className="page">
        {result ? (
          <div className="stack">
            <div className="banner">
              Imported {result.sessions} workouts and {result.sets} sets.
              {result.gymDetected ? ` ${result.gymDetected} workouts were assigned a gym from their notes.` : ''}
              {result.skipped ? ` Skipped ${result.skipped} workouts already imported.` : ''}
              {result.createdExercises ? ` Created ${result.createdExercises} new exercises.` : ''}
            </div>
            <p className="small muted">To move a stretch of workouts to a different gym, use Backup and export → Move workouts to another gym.</p>
            <a className="btn primary block" href="#/exercises">
              See your exercises
            </a>
          </div>
        ) : (
          <>
            <p className="small muted">In Strong: Settings → Export data. Choose the CSV file here. It stays on this phone.</p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            {error ? <p style={{ color: 'var(--plate-red)' }}>{error}</p> : null}

            {workouts ? (
              <>
                <p>
                  {workouts.length} workouts, {totalSets} sets, {names.length} exercises, {workouts[0].date.slice(0, 10)} to {workouts[workouts.length - 1].date.slice(0, 10)}.
                </p>

                <h2>Gyms</h2>
                <p className="small muted">A workout is assigned a gym when exactly one gym's words appear in its notes. All other workouts go to the default gym.</p>
                {gyms.map((g) => (
                  <label key={g.id} className="field">
                    <span>Words in notes that mean {g.name} (comma separated)</span>
                    <input value={gymWords(g.id, g.name)} onChange={(e) => setWords({ ...words, [g.id]: e.target.value })} />
                  </label>
                ))}
                <div className="row">
                  <input placeholder="Add a gym, e.g. Downtown" value={newGym} onChange={(e) => setNewGym(e.target.value)} />
                  <button
                    className="btn"
                    disabled={!newGym.trim()}
                    onClick={async () => {
                      await createGym(newGym);
                      setNewGym('');
                    }}
                  >
                    Add gym
                  </button>
                </div>
                <GymPicker label="Default gym for workouts without a gym in their notes" value={defaultGym} onChange={setDefaultGym} />

                <h2>Exercises</h2>
                <p className="small muted">Each Strong exercise maps to an exercise and variant here. Tap one to change it.</p>
                <div className="list">
                  {names.map(([name, n]) => {
                    const m = mappings[name];
                    const ex = m?.exerciseId ? exById.get(m.exerciseId) : undefined;
                    return (
                      <button key={name} className="list-item" onClick={() => setEditing(name)}>
                        <div className="grow">
                          <div className="title">{name}</div>
                          <div className="sub">
                            → {ex ? `${ex.name} · ${dimsLabel(m.dims)}` : `New exercise “${m?.newName ?? name}”`} · {n} {n === 1 ? 'workout' : 'workouts'}
                          </div>
                        </div>
                        <span className="faint">✎</span>
                      </button>
                    );
                  })}
                </div>

                <h2>Options</h2>
                <label className="check">
                  <input type="checkbox" checked={infer} onChange={(e) => setInfer(e.target.checked)} />
                  Read cable path and single-arm from notes (e.g. “High to low”, “SA”)
                </label>
                <label className="check">
                  <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                  Skip workouts that were already imported
                </label>
                <button className="btn primary block" disabled={!defaultGym || busy} onClick={run}>
                  {busy ? 'Importing…' : `Import ${workouts.length} workouts`}
                </button>
                {!defaultGym ? <p className="small muted">Choose a default gym to continue.</p> : null}
              </>
            ) : null}
          </>
        )}
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ?? ''}>
        {editing ? (
          <MappingEditor
            mapping={mappings[editing]}
            exercises={exercises}
            exercise={editingEx}
            onChange={(m) => setMappings({ ...mappings, [editing]: m })}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function MappingEditor({ mapping, exercises, exercise, onChange, onDone }: { mapping: StrongMapping; exercises: Exercise[]; exercise?: Exercise; onChange: (m: StrongMapping) => void; onDone: () => void }) {
  return (
    <div>
      <label className="field">
        <span>Exercise</span>
        <select value={mapping.exerciseId ?? ''} onChange={(e) => onChange({ ...mapping, exerciseId: e.target.value || null, dims: {} as Dims })}>
          <option value="">Create a new exercise</option>
          {[...exercises]
            .filter((e) => !e.deletedAt)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </label>
      {!mapping.exerciseId ? (
        <label className="field">
          <span>New exercise name</span>
          <input value={mapping.newName ?? ''} onChange={(e) => onChange({ ...mapping, newName: e.target.value })} />
        </label>
      ) : exercise ? (
        <DimsEditor exercise={exercise} dims={mapping.dims} onChange={(d) => onChange({ ...mapping, dims: d })} />
      ) : null}
      <button className="btn primary block" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
