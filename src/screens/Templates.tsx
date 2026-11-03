import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db/db';
import { isoLocal, uuidv7 } from '../db/ids';
import type { Exercise, Folder, Template, TemplateItem } from '../db/types';
import { dimsLabel, lastUsedDims } from '../db/variants';
import { DimsEditor } from '../components/DimsEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { GymPicker } from '../components/GymPicker';
import { PageHead, Sheet, toast } from '../components/ui';
import { startSession } from '../lib/sessionOps';
import { parseNum } from '../lib/format';
import { navigate } from '../router';

export async function createTemplate(folderId: string | null = null): Promise<string> {
  const id = uuidv7();
  const order = await db.templates.count();
  await db.templates.add({ id, folderId, name: 'New template', notes: '', order, archived: false, createdAt: isoLocal(), updatedAt: isoLocal() });
  return id;
}

export function TemplatesScreen() {
  const [showArchived, setShowArchived] = useState(false);
  const data = useLiveQuery(async () => {
    const [t, f, items] = await Promise.all([db.templates.toArray(), db.folders.toArray(), db.templateItems.toArray()]);
    const count = new Map<string, number>();
    items.forEach((i) => count.set(i.templateId, (count.get(i.templateId) ?? 0) + 1));
    return {
      templates: t.filter((x) => !x.deletedAt).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
      folders: f.filter((x) => !x.deletedAt).sort((a, b) => a.order - b.order),
      count,
    };
  }, []);
  if (!data) return null;
  const visible = data.templates.filter((t) => t.archived === showArchived);
  const groups: { folder: Folder | null; items: Template[] }[] = [
    { folder: null, items: visible.filter((t) => !t.folderId || !data.folders.some((f) => f.id === t.folderId)) },
    ...data.folders.map((f) => ({ folder: f, items: visible.filter((t) => t.folderId === f.id) })),
  ];

  const newFolder = async () => {
    const name = prompt('Folder name');
    if (!name?.trim()) return;
    await db.folders.add({ id: uuidv7(), name: name.trim(), order: data.folders.length });
  };

  return (
    <div>
      <PageHead
        title="Templates"
        right={
          <button className="btn primary small" onClick={async () => navigate(`/templates/${await createTemplate()}`)}>
            New template
          </button>
        }
      />
      <div className="page">
        <div className="row">
          <button className="btn small" onClick={newFolder}>
            New folder
          </button>
          <span className="grow" />
          <label className="check small">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        {groups.map(({ folder, items }) => {
          if (!folder && !items.length) return null;
          return (
            <div key={folder?.id ?? 'none'}>
              {folder ? (
                <div className="row">
                  <h2 className="grow">{folder.name}</h2>
                  <button
                    className="icon-btn"
                    aria-label={`Rename ${folder.name}`}
                    onClick={async () => {
                      const n = prompt('Rename folder', folder.name);
                      if (n?.trim()) await db.folders.update(folder.id, { name: n.trim() });
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Delete ${folder.name}`}
                    onClick={async () => {
                      if (!confirm(`Delete folder “${folder.name}”? Its templates move out of the folder.`)) return;
                      await db.templates.where('folderId').equals(folder.id).modify({ folderId: null });
                      await db.folders.update(folder.id, { deletedAt: isoLocal() });
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="spacer" />
              )}
              {items.length ? (
                <div className="list">
                  {items.map((t) => (
                    <a key={t.id} className="list-item" href={`#/templates/${t.id}`}>
                      <div className="grow">
                        <div className="title">{t.name}</div>
                        <div className="sub">{data.count.get(t.id) ?? 0} exercises</div>
                      </div>
                      <span className="faint">›</span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty small">No templates in this folder.</div>
              )}
            </div>
          );
        })}
        {!visible.length ? <div className="empty">{showArchived ? 'No archived templates.' : 'Create a template for each workout you repeat.'}</div> : null}
      </div>
    </div>
  );
}

export function TemplateEdit({ id }: { id: string }) {
  const data = useLiveQuery(async () => {
    const t = await db.templates.get(id);
    if (!t) return null;
    const items = (await db.templateItems.where('templateId').equals(id).toArray()).sort((a, b) => a.order - b.order);
    const exercises = new Map<string, Exercise>((await db.exercises.toArray()).map((e) => [e.id, e]));
    const folders = (await db.folders.toArray()).filter((f) => !f.deletedAt);
    return { t, items, exercises, folders };
  }, [id]);
  const settings = useLiveQuery(() => getSettings(), []);
  const [picker, setPicker] = useState(false);
  const [dimsFor, setDimsFor] = useState<TemplateItem | null>(null);
  const [startSheet, setStartSheet] = useState(false);
  const [gymId, setGymId] = useState<string | null>(null);

  if (data === undefined) return null;
  if (data === null)
    return (
      <div>
        <PageHead title="Template" onBack />
        <div className="page empty">This template was deleted.</div>
      </div>
    );
  const { t, items, exercises, folders } = data;
  const upd = (patch: Partial<Template>) => db.templates.update(t.id, { ...patch, updatedAt: isoLocal() });
  const updItem = (it: TemplateItem, patch: Partial<TemplateItem>) => db.templateItems.update(it.id, patch);

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    await db.transaction('rw', db.templateItems, async () => {
      await db.templateItems.update(items[i].id, { order: j });
      await db.templateItems.update(items[j].id, { order: i });
    });
  };
  const remove = async (i: number) => {
    await db.transaction('rw', db.templateItems, async () => {
      await db.templateItems.delete(items[i].id);
      const rest = items.filter((_, k) => k !== i);
      for (let k = 0; k < rest.length; k++) await db.templateItems.update(rest[k].id, { order: k });
    });
  };
  const toggleSS = async (i: number) => {
    const a = items[i];
    const b = items[i + 1];
    if (!b) return;
    if (a.supersetGroup && a.supersetGroup === b.supersetGroup) {
      await updItem(b, { supersetGroup: null });
      if (!items.some((x, k) => k !== i && x.supersetGroup === a.supersetGroup && k !== i + 1)) await updItem(a, { supersetGroup: null });
    } else {
      const g = a.supersetGroup ?? b.supersetGroup ?? uuidv7().slice(-6);
      await updItem(a, { supersetGroup: g });
      await updItem(b, { supersetGroup: g });
    }
  };

  return (
    <div>
      <PageHead
        title="Edit template"
        onBack
        right={
          <button
            className="btn primary small"
            disabled={!items.length}
            onClick={() => {
              setGymId(settings?.lastGymId ?? null);
              setStartSheet(true);
            }}
          >
            Start
          </button>
        }
      />
      <div className="page">
        <label className="field">
          <span>Name</span>
          <input value={t.name} onChange={(e) => upd({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Folder</span>
          <select value={t.folderId ?? ''} onChange={(e) => upd({ folderId: e.target.value || null })}>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea value={t.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Optional" style={{ minHeight: 60 }} />
        </label>

        <h2>Exercises</h2>
        {items.map((it, i) => {
          const ex = exercises.get(it.exerciseId);
          const ss = !!it.supersetGroup;
          const linkedNext = ss && items[i + 1]?.supersetGroup === it.supersetGroup;
          const linkedPrev = ss && i > 0 && items[i - 1]?.supersetGroup === it.supersetGroup;
          return (
            <section key={it.id} className={`ex-card ${ss ? 'ss' : ''} ${linkedPrev ? 'mid' : ''}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="ex-name">{ex?.name ?? 'Missing exercise'}</div>
                  <button className="variant-btn" onClick={() => setDimsFor(it)}>
                    {dimsLabel(it.dims)} <span className="faint">✎</span>
                  </button>
                </div>
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button className="icon-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button className="icon-btn" aria-label="Remove" onClick={() => remove(i)}>
                  ×
                </button>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Small label="Sets" value={it.targetSets} onChange={(v) => updItem(it, { targetSets: Math.max(1, v ?? 1) })} />
                <Small label="Reps min" value={it.repMin} onChange={(v) => updItem(it, { repMin: v })} />
                <Small label="Reps max" value={it.repMax} onChange={(v) => updItem(it, { repMax: v })} />
                <Small label="RIR" value={it.targetRir} onChange={(v) => updItem(it, { targetRir: v })} />
                <Small label="Rest s" value={it.restS} onChange={(v) => updItem(it, { restS: v })} />
              </div>
              <label className="check small">
                <input type="checkbox" checked={it.doubleProgression} onChange={(e) => updItem(it, { doubleProgression: e.target.checked })} />
                Double progression: flag “increase load” when every set hits the rep max
              </label>
              <label className="check small">
                <input type="checkbox" checked={it.logLR} onChange={(e) => updItem(it, { logLR: e.target.checked })} />
                Log left and right reps separately
              </label>
              {i < items.length - 1 ? (
                <button className="btn small ghost" onClick={() => toggleSS(i)}>
                  {linkedNext ? 'Unlink superset with next' : 'Superset with next'}
                </button>
              ) : null}
            </section>
          );
        })}
        <button className="btn block" onClick={() => setPicker(true)}>
          + Add exercise
        </button>

        <h2>Template</h2>
        <div className="row wrap">
          <button
            className="btn"
            onClick={async () => {
              const nid = uuidv7();
              await db.transaction('rw', db.templates, db.templateItems, async () => {
                await db.templates.add({ ...t, id: nid, name: `${t.name} (copy)`, createdAt: isoLocal(), updatedAt: isoLocal() });
                await db.templateItems.bulkAdd(items.map((x) => ({ ...x, id: uuidv7(), templateId: nid })));
              });
              toast('Template duplicated');
              navigate(`/templates/${nid}`, true);
            }}
          >
            Duplicate
          </button>
          <button className="btn" onClick={() => upd({ archived: !t.archived }).then(() => toast(t.archived ? 'Template restored' : 'Template archived'))}>
            {t.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm(`Delete “${t.name}”? Past workouts keep their data.`)) return;
              await upd({ deletedAt: isoLocal() });
              navigate('/templates', true);
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={async (ex) => {
          setPicker(false);
          await db.templateItems.add({
            id: uuidv7(),
            templateId: t.id,
            exerciseId: ex.id,
            dims: await lastUsedDims(ex.id, settings?.lastGymId ?? undefined),
            order: items.length,
            supersetGroup: null,
            targetSets: 3,
            repMin: 8,
            repMax: 12,
            targetRir: null,
            restS: settings?.defaultRestS ?? 120,
            doubleProgression: false,
            logLR: false,
          });
        }}
      />

      <TemplateDimsSheet item={dimsFor} exercise={dimsFor ? exercises.get(dimsFor.exerciseId) : undefined} onClose={() => setDimsFor(null)} />

      <Sheet open={startSheet} onClose={() => setStartSheet(false)} title={`Start ${t.name}`}>
        <GymPicker value={gymId} onChange={setGymId} />
        <button
          className="btn primary block"
          disabled={!gymId}
          onClick={async () => {
            if (!gymId) return;
            const sid = await startSession({ templateId: t.id, gymId });
            navigate(`/session/${sid}`);
          }}
        >
          Start workout
        </button>
      </Sheet>
    </div>
  );
}

function TemplateDimsSheet({ item, exercise, onClose }: { item: TemplateItem | null; exercise?: Exercise; onClose: () => void }) {
  const [dims, setDims] = useState(item?.dims ?? {});
  const [forId, setForId] = useState<string | null>(null);
  if (item && item.id !== forId) {
    setForId(item.id);
    setDims(item.dims);
  }
  return (
    <Sheet open={!!item} onClose={onClose} title={exercise ? `${exercise.name} variant` : 'Variant'}>
      {item && exercise ? (
        <>
          <p className="small muted">The gym is chosen when you start the workout, so this template works at any gym.</p>
          <DimsEditor exercise={exercise} dims={dims} onChange={setDims} />
          <button
            className="btn primary block"
            onClick={async () => {
              await db.templateItems.update(item.id, { dims });
              onClose();
            }}
          >
            Use this variant
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

function Small({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="field" style={{ flex: 1, margin: '6px 0' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <input key={String(value)} inputMode="numeric" defaultValue={value ?? ''} onBlur={(e) => onChange(parseNum(e.target.value))} style={{ padding: '6px 4px', textAlign: 'center' }} />
    </label>
  );
}
