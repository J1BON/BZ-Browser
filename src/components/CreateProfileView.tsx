import { useState, useCallback, useEffect, useRef } from 'react';
import type { SavedProxy } from '../types/phase4';
import { OsPickerIcon, IconChrome, IconFirefox } from './Icons';
import { OS_OPTIONS, OS_OPTIONS_QUICK, resolveOsConfig } from '../utils/os-templates';
import { parseProxyPaste } from '../utils/proxy-parse';
import { DEFAULT_STARTUP_URL } from '../constants/startup';

export { parseProxyPaste } from '../utils/proxy-parse';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface CreateProfileForm {
  name: string;
  group: string;
  color: string;
  browserEngine: 'chrome' | 'firefox';
  device: string;
  deviceType: 'desktop' | 'mobile-ios' | 'mobile-android';
  proxyMode: 'none' | 'saved' | 'new';
  proxyId: string;
  proxyPaste: string;
  proxyName: string;
  proxyType: string;
  alignGeo: boolean;
  canvas: string;
  webGlImage: string;
  webGlMeta: string;
  audioContext: string;
  fontEnable: string;
  mediaDevices: string;
  webRTC: string;
  hardwareAccelerate: string;
  openUrls: string;
  remark: string;
  templateId: string;
  count: number;
  tags: string;
  extensionIds: string[];
  headless: boolean;
  resolutionWidth?: number;
  resolutionHeight?: number;
}

interface WizardForm {
  name: string;
  group: string;
  color: string;
  browserEngine: 'chrome' | 'firefox';
  osHint: string;
  count: number;
  proxySource: 'none' | 'saved' | 'new';
  savedProxyId: string;
  proxyPaste: string;
  alignGeo: boolean;
  canvas: string;
  webGlImage: string;
  webGlMeta: string;
  audioContext: string;
  fontEnable: string;
  webRTC: string;
  openUrls: string;
  remark: string;
  templateId: string;
  resolution: string;
  canvasReal: boolean;
  e2eEncryption: boolean;
}

const DEFAULT_FORM: WizardForm = {
  name: '', group: '', color: '#4f8ef7', browserEngine: 'chrome',
  osHint: 'Windows', count: 1,
  proxySource: 'none', savedProxyId: '', proxyPaste: '', alignGeo: true,
  canvas: '2', webGlImage: '2', webGlMeta: '2', audioContext: '2',
  fontEnable: '2', webRTC: '3',
  openUrls: DEFAULT_STARTUP_URL, remark: '', templateId: '',
  resolution: 'auto',
  canvasReal: false,
  e2eEncryption: false,
};

// ─────────────────────────────────────────────
// IP Check Result display
// ─────────────────────────────────────────────
interface IpResult {
  ip: string; country: string; countryCode: string; flag: string;
  region: string; city: string; timezone: string; isp: string;
  asn: string; asnName: string; isProxy: boolean; isHosting: boolean;
  riskScore: number; latencyMs: number; source: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: 'US', GB: 'GB', DE: 'DE', FR: 'FR', JP: 'JP', CN: 'CN', RU: 'RU',
  KR: 'KR', IN: 'IN', BR: 'BR', CA: 'CA', AU: 'AU', NL: 'NL', SG: 'SG',
  HK: 'HK', TW: 'TW', UA: 'UA', PL: 'PL', TR: 'TR', MX: 'MX', AR: 'AR',
  BD: 'BD', PK: 'PK', NG: 'NG', ZA: 'ZA', IT: 'IT', ES: 'ES', SE: 'SE',
  NO: 'NO', FI: 'FI', DK: 'DK', CH: 'CH', AT: 'AT', BE: 'BE', PT: 'PT',
  CZ: 'CZ', RO: 'RO', HU: 'HU', ID: 'ID', TH: 'TH', VN: 'VN', PH: 'PH',
  MY: 'MY', IL: 'IL', AE: 'AE', SA: 'SA', EG: 'EG', KE: 'KE',
};

function getFlagText(countryCode: string): string {
  return COUNTRY_FLAGS[countryCode?.toUpperCase()] ?? countryCode?.toUpperCase() ?? 'Global';
}

function healthToIpResult(health: {
  exitIp?: string; country?: string; countryCode?: string; city?: string;
  timezone?: string; isp?: string; asn?: string; asnName?: string;
  isProxy?: boolean; isHosting?: boolean; riskScore?: number; latencyMs?: number;
}): IpResult | null {
  if (!health.exitIp) return null;
  const countryCode = String(health.countryCode ?? '').toUpperCase();
  return {
    ip: health.exitIp,
    country: health.country ?? '',
    countryCode,
    flag: getFlagText(countryCode),
    region: '',
    city: health.city ?? '',
    timezone: health.timezone ?? '',
    isp: health.isp ?? '',
    asn: health.asn ?? '',
    asnName: health.asnName ?? '',
    isProxy: !!health.isProxy,
    isHosting: !!health.isHosting,
    riskScore: health.riskScore ?? 0,
    latencyMs: health.latencyMs ?? 0,
    source: 'proxy',
  };
}

function proxyConfigFromPaste(paste: string): { host: string; port: string; account?: string; password?: string; type: string } | null {
  const parsed = parseProxyPaste(paste);
  if (!parsed.host || !parsed.port) return null;
  return {
    host: parsed.host,
    port: parsed.port,
    account: parsed.account,
    password: parsed.password,
    type: parsed.type.toLowerCase().includes('socks') ? 'socks5' : 'http',
  };
}
function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score < 30) return 'low';
  if (score < 65) return 'medium';
  return 'high';
}

function IpCheckCard({ result }: { result: IpResult }) {
  const level = getRiskLevel(result.riskScore);
  return (
    <div className="ip-check-card" style={{ marginTop: 12 }}>
      <div className="ip-check-card__header">
        <span className="ip-check-card__flag">
          {getFlagText(result.countryCode)}
        </span>
        <div className="ip-check-card__location">
          <span className="ip-check-card__ip">{result.ip}</span>
          <span className="ip-check-card__geo">{[result.city, result.region, result.country].filter(Boolean).join(', ')}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span className={`risk-badge ${level}`}>
            {level === 'low' ? 'Clean' : level === 'medium' ? 'Medium Risk' : 'High Risk'}
          </span>
        </div>
      </div>

      <div className="ip-check-card__badges">
        {result.isProxy && <span className="risk-badge high">Proxy/VPN</span>}
        {result.isHosting && <span className="risk-badge medium">Datacenter</span>}
        {!result.isProxy && !result.isHosting && <span className="risk-badge low">Residential</span>}
      </div>

      <div className="ip-check-card__grid">
        <div className="ip-check-card__row">
          <span className="ip-check-card__label">ISP</span>
          <span className="ip-check-card__value" title={result.isp}>{result.isp || '—'}</span>
        </div>
        <div className="ip-check-card__row">
          <span className="ip-check-card__label">ASN</span>
          <span className="ip-check-card__value" title={result.asn}>{result.asn || '—'}</span>
        </div>
        <div className="ip-check-card__row">
          <span className="ip-check-card__label">Timezone</span>
          <span className="ip-check-card__value">{result.timezone || '—'}</span>
        </div>
        <div className="ip-check-card__row">
          <span className="ip-check-card__label">Risk Score</span>
          <span className="ip-check-card__value">{result.riskScore}/100</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Engine & OS Option Cards
// ─────────────────────────────────────────────

const RESOLUTION_OPTIONS = [
  { value: 'auto', label: 'Random fingerprint screen (recommended)' },
  { value: '1920x1080', label: '1920 × 1080' },
  { value: '1536x864', label: '1536 × 864' },
  { value: '1440x900', label: '1440 × 900' },
  { value: '1366x768', label: '1366 × 768' },
  { value: '1600x900', label: '1600 × 900' },
  { value: '2560x1440', label: '2560 × 1440' },
];

const COLOR_PRESETS = ['#4f8ef7','#23c78e','#f5a623','#ef4444','#a855f7','#ec4899','#14b8a6','#f97316'];

// ─────────────────────────────────────────────
// Fingerprint Toggles Helper
// ─────────────────────────────────────────────
type SpoofMode = '1' | '2' | '3';

function SpoofToggle({ label, value, onChange, modes = ['1','2','3'], labels = ['Real','Noise','Block'] }: {
  label: string; value: SpoofMode;
  onChange: (v: SpoofMode) => void;
  modes?: string[]; labels?: string[];
}) {
  return (
    <div className="spoof-toggle-ml">
      <span className="spoof-toggle-ml__label">{label}</span>
      <div className="spoof-toggle-ml__group">
        {modes.map((m, i) => (
          <button
            key={m}
            type="button"
            className={`spoof-toggle-ml__btn${value === m ? ' active' : ''}`}
            onClick={() => onChange(m as SpoofMode)}
          >
            {labels[i]}
          </button>
        ))}
      </div>
    </div>
  );
}

function MlSwitch({ title, desc, checked, onChange }: {
  title: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="ml-switch-row">
      <div>
        <div className="ml-switch-title">{title}</div>
        <div className="ml-switch-desc">{desc}</div>
      </div>
      <label className="ml-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Creation Component
// ─────────────────────────────────────────────
interface Props {
  templates: any[];
  proxies: SavedProxy[];
  extensions: any[];
  groups: string[];
  onBack: () => void;
  onCreate: (form: CreateProfileForm) => Promise<void>;
  profileCount: number;
}

type TabType = 'general' | 'proxy' | 'fingerprints' | 'advanced';
type CreateMode = 'quick' | 'advanced';

export function CreateProfileView({ onBack, onCreate, proxies, groups, profileCount }: Props) {
  const [createMode, setCreateMode] = useState<CreateMode>('quick');
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [form, setForm] = useState<WizardForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fingerprint Preview state
  const [previewFp, setPreviewFp] = useState<any>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    source: 'proxy' | 'network' | 'pending';
    pending: boolean;
    countryCode?: string;
    country?: string;
  }>({ source: 'network', pending: false });
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((partial: Partial<WizardForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const nextSerial = String(profileCount + 1).padStart(4, '0');
  const profileName = form.name.trim() || `Profile #${nextSerial}`;

  // Live preview fetcher
  const fetchPreview = useCallback(async (
    os: string,
    resolutionStr: string,
    proxySource: string,
    savedProxyId: string,
    proxyPaste: string,
    alignGeo: boolean,
  ) => {
    setPreviewBusy(true);
    try {
      const devType = os === 'iOS' ? 'mobile-ios' : os === 'Android' ? 'mobile-android' : 'desktop';
      const devOpts: any = devType === 'mobile-ios'
        ? { formFactor: 'mobile' as const, device: 'iOS' as const }
        : devType === 'mobile-android'
          ? { formFactor: 'mobile' as const, device: 'Android' as const }
          : { formFactor: 'desktop' as const, device: os as any };

      devOpts.proxyMode = proxySource;
      devOpts.alignGeo = alignGeo;

      if (resolutionStr && resolutionStr !== 'auto') {
        const [w, h] = resolutionStr.split('x').map(Number);
        if (w && h) {
          devOpts.resolution = { width: w, height: h };
        }
      }

      if (proxySource === 'saved' && savedProxyId) {
        const saved = proxies.find((p) => p.id === savedProxyId);
        devOpts.savedProxyId = savedProxyId;
        if (saved) {
          devOpts.proxy = saved.proxy;
        }
      } else if (proxySource === 'new' && proxyPaste.trim()) {
        const parsed = proxyConfigFromPaste(proxyPaste);
        if (parsed) {
          devOpts.proxy = {
            category: '4',
            type: parsed.type,
            host: parsed.host,
            port: parsed.port,
            account: parsed.account,
            password: parsed.password,
          };
        }
      }

      const fp = await (window as any).electronAPI.previewFingerprint(devOpts);
      setPreviewFp(fp);
      setPreviewMeta({
        source: fp.geoSource ?? 'network',
        pending: !!fp.geoPending,
        countryCode: fp.geoCountryCode,
        country: fp.geoCountry,
      });
    } catch (e) {
      console.error('Failed to generate preview fingerprint:', e);
    } finally {
      setPreviewBusy(false);
    }
  }, [proxies]);

  const schedulePreview = useCallback((delayMs = 300) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      fetchPreview(form.osHint, form.resolution, form.proxySource, form.savedProxyId, form.proxyPaste, form.alignGeo);
    }, delayMs);
  }, [fetchPreview, form.osHint, form.resolution, form.proxySource, form.savedProxyId, form.proxyPaste, form.alignGeo]);

  useEffect(() => {
    const delay = form.proxySource === 'new' && form.proxyPaste.trim() ? 500 : 200;
    schedulePreview(delay);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [form.osHint, form.resolution, form.proxySource, form.savedProxyId, form.proxyPaste, form.alignGeo, schedulePreview]);

  // Handle Proxy Check IP
  const [checkingProxy, setCheckingProxy] = useState(false);
  const [ipResult, setIpResult] = useState<IpResult | null>(null);
  const [ipError, setIpError] = useState('');

  const handleCheckIp = useCallback(async () => {
    setCheckingProxy(true);
    setIpError('');
    setIpResult(null);
    try {
      const api = (window as any).electronAPI;
      let mapped: IpResult | null = null;

      if (form.proxySource === 'saved' && form.savedProxyId) {
        const saved = proxies.find((p) => p.id === form.savedProxyId);
        if (!saved) {
          setIpError('Select a saved proxy first');
          return;
        }
        const health = await api.checkProxyConfig(saved.proxy);
        if (!health?.online) {
          setIpError(health?.error ?? 'Proxy is offline or unresolvable');
          return;
        }
        mapped = healthToIpResult(health);
      } else if (form.proxySource === 'new' && form.proxyPaste.trim()) {
        const parsed = proxyConfigFromPaste(form.proxyPaste);
        if (!parsed) {
          setIpError('Enter a valid proxy (host:port)');
          return;
        }
        const health = await api.checkProxyConfig({
          category: '4',
          type: parsed.type,
          host: parsed.host,
          port: parsed.port,
          account: parsed.account,
          password: parsed.password,
        });
        if (!health?.online) {
          setIpError(health?.error ?? 'Proxy is offline or unresolvable');
          return;
        }
        mapped = healthToIpResult(health);
      } else {
        const result = await api?.checkIp?.() ?? null;
        if (result?.error) {
          setIpError(result.error);
          return;
        }
        if (result) {
          mapped = {
            ...result,
            flag: getFlagText(result.countryCode),
          } as IpResult;
        }
      }

      if (!mapped) {
        setIpError('Could not resolve IP location');
        return;
      }

      setIpResult(mapped);
      fetchPreview(form.osHint, form.resolution, form.proxySource, form.savedProxyId, form.proxyPaste, form.alignGeo);
    } catch (e) {
      setIpError(String(e));
    } finally {
      setCheckingProxy(false);
    }
  }, [form.proxySource, form.savedProxyId, form.proxyPaste, form.osHint, form.resolution, form.alignGeo, proxies, fetchPreview]);

  // Submit Handler
  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const osConfig = resolveOsConfig(form.osHint);
      const overrideRes = form.resolution !== 'auto' ? form.resolution.split('x').map(Number) : [];
      const parsedProxy = form.proxySource === 'new' && form.proxyPaste.trim()
        ? parseProxyPaste(form.proxyPaste)
        : null;
      const completeForm: CreateProfileForm = {
        name: profileName,
        group: form.group,
        color: form.color,
        browserEngine: form.browserEngine,
        device: osConfig.device,
        deviceType: osConfig.deviceType,
        proxyMode: form.proxySource,
        proxyId: form.savedProxyId,
        proxyPaste: form.proxyPaste,
        proxyName: 'Profile proxy',
        proxyType: parsedProxy?.type ?? 'HTTP',
        alignGeo: form.alignGeo,
        canvas: form.canvasReal ? '1' : form.canvas,
        webGlImage: form.webGlImage,
        webGlMeta: form.webGlMeta,
        audioContext: form.audioContext,
        fontEnable: form.fontEnable,
        mediaDevices: '2',
        webRTC: form.webRTC,
        hardwareAccelerate: '2',
        openUrls: form.openUrls.trim() || DEFAULT_STARTUP_URL,
        remark: form.remark,
        templateId: osConfig.templateId,
        count: Math.max(1, Math.min(50, form.count || 1)),
        tags: '',
        extensionIds: [],
        headless: false,
        resolutionWidth: overrideRes[0] || undefined,
        resolutionHeight: overrideRes[1] || undefined,
      };

      await onCreate(completeForm);
      onBack();
    } catch (e: any) {
      if (e?.message !== 'invalid-proxy') {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, profileName, onCreate, onBack]);

  return (
    <div className="create-page-ml">
      <div className="create-page-header-ml">
        <button type="button" className="ghost back-btn" onClick={onBack}>← Back to profiles</button>
        <div className="create-mode-tabs-ml">
          <button type="button" className={createMode === 'quick' ? 'mode-tab-ml active' : 'mode-tab-ml'} onClick={() => setCreateMode('quick')}>
            Quick create
          </button>
          <button type="button" className={createMode === 'advanced' ? 'mode-tab-ml active' : 'mode-tab-ml'} onClick={() => setCreateMode('advanced')}>
            Advanced create
          </button>
        </div>
      </div>

      <div className="create-page-body-ml">
        <div className="create-form-panel-ml">
          {createMode === 'quick' ? (
            <div className="form-sections-ml">
              <section className="form-block-ml">
                <h4 className="form-block-title-ml">Browser</h4>
                <div className="engine-row-ml">
                  <button type="button" className={`engine-card-ml${form.browserEngine === 'chrome' ? ' selected' : ''}`} onClick={() => update({ browserEngine: 'chrome' })}>
                    <IconChrome size={20} />
                    <span>Chrome</span>
                    {form.browserEngine === 'chrome' && <span className="check-mark-ml">✓</span>}
                  </button>
                  <button type="button" className={`engine-card-ml${form.browserEngine === 'firefox' ? ' selected' : ''}`} onClick={() => update({ browserEngine: 'firefox' })}>
                    <IconFirefox size={20} />
                    <span>Firefox</span>
                    {form.browserEngine === 'firefox' && <span className="check-mark-ml">✓</span>}
                  </button>
                </div>
              </section>

              <section className="form-block-ml">
                <h4 className="form-block-title-ml">Operating system</h4>
                <div className="os-grid-ml os-grid-quick">
                  {OS_OPTIONS_QUICK.map((os) => (
                    <button
                      key={os.value}
                      type="button"
                      className={form.osHint === os.value ? 'os-card-ml selected' : 'os-card-ml'}
                      onClick={() => update({ osHint: os.value })}
                    >
                      <span className="os-card-ml-icon"><OsPickerIcon os={resolveOsConfig(os.value).iconId} size={22} /></span>
                      <span>{os.label}</span>
                      {form.osHint === os.value && <span className="check-mark-ml">✓</span>}
                    </button>
                  ))}
                </div>
              </section>

              <section className="form-block-ml">
                <div className="field-row-ml">
                  <div className="form-field-ml" style={{ flex: 2 }}>
                    <label className="form-label-ml">Profile name</label>
                    <input className="form-input-ml" placeholder={`Profile #${nextSerial}`} value={form.name} onChange={(e) => update({ name: e.target.value })} />
                  </div>
                  <div className="form-field-ml" style={{ flex: 1 }}>
                    <label className="form-label-ml">Number of profiles</label>
                    <input className="form-input-ml" type="number" min={1} max={50} value={form.count} onChange={(e) => update({ count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
                  </div>
                </div>
                <div className="form-field-ml">
                  <label className="form-label-ml">Profile group</label>
                  <input
                    className="form-input-ml"
                    list="create-profile-groups"
                    placeholder="Select or enter a group"
                    value={form.group}
                    onChange={(e) => update({ group: e.target.value })}
                  />
                  <datalist id="create-profile-groups">
                    {groups.map((g) => <option key={g} value={g} />)}
                  </datalist>
                </div>
              </section>

              <section className="form-block-ml">
                <MlSwitch
                  title="End-to-end encryption"
                  desc="When enabled, only authorized devices can decrypt and access this profile."
                  checked={form.e2eEncryption}
                  onChange={(v) => update({ e2eEncryption: v })}
                />
                <MlSwitch
                  title="Canvas fingerprint technology"
                  desc="Use an authentic canvas fingerprint compatible with major websites."
                  checked={form.canvasReal}
                  onChange={(v) => update({ canvasReal: v, canvas: v ? '1' : '2' })}
                />
              </section>

              <section className="form-block-ml">
                <h4 className="form-block-title-ml">Proxy (optional)</h4>
                <div className="proxy-source-tabs" style={{ marginBottom: 8 }}>
                  {(['none', 'saved', 'new'] as const).map((src) => (
                    <button key={src} type="button" className={`proxy-source-tab${form.proxySource === src ? ' active' : ''}`} onClick={() => update({ proxySource: src })}>
                      {src === 'none' ? 'No proxy' : src === 'saved' ? 'Saved proxy' : 'New proxy'}
                    </button>
                  ))}
                </div>
                {form.proxySource === 'saved' && (
                  <select className="form-input-ml" value={form.savedProxyId} onChange={(e) => update({ savedProxyId: e.target.value })}>
                    <option value="">— Select proxy —</option>
                    {proxies.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.proxy.host}:{p.proxy.port}</option>)}
                  </select>
                )}
                {form.proxySource === 'new' && (
                  <input className="form-input-ml" placeholder="host:port · user:pass@host:port · socks5://host:port" value={form.proxyPaste} onChange={(e) => update({ proxyPaste: e.target.value })} />
                )}
                {form.proxySource !== 'none' && (
                  <button type="button" className="btn btn-secondary" style={{ marginTop: 8, fontSize: 11 }} onClick={handleCheckIp} disabled={checkingProxy}>
                    {checkingProxy ? 'Checking…' : 'Network detection'}
                  </button>
                )}
                {ipResult && <IpCheckCard result={ipResult} />}
              </section>
            </div>
          ) : (
          <div className="split-creation-layout">
          <div className="split-creation-sidebar">
            <button type="button" className={`split-sidebar-tab${activeTab === 'general' ? ' active' : ''}`} onClick={() => setActiveTab('general')}>
              General
            </button>
            <button type="button" className={`split-sidebar-tab${activeTab === 'proxy' ? ' active' : ''}`} onClick={() => setActiveTab('proxy')}>
              Proxy Setup
            </button>
            <button type="button" className={`split-sidebar-tab${activeTab === 'fingerprints' ? ' active' : ''}`} onClick={() => setActiveTab('fingerprints')}>
              Fingerprint
            </button>
            <button type="button" className={`split-sidebar-tab${activeTab === 'advanced' ? ' active' : ''}`} onClick={() => setActiveTab('advanced')}>
              Advanced
            </button>
          </div>

          {/* Active Tab Pane */}
          <div className="split-creation-pane">
            {activeTab === 'general' && (
              <>
                <div className="form-field-ml">
                  <label className="form-label-ml">Profile name</label>
                  <input
                    className="form-input-ml"
                    placeholder={`Profile #${nextSerial}`}
                    value={form.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </div>

                <div className="form-field-ml">
                  <label className="form-label-ml">Browser</label>
                  <div className="engine-row-ml">
                    <button type="button" className={`engine-card-ml${form.browserEngine === 'chrome' ? ' selected' : ''}`} onClick={() => update({ browserEngine: 'chrome' })}>
                      <IconChrome size={20} />
                      <span>Chrome</span>
                      {form.browserEngine === 'chrome' && <span className="check-mark-ml">✓</span>}
                    </button>
                    <button type="button" className={`engine-card-ml${form.browserEngine === 'firefox' ? ' selected' : ''}`} onClick={() => update({ browserEngine: 'firefox' })}>
                      <IconFirefox size={20} />
                      <span>Firefox</span>
                      {form.browserEngine === 'firefox' && <span className="check-mark-ml">✓</span>}
                    </button>
                  </div>
                </div>

                <div className="form-field-ml">
                  <label className="form-label-ml">Operating system</label>
                  <div className="os-grid-ml">
                    {OS_OPTIONS.map((os) => (
                      <button
                        key={os.value}
                        type="button"
                        className={form.osHint === os.value ? 'os-card-ml selected' : 'os-card-ml'}
                        onClick={() => update({ osHint: os.value })}
                      >
                        <span className="os-card-ml-icon"><OsPickerIcon os={resolveOsConfig(os.value).iconId} size={22} /></span>
                        <span>{os.label}</span>
                        {form.osHint === os.value && <span className="check-mark-ml">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field-row-ml">
                  <div className="form-field-ml" style={{ flex: 1 }}>
                    <label className="form-label-ml">Profile group</label>
                    <input
                      className="form-input-ml"
                      list="create-profile-groups-adv"
                      placeholder="Select or enter a group"
                      value={form.group}
                      onChange={(e) => update({ group: e.target.value })}
                    />
                    <datalist id="create-profile-groups-adv">
                      {groups.map((g) => <option key={g} value={g} />)}
                    </datalist>
                  </div>
                  <div className="form-field-ml">
                    <label className="form-label-ml">Color tag</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => update({ color: c })}
                          style={{
                            width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer',
                            border: form.color === c ? '2px solid var(--ml-text)' : '1px solid var(--ml-border)',
                            boxShadow: form.color === c ? `0 0 0 2px ${c}40` : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'proxy' && (
              <>
                <div className="proxy-source-tabs">
                  {(['none', 'saved', 'new'] as const).map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={`proxy-source-tab${form.proxySource === src ? ' active' : ''}`}
                      onClick={() => update({ proxySource: src })}
                    >
                      {src === 'none' ? 'No proxy' : src === 'saved' ? 'Saved proxy' : 'New proxy'}
                    </button>
                  ))}
                </div>

                {form.proxySource === 'none' && (
                  <p className="hint">Profile will use your direct network connection.</p>
                )}

                {form.proxySource === 'saved' && (
                  <div className="form-field-ml">
                    <label className="form-label-ml">Select saved proxy</label>
                    <select
                      className="form-input-ml"
                      value={form.savedProxyId}
                      onChange={(e) => update({ savedProxyId: e.target.value })}
                    >
                      <option value="">— Select a proxy —</option>
                      {proxies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.proxy.host}:{p.proxy.port}
                          {p.lastStatus === 'online' ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {form.proxySource === 'new' && (
                  <div className="form-field-ml">
                    <label className="form-label-ml">Proxy address</label>
                    <input
                      className="form-input-ml"
                      placeholder="host:port · user:pass@host:port · socks5://host:port"
                      value={form.proxyPaste}
                      onChange={(e) => update({ proxyPaste: e.target.value })}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                )}

                {form.proxySource !== 'none' && (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12 }}
                        onClick={handleCheckIp}
                        disabled={checkingProxy || (form.proxySource === 'saved' && !form.savedProxyId)}
                      >
                        {checkingProxy ? 'Checking…' : 'Network detection'}
                      </button>
                      {ipError && <span className="create-error-ml">{ipError}</span>}
                    </div>

                    {ipResult && <IpCheckCard result={ipResult} />}

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ml-text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={form.alignGeo}
                        onChange={(e) => update({ alignGeo: e.target.checked })}
                        style={{ accentColor: 'var(--ml-accent)' }}
                      />
                      Auto-align timezone &amp; languages to proxy location
                    </label>
                  </>
                )}
              </>
            )}

            {activeTab === 'fingerprints' && (
              <div>
                <div className="form-field-ml" style={{ marginBottom: 12 }}>
                  <label className="form-label-ml">Fingerprint screen size</label>
                  <select
                    className="form-input-ml"
                    value={form.resolution}
                    onChange={(e) => update({ resolution: e.target.value })}
                  >
                    {RESOLUTION_OPTIONS.map((res) => (
                      <option key={res.value} value={res.value}>
                        {res.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">What websites detect via JavaScript. Browser window size matches your display at launch.</p>
                </div>

                <SpoofToggle label="Canvas Spoofing" value={form.canvas as SpoofMode} onChange={(v) => update({ canvas: v })} />
                <SpoofToggle label="WebGL Image Spoofing" value={form.webGlImage as SpoofMode} onChange={(v) => update({ webGlImage: v })} />
                <SpoofToggle label="WebGL Metadata Spoofing" value={form.webGlMeta as SpoofMode} onChange={(v) => update({ webGlMeta: v })} />
                <SpoofToggle label="WebAudio Spoofing" value={form.audioContext as SpoofMode} onChange={(v) => update({ audioContext: v })} />
                <SpoofToggle label="Font List Masking" value={form.fontEnable as SpoofMode} onChange={(v) => update({ fontEnable: v })} />
                <SpoofToggle label="WebRTC Local IPs" value={form.webRTC as SpoofMode} modes={['1','2','3']} labels={['Real','Spoof','Block']} onChange={(v) => update({ webRTC: v })} />
              </div>
            )}

            {activeTab === 'advanced' && (
              <>
                <div className="form-field-ml">
                  <label className="form-label-ml">Startup URLs</label>
                  <textarea
                    className="form-input-ml"
                    rows={3}
                    placeholder="https://example.com"
                    value={form.openUrls}
                    onChange={(e) => update({ openUrls: e.target.value })}
                    style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                  />
                </div>

                <div className="form-field-ml">
                  <label className="form-label-ml">Description / remarks</label>
                  <textarea
                    className="form-input-ml"
                    rows={2}
                    placeholder="Profile notes…"
                    value={form.remark}
                    onChange={(e) => update({ remark: e.target.value })}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Right Fingerprint Preview Card (advanced tab pane only — outer panel below) */}
          <div className="split-creation-preview" style={{ width: '260px', padding: '16px', display: 'none' }} />
          </div>
          )}
        </div>

          {/* Browser profile overview — MoreLogin-style right panel (both modes) */}
          <aside className="overview-panel-ml">
            <div className="overview-header-ml">
              <h3>Browser profile overview</h3>
              <button
                type="button"
                className="ghost refresh-fp"
                onClick={() => fetchPreview(form.osHint, form.resolution, form.proxySource, form.savedProxyId, form.proxyPaste, form.alignGeo)}
                disabled={previewBusy}
              >
                ↻ Refresh fingerprint
              </button>
            </div>
            {!previewFp && previewBusy ? (
              <p className="hint">Generating fingerprint…</p>
            ) : previewFp ? (
              <dl className={`overview-list-ml${previewBusy ? ' overview-list-ml--busy' : ''}`}>
                <div><dt>Browser</dt><dd>{form.browserEngine === 'firefox' ? 'Firefox' : 'Chrome'} (Auto-match)</dd></div>
                <div><dt>Operating system</dt><dd>{OS_OPTIONS.find((o) => o.value === form.osHint)?.label ?? form.osHint}</dd></div>
                <div><dt>UA</dt><dd className="mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>{previewFp.userAgent}</dd></div>
                <div><dt>Time zone</dt><dd>
                  {previewMeta.pending
                    ? <span className="hint">Pending — run Network detection</span>
                    : <>
                        {previewFp.timeZone}
                        {previewMeta.source === 'proxy' && previewMeta.countryCode && (
                          <span className="hint"> (proxy exit {previewMeta.countryCode})</span>
                        )}
                        {previewMeta.source === 'network' && (
                          <span className="hint"> (your network)</span>
                        )}
                      </>}
                </dd></div>
                <div><dt>Language</dt><dd>
                  {previewMeta.pending
                    ? <span className="hint">Pending — run Network detection</span>
                    : <>
                        {previewFp.screenLang}
                        {previewMeta.source === 'proxy' && previewMeta.countryCode && (
                          <span className="hint"> (proxy exit {previewMeta.countryCode})</span>
                        )}
                        {previewMeta.source === 'network' && (
                          <span className="hint"> (your network)</span>
                        )}
                      </>}
                </dd></div>
                <div><dt>Geolocation</dt><dd>
                  {previewMeta.pending
                    ? 'Pending proxy check'
                    : previewMeta.source === 'proxy'
                      ? `Match proxy IP${previewMeta.countryCode ? ` (${previewMeta.countryCode})` : ''}`
                      : form.proxySource !== 'none'
                        ? 'Match proxy IP (check pending)'
                        : 'Prompt'}
                </dd></div>
                <div><dt>WebRTC</dt><dd>{form.webRTC === '3' ? 'Privacy' : form.webRTC === '2' ? 'Proxy IP' : 'Real'}</dd></div>
                <div><dt>Fingerprint screen</dt><dd>{previewFp.screenWidth}×{previewFp.screenHeight}{form.resolution === 'auto' ? ' (random)' : ''}</dd></div>
                <div><dt>Launch window</dt><dd>Maximized — your display</dd></div>
                <div><dt>Canvas</dt><dd>{form.canvasReal || form.canvas === '1' ? 'Authentic' : form.canvas === '2' ? 'Noise' : 'Block'}</dd></div>
                <div><dt>WebGL image</dt><dd>{form.webGlImage === '2' ? 'Noise' : 'Authentic'}</dd></div>
                <div><dt>AudioContext</dt><dd>{form.audioContext === '2' ? 'Noise' : 'Authentic'}</dd></div>
                <div><dt>Font</dt><dd>{form.fontEnable === '2' ? 'Noise' : 'Authentic'}</dd></div>
                <div><dt>WebGL renderer</dt><dd style={{ fontSize: 10 }}>{previewFp.webGlMode || '—'}</dd></div>
              </dl>
            ) : (
              <p className="hint">Select OS to preview fingerprint</p>
            )}
            <p className="hint overview-foot">Unique fingerprint generated on confirm. OS above matches what will be created.</p>
          </aside>
        </div>

        <div className="create-page-footer-ml">
          {error && <span className="create-error-ml">{error}</span>}
          <button type="button" className="secondary" onClick={onBack} disabled={submitting}>Cancel</button>
          <button type="button" className="primary confirm-btn" onClick={handleCreate} disabled={submitting}>
            {submitting ? 'Creating…' : 'Confirm'}
          </button>
        </div>
      </div>
  );
}
