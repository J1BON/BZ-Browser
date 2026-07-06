import { useMemo, useState } from 'react';
import type { BrowserProfile } from '../types/profile';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconClose, IconGroups } from './Icons';

interface GroupsPanelProps {
  profiles: BrowserProfile[];
  extraGroups: string[];
  onCreateGroup: (name: string) => void;
  onRenameGroup: (from: string, to: string) => Promise<void>;
  onDeleteGroup: (name: string) => Promise<void>;
  showMsg: (text: string) => void;
}

export function GroupsPanel({ profiles, extraGroups, onCreateGroup, onRenameGroup, onDeleteGroup, showMsg }: GroupsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of extraGroups) counts.set(g, 0);
    for (const p of profiles) {
      if (p.group) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, extraGroups]);

  const ungrouped = profiles.filter((p) => !p.group).length;

  const submitNew = () => {
    const n = newName.trim();
    if (!n) { setCreating(false); return; }
    if (groups.some((g) => g.name === n)) { showMsg('Group already exists'); return; }
    onCreateGroup(n);
    setNewName('');
    setCreating(false);
    showMsg(`Group "${n}" created`);
  };

  const submitRename = async (from: string) => {
    const to = editValue.trim();
    setEditing(null);
    if (!to || to === from) return;
    await onRenameGroup(from, to);
    showMsg('Group renamed');
  };

  return (
    <div className="content-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">Groups</h2>
          <p className="panel-desc">Organize profiles into groups for quick filtering and bulk actions.</p>
        </div>
        <div className="panel-header-actions">
          <button
            style={{ background: 'var(--brand-gradient)', color: '#fff' }}
            onClick={() => { setCreating(true); setNewName(''); }}
          >
            <IconPlus size={14} /> New group
          </button>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table groups-table">
          <thead>
            <tr>
              <th>Group name</th>
              <th className="ta-center">Profiles</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creating && (
              <tr className="editing-row">
                <td>
                  <div className="inline-edit">
                    <input
                      autoFocus
                      value={newName}
                      placeholder="Group name"
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') setCreating(false); }}
                      style={{ maxWidth: 240 }}
                    />
                    <button className="icon-btn success-btn" onClick={submitNew} title="Save"><IconCheck size={13} /></button>
                    <button className="icon-btn ghost" onClick={() => setCreating(false)} title="Cancel"><IconClose size={13} /></button>
                  </div>
                </td>
                <td className="ta-center"><span className="count-badge">0</span></td>
                <td />
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.name}>
                <td>
                  {editing === g.name ? (
                    <div className="inline-edit">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitRename(g.name); if (e.key === 'Escape') setEditing(null); }}
                        style={{ maxWidth: 240 }}
                      />
                      <button className="icon-btn success-btn" onClick={() => submitRename(g.name)} title="Save"><IconCheck size={13} /></button>
                      <button className="icon-btn ghost" onClick={() => setEditing(null)} title="Cancel"><IconClose size={13} /></button>
                    </div>
                  ) : (
                    <span className="groups-table-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                      <span className="group-color-dot" />
                      {g.name}
                    </span>
                  )}
                </td>
                <td className="ta-center"><span className="count-badge">{g.count}</span></td>
                <td className="col-actions">
                  <div className="row-actions">
                    <button
                      className="icon-btn ghost"
                      title="Rename group"
                      onClick={() => { setEditing(g.name); setEditValue(g.name); }}
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      className="icon-btn ghost"
                      title="Delete group"
                      style={{ color: 'var(--red)' }}
                      onClick={async () => {
                        if (g.count > 0 && !confirm(`Delete "${g.name}"? ${g.count} profile(s) will become ungrouped.`)) return;
                        await onDeleteGroup(g.name);
                        showMsg('Group deleted');
                      }}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="ungrouped-row">
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  <span className="group-color-dot ungrouped" />
                  Ungrouped
                </span>
              </td>
              <td className="ta-center"><span className="count-badge">{ungrouped}</span></td>
              <td />
            </tr>
          </tbody>
        </table>
        {groups.length === 0 && !creating && (
          <div className="empty-hero small">
            <div className="empty-icon"><IconGroups size={28} /></div>
            <h3>No groups yet</h3>
            <p>Create groups to organize your profiles and enable quick filtering.</p>
          </div>
        )}
      </div>
    </div>
  );
}
