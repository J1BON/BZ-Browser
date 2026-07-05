import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BrowserProfile, SyncState, SyncConflict, ValidationReport } from './types/profile';
import { antidetectWarnings, FP_LAUNCH_GATE_DESCRIPTION, FP_LAUNCH_GATE_SCOPE } from './core/fingerprint/antidetect-policy';
import type { SavedProxy, ExtensionEntry, AutomationStatus, UpdateState } from './types/phase4';
import type { TeamState, TeamRole } from './types/team';
import type { RpaScript, RpaRecordingState } from './types/rpa';

type Tab = 'profiles' | 'proxies' | 'extensions' | 'automation' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('profiles');
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [proxies, setProxies] = useState<SavedProxy[]>([]);
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selected, setSelected] = useState<BrowserProfile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterGroup, setFilterGroup] = useState('');
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [automation, setAutomation] = useState<AutomationStatus | null>(null);
  const [appPaths, setAppPaths] = useState<{ automationUrl: string; version?: string; isPackaged?: boolean; bundledChromium?: boolean } | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [teamFolderId, setTeamFolderId] = useState('');
  const [conflicts] = useState<SyncConflict[]>([]);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [chromiumSource, setChromiumSource] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editTags, setEditTags] = useState('');
  const [newProxyName, setNewProxyName] = useState('');
  const [newProxyHost, setNewProxyHost] = useState('');
  const [newProxyPort, setNewProxyPort] = useState('');
  const [newDeviceType, setNewDeviceType] = useState<'desktop' | 'mobile-ios' | 'mobile-android'>('desktop');
  const [chromiumStatus, setChromiumStatus] = useState<{ isPatched: boolean; tlsReady: boolean; version: string | null; source: string | null } | null>(null);
  const [warmupPresets, setWarmupPresets] = useState<{ id: string; name: string; description: string }[]>([]);
  const [selectedWarmup, setSelectedWarmup] = useState('');
  const [warmupOnLaunch, setWarmupOnLaunch] = useState(false);
  const [installingChromium, setInstallingChromium] = useState(false);
  const [rpaScripts, setRpaScripts] = useState<RpaScript[]>([]);
  const [rpaRecording, setRpaRecording] = useState<RpaRecordingState | null>(null);
  const [rpaScriptName, setRpaScriptName] = useState('');
  const [teamState, setTeamState] = useState<TeamState | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>('member');
  const [validatingExternal, setValidatingExternal] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string; category: string }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('win-desktop');
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkPrefix, setBulkPrefix] = useState('Profile');
  const [trash, setTrash] = useState<BrowserProfile[]>([]);
  const [editRemark, setEditRemark] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [headless, setHeadless] = useState(false);
  const [minFpScore, setMinFpScore] = useState(0);
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; prefix: string }[]>([]);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [auditEntries, setAuditEntries] = useState<{ timestamp: number; actorEmail: string; action: string; target?: string }[]>([]);
  const [marketplace, setMarketplace] = useState<{ id: string; name: string; description: string; category: string; chromeStoreId?: string }[]>([]);
  const [resProviders, setResProviders] = useState<{ id: string; name: string; hostTemplate: string; port: string; docs: string }[]>([]);
  const [resProviderId, setResProviderId] = useState('brightdata');
  const [resName, setResName] = useState('');
  const [resAccount, setResAccount] = useState('');
  const [resPassword, setResPassword] = useState('');
  const [resCountry, setResCountry] = useState('');
  const [rotationMode, setRotationMode] = useState<'off' | 'session' | 'random'>('off');
  const [proxyPoolIds, setProxyPoolIds] = useState<Set<string>>(new Set());
  const [webhooks, setWebhooks] = useState<{ id: string; url: string; events: string[]; enabled: boolean; lastStatus?: string }[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<Set<string>>(new Set(['profile.closed', 'profile.launched']));

  const refresh = useCallback(async () => {
    if (!window.electronAPI) return;
    const [list, proxyList, extList, groupList, sync, auto, paths, chrome, chromeStatus, presets, scripts, team, tpl, trashList, keys, audit, mkt, res, hooks] = await Promise.all([
      window.electronAPI.listProfiles(),
      window.electronAPI.listProxies(),
      window.electronAPI.listExtensions(),
      window.electronAPI.getGroups(),
      window.electronAPI.getSyncStatus(),
      window.electronAPI.getAutomationStatus(),
      window.electronAPI.getAppPaths(),
      window.electronAPI.getChromiumInfo(),
      window.electronAPI.getChromiumStatus(),
      window.electronAPI.listWarmupPresets(),
      window.electronAPI.listRpaScripts(),
      window.electronAPI.getTeamState(),
      window.electronAPI.listTemplates(),
      window.electronAPI.listTrash(),
      window.electronAPI.listApiKeys(),
      window.electronAPI.listAuditLog(50),
      window.electronAPI.listExtensionMarketplace(),
      window.electronAPI.listResidentialProviders(),
      window.electronAPI.listWebhooks(),
    ]);
    setProfiles(list);
    setProxies(proxyList);
    setExtensions(extList);
    setGroups(groupList);
    setSyncState(sync);
    setAutomation(auto);
    setAppPaths(paths);
    setChromiumSource(chrome?.source ?? 'unknown');
    setChromiumStatus(chromeStatus);
    setWarmupPresets(presets);
    setRpaScripts(scripts);
    setTeamState(team);
    setTemplates(tpl);
    setTrash(trashList);
    setApiKeys(keys);
    setAuditEntries(audit);
    setMarketplace(mkt);
    setResProviders(res);
    setWebhooks(hooks);
    const rec = await window.electronAPI.getRpaRecordingState();
    setRpaRecording(rec);
    const upd = await window.electronAPI.getUpdateState();
    setUpdateState(upd);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onUpdateStatus(setUpdateState);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (selected) {
      setEditGroup(selected.group ?? '');
      setEditTags(selected.tags.join(', '));
      setSelectedWarmup(selected.warmupPresetId ?? '');
      setWarmupOnLaunch(selected.warmupOnLaunch ?? false);
      setEditRemark(selected.remark ?? '');
      setEditColor(selected.color ?? '#3b82f6');
      setHeadless(selected.headless ?? false);
      setMinFpScore(selected.minFpScore ?? 0);
      setRotationMode(selected.proxy.rotationMode ?? 'off');
      setProxyPoolIds(new Set(selected.proxyPoolIds ?? []));
    }
  }, [selected]);

  const filteredProfiles = useMemo(() => {
    if (!filterGroup) return profiles;
    return profiles.filter((p) => p.group === filterGroup);
  }, [profiles, filterGroup]);

  const profileWarnings = useMemo(() => {
    if (!selected) return [];
    return antidetectWarnings(selected.fingerprint, !!(selected.proxy.host && selected.proxy.port));
  }, [selected]);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 5000);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkLaunch = async () => {
    if (!window.electronAPI || selectedIds.size === 0) return;
    const result = await window.electronAPI.bulkLaunch([...selectedIds]);
    showMsg(`Launched ${result.launched.length}, failed ${result.failed.length}`);
  };

  const handleSaveMeta = async () => {
    if (!window.electronAPI || !selected) return;
    await window.electronAPI.updateProfileMeta(selected.id, {
      group: editGroup || undefined,
      tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
      remark: editRemark || undefined,
      color: editColor,
      headless,
      minFpScore,
      rotationMode,
      proxyPoolIds: [...proxyPoolIds],
    });
    await refresh();
    showMsg('Profile updated');
  };

  const handleCreateProxy = async () => {
    if (!window.electronAPI || !newProxyName || !newProxyHost) return;
    await window.electronAPI.createProxy(newProxyName, {
      category: '4', type: 'CustomProxy', host: newProxyHost, port: newProxyPort, rotationMode: 'off',
    });
    setNewProxyName(''); setNewProxyHost(''); setNewProxyPort('');
    await refresh();
    showMsg('Proxy saved');
  };

  const handleCheckAllProxies = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.checkAllProxies();
    await refresh();
    showMsg('All proxies checked');
  };

  const handleApplyProxy = async (proxyId: string) => {
    if (!window.electronAPI || !selected) return;
    await window.electronAPI.applyProxyToProfile(selected.id, proxyId);
    await refresh();
    showMsg('Proxy applied + geo aligned');
  };

  const handleImportBroearnExt = async () => {
    if (!window.electronAPI) return;
    const r = await window.electronAPI.importBroearnExtensions();
    await refresh();
    showMsg(`Imported ${r.count} extensions`);
  };

  const handleAssignExt = async (extId: string) => {
    if (!window.electronAPI || !selected) return;
    const current = new Set(selected.extensions);
    if (current.has(extId)) current.delete(extId);
    else current.add(extId);
    await window.electronAPI.assignExtensions(selected.id, [...current]);
    await refresh();
    const updated = (await window.electronAPI.listProfiles()).find((p) => p.id === selected.id);
    if (updated) setSelected(updated);
  };

  const handleSetTeamFolder = async () => {
    if (!window.electronAPI || !teamFolderId.trim()) return;
    await window.electronAPI.setTeamFolder(teamFolderId.trim());
    await refresh();
    showMsg('Team folder set');
  };

  if (!window.electronAPI) {
    return (
      <div className="app">
        <header className="header"><h1>Cloud Antidetect Browser</h1></header>
        <p className="dev-hint">Use <code>npm run electron:dev</code></p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Cloud Antidetect Browser</h1>
          <p className="subtitle">
            {chromiumStatus?.tlsReady ? 'TLS Ready' : 'TLS: install patched Chromium'} · {chromiumSource} · API :9321
          </p>
        </div>
        <div className="header-actions">
          <span className={`sync-badge ${syncState?.connected ? 'connected' : ''}`}>
            {syncState?.connected ? 'Drive' : 'Offline'}
          </span>
          {automation?.running && <span className="sync-badge connected">API live</span>}
          <button onClick={() => window.electronAPI!.runSync().then(refresh)} disabled={!syncState?.connected}>Sync</button>
        </div>
      </header>

      <nav className="tabs">
        {(['profiles', 'proxies', 'extensions', 'automation', 'settings'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {message && <div className="toast">{message}</div>}

      {conflicts.length > 0 && tab === 'profiles' && (
        <div className="conflict-banner">
          {conflicts.map((c) => (
            <div key={c.profileId} className="conflict-row">
              <span>{c.profileName} conflict</span>
              <button onClick={() => window.electronAPI!.runSync({ [c.profileId]: 'keep-local' }).then(refresh)}>Keep Local</button>
              <button onClick={() => window.electronAPI!.runSync({ [c.profileId]: 'keep-remote' }).then(refresh)}>Keep Remote</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'profiles' && (
        <div className="layout">
          <aside className="sidebar">
            <div className="create-row">
              <input placeholder="Profile name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button onClick={async () => {
                if (!newName.trim()) return;
                const options = newDeviceType === 'mobile-ios'
                  ? { formFactor: 'mobile' as const, device: 'iOS' as const }
                  : newDeviceType === 'mobile-android'
                    ? { formFactor: 'mobile' as const, device: 'Android' as const }
                    : { formFactor: 'desktop' as const };
                await window.electronAPI!.createProfile(newName.trim(), newGroup || undefined, options);
                setNewName(''); await refresh();
              }}>+</button>
            </div>
            <input placeholder="Group (optional)" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className="full-width" />
            <select value={newDeviceType} onChange={(e) => setNewDeviceType(e.target.value as typeof newDeviceType)} className="full-width">
              <option value="desktop">Desktop (random OS)</option>
              <option value="mobile-ios">Mobile — iOS</option>
              <option value="mobile-android">Mobile — Android</option>
            </select>
            <div className="template-block">
              <label className="muted">Template</label>
              <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} className="full-width">
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="secondary full-width" onClick={async () => {
                if (!newName.trim()) { showMsg('Enter a profile name'); return; }
                await window.electronAPI!.createFromTemplate(selectedTemplate, newName.trim(), newGroup || undefined);
                setNewName(''); await refresh(); showMsg('Created from template');
              }}>Create from template</button>
              <div className="create-row">
                <input type="number" min={1} max={100} value={bulkCount} onChange={(e) => setBulkCount(Number(e.target.value))} style={{ width: 60 }} />
                <input placeholder="Prefix" value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} />
                <button className="secondary" onClick={async () => {
                  await window.electronAPI!.bulkCreateProfiles(selectedTemplate, bulkCount, bulkPrefix);
                  await refresh(); showMsg(`Created ${bulkCount} profiles`);
                }}>Bulk</button>
              </div>
            </div>
            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} className="full-width">
              <option value="">All groups</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="sidebar-actions">
              <button className="secondary" onClick={handleBulkLaunch} disabled={selectedIds.size === 0}>
                Launch {selectedIds.size || ''} selected
              </button>
              <button className="secondary" onClick={async () => {
                const p = await window.electronAPI!.getAppPaths();
                const r = await window.electronAPI!.importBroearn(p.broearnDefault);
                await refresh(); showMsg(`Imported ${r.count}`);
              }}>Import Broearn</button>
            </div>
            <ul className="profile-list">
              {loading ? <li className="empty">Loading...</li> : filteredProfiles.map((p) => (
                <li key={p.id} className={selected?.id === p.id ? 'active' : ''}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} onClick={(e) => e.stopPropagation()} />
                  <div onClick={() => { setSelected(p); setValidation(null); }} style={{ flex: 1 }}>
                    <strong>{p.name}</strong>
                    <small>{p.group ?? 'ungrouped'} · {p.tags.slice(0, 2).join(', ') || 'no tags'}</small>
                  </div>
                </li>
              ))}
            </ul>
            {trash.length > 0 && (
              <div className="trash-block">
                <h4>Trash ({trash.length})</h4>
                {trash.slice(0, 5).map((p) => (
                  <div key={p.id} className="trash-row">
                    <span>{p.name}</span>
                    <button className="secondary" onClick={async () => {
                      await window.electronAPI!.restoreProfile(p.id); await refresh(); showMsg('Restored');
                    }}>Restore</button>
                    <button className="danger" onClick={async () => {
                      if (!confirm('Permanently delete?')) return;
                      await window.electronAPI!.purgeProfile(p.id); await refresh();
                    }}>Purge</button>
                  </div>
                ))}
              </div>
            )}
          </aside>
          <main className="detail">
            {selected ? (
              <>
                <div className="detail-header">
                  <h2>{selected.name}</h2>
                  <div className="detail-actions">
                    <button className="primary" onClick={async () => {
                      const r = await window.electronAPI!.launchBrowser(selected.id);
                      const fpMsg = r.fpScore != null ? ` · FP ${r.fpScore}%` : '';
                      const warnMsg = r.antidetectWarnings?.length ? ` ⚠ ${r.antidetectWarnings[0]}` : '';
                      showMsg(r.success ? `Launched :${r.cdpPort}${fpMsg}${warnMsg}` : r.error ?? 'Failed');
                    }}>Launch</button>
                    <button className="secondary" onClick={async () => {
                      const cdp = await window.electronAPI!.getCdp(selected.id);
                      if (cdp?.wsUrl) { navigator.clipboard.writeText(cdp.wsUrl); showMsg('CDP URL copied'); }
                      else showMsg('Launch browser first');
                    }}>Copy CDP</button>
                    <button className="secondary" onClick={async () => {
                      const r = await window.electronAPI!.validateFingerprint(selected.id);
                      setValidation(r); if (r) showMsg(`Score: ${r.score}%`);
                    }}>Validate</button>
                    <button className="secondary" disabled={validatingExternal} onClick={async () => {
                      setValidatingExternal(true);
                      showMsg('Running external tests (BrowserLeaks, Pixelscan, Whoer)...');
                      const r = await window.electronAPI!.validateFingerprint(selected.id, true);
                      setValidatingExternal(false);
                      setValidation(r);
                      if (r) showMsg(`External score: ${r.externalScore ?? r.score}% (${r.passed}/${r.total})`);
                    }}>{validatingExternal ? 'Testing...' : 'External Test'}</button>
                    <button className="secondary" onClick={async () => {
                      if (!confirm('Generate a completely new device identity for this profile?')) return;
                      const r = await window.electronAPI!.regenerateDevice(selected.id);
                      if (r.error) showMsg(r.error);
                      else {
                        setProfiles(r.profiles);
                        if (r.profile) setSelected(r.profile);
                        setValidation(null);
                        showMsg('New device generated');
                      }
                    }}>New Device</button>
                  </div>
                </div>
                {profileWarnings.length > 0 && (
                  <div className="validation-box warn">
                    <strong>Antidetect warnings</strong>
                    <ul className="validation-sites">
                      {profileWarnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {validation && (
                  <div className={`validation-box ${validation.score >= 80 ? 'pass' : 'warn'}`}>
                    <strong>Score: {validation.score}%</strong> ({validation.passed}/{validation.total})
                    {validation.externalScore != null && <span> · External: {validation.externalScore}%</span>}
                    {validation.sites && validation.sites.length > 0 && (
                      <ul className="validation-sites">
                        {validation.sites.map((s) => (
                          <li key={s.name} className={s.pass ? 'pass' : 'fail'}>{s.name}: {s.detail}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="meta-edit">
                  <input placeholder="Group" value={editGroup} onChange={(e) => setEditGroup(e.target.value)} />
                  <input placeholder="Tags (comma separated)" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                  <input placeholder="Remark / notes" value={editRemark} onChange={(e) => setEditRemark(e.target.value)} />
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} title="Profile color" />
                  <label className="toggle-label">
                    <input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} />
                    Headless launch
                  </label>
                  <label className="toggle-label" title={FP_LAUNCH_GATE_DESCRIPTION}>
                    Launch FP gate ({FP_LAUNCH_GATE_SCOPE}):
                    <input type="number" min={0} max={100} value={minFpScore} onChange={(e) => setMinFpScore(Number(e.target.value))} style={{ width: 56, marginLeft: 8 }} />
                  </label>
                  <p className="hint" style={{ fontSize: 12, opacity: 0.75, margin: '4px 0 0' }}>{FP_LAUNCH_GATE_DESCRIPTION}</p>
                  <button onClick={handleSaveMeta}>Save Meta</button>
                </div>
                <div className="grid">
                  <Section title="Proxy">
                    <Row label="Host" value={selected.proxy.host || 'None'} />
                    <Row label="IP" value={selected.proxy.ip ?? '—'} />
                    <Row label="Rotation" value={selected.proxy.rotationMode ?? 'off'} />
                    {proxies.length > 0 && (
                      <div className="proxy-assign">
                        <select id="proxy-select" defaultValue="">
                          <option value="" disabled>Apply saved proxy...</option>
                          {proxies.map((px) => (
                            <option key={px.id} value={px.id}>{px.name} ({px.lastStatus})</option>
                          ))}
                        </select>
                        <button onClick={() => {
                          const sel = document.getElementById('proxy-select') as HTMLSelectElement;
                          if (sel.value) handleApplyProxy(sel.value);
                        }}>Apply</button>
                      </div>
                    )}
                    <label className="muted">Rotation mode (uses pool on launch)</label>
                    <select
                      value={rotationMode}
                      onChange={(e) => setRotationMode(e.target.value as typeof rotationMode)}
                      className="full-width"
                    >
                      <option value="off">Off — use assigned proxy</option>
                      <option value="session">Session — pick from pool per launch</option>
                      <option value="random">Random — pick from pool per launch</option>
                    </select>
                    {proxies.length > 0 && rotationMode !== 'off' && (
                      <div className="proxy-pool">
                        <label className="muted">Proxy pool ({proxyPoolIds.size} selected)</label>
                        {proxies.map((px) => (
                          <label key={px.id} className="ext-check">
                            <input
                              type="checkbox"
                              checked={proxyPoolIds.has(px.id)}
                              onChange={() => {
                                setProxyPoolIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(px.id)) next.delete(px.id);
                                  else next.add(px.id);
                                  return next;
                                });
                              }}
                            />
                            {px.name} · {px.proxy.host}:{px.proxy.port} ({px.lastStatus})
                          </label>
                        ))}
                      </div>
                    )}
                    <button className="secondary" onClick={handleSaveMeta}>Save proxy settings</button>
                  </Section>
                  <Section title="Extensions">
                    {extensions.length === 0 ? <p className="muted">Import extensions in Extensions tab</p> :
                      extensions.map((ext) => (
                        <label key={ext.id} className="ext-check">
                          <input type="checkbox" checked={selected.extensions.includes(ext.id)} onChange={() => handleAssignExt(ext.id)} />
                          {ext.name}
                        </label>
                      ))}
                  </Section>
                  <Section title="Cookies">
                    <div className="sidebar-actions">
                      <button className="secondary" onClick={async () => {
                        const r = await window.electronAPI!.exportCookies(selected.id, 'json');
                        if (r.canceled) return;
                        showMsg(r.count ? `Exported ${r.count} cookies` : 'Launch browser first');
                      }}>Export JSON</button>
                      <button className="secondary" onClick={async () => {
                        const r = await window.electronAPI!.exportCookies(selected.id, 'netscape');
                        if (r.canceled) return;
                        showMsg(r.count ? `Exported ${r.count} cookies` : 'Launch browser first');
                      }}>Export Netscape</button>
                      <button onClick={async () => {
                        const r = await window.electronAPI!.importCookies(selected.id, 'json');
                        if (r.canceled) return;
                        showMsg(r.count ? `Imported ${r.count} cookies` : 'Launch browser first');
                      }}>Import JSON</button>
                    </div>
                  </Section>
                  <Section title="Device Fingerprint">
                    <Row label="Signature" value={selected.deviceSignature ?? '—'} mono />
                    <Row label="FP gate" value={`${selected.minFpScore ?? 85}% min (${FP_LAUNCH_GATE_SCOPE})`} />
                    <Row label="FP gate scope" value={FP_LAUNCH_GATE_DESCRIPTION} />
                    <Row label="Form factor" value={`${selected.fingerprint.formFactor ?? 'desktop'} · ${selected.fingerprint.device}`} />
                    <Row label="Engine" value={selected.fingerprint.device === 'iOS' ? 'Safari UA on Chromium (risky)' : 'Chromium-consistent'} />
                    <Row label="Screen" value={`${selected.fingerprint.screenWidth ?? selected.fingerprint.windowWidth}×${selected.fingerprint.screenHeight ?? selected.fingerprint.windowHeight}`} />
                    <Row label="Viewport" value={`${selected.fingerprint.windowWidth}×${selected.fingerprint.windowHeight}`} />
                    <Row label="CPU / RAM" value={`${selected.fingerprint.hardwareConcurrency ?? '?'} cores · ${selected.fingerprint.deviceMemory ?? '?'} GB`} />
                    <Row label="Touch" value={String(selected.fingerprint.touchPoints ?? 0)} />
                    <Row label="WebGL" value={selected.fingerprint.webGlMode?.slice(0, 48) ?? '—'} />
                    <Row label="TLS" value={chromiumStatus?.tlsReady ? 'Patched kernel' : 'Requires patched Chromium'} />
                  </Section>
                  <Section title="Cookie Warmup">
                    <select value={selectedWarmup} onChange={(e) => setSelectedWarmup(e.target.value)} className="full-width">
                      <option value="">Select preset...</option>
                      {warmupPresets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <label className="toggle-label">
                      <input type="checkbox" checked={warmupOnLaunch} onChange={(e) => setWarmupOnLaunch(e.target.checked)} />
                      Run warmup on launch
                    </label>
                    <div className="sidebar-actions">
                      <button className="secondary" onClick={async () => {
                        if (!selectedWarmup) { showMsg('Select a warmup preset'); return; }
                        await window.electronAPI!.updateProfileMeta(selected.id, {
                          warmupPresetId: selectedWarmup,
                          warmupOnLaunch,
                        });
                        showMsg('Warmup settings saved');
                      }}>Save Warmup</button>
                      <button onClick={async () => {
                        if (!selectedWarmup) { showMsg('Select a preset'); return; }
                        const r = await window.electronAPI!.runWarmup(selected.id, selectedWarmup);
                        if ('error' in r) showMsg(r.error ?? 'Warmup error');
                        else showMsg(r.success ? `Warmup done — ${r.cookiesSet} cookies` : (r.error ?? 'Warmup failed'));
                      }}>Run Warmup</button>
                    </div>
                  </Section>
                  <Section title="RPA Recorder">
                    <Row label="Status" value={rpaRecording?.recording ? `Recording (${rpaRecording.actionCount} actions)` : 'Idle'} />
                    <input placeholder="Script name" value={rpaScriptName} onChange={(e) => setRpaScriptName(e.target.value)} className="full-width" />
                    <div className="sidebar-actions">
                      {!rpaRecording?.recording ? (
                        <button onClick={async () => {
                          const r = await window.electronAPI!.startRpaRecording(selected.id);
                          if ('error' in r) showMsg(r.error ?? 'Failed');
                          else { setRpaRecording(r); showMsg('Recording — interact in browser'); }
                        }}>Start Recording</button>
                      ) : (
                        <button onClick={async () => {
                          const name = rpaScriptName.trim() || `Script ${new Date().toLocaleTimeString()}`;
                          await window.electronAPI!.stopRpaRecording(name, selected.id);
                          setRpaScriptName('');
                          await refresh();
                          showMsg('Script saved');
                        }}>Stop & Save</button>
                      )}
                    </div>
                    {rpaScripts.filter((s) => s.profileId === selected.id || !s.profileId).slice(0, 5).map((s) => (
                      <div key={s.id} className="rpa-script-row">
                        <span>{s.name} ({s.actions.length} steps)</span>
                        <button className="secondary" onClick={async () => {
                          const r = await window.electronAPI!.replayRpaScript(selected.id, s.id);
                          if ('error' in r) showMsg(r.error ?? 'Replay failed');
                          else showMsg(r.success ? `Replayed ${r.stepsCompleted} steps` : r.error ?? 'Failed');
                        }}>Replay</button>
                      </div>
                    ))}
                  </Section>
                  <Section title="Automation">
                    <Row label="CDP Port" value={selected.lastOpened ? 'Launch to get port' : '—'} />
                    <Row label="API" value={appPaths?.automationUrl ?? 'http://127.0.0.1:9321'} mono />
                    <Row label="Playwright" value={`connectOverCDP(wsUrl from /profiles/:id/cdp)`} mono />
                  </Section>
                </div>
              </>
            ) : (
              <div className="empty-state"><h2>Select a profile</h2><p>Use checkboxes for bulk launch</p></div>
            )}
          </main>
        </div>
      )}

      {tab === 'proxies' && (
        <div className="panel">
          <h2>Proxy Manager</h2>
          <Section title="Residential provider preset">
            <select value={resProviderId} onChange={(e) => setResProviderId(e.target.value)} className="full-width">
              {resProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="create-row">
              <input placeholder="Name" value={resName} onChange={(e) => setResName(e.target.value)} />
              <input placeholder="Account / username" value={resAccount} onChange={(e) => setResAccount(e.target.value)} />
              <input type="password" placeholder="Password" value={resPassword} onChange={(e) => setResPassword(e.target.value)} />
              <input placeholder="Country (US)" value={resCountry} onChange={(e) => setResCountry(e.target.value)} style={{ width: 80 }} />
              <button onClick={async () => {
                if (!resName || !resAccount || !resPassword) { showMsg('Fill provider credentials'); return; }
                const r = await window.electronAPI!.createResidentialProxy(resProviderId, resName, resAccount, resPassword, resCountry || undefined);
                if (r.error) showMsg(r.error);
                else { setResName(''); setResAccount(''); setResPassword(''); await refresh(); showMsg('Residential proxy added'); }
              }}>Add provider</button>
            </div>
          </Section>
          <div className="create-row">
            <input placeholder="Name" value={newProxyName} onChange={(e) => setNewProxyName(e.target.value)} />
            <input placeholder="Host" value={newProxyHost} onChange={(e) => setNewProxyHost(e.target.value)} />
            <input placeholder="Port" value={newProxyPort} onChange={(e) => setNewProxyPort(e.target.value)} />
            <button onClick={handleCreateProxy}>Add</button>
            <button className="secondary" onClick={handleCheckAllProxies}>Check All</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Host</th><th>Status</th><th>Latency</th><th>Exit IP</th><th></th></tr></thead>
            <tbody>
              {proxies.map((px) => (
                <tr key={px.id}>
                  <td>{px.name}</td>
                  <td>{px.proxy.host}:{px.proxy.port}</td>
                  <td className={px.lastStatus === 'online' ? 'online' : 'offline'}>{px.lastStatus}</td>
                  <td>{px.lastLatencyMs ? `${px.lastLatencyMs}ms` : '—'}</td>
                  <td>{px.exitIp ?? '—'}</td>
                  <td>
                    <button className="secondary" onClick={async () => {
                      await window.electronAPI!.checkProxy(px.id); await refresh();
                    }}>Check</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'extensions' && (
        <div className="panel">
          <h2>Extension Loader</h2>
          <button onClick={handleImportBroearnExt}>Import from Broearn</button>
          <Section title="Marketplace (Chrome Web Store IDs)">
            <ul className="ext-list">
              {marketplace.map((ext) => (
                <li key={ext.id}>
                  <strong>{ext.name}</strong>
                  <small>{ext.description} · {ext.category}</small>
                  {ext.chromeStoreId && (
                    <button className="secondary" onClick={() => {
                      void window.electronAPI!.openExternal(`https://chromewebstore.google.com/detail/${ext.chromeStoreId}`);
                    }}>Open in Store</button>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted">Download unpacked CRX, then import via Broearn path or custom folder.</p>
          </Section>
          <ul className="ext-list">
            {extensions.map((ext) => (
              <li key={ext.id}>
                <strong>{ext.name}</strong>
                <small>{ext.path}</small>
                <button className="danger" onClick={async () => {
                  await window.electronAPI!.removeExtension(ext.id); await refresh();
                }}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'automation' && (
        <div className="panel">
          <h2>RPA Scripts & API</h2>
          <p className="muted">Record actions in a launched profile, replay with human-like input.</p>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Steps</th><th>Profile</th><th>Duration</th><th></th></tr></thead>
            <tbody>
              {rpaScripts.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.actions.length}</td>
                  <td>{s.profileId?.slice(0, 8) ?? 'any'}</td>
                  <td>{s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : '—'}</td>
                  <td>
                    <button className="danger" onClick={async () => {
                      await window.electronAPI!.deleteRpaScript(s.id);
                      await refresh();
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <pre className="api-docs">{`Authorization: Bearer cab_...  (required when API keys exist)
GET  /profiles  POST /profiles  PUT /profiles/:id  DELETE /profiles/:id
GET  /proxies   POST /proxies   DELETE /proxies/:id
POST /sync/run
GET  /rpa/scripts?profileId=...
POST /profiles/:id/rpa/record-start
POST /profiles/:id/rpa/record-stop  {"name":"My flow"}
POST /profiles/:id/rpa/replay       {"scriptId":"..."}
POST /profiles/:id/validate       {"external":true}`}</pre>
        </div>
      )}

      {tab === 'settings' && (
        <div className="panel">
          <h2>Settings & Team Sharing</h2>
          <Section title="Patched Chromium (TLS/JA3)">
            <Row label="Status" value={chromiumStatus?.tlsReady ? 'Patched — TLS ready' : 'Stock Chrome — TLS leak risk'} />
            <Row label="Source" value={chromiumStatus?.source ?? 'none'} />
            <Row label="Version" value={chromiumStatus?.version ?? '—'} mono />
            <div className="sidebar-actions">
              <button
                disabled={installingChromium}
                onClick={async () => {
                  setInstallingChromium(true);
                  showMsg('Installing patched Chromium...');
                  const r = await window.electronAPI!.installPatchedChromium();
                  setInstallingChromium(false);
                  await refresh();
                  showMsg(r.success ? 'Patched Chromium installed' : r.error ?? 'Install failed');
                }}
              >
                {installingChromium ? 'Installing...' : 'Install Patched Chromium'}
              </button>
            </div>
            <p className="muted">Uses fingerprint-chromium or copies Broearn kernel. Required for TLS/JA3 spoofing.</p>
          </Section>
          <Section title="App & Updates">
            <Row label="Version" value={appPaths?.version ?? '0.3.0'} />
            <Row label="Build" value={appPaths?.isPackaged ? (appPaths.bundledChromium ? 'Installed + bundled Chromium' : 'Installed (production)') : 'Development'} />
            <Row label="Update status" value={updateState?.status ?? 'idle'} />
            {updateState?.latestVersion && updateState.status === 'available' && (
              <Row label="Available" value={`v${updateState.latestVersion}`} />
            )}
            {updateState?.status === 'downloading' && updateState.progress !== undefined && (
              <Row label="Download" value={`${Math.round(updateState.progress)}%`} />
            )}
            {updateState?.error && <p className="muted error-text">{updateState.error}</p>}
            <div className="sidebar-actions">
              <button className="secondary" onClick={async () => {
                const s = await window.electronAPI!.checkForUpdates();
                setUpdateState(s);
                showMsg(s.status === 'not-available' ? 'You are on the latest version' : `Update: ${s.status}`);
              }}>Check for Updates</button>
              {updateState?.status === 'available' && (
                <button onClick={async () => {
                  const s = await window.electronAPI!.downloadUpdate();
                  setUpdateState(s);
                  showMsg('Downloading update...');
                }}>Download Update</button>
              )}
              {updateState?.status === 'downloaded' && (
                <button className="primary" onClick={() => window.electronAPI!.installUpdate()}>
                  Restart & Install
                </button>
              )}
            </div>
            <p className="muted">Auto-update checks on launch. Host releases at UPDATE_BASE_URL with latest.yml.</p>
          </Section>
          <Section title="Google Drive">
            <button className="secondary" onClick={async () => {
              const { url, error } = await window.electronAPI!.getSyncAuthUrl();
              if (error) showMsg(error); else if (url) await window.electronAPI!.openExternal(url);
            }}>Connect Drive</button>
            <input placeholder="OAuth code" value={authCode} onChange={(e) => setAuthCode(e.target.value)} />
            <button onClick={async () => {
              await window.electronAPI!.authenticateSync(authCode); setAuthCode(''); await refresh();
            }}>Authorize</button>
          </Section>
          <Section title="Encryption">
            <input type="password" placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            <button onClick={async () => {
              await window.electronAPI!.setSyncPassphrase(passphrase); setPassphrase(''); await refresh();
            }}>Set Passphrase</button>
            <button className="secondary" onClick={async () => {
              await window.electronAPI!.unlockSync(passphrase); setPassphrase(''); await refresh();
            }}>Unlock</button>
          </Section>
          <Section title="Team RBAC">
            <Row label="You" value={teamState?.currentUserEmail ?? 'Connect Google Drive'} />
            <Row label="Role" value={teamState?.currentRole ?? 'owner (local)'} />
            <div className="create-row">
              <input placeholder="Member email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
              <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value as TeamRole)}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button onClick={async () => {
                if (!newMemberEmail.trim()) return;
                try {
                  await window.electronAPI!.addTeamMember(newMemberEmail.trim(), newMemberRole);
                  setNewMemberEmail('');
                  await refresh();
                  showMsg('Member added');
                } catch (e) {
                  showMsg(e instanceof Error ? e.message : 'Failed');
                }
              }}>Add</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Email</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {(teamState?.members ?? []).map((m) => (
                  <tr key={m.email}>
                    <td>{m.email}</td>
                    <td>
                      <select value={m.role} onChange={async (e) => {
                        await window.electronAPI!.updateTeamRole(m.email, e.target.value as TeamRole);
                        await refresh();
                      }}>
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td>
                      {m.role !== 'owner' && (
                        <button className="danger" onClick={async () => {
                          await window.electronAPI!.removeTeamMember(m.email);
                          await refresh();
                        }}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Roles: Owner (all) · Admin (no team mgmt) · Member (create/launch) · Viewer (launch only)</p>
          </Section>
          <Section title="Team Shared Folder">
            <p className="muted">Create a folder in Google Drive, share with team, paste folder ID below</p>
            <input placeholder="Google Drive folder ID" value={teamFolderId} onChange={(e) => setTeamFolderId(e.target.value)} className="full-width" />
            <button onClick={handleSetTeamFolder}>Set Team Folder</button>
            <label className="toggle-label">
              <input type="checkbox" checked={syncState?.useTeamFolder ?? false} onChange={async (e) => {
                await window.electronAPI!.setUseTeamFolder(e.target.checked); await refresh();
              }} />
              Sync to team folder (instead of personal)
            </label>
            {syncState?.teamFolderId && <Row label="Team folder" value={syncState.teamFolderId} mono />}
          </Section>
          <Section title="Webhooks">
            <p className="muted">POST JSON to your URL on profile/sync events. Optional HMAC via X-CAB-Signature header.</p>
            <div className="create-row">
              <input placeholder="https://your-server.com/webhook" value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} className="full-width" />
              <input type="password" placeholder="Secret (optional)" value={newWebhookSecret} onChange={(e) => setNewWebhookSecret(e.target.value)} />
            </div>
            <div className="webhook-events">
              {(['profile.closed', 'profile.launched', 'profile.created', 'sync.completed'] as const).map((ev) => (
                <label key={ev} className="ext-check">
                  <input
                    type="checkbox"
                    checked={webhookEvents.has(ev)}
                    onChange={() => {
                      setWebhookEvents((prev) => {
                        const next = new Set(prev);
                        if (next.has(ev)) next.delete(ev);
                        else next.add(ev);
                        return next;
                      });
                    }}
                  />
                  {ev}
                </label>
              ))}
            </div>
            <button onClick={async () => {
              if (!newWebhookUrl.trim() || webhookEvents.size === 0) { showMsg('URL and at least one event required'); return; }
              await window.electronAPI!.createWebhook(newWebhookUrl.trim(), [...webhookEvents], newWebhookSecret || undefined);
              setNewWebhookUrl(''); setNewWebhookSecret('');
              await refresh(); showMsg('Webhook registered');
            }}>Add webhook</button>
            <table className="data-table">
              <thead><tr><th>URL</th><th>Events</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="mono" title={w.url}>{w.url.slice(0, 40)}{w.url.length > 40 ? '…' : ''}</td>
                    <td>{w.events.join(', ')}</td>
                    <td className={w.lastStatus === 'ok' ? 'online' : w.lastStatus === 'error' ? 'offline' : ''}>{w.lastStatus ?? '—'}</td>
                    <td>
                      <button className="secondary" onClick={async () => {
                        const r = await window.electronAPI!.testWebhook(w.id);
                        showMsg(r.success ? `Test OK (${r.statusCode})` : r.error ?? 'Test failed');
                        await refresh();
                      }}>Test</button>
                      <button className="danger" onClick={async () => {
                        await window.electronAPI!.deleteWebhook(w.id); await refresh();
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="API Keys">
            <div className="create-row">
              <input placeholder="Key name" value={newApiKeyName} onChange={(e) => setNewApiKeyName(e.target.value)} />
              <button onClick={async () => {
                if (!newApiKeyName.trim()) return;
                const r = await window.electronAPI!.createApiKey(newApiKeyName.trim());
                setNewApiKeyName('');
                await refresh();
                navigator.clipboard.writeText(r.rawKey);
                showMsg(`Key created — copied to clipboard (${r.entry.prefix}...)`);
              }}>Create key</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Prefix</th><th></th></tr></thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="mono">{k.prefix}...</td>
                    <td><button className="danger" onClick={async () => {
                      await window.electronAPI!.revokeApiKey(k.id); await refresh();
                    }}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Audit log">
            <table className="data-table">
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>
                {auditEntries.slice(0, 20).map((e, i) => (
                  <tr key={i}>
                    <td>{new Date(e.timestamp).toLocaleString()}</td>
                    <td>{e.actorEmail}</td>
                    <td>{e.action}</td>
                    <td>{e.target ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Automation API">
            <Row label="URL" value={appPaths?.automationUrl ?? 'http://127.0.0.1:9321'} mono />
            <Row label="Status" value={automation?.running ? 'Running' : 'Stopped'} />
            <Row label="Active browsers" value={String(automation?.activeBrowsers.length ?? 0)} />
            <pre className="api-docs">{`Authorization: Bearer cab_...
GET  /health
GET  /profiles  POST /profiles  PUT /profiles/:id  DELETE /profiles/:id
GET  /proxies   POST /proxies   DELETE /proxies/:id
POST /sync/run
GET  /webhooks  POST /webhooks  DELETE /webhooks/:id  POST /webhooks/:id/test
GET  /warmup/presets
POST /profiles/:id/launch
POST /profiles/:id/warmup  {"presetId":"google-news"}
GET  /profiles/:id/cdp
POST /bulk-launch  {"profileIds":["..."]}`}</pre>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="section"><h3>{title}</h3>{children}</section>;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span className={mono ? 'mono' : ''} title={value}>{value}</span>
    </div>
  );
}
