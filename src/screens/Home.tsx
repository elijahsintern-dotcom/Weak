import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db/db';
import { GymPicker } from '../components/GymPicker';
import { GymBadge, PageHead, useGyms } from '../components/ui';
import { startSession } from '../lib/sessionOps';
import { navigate } from '../router';
import { daysAgo, fmtDateTime, fmtDuration } from '../lib/format';

export function Home() {
  const settings = useLiveQuery(() => getSettings(), []);
  const { byId, color } = useGyms(true);
  const [gymId, setGymId] = useState<string | null>(null);
  useEffect(() => {
    if (!gymId && settings?.lastGymId) setGymId(settings.lastGymId);
  }, [settings, gymId]);

  const active = useLiveQuery(async () => (await db.sessions.toArray()).find((s) => !s.endedAt && !s.deletedAt), []);
  const templates = useLiveQuery(async () => {
    const [t, f, items] = await Promise.all([db.templates.toArray(), db.folders.toArray(), db.templateItems.toArray()]);
    const count = new Map<string, number>();
    items.forEach((i) => count.set(i.templateId, (count.get(i.templateId) ?? 0) + 1));
    const folders = f.filter((x) => !x.deletedAt).sort((a, b) => a.order - b.order);
    const live = t.filter((x) => !x.deletedAt && !x.archived).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return { folders, live, count };
  }, []);
  const recent = useLiveQuery(async () => {
    const s = (await db.sessions.orderBy('startedAt').reverse().limit(30).toArray()).filter((x) => x.endedAt && !x.deletedAt).slice(0, 12);
    return s;
  }, []);
  const hasData = useLiveQuery(async () => (await db.sessions.count()) > 0, []);

  const start = async (templateId: string | null) => {
    if (!gymId) return;
    const id = await startSession({ templateId, gymId });
    navigate(`/session/${id}`);
  };

  const exportDue =
    hasData && settings && (!settings.lastExportAt || daysAgo(settings.lastExportAt) >= settings.exportReminderDays);

  return (
    <div>
      <PageHead title="Workout" />
      <div className="page stack">
        {active ? (
          <a className="resume" href={`#/session/${active.id}`}>
            <span className="grow">
              Continue {active.name}
              <div className="small" style={{ fontWeight: 400 }}>
                Started {fmtDuration(Date.now() - new Date(active.startedAt).getTime())} ago
              </div>
            </span>
            <span aria-hidden="true">›</span>
          </a>
        ) : null}

        {exportDue ? (
          <div className="banner">
            {settings?.lastExportAt ? `Last backup was ${daysAgo(settings.lastExportAt)} days ago.` : 'You have no backup yet.'} Your data lives only on this phone.{' '}
            <a href="#/settings/data">Back up now</a>
          </div>
        ) : null}

        {!active ? (
          <>
            <GymPicker value={gymId} onChange={setGymId} />
            <button className="btn block" disabled={!gymId} onClick={() => start(null)}>
              Start empty workout
            </button>

            <h2>Start from a template</h2>
            {templates && templates.live.length ? (
              [{ id: null as string | null, name: '' }, ...templates.folders].map((f) => {
                const ts = templates.live.filter((t) => (t.folderId ?? null) === f.id);
                if (!ts.length) return null;
                return (
                  <div key={f.id ?? 'none'}>
                    {f.name ? <h3 className="muted">{f.name}</h3> : null}
                    <div className="list">
                      {ts.map((t) => (
                        <div key={t.id} className="list-item" style={{ cursor: 'default' }}>
                          <a className="grow" href={`#/templates/${t.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            <div className="title">{t.name}</div>
                            <div className="sub">{templates.count.get(t.id) ?? 0} exercises</div>
                          </a>
                          <button className="btn primary small" disabled={!gymId} onClick={() => start(t.id)}>
                            Start
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">
                No templates yet. <a href="#/templates">Create one</a>
              </div>
            )}
          </>
        ) : null}

        <h2>Recent workouts</h2>
        {recent && recent.length ? (
          <div className="list">
            {recent.map((s) => (
              <a key={s.id} className="list-item" href={`#/session/${s.id}`}>
                <div className="grow">
                  <div className="title">{s.name}</div>
                  <div className="sub row">
                    <span>{fmtDateTime(s.startedAt)}</span>
                    <GymBadge gym={byId.get(s.gymId)} color={color.get(s.gymId)} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty">Finished workouts will show here.</div>
        )}
      </div>
    </div>
  );
}
