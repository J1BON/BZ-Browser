import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BrowserProfile, SyncState, SyncConflict } from './types/profile';
import type { SavedProxy, ExtensionEntry, AutomationStatus, UpdateState } from './types/phase4';
import { ProfileDrawer } from './components/ProfileDrawer';
import { parseProxyPaste } from './utils/proxy-parse';
import { DEFAULT_STARTUP_URL } from './constants/startup';
import { CreateProfileView, type CreateProfileForm } from './components/CreateProfileView';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { ProxyDisplayCell } from './components/ProxyDisplayCell';
import { GroupsPanel } from './components/GroupsPanel';
import { ProxyModal } from './components/ProxyModal';
import { RowMenu } from './components/RowMenu';
import {
  DeviceIcon,
  IconPlay, IconStop, IconSearch, IconPlus, IconRefresh,
  IconProfiles, IconProxy, IconGroups, IconExtension, IconSettings, IconTrash,
  IconEdit, IconCopy, IconCloud, IconShield, IconChevronDown, IconBell,
  IconChrome, IconFirefox, IconRisk,
} from './components/Icons';
import { profileProxyDisplay, savedProxyDisplay, truncate, deviceLabel } from './utils/format';
import { formatLaunchError } from './utils/launch-error';
import { assessFingerprintHealth } from './utils/fp-health';
import { resolveOsConfig } from './utils/os-templates';

type Tab = 'profiles' | 'proxies' | 'groups' | 'extensions' | 'settings';
const PAGE_SIZE = 15;
const CUSTOM_GROUPS_KEY = 'bz.customGroups';
const FINGERPRINT_CHECK_URL = 'https://www.browserscan.net/';

function loadCustomGroups(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('profiles');
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [proxies, setProxies] = useState<SavedProxy[]>([]);
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [customGroups, setCustomGroups] = useState<string[]>(loadCustomGroups);
  const [selected, setSelected] = useState<BrowserProfile | null>(null);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [automation, setAutomation] = useState<AutomationStatus | null>(null);
  const [appPaths, setAppPaths] = useState<{ automationUrl: string; version?: string; isPackaged?: boolean; bundledChromium?: boolean } | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [teamFolderId, setTeamFolderId] = useState('');
  const [conflicts] = useState<SyncConflict[]>([]);
  const [editGroup, setEditGroup] = useState('');
  const [chromiumStatus, setChromiumStatus] = useState<{ isPatched: boolean; tlsReady: boolean; version: string | null; source: string | null } | null>(null);
  const [installingChromium, setInstallingChromium] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string; category: string }[]>([]);
  const [trash, setTrash] = useState<BrowserProfile[]>([]);
  const [editRemark, setEditRemark] = useState('');
  const [editColor, setEditColor] = useState('#4f8ef7');
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [marketplace, setMarketplace] = useState<{ id: string; name: string; description: string; category: string; chromeStoreId?: string }[]>([]);
  const [webhooks, setWebhooks] = useState<{ id: string; url: string; events: string[]; enabled: boolean; lastStatus?: string }[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsAdvanced, setSettingsAdvanced] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [proxyModal, setProxyModal] = useState<{ open: boolean; editing: SavedProxy | null }>({ open: false, editing: null });
  const [busy, setBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const [list, proxyList, extList, groupList, sync, auto, paths, chromeStatus, tpl, trashList, mkt, hooks] = await Promise.all([
        window.electronAPI.listProfiles(),
        window.electronAPI.listProxies(),
        window.electronAPI.listExtensions(),
        window.electronAPI.getGroups(),
        window.electronAPI.getSyncStatus(),
        window.electronAPI.getAutomationStatus(),
        window.electronAPI.getAppPaths(),
        window.electronAPI.getChromiumStatus(),
        window.electronAPI.listTemplates(),
        window.electronAPI.listTrash(),
        window.electronAPI.listExtensionMarketplace(),
        window.electronAPI.listWebhooks(),
      ]);
      setProfiles(list);
      setProxies(proxyList);
      setExtensions(extList);
      setGroups(groupList);
      setSyncState(sync);
      setAutomation(auto);
      setAppPaths(paths);
      setChromiumStatus(chromeStatus);
      setTemplates(tpl);
      setTrash(trashList);
      setMarketplace(mkt);
      setWebhooks(hooks);
      const runningChecks = await Promise.all(list.map((p) => window.electronAPI!.isBrowserRunning(p.id)));
      setRunningIds(new Set(list.filter((_, i) => runningChecks[i]).map((p) => p.id)));
      const upd = await window.electronAPI.getUpdateState();
      setUpdateState(upd);
    } catch (err) {
      console.error('refresh failed:', err);
      setMessage('Could not load data — check connection and retry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onUpdateStatus(setUpdateState);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!window.electronAPI || tab !== 'profiles') return;
    const id = setInterval(() => { refresh(); }, 5000);
    return () => clearInterval(id);
  }, [tab, refresh]);

  useEffect(() => {
    if (selected) {
      setEditGroup(selected.group ?? '');
      setEditRemark(selected.remark ?? '');
      setEditColor(selected.color ?? '#4f8ef7');
    }
  }, [selected]);

  useEffect(() => {
    try { localStorage.setItem(CUSTOM_GROUPS_KEY, JSON.stringify(customGroups)); } catch { /* ignore */ }
  }, [customGroups]);

  const allGroups = useMemo(() => {
    const set = new Set<string>([...groups, ...customGroups]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [groups, customGroups]);

  const filteredProfiles = useMemo(() => {
    let list = profiles;
    if (filterGroup) list = list.filter((p) => (filterGroup === '__ungrouped__' ? !p.group : p.group === filterGroup));
    if (filterStatus === 'running') list = list.filter((p) => runningIds.has(p.id));
    if (filterStatus === 'stopped') list = list.filter((p) => !runningIds.has(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.group?.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        (p.remark?.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [profiles, filterGroup, filterStatus, searchQuery, runningIds]);

  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProfiles = useMemo(
    () => filteredProfiles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredProfiles, currentPage],
  );
  useEffect(() => { setPage(1); }, [filterGroup, filterStatus, searchQuery]);

  // ── Messaging ─────────────────────────────────────────────────────
  const showMsg = (text: string) => {
    setMessage(formatLaunchError(text));
    setTimeout(() => setMessage(''), 5500);
  };

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSaveMeta = async () => {
    if (!window.electronAPI || !selected) return;
    await window.electronAPI.updateProfileMeta(selected.id, {
      group: editGroup || '',
      remark: editRemark || undefined,
      color: editColor,
    });
    await refresh();
    showMsg('Profile saved');
  };

  const handleApplyProxy = async (proxyId: string) => {
    if (!window.electronAPI || !selected) return;
    await window.electronAPI.applyProxyToProfile(selected.id, proxyId);
    await refresh();
    showMsg('Proxy applied');
  };

  const handleAssignExt = async (extId: string) => {
    if (!window.electronAPI || !selected) return;
    const current = new Set(selected.extensions);
    if (current.has(extId)) current.delete(extId); else current.add(extId);
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

  const ensureBrowserReady = async (): Promise<boolean> => {
    if (chromiumStatus?.tlsReady) return true;
    const install = confirm('BZ Browser needs a one-time setup (~200MB) before opening profiles.\n\nInstall now?');
    if (!install) { showMsg('Complete setup in Settings first'); return false; }
    setInstallingChromium(true);
    showMsg('Setting up browser…');
    const inst = await window.electronAPI!.installPatchedChromium();
    setInstallingChromium(false);
    await refresh();
    if (!inst.success) { showMsg(inst.error ?? 'Setup failed — try Settings'); return false; }
    return true;
  };

  const launchProfile = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (runningIds.has(id)) {
      await window.electronAPI!.closeBrowser(id);
      await refresh();
      showMsg(`Closed ${profile?.name ?? 'profile'}`);
      return;
    }
    if (!(await ensureBrowserReady())) return;
    const r = await window.electronAPI!.launchBrowser(id);
    showMsg(r.success ? `Opening ${profile?.name ?? 'profile'}…` : r.error ?? 'Could not open profile');
    await refresh();
  };

  const checkFingerprint = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!(await ensureBrowserReady())) return;
    showMsg(`Running fingerprint check for ${profile?.name ?? 'profile'}…`);
    const r = await window.electronAPI!.openProfileUrl(id, FINGERPRINT_CHECK_URL);
    if (!r.success) showMsg(r.error ?? 'Could not run fingerprint check');
    await refresh();
  };

  const applyInlineProxy = async (id: string, paste: string, type: 'http' | 'socks5') => {
    if (!paste) {
      await window.electronAPI!.setInlineProxy(id, null);
      await refresh();
      showMsg('Proxy removed');
      return;
    }
    const parsed = parseProxyPaste(paste);
    if (!parsed) { showMsg('Could not read proxy — use host:port or host:port:user:pass'); return; }
    showMsg('Testing proxy…');
    const res = await window.electronAPI!.setInlineProxy(id, {
      host: parsed.host, port: parsed.port,
      account: parsed.account, password: parsed.password,
      type: parsed.type ?? type,
    });
    await refresh();
    const health = res && typeof res === 'object' && 'health' in res ? res.health : null;
    if (health?.online) {
      const loc = [health.country, health.city].filter(Boolean).join(' · ');
      showMsg(`Proxy set · ${health.exitIp ?? '—'}${loc ? ` · ${loc}` : ''}`);
    } else if (health) {
      showMsg(health.error ? `Proxy set but unreachable: ${health.error}` : 'Proxy set but exit IP unknown');
    } else {
      showMsg('Proxy saved');
    }
  };

  const handleBulkLaunch = async () => {
    if (selectedIds.size === 0) return;
    if (!(await ensureBrowserReady())) return;
    setBusy(true);
    try {
      const ids = [...selectedIds].filter((id) => !runningIds.has(id));
      const r = await window.electronAPI!.bulkLaunch(ids);
      showMsg(`Started ${r.launched.length} profile(s)${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
      await refresh();
    } finally { setBusy(false); }
  };

  const handleBulkClose = async () => {
    setBusy(true);
    try {
      for (const id of selectedIds) {
        if (runningIds.has(id)) await window.electronAPI!.closeBrowser(id);
      }
      await refresh();
      showMsg('Closed selected profiles');
    } finally { setBusy(false); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Move ${selectedIds.size} profile(s) to trash?`)) return;
    setBusy(true);
    try {
      for (const id of selectedIds) await window.electronAPI!.deleteProfile(id);
      setSelectedIds(new Set());
      await refresh();
      showMsg('Moved to trash');
    } finally { setBusy(false); }
  };

  const handleRenameGroup = async (from: string, to: string) => {
    for (const p of profiles.filter((p) => p.group === from)) {
      await window.electronAPI!.updateProfileMeta(p.id, { group: to });
    }
    setCustomGroups((g) => g.map((x) => (x === from ? to : x)).filter((x, i, arr) => arr.indexOf(x) === i));
    await refresh();
  };

  const handleDeleteGroup = async (name: string) => {
    for (const p of profiles.filter((p) => p.group === name)) {
      await window.electronAPI!.updateProfileMeta(p.id, { group: '' });
    }
    setCustomGroups((g) => g.filter((x) => x !== name));
    if (filterGroup === name) setFilterGroup('');
    await refresh();
  };

  const handleCreateProfileFull = async (form: CreateProfileForm) => {
    const osConfig = resolveOsConfig(form.device || 'Windows');
    const templateId = form.templateId || osConfig.templateId;

    const deviceOptions: { formFactor: 'desktop' | 'mobile'; device?: string; resolution?: { width: number; height: number } } =
      osConfig.deviceType === 'mobile-ios'
        ? { formFactor: 'mobile', device: 'iOS' }
        : osConfig.deviceType === 'mobile-android'
          ? { formFactor: 'mobile', device: 'Android' }
          : { formFactor: 'desktop', device: osConfig.device };

    if (form.resolutionWidth && form.resolutionHeight) {
      deviceOptions.resolution = { width: form.resolutionWidth, height: form.resolutionHeight };
    }

    const openUrls = form.openUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (openUrls.length === 0) openUrls.push(DEFAULT_STARTUP_URL);
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);

    let proxyNew: { name: string; host: string; port: string; account?: string; password?: string; type?: string } | undefined;
    if (form.proxyMode === 'new' && form.proxyPaste.trim()) {
      const parsed = parseProxyPaste(form.proxyPaste);
      if (parsed.host && parsed.port) {
        proxyNew = { name: form.proxyName, host: parsed.host, port: parsed.port, account: parsed.account, password: parsed.password, type: parsed.type ?? form.proxyType };
      } else {
        showMsg('Could not read proxy — paste host:port, user:pass@host:port, or socks5://…');
        throw new Error('invalid-proxy');
      }
    }

    const count = Math.max(1, Math.min(50, Math.floor(Number(form.count) || 1)));
    await window.electronAPI!.createProfileFull({
      name: form.name.trim(),
      count,
      group: form.group || undefined,
      tags,
      remark: form.remark || undefined,
      color: form.color,
      templateId,
      browserEngine: form.browserEngine,
      deviceOptions,
      fingerprint: {
        canvas: form.canvas, webGlImage: form.webGlImage, audioContext: form.audioContext,
        fontEnable: form.fontEnable, mediaDevices: form.mediaDevices, webRTC: form.webRTC,
        hardwareAccelerate: form.hardwareAccelerate,
      },
      proxyMode: form.proxyMode,
      proxyId: form.proxyId || undefined,
      proxyNew,
      alignGeo: form.alignGeo,
      openUrls,
      extensionIds: form.extensionIds,
      headless: form.headless,
    });
    await refresh();
    showMsg(count > 1 ? `${count} profiles created` : `Profile "${form.name}" created`);
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '—';
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const openProfile = (p: BrowserProfile) => { setSelected(p); setDrawerOpen(true); };
  const closeDrawer = () => setDrawerOpen(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pageIds = pagedProfiles.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const linkedProfileCount = (px: SavedProxy) =>
    profiles.filter((p) => p.proxy.host && p.proxy.host === px.proxy.host && p.proxy.port === px.proxy.port).length;

  // ── Dev mode guard ────────────────────────────────────────────────
  if (!window.electronAPI) {
    return (
      <div className="shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: 32, fontWeight: 800, background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BZ Browser</div>
          <p>Run <code>npm run electron:dev</code> to start the app</p>
        </div>
      </div>
    );
  }

  // ── Navigation items ──────────────────────────────────────────────
  const navMain: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profiles',   label: 'Profiles',   icon: <IconProfiles size={17} /> },
    { id: 'proxies',    label: 'Proxies',    icon: <IconProxy size={17} /> },
    { id: 'groups',     label: 'Groups',     icon: <IconGroups size={17} /> },
  ];
  const navTools: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'extensions', label: 'Extensions', icon: <IconExtension size={17} /> },
    { id: 'settings',   label: 'Settings',   icon: <IconSettings size={17} /> },
  ];

  const renderNavItem = (item: { id: Tab; label: string; icon: React.ReactNode }) => (
    <button
      key={item.id}
      className={`nav-item${tab === item.id ? ' active' : ''}`}
      onClick={() => setTab(item.id)}
      title={item.label}
    >
      <span className="nav-icon">{item.icon}</span>
      {item.label}
    </button>
  );

  const tabTitle = { profiles: 'Profiles', proxies: 'Proxies', groups: 'Groups', extensions: 'Extensions', settings: 'Settings' }[tab];

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="nav-rail">
        <div className="brand">
          <div className="brand-logo-placeholder">BZ</div>
          <div className="brand-text">
            <strong>BZ Browser</strong>
            <small>v{appPaths?.version ?? '0.8.2'}</small>
          </div>
        </div>

        <nav className="nav-items">
          <button
            type="button"
            className="nav-new-profile"
            onClick={() => { setTab('profiles'); setShowCreateModal(true); }}
          >
            <IconPlus size={15} />
            New profile
          </button>
          {navMain.map(renderNavItem)}
          <div className="nav-section-label">Tools</div>
          {navTools.map(renderNavItem)}
        </nav>

        <div className="nav-footer">
          <div className="stats-card">
            <div className="stats-row">
              <span>Profiles</span>
              <strong>{profiles.length}</strong>
            </div>
            <div className="stats-row">
              <span>Running</span>
              <strong className="running-val">{runningIds.size}</strong>
            </div>
            <div className="stats-row">
              <span>Proxies</span>
              <strong>{proxies.length}</strong>
            </div>
          </div>
          <div className={`browser-status-pill ${chromiumStatus?.tlsReady ? 'ready' : 'warn'}`}>
            <span className={`pill-dot${chromiumStatus?.tlsReady ? ' pulse' : ''}`} />
            {chromiumStatus?.tlsReady ? 'Browser ready' : 'Setup needed'}
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="main-area">
        {/* ── Topbar (hidden on create flow — full-page MoreLogin layout) ── */}
        {!showCreateModal && (
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{tabTitle}</span>
            {tab === 'profiles' && (
              <span className="topbar-sub">{profiles.length} profiles · {runningIds.size} running</span>
            )}
          </div>
          <div className="topbar-right">
            {syncState?.connected && (
              <button
                className="ghost sm"
                style={{ gap: '0.4rem' }}
                onClick={() => window.electronAPI!.runSync().then(refresh)}
              >
                <IconCloud size={13} /> Sync
              </button>
            )}
            {updateState?.status === 'available' && (
              <button
                className="ghost sm"
                style={{ gap: '0.4rem', color: 'var(--orange)', borderColor: 'rgba(245,166,35,0.3)' }}
                onClick={() => setTab('settings')}
              >
                <IconBell size={13} /> Update
              </button>
            )}
          </div>
        </header>
        )}

        {/* ── Conflict banner ── */}
        {conflicts.length > 0 && tab === 'profiles' && (
          <div className="conflict-banner">
            {conflicts.map((c) => (
              <div key={c.profileId} className="conflict-row">
                <span>⚠ {c.profileName} sync conflict</span>
                <div className="row-actions">
                  <button className="ghost sm" onClick={() => window.electronAPI!.runSync({ [c.profileId]: 'keep-local' }).then(refresh)}>Keep local</button>
                  <button className="ghost sm" onClick={() => window.electronAPI!.runSync({ [c.profileId]: 'keep-remote' }).then(refresh)}>Keep remote</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Toast ── */}
        {message && <div className="toast" role="status">{message}</div>}

        {/* ── Content ── */}
        <div className="content">

          {/* ════ PROFILES TAB ════ */}
          {tab === 'profiles' && showCreateModal ? (
            <CreateProfileView
              templates={templates}
              proxies={proxies}
              extensions={extensions}
              groups={allGroups}
              onBack={() => setShowCreateModal(false)}
              onCreate={handleCreateProfileFull}
              profileCount={profiles.length}
            />
          ) : tab === 'profiles' && (
            <>
              {/* Setup banner */}
              {!chromiumStatus?.tlsReady && (
                <div className="setup-banner">
                  <div className="setup-banner-text">
                    <strong>One-time setup required</strong>
                    <p>Install the secure browser engine (~200MB) to open profiles.</p>
                  </div>
                  <button
                    disabled={installingChromium}
                    style={{ background: 'var(--brand-gradient)', color: '#fff', whiteSpace: 'nowrap' }}
                    onClick={async () => {
                      setInstallingChromium(true);
                      showMsg('Setting up browser…');
                      const r = await window.electronAPI!.installPatchedChromium();
                      setInstallingChromium(false);
                      await refresh();
                      showMsg(r.success ? 'Browser ready — create a profile!' : r.error ?? 'Setup failed');
                    }}
                  >
                    {installingChromium ? 'Setting up…' : 'Install now'}
                  </button>
                </div>
              )}

              {/* Toolbar */}
              <div className="toolbar">
                <div className="toolbar-left">
                  <div className="search-wrap">
                    <IconSearch size={14} />
                    <input
                      placeholder="Search profiles, tags, notes…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search profiles"
                    />
                  </div>
                  <select
                    className="filter-select"
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                    aria-label="Filter by group"
                  >
                    <option value="">All groups</option>
                    {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    <option value="__ungrouped__">Ungrouped</option>
                  </select>
                  <select
                    className="filter-select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="">All status</option>
                    <option value="running">Running</option>
                    <option value="stopped">Stopped</option>
                  </select>
                </div>
                <div className="toolbar-right">
                  <button className="icon-btn" onClick={() => refresh()} title="Refresh">
                    <IconRefresh size={14} />
                  </button>
                  <button
                    id="new-profile-btn"
                    className="new-profile-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <IconPlus size={14} /> New profile
                  </button>
                </div>
              </div>

              {/* Bulk bar */}
              {selectedIds.size > 0 && (
                <div className="bulk-bar">
                  <span className="bulk-count">{selectedIds.size} selected</span>
                  <div className="bulk-actions">
                    <button className="ghost sm" disabled={busy} onClick={handleBulkLaunch}>
                      <IconPlay size={11} /> Start
                    </button>
                    <button className="ghost sm" disabled={busy} onClick={handleBulkClose}>
                      <IconStop size={11} /> Stop
                    </button>
                    <button className="ghost sm" disabled={busy} onClick={handleBulkDelete} style={{ color: 'var(--red)' }}>
                      <IconTrash size={13} /> Delete
                    </button>
                    <button className="ghost sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
                  </div>
                </div>
              )}

              {/* Profile table */}
              <div className="table-wrap">
                {loading ? (
                  <div className="empty-table">
                    <span style={{ color: 'var(--text-muted)' }}>Loading profiles…</span>
                  </div>
                ) : filteredProfiles.length === 0 ? (
                  <div className="empty-hero">
                    <div className="empty-icon large">
                      <IconProfiles size={32} />
                    </div>
                    <h3>{searchQuery || filterGroup ? 'No matching profiles' : 'No profiles yet'}</h3>
                    <p>
                      {searchQuery || filterGroup
                        ? 'Try a different search or group filter.'
                        : 'Create an isolated browser profile with its own fingerprint, proxy, and identity.'}
                    </p>
                    {!searchQuery && !filterGroup && (
                      <button
                        style={{ background: 'var(--brand-gradient)', color: '#fff', marginTop: '0.5rem' }}
                        onClick={() => setShowCreateModal(true)}
                      >
                        <IconPlus size={14} /> Create first profile
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="profile-table" role="grid">
                    <thead>
                      <tr>
                        <th className="col-check">
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            onChange={toggleSelectAll}
                            aria-label="Select all on page"
                          />
                        </th>
                        <th className="col-no">#</th>
                        <th className="col-engine">Engine</th>
                        <th>Profile</th>
                        <th className="col-action">Action</th>
                        <th>Proxy / IP</th>
                        <th className="col-notes">Notes</th>
                        <th className="col-tags">Tags</th>
                        <th className="col-date">Last active</th>
                        <th className="col-menu" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedProfiles.map((p, idx) => {
                        const isRunning = runningIds.has(p.id);
                        const proxyDisplay = profileProxyDisplay(p);
                        const isChecked = selectedIds.has(p.id);
                        const health = assessFingerprintHealth(p);
                        return (
                          <tr
                            key={p.id}
                            className={`${isChecked ? 'selected' : ''} ${isRunning ? 'running' : ''}`}
                          >
                            <td className="col-check">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelect(p.id)}
                                aria-label={`Select ${p.name}`}
                              />
                            </td>
                            <td className="col-no">
                              <span className="profile-serial">
                                #{String((p as any).serialNumber ?? ((currentPage - 1) * PAGE_SIZE + idx + 1)).padStart(4, '0')}
                              </span>
                            </td>
                            <td className="col-engine">
                              <span className={`engine-badge ${(p as any).browserEngine === 'firefox' ? 'firefox' : 'chrome'}`}>
                                {(p as any).browserEngine === 'firefox' ? <><IconFirefox size={12} /> Firefox</> : <><IconChrome size={12} /> Chrome</>}
                              </span>
                            </td>
                            <td
                              className="col-profile"
                              onClick={() => openProfile(p)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && openProfile(p)}
                            >
                              <div className="profile-name-cell">
                                <span className="profile-avatar" style={{ background: p.color ?? '#4f8ef7' }}>
                                  <DeviceIcon device={p.fingerprint.device} formFactor={p.fingerprint.formFactor} size={14} />
                                  {isRunning
                                    ? <span className="running-dot" />
                                    : <span className={`fp-dot ${health.level}`} title={`FP health: ${health.score}%`} />
                                  }
                                </span>
                                <div className="profile-name-block">
                                  <div className="profile-name">{p.name}</div>
                                  <div className="profile-meta">
                                    <span className="os-chip">
                                      <DeviceIcon device={p.fingerprint.device} formFactor={p.fingerprint.formFactor} size={10} />
                                      {deviceLabel(p)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="col-action">
                              <button
                                className={`start-btn ${isRunning ? 'running-stop' : 'idle'}`}
                                onClick={() => launchProfile(p.id)}
                                id={`launch-btn-${p.id}`}
                              >
                                {isRunning ? <><IconStop size={10} /> Stop</> : <><IconPlay size={10} /> Start</>}
                              </button>
                            </td>
                            <td className="col-proxy" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <ProxyDisplayCell display={proxyDisplay} />
                              {p.proxy?.ip && (
                                <span className={`risk-badge ${
                                  (p.proxy as any).riskScore >= 65 ? 'high' :
                                  (p.proxy as any).riskScore >= 30 ? 'medium' : 'low'
                                }`} style={{ fontSize: 10, padding: '1px 5px' }}>
                                  <IconRisk size={10} /> {(p.proxy as any).riskScore}%
                                </span>
                              )}
                            </td>
                            <td className="col-notes muted" title={p.remark}>
                              {truncate(p.remark?.trim() || '—', 28)}
                            </td>
                            <td className="col-tags">
                              {p.tags.length
                                ? p.tags.slice(0, 2).map((t) => <span key={t} className="tag-chip">{t}</span>)
                                : <span className="muted">—</span>}
                              {p.tags.length > 2 && <span className="tag-chip more">+{p.tags.length - 2}</span>}
                            </td>
                            <td className="col-date muted">{formatDate(p.lastOpened)}</td>
                            <td className="col-menu">
                              <RowMenu
                                items={[
                                  { label: 'Edit profile', icon: <IconEdit size={13} />, onClick: () => openProfile(p) },
                                  { label: isRunning ? 'Stop' : 'Start', icon: isRunning ? <IconStop size={12} /> : <IconPlay size={12} />, onClick: () => launchProfile(p.id) },
                                  { label: 'Check fingerprint', icon: <IconShield size={13} />, onClick: () => checkFingerprint(p.id) },
                                  { label: 'Export cookies', icon: <IconCopy size={13} />, onClick: async () => {
                                    const r = await window.electronAPI!.exportCookies(p.id, 'json');
                                    if (!r.canceled) showMsg(r.count ? `Exported ${r.count} cookies` : 'Open the profile first');
                                  }},
                                  { label: 'Delete', icon: <IconTrash size={13} />, danger: true, onClick: async () => {
                                    if (!confirm(`Move "${p.name}" to trash?`)) return;
                                    await window.electronAPI!.deleteProfile(p.id);
                                    await refresh();
                                    showMsg('Moved to trash');
                                  }},
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {filteredProfiles.length > 0 && (
                <div className="table-footer">
                  <span className="footer-count">{filteredProfiles.length} profile{filteredProfiles.length !== 1 ? 's' : ''}</span>
                  <div className="pagination">
                    <button disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
                    <span className="page-indicator">{currentPage} / {totalPages}</span>
                    <button disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next →</button>
                  </div>
                </div>
              )}

              {/* Trash */}
              {trash.length > 0 && (
                <div className="trash-block">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <h4>Trash ({trash.length})</h4>
                    <button className="ghost sm" onClick={() => setTrashOpen(!trashOpen)}>
                      <IconChevronDown size={12} style={{ transform: trashOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      {trashOpen ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  {trashOpen && trash.slice(0, 10).map((p) => (
                    <div key={p.id} className="trash-row">
                      <span>{p.name}</span>
                      <button className="ghost sm" onClick={async () => {
                        await window.electronAPI!.restoreProfile(p.id); await refresh(); showMsg('Restored');
                      }}>Restore</button>
                      <button className="danger sm" onClick={async () => {
                        if (!confirm('Permanently delete?')) return;
                        await window.electronAPI!.purgeProfile(p.id); await refresh();
                      }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Profile drawer */}
              {drawerOpen && selected && (
                <ProfileDrawer
                  profile={selected}
                  proxies={proxies}
                  extensions={extensions}
                  browserReady={!!chromiumStatus?.tlsReady}
                  editRemark={editRemark}
                  editGroup={editGroup}
                  editColor={editColor}
                  groups={allGroups}
                  onClose={closeDrawer}
                  onLaunch={() => launchProfile(selected.id)}
                  onCheckFingerprint={() => checkFingerprint(selected.id)}
                  onApplyInlineProxy={(paste, type) => applyInlineProxy(selected.id, paste, type)}
                  isRunning={runningIds.has(selected.id)}
                  onSaveMeta={handleSaveMeta}
                  onApplyProxy={handleApplyProxy}
                  onAssignExt={handleAssignExt}
                  onDelete={async () => {
                    if (!confirm(`Move "${selected.name}" to trash?`)) return;
                    await window.electronAPI!.deleteProfile(selected.id);
                    closeDrawer();
                    setSelected(null);
                    await refresh();
                    showMsg('Moved to trash');
                  }}
                  setEditRemark={setEditRemark}
                  setEditGroup={setEditGroup}
                  setEditColor={setEditColor}
                  onExportCookies={async () => {
                    const r = await window.electronAPI!.exportCookies(selected.id, 'json');
                    if (r.canceled) return;
                    showMsg(r.count ? `Exported ${r.count} cookies` : 'Open the profile first');
                  }}
                  onImportCookies={async () => {
                    const r = await window.electronAPI!.importCookies(selected.id, 'json');
                    if (r.canceled) return;
                    showMsg(r.count ? `Imported ${r.count} cookies` : 'Open the profile first');
                  }}
                  showMsg={showMsg}
                />
              )}
            </>
          )}

          {/* ════ PROXIES TAB ════ */}
          {tab === 'proxies' && (
            <div className="content-panel">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">Proxies</h2>
                  <p className="panel-desc">Manage proxies and verify exit IPs before assigning to profiles.</p>
                </div>
                <div className="panel-header-actions">
                  <button
                    className="ghost sm"
                    disabled={busy || proxies.length === 0}
                    onClick={async () => {
                      setBusy(true);
                      try { await window.electronAPI!.checkAllProxies(); await refresh(); showMsg('Batch check completed'); }
                      finally { setBusy(false); }
                    }}
                  >
                    <IconRefresh size={13} /> Batch check
                  </button>
                  <button
                    style={{ background: 'var(--brand-gradient)', color: '#fff' }}
                    onClick={() => setProxyModal({ open: true, editing: null })}
                  >
                    <IconPlus size={14} /> Add proxy
                  </button>
                </div>
              </div>

              {proxies.length === 0 ? (
                <div className="empty-hero small">
                  <div className="empty-icon"><IconProxy size={28} /></div>
                  <h3>No proxies yet</h3>
                  <p>Add a proxy to assign unique IPs to your profiles. Test before saving to verify connectivity.</p>
                  <button style={{ background: 'var(--brand-gradient)', color: '#fff' }} onClick={() => setProxyModal({ open: true, editing: null })}>
                    <IconPlus size={14} /> Add first proxy
                  </button>
                </div>
              ) : (
                <div className="table-card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="col-no">#</th>
                        <th>Proxy</th>
                        <th>Status</th>
                        <th>Exit IP / Location</th>
                        <th className="ta-center">Profiles</th>
                        <th>Latency</th>
                        <th className="col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proxies.map((px, idx) => {
                        const display = savedProxyDisplay(px);
                        const linked = linkedProfileCount(px);
                        const isHttp = !px.proxy.type?.toUpperCase().includes('SOCKS');
                        return (
                          <tr key={px.id}>
                            <td className="col-no muted">{idx + 1}</td>
                            <td>
                              <div className="proxy-name-cell">
                                <strong>{px.name}</strong>
                                <span className="proxy-type-badge">
                                  {isHttp ? 'HTTP' : 'SOCKS5'} · {px.proxy.host}:{px.proxy.port}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={`proxy-status-pill ${display.status}`}>
                                <span className="status-dot-sm" />
                                {display.status === 'online' ? 'Online' : display.status === 'offline' ? 'Failed' : 'Unchecked'}
                              </span>
                            </td>
                            <td>
                              {px.exitIp ? (
                                <div className="ip-cell">
                                  <span className="ip-address">{px.exitIp}</span>
                                  {px.country && <span className="ip-location">📍 {[px.country, px.proxy.city].filter(Boolean).join(', ')}</span>}
                                </div>
                              ) : (
                                <ProxyDisplayCell display={display} />
                              )}
                            </td>
                            <td className="ta-center">
                              <span className="count-badge">{linked}</span>
                            </td>
                            <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {px.lastLatencyMs
                                ? <span style={{ color: px.lastLatencyMs < 200 ? 'var(--green)' : px.lastLatencyMs < 500 ? 'var(--orange)' : 'var(--red)' }}>
                                    {px.lastLatencyMs}ms
                                  </span>
                                : '—'}
                            </td>
                            <td className="col-actions">
                              <div className="row-actions">
                                <button
                                  className="ghost sm"
                                  disabled={busy}
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      const r = await window.electronAPI!.checkProxy(px.id);
                                      await refresh();
                                      showMsg(r.online ? `${r.exitIp ?? 'OK'} · ${r.latencyMs}ms` : r.error ?? 'Check failed');
                                    } finally { setBusy(false); }
                                  }}
                                >
                                  Check IP
                                </button>
                                <button className="icon-btn ghost" title="Edit" onClick={() => setProxyModal({ open: true, editing: px })}>
                                  <IconEdit size={14} />
                                </button>
                                <button
                                  className="icon-btn ghost"
                                  title="Delete"
                                  style={{ color: 'var(--red)' }}
                                  onClick={async () => {
                                    if (linked > 0 && !confirm(`This proxy is used by ${linked} profile(s). Delete anyway?`)) return;
                                    else if (linked === 0 && !confirm(`Delete proxy "${px.name}"?`)) return;
                                    await window.electronAPI!.deleteProxy(px.id);
                                    await refresh();
                                    showMsg('Proxy deleted');
                                  }}
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════ GROUPS TAB ════ */}
          {tab === 'groups' && (
            <GroupsPanel
              profiles={profiles}
              extraGroups={customGroups}
              onCreateGroup={(name) => setCustomGroups((g) => (g.includes(name) ? g : [...g, name]))}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              showMsg={showMsg}
            />
          )}

          {/* ════ EXTENSIONS TAB ════ */}
          {tab === 'extensions' && (
            <ExtensionsPanel
              extensions={extensions}
              marketplace={marketplace}
              onRefresh={refresh}
              showMsg={showMsg}
            />
          )}

          {/* ════ SETTINGS TAB ════ */}
          {tab === 'settings' && (
            <div className="content-panel settings-consumer">
              <h2 className="panel-title" style={{ marginBottom: '1.25rem' }}>Settings</h2>

              {/* Browser */}
              <div className="settings-section">
                <div className="settings-section-title">Browser engine</div>
                <div className="setting-row"><span>Status</span><span style={{ color: chromiumStatus?.tlsReady ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }}>{chromiumStatus?.tlsReady ? '✓ Ready' : 'Setup required'}</span></div>
                {chromiumStatus?.version && <div className="setting-row"><span>Version</span><span>{chromiumStatus.version}</span></div>}
                {!chromiumStatus?.tlsReady && (
                  <div className="setting-actions">
                    <button
                      disabled={installingChromium}
                      style={{ background: 'var(--brand-gradient)', color: '#fff' }}
                      onClick={async () => {
                        setInstallingChromium(true);
                        showMsg('Setting up…');
                        const r = await window.electronAPI!.installPatchedChromium();
                        setInstallingChromium(false);
                        await refresh();
                        showMsg(r.success ? 'Browser ready' : r.error ?? 'Setup failed');
                      }}
                    >
                      {installingChromium ? 'Setting up…' : 'Install browser'}
                    </button>
                  </div>
                )}
                <p className="hint" style={{ marginTop: '0.5rem' }}>Profiles run in a secure, isolated browser — not your everyday Chrome.</p>
              </div>

              {/* Updates */}
              <div className="settings-section">
                <div className="settings-section-title">Updates</div>
                <div className="setting-row"><span>Current version</span><span>v{appPaths?.version ?? '0.8.2'}</span></div>
                <div className="setting-row">
                  <span>Status</span>
                  <span style={{ color: updateState?.status === 'available' ? 'var(--orange)' : 'var(--green)', fontWeight: 600 }}>
                    {updateState?.status === 'available' ? `Update available (v${updateState.latestVersion})` : '✓ Up to date'}
                  </span>
                </div>
                <div className="setting-actions">
                  <button className="ghost sm" onClick={async () => {
                    const s = await window.electronAPI!.checkForUpdates();
                    setUpdateState(s);
                    showMsg(s.status === 'not-available' ? 'You have the latest version' : 'Checking for updates…');
                  }}>Check for updates</button>
                  {updateState?.status === 'downloaded' && (
                    <button style={{ background: 'var(--brand-gradient)', color: '#fff' }} onClick={() => window.electronAPI!.installUpdate()}>
                      Restart to update
                    </button>
                  )}
                </div>
              </div>

              {/* Cloud sync */}
              <div className="settings-section">
                <div className="settings-section-title">Cloud backup · Google Drive</div>
                <p className="hint" style={{ marginBottom: '0.75rem' }}>Sync profiles across devices with end-to-end encryption.</p>
                {!syncState?.connected ? (
                  <>
                    <button
                      style={{ background: 'var(--brand-gradient)', color: '#fff' }}
                      onClick={async () => {
                        const { url, error } = await window.electronAPI!.getSyncAuthUrl();
                        if (error) showMsg(error);
                        else if (url) await window.electronAPI!.openExternal(url);
                      }}
                    >
                      <IconCloud size={14} /> Connect Google Drive
                    </button>
                    <div className="create-row" style={{ marginTop: '0.75rem' }}>
                      <input
                        placeholder="Paste authorization code"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="ghost"
                        onClick={async () => {
                          await window.electronAPI!.authenticateSync(authCode);
                          setAuthCode('');
                          await refresh();
                          showMsg('Google Drive connected');
                        }}
                      >Connect</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="setting-row"><span>Status</span><span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Connected</span></div>
                    {syncState.lastSyncAt && (
                      <div className="setting-row"><span>Last sync</span><span>{formatDate(syncState.lastSyncAt)}</span></div>
                    )}
                    <div className="setting-actions">
                      <button className="ghost sm" onClick={() => window.electronAPI!.runSync().then(refresh)}>
                        <IconRefresh size={13} /> Sync now
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Advanced toggle */}
              <button
                className="expand-advanced"
                onClick={() => setSettingsAdvanced(!settingsAdvanced)}
              >
                {settingsAdvanced ? '▾ Hide advanced' : '▸ Advanced settings'}
              </button>

              {settingsAdvanced && (
                <>
                  {/* Encryption */}
                  <div className="settings-section">
                    <div className="settings-section-title">Encryption</div>
                    <div className="field" style={{ marginBottom: '0.75rem' }}>
                      <label>Backup passphrase</label>
                      <input type="password" placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div className="setting-actions">
                      <button className="ghost sm" onClick={async () => {
                        await window.electronAPI!.setSyncPassphrase(passphrase); setPassphrase(''); await refresh(); showMsg('Passphrase saved');
                      }}>Set passphrase</button>
                      <button className="ghost sm" onClick={async () => {
                        await window.electronAPI!.unlockSync(passphrase); setPassphrase(''); await refresh();
                      }}>Unlock</button>
                    </div>
                  </div>

                  {/* Team folder */}
                  <div className="settings-section">
                    <div className="settings-section-title">Team folder</div>
                    <div className="create-row">
                      <input placeholder="Google Drive folder ID" value={teamFolderId} onChange={(e) => setTeamFolderId(e.target.value)} style={{ flex: 1 }} />
                      <button className="ghost sm" onClick={handleSetTeamFolder}>Save</button>
                    </div>
                  </div>

                  {/* API */}
                  <div className="settings-section">
                    <div className="settings-section-title">Local API & automation</div>
                    <div className="setting-row"><span>Endpoint</span><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{appPaths?.automationUrl ?? 'http://127.0.0.1:9321'}</span></div>
                    <div className="setting-row"><span>Status</span><span style={{ color: automation?.running ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>{automation?.running ? '✓ Running' : 'Stopped'}</span></div>
                    <pre className="api-docs">{'GET /profiles\nPOST /profiles/:id/launch\nAuthorization: Bearer cab_...'}</pre>
                  </div>

                  {/* Webhooks */}
                  <div className="settings-section">
                    <div className="settings-section-title">Webhooks</div>
                    <div className="create-row" style={{ marginBottom: '0.75rem' }}>
                      <input placeholder="Webhook URL (https://…)" value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} style={{ flex: 1 }} />
                      <button className="ghost sm" onClick={async () => {
                        if (!newWebhookUrl.trim()) return;
                        await window.electronAPI!.createWebhook(newWebhookUrl.trim(), ['profile.closed', 'profile.launched']);
                        setNewWebhookUrl('');
                        await refresh();
                        showMsg('Webhook added');
                      }}>Add</button>
                    </div>
                    {webhooks.map((w) => (
                      <div key={w.id} className="trash-row">
                        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{truncate(w.url, 50)}</span>
                        <button className="ghost sm" style={{ color: 'var(--red)' }} onClick={async () => {
                          await window.electronAPI!.deleteWebhook(w.id); await refresh();
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>

                  {/* API Keys */}
                  <div className="settings-section">
                    <div className="settings-section-title">API keys</div>
                    <div className="create-row">
                      <input placeholder="Key name" value={newApiKeyName} onChange={(e) => setNewApiKeyName(e.target.value)} style={{ flex: 1 }} />
                      <button className="ghost sm" onClick={async () => {
                        if (!newApiKeyName.trim()) return;
                        const r = await window.electronAPI!.createApiKey(newApiKeyName.trim());
                        setNewApiKeyName('');
                        await refresh();
                        navigator.clipboard.writeText(r.rawKey);
                        showMsg('API key copied to clipboard');
                      }}>Create</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Proxy modal */}
      {proxyModal.open && (
        <ProxyModal
          existing={proxyModal.editing}
          onClose={() => setProxyModal({ open: false, editing: null })}
          onSaved={refresh}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}
