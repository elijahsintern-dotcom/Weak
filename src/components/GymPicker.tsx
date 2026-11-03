import { useState } from 'react';
import { db } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import { useGyms } from './ui';

export async function createGym(name: string): Promise<string> {
  const id = uuidv7();
  await db.gyms.add({ id, name: name.trim(), createdAt: isoLocal(), platesKg: [], cableStacks: [] });
  return id;
}

/** Gym selector with inline "+ New gym". */
export function GymPicker({ value, onChange, label = 'Gym' }: { value: string | null; onChange: (id: string) => void; label?: string }) {
  const { gyms } = useGyms();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    const id = await createGym(name);
    setName('');
    setAdding(false);
    onChange(id);
  };
  return (
    <div className="field">
      <span>{label}</span>
      {adding || gyms.length === 0 ? (
        <div className="row">
          <input autoFocus placeholder="Gym name, e.g. Home" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn primary" onClick={add} disabled={!name.trim()}>
            Add gym
          </button>
          {gyms.length > 0 ? (
            <button className="btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : (
        <select
          value={value ?? ''}
          onChange={(e) => {
            if (e.target.value === '__new') setAdding(true);
            else onChange(e.target.value);
          }}
        >
          {!value ? <option value="">Choose a gym</option> : null}
          {gyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="__new">+ New gym</option>
        </select>
      )}
    </div>
  );
}
