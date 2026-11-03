import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { uuidv7 } from '../db/ids';
import { DIMENSION_LABELS, type Dimension, type Dims, type Exercise } from '../db/types';

/** Chip editor for an exercise's applicable variation dimensions. Unselected = standard. */
export function DimsEditor({ exercise, dims, onChange }: { exercise: Exercise; dims: Dims; onChange: (d: Dims) => void }) {
  const values = useLiveQuery(() => db.dimensionValues.toArray(), [], []);
  const [adding, setAdding] = useState<Dimension | null>(null);
  const [text, setText] = useState('');

  const set = (dim: Dimension, v: string | undefined) => {
    const next = { ...dims };
    if (v) next[dim] = v;
    else delete next[dim];
    onChange(next);
  };

  const addCustom = async (dim: Dimension) => {
    const label = text.trim();
    if (!label) return;
    const exists = values.find((v) => v.dimension === dim && v.label.toLowerCase() === label.toLowerCase());
    if (!exists) {
      const order = values.filter((v) => v.dimension === dim).length;
      await db.dimensionValues.add({ id: uuidv7(), dimension: dim, label, order, isCustom: true });
    }
    set(dim, exists?.label ?? label);
    setText('');
    setAdding(null);
  };

  if (!exercise.dims.length) return <p className="muted small">This exercise has no variations.</p>;

  return (
    <div>
      {exercise.dims.map((dim) => {
        const opts = values.filter((v) => v.dimension === dim).sort((a, b) => a.order - b.order);
        const cur = dims[dim];
        if (dim === 'tempo') {
          return (
            <label key={dim} className="field">
              <span>{DIMENSION_LABELS[dim]}</span>
              <input placeholder="Standard, or e.g. 3-1-1-0" value={cur ?? ''} onChange={(e) => set(dim, e.target.value || undefined)} />
            </label>
          );
        }
        return (
          <div key={dim} className="field">
            <span>{DIMENSION_LABELS[dim]}</span>
            <div className="chips">
              <button className={`chip ${!cur ? 'on' : ''}`} onClick={() => set(dim, undefined)}>
                Standard
              </button>
              {opts.map((o) => (
                <button key={o.id} className={`chip ${cur?.toLowerCase() === o.label.toLowerCase() ? 'on' : ''}`} onClick={() => set(dim, o.label)}>
                  {o.label}
                </button>
              ))}
              {cur && !opts.some((o) => o.label.toLowerCase() === cur.toLowerCase()) ? <button className="chip on">{cur}</button> : null}
              {adding === dim ? (
                <span className="row">
                  <input autoFocus style={{ width: 130, minHeight: 32, padding: '4px 8px' }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom(dim)} placeholder="New value" />
                  <button className="btn small" onClick={() => addCustom(dim)}>
                    Add
                  </button>
                </span>
              ) : (
                <button className="chip add" onClick={() => setAdding(dim)}>
                  + Add
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
