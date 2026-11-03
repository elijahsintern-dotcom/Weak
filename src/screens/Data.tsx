import { useState } from 'react';
import { db, initDb, updateSettings } from '../db/db';
import { isoLocal } from '../db/ids';
import { GymPicker } from '../components/GymPicker';
import { PageHead, toast, useGyms } from '../components/ui';
import { buildFullExport, buildSetsCsv, dateStamp, exportCounts, restoreExport, shareOrDownload, validateExport, type FullExport } from '../lib/exportData';
import { reassignGym } from '../lib/importStrong';

export function DataScreen() {
  const { gyms } = useGyms(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [gymFilter, setGymFilter] = useState('');
  const [pending, setPending] = useState<FullExport | null>(null);
  const [busy, setBusy] = useState(false);

  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState(isoLocal().slice(0, 10));
  const [rFromGym, setRFromGym] = useState('');
  const [rToGym, setRToGym] = useState<string | null>(null);

  const exportCsv = async () => {
    const { csv, rows } = await buildSetsCsv({ from: from || undefined, to: to || undefined, gymIds: gymFilter ? [gymFilter] : undefined });
    if (!rows) return toast('No sets match those filters');
    const res = await shareOrDownload(`weak_sets_${from || 'all'}_${to || dateStamp()}.csv`, csv, 'text/csv');
    if (res !== 'cancelled') toast(`Exported ${rows} sets`);
  };

  const exportJson = async () => {
    const data = await buildFullExport();
    const res = await shareOrDownload(`weak_backup_${dateStamp()}.json`, JSON.stringify(data), 'application/json');
    if (res !== 'cancelled') {
      await updateSettings({ lastExportAt: isoLocal() });
      toast('Backup exported');
    }
  };

  const pickRestore = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(validateExport(JSON.parse(await f.text())));
    } catch (e) {
      alert(`Can't restore this file: ${(e as Error).message}`);
    }
  };

  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    if (mode === 'replace' && !confirm('Replace everything on this phone with the backup? This cannot be undone.')) return;
    setBusy(true);
    try {
      await restoreExport(pending, mode);
      await initDb();
      toast(mode === 'replace' ? 'Backup restored' : 'Backup merged');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Backup and export" onBack />
      <div className="page">
        <h2>Back up everything</h2>
        <p className="small muted">A JSON file with all workouts, templates, gyms, exercises and notes. Use it to restore on this or another phone. Save it to Google Drive or Files from the share sheet.</p>
        <button className="btn primary block" onClick={exportJson}>
          Export backup (JSON)
        </button>

        <h2>Export sets for analysis</h2>
        <p className="small muted">One row per set, with every variation as its own column. Opens in Excel, Sheets or pandas.</p>
        <div className="row">
          <label className="field grow">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field grow">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Gym</span>
          <select value={gymFilter} onChange={(e) => setGymFilter(e.target.value)}>
            <option value="">All gyms</option>
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn block" onClick={exportCsv}>
          Export sets (CSV)
        </button>

        <h2>Restore from backup</h2>
        <input type="file" accept="application/json,.json" onChange={(e) => pickRestore(e.target.files?.[0])} />
        {pending ? (
          <div className="banner" style={{ marginTop: 10 }}>
            <p>
              Backup from {new Date(pending.exported_at).toLocaleString()}: {exportCounts(pending).sessions} workouts, {exportCounts(pending).sets} sets, {exportCounts(pending).templates} templates.
            </p>
            <div className="row">
              <button className="btn grow" disabled={busy} onClick={() => doRestore('merge')}>
                Merge
              </button>
              <button className="btn danger grow" disabled={busy} onClick={() => doRestore('replace')}>
                Replace all
              </button>
            </div>
          </div>
        ) : null}

        <h2>Move workouts to another gym</h2>
        <p className="small muted">For fixing imported history: every exercise in the matching workouts moves to the same variant at the new gym.</p>
        <div className="row">
          <label className="field grow">
            <span>From date</span>
            <input type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} />
          </label>
          <label className="field grow">
            <span>To date</span>
            <input type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Only workouts currently at</span>
          <select value={rFromGym} onChange={(e) => setRFromGym(e.target.value)}>
            <option value="">Any gym</option>
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <GymPicker label="Move to" value={rToGym} onChange={setRToGym} />
        <button
          className="btn block"
          disabled={!rFrom || !rTo || !rToGym || busy}
          onClick={async () => {
            if (!rToGym) return;
            setBusy(true);
            const n = await reassignGym({ from: rFrom, to: rTo, fromGymId: rFromGym || null, toGymId: rToGym });
            setBusy(false);
            toast(`Moved ${n} workouts`);
          }}
        >
          Move workouts
        </button>

        <h2>Danger zone</h2>
        <button
          className="btn danger block"
          onClick={async () => {
            if (!confirm('Delete ALL data on this phone? Export a backup first if you might want it.')) return;
            if (!confirm('Really delete everything?')) return;
            await db.delete();
            location.reload();
          }}
        >
          Delete all data
        </button>
      </div>
    </div>
  );
}
