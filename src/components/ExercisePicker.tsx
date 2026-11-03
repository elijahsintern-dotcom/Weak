import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import { DIMENSIONS, DIMENSION_LABELS, MUSCLES, type Dimension, type Equipment, type Exercise, type LoadType, type Muscle } from '../db/types';
import { Sheet } from './ui';

export function ExercisePicker({ open, onClose, onPick, title = 'Add exercise' }: { open: boolean; onClose: () => void; onPick: (ex: Exercise) => void; title?: string }) {
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | ''>('');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return exercises
      .filter((e) => !e.deletedAt && !e.archived)
      .filter((e) => !t || e.name.toLowerCase().includes(t))
      .filter((e) => !muscle || e.primary.includes(muscle) || e.secondary.includes(muscle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, q, muscle]);

  return (
    <Sheet open={open} onClose={onClose} title={creating ? 'New exercise' : title}>
      {creating ? (
        <ExerciseForm
          initialName={q}
          onCancel={() => setCreating(false)}
          onSaved={(ex) => {
            setCreating(false);
            onPick(ex);
          }}
        />
      ) : (
        <>
          <div className="row">
            <input type="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
            <select style={{ width: 130 }} value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle | '')} aria-label="Filter by muscle">
              <option value="">All muscles</option>
              {MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="spacer" />
          <div className="list">
            {list.map((e) => (
              <button key={e.id} className="list-item" onClick={() => onPick(e)}>
                <div className="grow">
                  <div className="title">{e.name}</div>
                  <div className="sub">{e.primary.join(', ') || 'No muscles set'}</div>
                </div>
              </button>
            ))}
            {!list.length ? <div className="empty">No exercise matches “{q}”.</div> : null}
          </div>
          <div className="spacer" />
          <button className="btn block" onClick={() => setCreating(true)}>
            Create exercise
          </button>
        </>
      )}
    </Sheet>
  );
}

const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight', 'kettlebell', 'band', 'other'];

export function ExerciseForm({ initial, initialName, onSaved, onCancel }: { initial?: Exercise; initialName?: string; onSaved: (e: Exercise) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? initialName ?? '');
  const [category, setCategory] = useState<Exercise['category']>(initial?.category ?? 'isolation');
  const [equipment, setEquipment] = useState<Equipment>(initial?.equipment ?? 'cable');
  const [loadType, setLoadType] = useState<LoadType>(initial?.loadType ?? 'external');
  const [primary, setPrimary] = useState<Muscle[]>(initial?.primary ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(initial?.secondary ?? []);
  const [dims, setDims] = useState<Dimension[]>(initial?.dims ?? ['laterality', 'rom', 'tempo']);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    const ex: Exercise = {
      id: initial?.id ?? uuidv7(),
      name: name.trim(),
      category,
      equipment,
      loadType,
      primary,
      secondary: secondary.filter((m) => !primary.includes(m)),
      dims,
      isCustom: initial?.isCustom ?? true,
      createdAt: initial?.createdAt ?? isoLocal(),
    };
    await db.exercises.put(ex);
    onSaved(ex);
  };

  return (
    <div>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable Low Row" />
      </label>
      <div className="row">
        <label className="field grow">
          <span>Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Exercise['category'])}>
            <option value="compound">Compound</option>
            <option value="isolation">Isolation</option>
          </select>
        </label>
        <label className="field grow">
          <span>Equipment</span>
          <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Load is</span>
        <select value={loadType} onChange={(e) => setLoadType(e.target.value as LoadType)}>
          <option value="external">Weight lifted</option>
          <option value="bodyweight">Added to bodyweight (e.g. weighted pull-up)</option>
          <option value="assisted">Assistance (e.g. band or machine assist)</option>
        </select>
      </label>
      <div className="field">
        <span>Primary muscles (1.0 set each)</span>
        <div className="chips">
          {MUSCLES.map((m) => (
            <button key={m} className={`chip ${primary.includes(m) ? 'on' : ''}`} onClick={() => setPrimary(toggle(primary, m))}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Secondary muscles (0.5 set each)</span>
        <div className="chips">
          {MUSCLES.filter((m) => !primary.includes(m)).map((m) => (
            <button key={m} className={`chip ${secondary.includes(m) ? 'on' : ''}`} onClick={() => setSecondary(toggle(secondary, m))}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Variations tracked separately</span>
        <div className="chips">
          {DIMENSIONS.map((d) => (
            <button key={d} className={`chip ${dims.includes(d) ? 'on' : ''}`} onClick={() => setDims(DIMENSIONS.filter((x) => (x === d ? !dims.includes(d) : dims.includes(x))))}>
              {DIMENSION_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary grow" disabled={!name.trim()} onClick={save}>
          Save exercise
        </button>
      </div>
    </div>
  );
}
