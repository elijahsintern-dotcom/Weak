import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, updateSettings } from '../db/db';
import { isoLocal } from '../db/ids';
import { DIMENSIONS, DIMENSION_LABELS, type CableStack, type GymProfile } from '../db/types';
import { createGym } from '../components/GymPicker';
import { GymBadge, PageHead, toast, useGyms } from '../components/ui';
import { fmtNum, parseNum } from '../lib/format';
import { APP_VERSION } from '../lib/exportData';
import { navigate } from '../router';

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings(), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);
  if (!settings) return null;
  return (
    <div>
      <PageHead title="Settings" />
      <div className="page">
        <div className="list">
          <a className="list-item" href="#/settings/gyms">
            <div className="grow">
              <div className="title">Gyms</div>
              <div className="sub">Create gyms and set their equipment</div>
            </div>
            <span className="faint">›</span>
          </a>
          <a className="list-item" href="#/settings/data">
            <div className="grow">
              <div className="title">Backup and export</div>
              <div className="sub">CSV for analysis, JSON backup and restore, gym reassignment</div>
            </div>
            <span className="faint">›</span>
          </a>
          <a className="list-item" href="#/settings/strong">
            <div className="grow">
              <div className="title">Import from Strong</div>
              <div className="sub">Bring in your Strong CSV export</div>
            </div>
            <span className="faint">›</span>
          </a>
          <a className="list-item" href="#/settings/values">
            <div className="grow">
              <div className="title">Variation values</div>
              <div className="sub">Grips, attachments, positions and your own values</div>
            </div>
            <span className="faint">›</span>
          </a>
        </div>

        <h2>Workout</h2>
        <label className="field">
          <span>Default rest timer (seconds)</span>
          <input inputMode="numeric" defaultValue={settings.defaultRestS} onBlur={(e) => updateSettings({ defaultRestS: parseNum(e.target.value) ?? 120 })} />
        </label>
        <label className="field">
          <span>Default load increment for “increase load” (kg)</span>
          <input inputMode="decimal" defaultValue={settings.defaultIncrementKg} onBlur={(e) => updateSettings({ defaultIncrementKg: parseNum(e.target.value) ?? 2.5 })} />
        </label>
        <div className="field">
          <span>Rest timer alerts when the app is in the background</span>
          {perm === 'granted' ? (
            <p className="small muted">On. Alerts can be delayed or missed while the phone is locked.</p>
          ) : perm === 'unsupported' ? (
            <p className="small muted">Not supported on this browser.</p>
          ) : (
            <button
              className="btn small"
              onClick={async () => {
                const p = await Notification.requestPermission();
                setPerm(p);
              }}
            >
              Allow notifications
            </button>
          )}
        </div>

        <h2>Backups</h2>
        <label className="field">
          <span>Remind me to back up after (days)</span>
          <input inputMode="numeric" defaultValue={settings.exportReminderDays} onBlur={(e) => updateSettings({ exportReminderDays: parseNum(e.target.value) ?? 7 })} />
        </label>
        <p className="small muted">
          Storage {persisted ? 'is protected from automatic clearing.' : persisted === false ? 'may be cleared by the browser if the phone runs low on space. Installing the app to the home screen usually fixes this.' : 'status unknown.'}
        </p>
        <p className="small faint">Weak v{APP_VERSION}. Your data stays on this phone.</p>
      </div>
    </div>
  );
}

export function GymsScreen() {
  const { all, color } = useGyms(true);
  const [name, setName] = useState('');
  return (
    <div>
      <PageHead title="Gyms" onBack />
      <div className="page">
        <div className="row">
          <input placeholder="New gym name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={async (e) => e.key === 'Enter' && name.trim() && (await createGym(name), setName(''))} />
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={async () => {
              await createGym(name);
              setName('');
            }}
          >
            Add gym
          </button>
        </div>
        <div className="spacer" />
        {all.length ? (
          <div className="list">
            {all.map((g) => (
              <a key={g.id} className="list-item" href={`#/settings/gyms/${g.id}`}>
                <div className="grow">
                  <GymBadge gym={g} color={color.get(g.id)} />
                  {g.archived ? <span className="tag" style={{ marginLeft: 8 }}>Archived</span> : null}
                </div>
                <span className="faint">›</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty">Add the gyms you train at. Each gym keeps its own history per exercise.</div>
        )}
      </div>
    </div>
  );
}

export function GymEdit({ id }: { id: string }) {
  const gym = useLiveQuery(() => db.gyms.get(id), [id]);
  const usage = useLiveQuery(async () => (await db.sessions.where('gymId').equals(id).toArray()).filter((s) => !s.deletedAt).length, [id]);
  if (gym === undefined) return null;
  const upd = (p: Partial<GymProfile>) => db.gyms.update(id, p);
  const stacks = gym.cableStacks ?? [];
  return (
    <div>
      <PageHead title={gym.name || 'Gym'} onBack />
      <div className="page">
        <label className="field">
          <span>Name</span>
          <input defaultValue={gym.name} onBlur={(e) => e.target.value.trim() && upd({ name: e.target.value.trim() })} />
        </label>
        <p className="small muted">{usage ?? 0} workouts at this gym.</p>
        <h2>Equipment</h2>
        <p className="small muted">Optional. Used for the plate maths and load increments.</p>
        <div className="row">
          <label className="field grow">
            <span>Barbell (kg)</span>
            <input inputMode="decimal" defaultValue={gym.barbellKg ?? ''} placeholder="20" onBlur={(e) => upd({ barbellKg: parseNum(e.target.value) })} />
          </label>
          <label className="field grow">
            <span>Plates (kg, comma separated)</span>
            <input defaultValue={(gym.platesKg ?? []).join(', ')} placeholder="25, 20, 15, 10, 5, 2.5, 1.25" onBlur={(e) => upd({ platesKg: e.target.value.split(/[,\s]+/).map(parseNum).filter((n): n is number => n != null) })} />
          </label>
        </div>
        <div className="row">
          <label className="field grow">
            <span>Dumbbells from</span>
            <input inputMode="decimal" defaultValue={gym.dbMinKg ?? ''} onBlur={(e) => upd({ dbMinKg: parseNum(e.target.value) })} />
          </label>
          <label className="field grow">
            <span>to</span>
            <input inputMode="decimal" defaultValue={gym.dbMaxKg ?? ''} onBlur={(e) => upd({ dbMaxKg: parseNum(e.target.value) })} />
          </label>
          <label className="field grow">
            <span>step</span>
            <input inputMode="decimal" defaultValue={gym.dbStepKg ?? ''} onBlur={(e) => upd({ dbStepKg: parseNum(e.target.value) })} />
          </label>
        </div>
        <h3>Cable stacks</h3>
        {stacks.map((c, i) => (
          <div key={i} className="row">
            <input defaultValue={c.name} placeholder="Stack name" onBlur={(e) => upd({ cableStacks: stacks.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
            <input inputMode="decimal" style={{ width: 110 }} defaultValue={fmtNum(c.incrementKg, 2)} placeholder="kg per pin" onBlur={(e) => upd({ cableStacks: stacks.map((x, k) => (k === i ? { ...x, incrementKg: parseNum(e.target.value) ?? x.incrementKg } : x)) })} />
            <button className="icon-btn" aria-label="Remove stack" onClick={() => upd({ cableStacks: stacks.filter((_, k) => k !== i) })}>
              ×
            </button>
          </div>
        ))}
        <button className="btn small" onClick={() => upd({ cableStacks: [...stacks, { name: `Cable ${stacks.length + 1}`, incrementKg: 5 } as CableStack] })}>
          + Add cable stack
        </button>
        <label className="field">
          <span>Notes</span>
          <textarea defaultValue={gym.notes ?? ''} onBlur={(e) => upd({ notes: e.target.value })} placeholder="Pulley ratio, opening hours…" />
        </label>
        <div className="row">
          <button className="btn" onClick={() => upd({ archived: !gym.archived }).then(() => toast(gym.archived ? 'Gym restored' : 'Gym archived'))}>
            {gym.archived ? 'Unarchive' : 'Archive'}
          </button>
          {!usage ? (
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm(`Delete ${gym.name}?`)) return;
                await upd({ deletedAt: isoLocal() });
                navigate('/settings/gyms', true);
              }}
            >
              Delete
            </button>
          ) : (
            <span className="small faint">Gyms with workouts can be archived, not deleted.</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ValuesScreen() {
  const values = useLiveQuery(() => db.dimensionValues.toArray(), [], []);
  return (
    <div>
      <PageHead title="Variation values" onBack />
      <div className="page">
        <p className="small muted">Add values from any exercise's variant picker. Removing a value here doesn't change past workouts.</p>
        {DIMENSIONS.filter((d) => d !== 'tempo').map((d) => (
          <div key={d}>
            <h3>{DIMENSION_LABELS[d]}</h3>
            <div className="chips">
              {values
                .filter((v) => v.dimension === d)
                .sort((a, b) => a.order - b.order)
                .map((v) => (
                  <button
                    key={v.id}
                    className="chip"
                    onClick={async () => {
                      if (confirm(`Remove “${v.label}” from the ${DIMENSION_LABELS[d].toLowerCase()} options?`)) await db.dimensionValues.delete(v.id);
                    }}
                  >
                    {v.label} ×
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
