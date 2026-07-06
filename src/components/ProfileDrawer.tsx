import { useState } from 'react';
import type { BrowserProfile } from '../types/profile';
import type { SavedProxy, ExtensionEntry } from '../types/phase4';
import {
  IconPlay, IconStop, IconClose, IconShield, DeviceIcon,
  IconDownload, IconUpload, IconTrash, IconGlobe,
} from './Icons';
import { profileProxyDisplay } from '../utils/format';
import { assessFingerprintHealth } from '../utils/fp-health';
import { ProxyDisplayCell } from './ProxyDisplayCell';
import { FingerprintBar } from './FingerprintBar';

type DrawerTab = 'overview' | 'edit' | 'proxy' | 'extensions' | 'fingerprint' | 'cookies';

interface ProfileDrawerProps {
  profile: BrowserProfile;
  proxies: SavedProxy[];
  extensions: ExtensionEntry[];
  browserReady: boolean;
  editRemark: string;
  editGroup: string;
  editColor: string;
  groups: string[];
  isRunning: boolean;
  onClose: () => void;
  onLaunch: () => void;
  onSaveMeta: () => void;
  onApplyProxy: (proxyId: string) => void;
  onAssignExt: (extId: string) => void;
  onDelete: () => void;
  setEditRemark: (v: string) => void;
  setEditGroup: (v: string) => void;
  setEditColor: (v: string) => void;
  onExportCookies: () => void;
  onImportCookies: () => void;
  onCheckFingerprint: () => void;
  onApplyInlineProxy: (paste: string, type: 'http' | 'socks5') => Promise<void>;
  showMsg: (text: string) => void;
}

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'edit', label: 'Edit' },
  { id: 'proxy', label: 'Proxy' },
  { id: 'extensions', label: 'Extensions' },
  { id: 'fingerprint', label: 'Fingerprint' },
  { id: 'cookies', label: 'Cookies' },
];

export function ProfileDrawer(props: ProfileDrawerProps) {
  const { profile: p } = props;
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [checkingIp, setCheckingIp] = useState(false);
  const [showProxyEdit, setShowProxyEdit] = useState(false);
  const [proxyPaste, setProxyPaste] = useState('');
  const [proxyType, setProxyType] = useState<'http' | 'socks5'>(
    p.proxy.type?.toLowerCase().includes('socks') ? 'socks5' : 'http',
  );
  const [applyingProxy, setApplyingProxy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState('');

  const proxyDisplay = profileProxyDisplay(p);
  const health = assessFingerprintHealth(p);

  const formatDate = (ts?: number) => {
    if (!ts) return '—';
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { year: '2-digit', month: '2-digit', day: '2-digit' });
  };

  const handleSave = async () => {
    setSaving(true);
    try { await props.onSaveMeta(); }
    finally { setSaving(false); }
  };

  const handleApplyProxy = async () => {
    setApplyingProxy(true);
    try {
      await props.onApplyInlineProxy(proxyPaste, proxyType);
      setProxyPaste('');
      setShowProxyEdit(false);
    } finally {
      setApplyingProxy(false);
    }
  };

  const osLabel = `${p.fingerprint.device} · ${p.fingerprint.formFactor}`;

  return (
    <>
      <div className="drawer-backdrop" onClick={props.onClose} />
      <aside className="drawer" role="dialog" aria-label={`Profile: ${p.name}`}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-block">
            <span className="profile-avatar lg" style={{ background: props.editColor }}>
              <DeviceIcon device={p.fingerprint.device} formFactor={p.fingerprint.formFactor} size={16} />
              {props.isRunning
                ? <span className="running-dot" />
                : <span className={`fp-dot ${health.level}`} />
              }
            </span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{p.name}</h2>
              <p className="drawer-sub">{osLabel}{props.isRunning ? ' · Running' : ''}</p>
            </div>
          </div>
          <button className="icon-btn" onClick={props.onClose} aria-label="Close drawer">
            <IconClose size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`drawer-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Launch button always visible */}
          <button
            className={`drawer-launch-btn ${props.isRunning ? 'stop' : 'idle'}`}
            onClick={props.onLaunch}
          >
            {props.isRunning
              ? <><IconStop size={14} /> Stop profile</>
              : <><IconPlay size={14} /> Start profile</>
            }
          </button>

          {/* ── Overview Tab ── */}
          {activeTab === 'overview' && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Browser info</div>
                <div className="info-grid">
                  <div className="info-row"><span>OS</span><span>{p.fingerprint.device}</span></div>
                  <div className="info-row"><span>Platform</span><span>{p.fingerprint.formFactor}</span></div>
                  <div className="info-row"><span>User Agent</span><span title={p.fingerprint.userAgent}>{p.fingerprint.userAgent.slice(0, 40)}…</span></div>
                  <div className="info-row"><span>Browser</span><span>{p.fingerprint.browserVersion}</span></div>
                  <div className="info-row"><span>Timezone</span><span>{p.fingerprint.timeZone}</span></div>
                  <div className="info-row"><span>Language</span><span>{p.fingerprint.screenLang}</span></div>
                  <div className="info-row"><span>Screen</span><span>{p.fingerprint.windowWidth}×{p.fingerprint.windowHeight}</span></div>
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Proxy</div>
                <ProxyDisplayCell display={proxyDisplay} />
                {p.proxy.country && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    📍 {[p.proxy.country, p.proxy.city].filter(Boolean).join(', ')}
                    {p.proxy.timezone && ` · ${p.proxy.timezone}`}
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Activity</div>
                <div className="info-grid">
                  <div className="info-row"><span>Created</span><span>{formatDate(p.createTime)}</span></div>
                  <div className="info-row"><span>Last opened</span><span>{formatDate(p.lastOpened)}</span></div>
                  <div className="info-row"><span>Last synced</span><span>{formatDate(p.lastSynced)}</span></div>
                  <div className="info-row"><span>Extensions</span><span>{p.extensions.length}</span></div>
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Quick actions</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="ghost sm" onClick={props.onCheckFingerprint}>
                    <IconShield size={13} /> Check fingerprint
                  </button>
                  <button className="ghost sm" onClick={() => { setActiveTab('proxy'); }}>
                    <IconGlobe size={13} /> Change proxy
                  </button>
                  <button className="ghost sm" onClick={props.onExportCookies}>
                    <IconDownload size={13} /> Export cookies
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Edit Tab ── */}
          {activeTab === 'edit' && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Profile details</div>
                <div className="field">
                  <label>Notes</label>
                  <textarea
                    className="textarea"
                    placeholder="Account info, purpose, credentials hint…"
                    value={props.editRemark}
                    onChange={(e) => props.setEditRemark(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="field-row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>Group</label>
                    <select
                      value={props.editGroup}
                      onChange={(e) => props.setEditGroup(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">— Ungrouped —</option>
                      {props.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="field field-color" style={{ width: 80 }}>
                    <label>Color</label>
                    <input
                      type="color"
                      value={props.editColor}
                      onChange={(e) => props.setEditColor(e.target.value)}
                    />
                  </div>
                </div>
                {newGroupInput !== '' && (
                  <div className="field">
                    <label>New group name</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        value={newGroupInput}
                        onChange={(e) => setNewGroupInput(e.target.value)}
                        placeholder="Group name"
                        style={{ flex: 1 }}
                      />
                      <button className="ghost sm" onClick={() => { props.setEditGroup(newGroupInput); setNewGroupInput(''); }}>OK</button>
                    </div>
                  </div>
                )}
                <button
                  className="link-btn"
                  onClick={() => setNewGroupInput(newGroupInput === '' ? 'New group' : '')}
                  style={{ fontSize: 12, marginBottom: '0.5rem' }}
                >
                  + Create new group
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  style={{ flex: 1, background: 'var(--brand-gradient)', color: '#fff' }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>

              <div className="drawer-section" style={{ marginTop: '1.25rem' }}>
                <div className="drawer-section-title">Danger zone</div>
                <div className="danger-zone">
                  <button className="btn-danger-ghost w-full" onClick={props.onDelete} style={{ width: '100%' }}>
                    <IconTrash size={14} /> Move to trash
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Proxy Tab ── */}
          {activeTab === 'proxy' && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Current proxy</div>
                <ProxyDisplayCell display={proxyDisplay} />
                {p.proxy.host && (
                  <div style={{ marginTop: '0.5rem', fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.proxy.type?.toUpperCase().includes('SOCKS') ? 'SOCKS5' : 'HTTP'} · {p.proxy.host}:{p.proxy.port}
                  </div>
                )}
              </div>

              {/* Assign saved proxy */}
              {props.proxies.length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">Assign saved proxy</div>
                  <div className="proxy-assign-row">
                    <select
                      id="proxy-assign-select"
                      defaultValue=""
                      onChange={(e) => e.target.value && props.onApplyProxy(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">— Select proxy —</option>
                      {props.proxies.map((px) => (
                        <option key={px.id} value={px.id}>{px.name} · {px.proxy.host}:{px.proxy.port}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Manual proxy */}
              <div className="drawer-section">
                <div className="drawer-section-title">Set custom proxy</div>
                <button className="link-btn" onClick={() => setShowProxyEdit(!showProxyEdit)}>
                  {showProxyEdit ? 'Hide proxy form' : 'Enter proxy manually'}
                </button>
                {showProxyEdit && (
                  <div className="proxy-edit-inline">
                    <select
                      value={proxyType}
                      onChange={(e) => setProxyType(e.target.value as 'http' | 'socks5')}
                    >
                      <option value="http">HTTP/HTTPS</option>
                      <option value="socks5">SOCKS5</option>
                    </select>
                    <input
                      placeholder="host:port  or  host:port:user:pass"
                      value={proxyPaste}
                      onChange={(e) => setProxyPaste(e.target.value)}
                    />
                    <div className="proxy-edit-inline-actions">
                      <button
                        disabled={applyingProxy}
                        onClick={handleApplyProxy}
                        style={{ background: 'var(--brand-gradient)', color: '#fff' }}
                      >
                        {applyingProxy ? 'Applying…' : 'Apply proxy'}
                      </button>
                      {p.proxy.host && (
                        <button
                          className="ghost"
                          disabled={applyingProxy}
                          onClick={async () => {
                            await props.onApplyInlineProxy('', proxyType);
                            setShowProxyEdit(false);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* IP check */}
              {p.proxy.host && (
                <div className="drawer-section">
                  <div className="drawer-section-title">IP verification</div>
                  <button
                    className="ghost"
                    style={{ gap: '0.4rem' }}
                    disabled={checkingIp}
                    onClick={async () => {
                      if (!window.electronAPI) return;
                      setCheckingIp(true);
                      try {
                        const px = props.proxies.find((px) => px.proxy.host === p.proxy.host && px.proxy.port === p.proxy.port);
                        if (px) {
                          const r = await window.electronAPI.checkProxy(px.id);
                          props.showMsg(r.online ? `IP: ${r.exitIp ?? 'OK'} · ${r.latencyMs}ms` : r.error ?? 'Check failed');
                        }
                      } finally {
                        setCheckingIp(false);
                      }
                    }}
                  >
                    <IconGlobe size={13} />
                    {checkingIp ? 'Checking…' : 'Check exit IP'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Extensions Tab ── */}
          {activeTab === 'extensions' && (
            <div className="drawer-section">
              <div className="drawer-section-title">
                Assign extensions ({props.extensions.length} available)
              </div>
              {props.extensions.length === 0 ? (
                <p className="hint" style={{ marginTop: '0.5rem' }}>
                  No extensions installed. Go to the Extensions tab to add some.
                </p>
              ) : (
                <div className="ext-check-list">
                  {props.extensions.map((ext) => (
                    <label key={ext.id} className="ext-check">
                      <input
                        type="checkbox"
                        checked={p.extensions.includes(ext.id)}
                        onChange={() => props.onAssignExt(ext.id)}
                      />
                      <span>{ext.name}</span>
                      {ext.version && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{ext.version}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Fingerprint Tab ── */}
          {activeTab === 'fingerprint' && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Health score</div>
                <FingerprintBar
                  score={health.score}
                  level={health.level}
                  issues={health.issues?.map((i) => ({ severity: i.severity as 'error' | 'warn', text: i.message }))}
                />
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="ghost sm" onClick={props.onCheckFingerprint}>
                    <IconShield size={13} /> Live check on BrowserScan
                  </button>
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Fingerprint details</div>
                <div className="info-grid">
                  <div className="info-row"><span>Canvas</span><span>{p.fingerprint.canvas === '2' ? 'Noise' : p.fingerprint.canvas === '3' ? 'Blocked' : 'Real'}</span></div>
                  <div className="info-row"><span>WebGL</span><span>{p.fingerprint.webGlImage === '2' ? 'Noise' : p.fingerprint.webGlImage === '3' ? 'Blocked' : 'Real'}</span></div>
                  <div className="info-row"><span>AudioContext</span><span>{p.fingerprint.audioContext === '2' ? 'Noise' : p.fingerprint.audioContext === '3' ? 'Blocked' : 'Real'}</span></div>
                  <div className="info-row"><span>WebRTC</span><span>{p.fingerprint.webRTC === '3' ? 'Disabled' : p.fingerprint.webRTC === '2' ? 'Proxy IP' : 'Real'}</span></div>
                  <div className="info-row"><span>Fonts</span><span>{p.fingerprint.fontEnable === '2' ? 'Noise' : p.fingerprint.fontEnable === '3' ? 'Blocked' : 'Real'}</span></div>
                  <div className="info-row"><span>Media devices</span><span>{p.fingerprint.mediaDevices === '2' ? 'Noise' : p.fingerprint.mediaDevices === '3' ? 'Blocked' : 'Real'}</span></div>
                </div>
              </div>
            </>
          )}

          {/* ── Cookies Tab ── */}
          {activeTab === 'cookies' && (
            <div className="drawer-section">
              <div className="drawer-section-title">Cookie management</div>
              <p className="hint" style={{ marginBottom: '0.85rem' }}>
                Export/import cookies for this profile. The profile must be opened at least once for cookies to be available.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  className="ghost"
                  style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                  onClick={props.onExportCookies}
                >
                  <IconDownload size={14} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Export cookies</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>Save cookies as JSON file</div>
                  </div>
                </button>
                <button
                  className="ghost"
                  style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                  onClick={props.onImportCookies}
                >
                  <IconUpload size={14} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Import cookies</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>Load cookies from JSON file</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
