import { useState } from 'react';
import type { SavedProxy, ProxyHealthResult } from '../types/phase4';
import { IconClose, IconGlobe } from './Icons';

type ProxyType = 'HTTP' | 'HTTPS' | 'SOCKS5';

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', RU: '🇷🇺',
  KR: '🇰🇷', IN: '🇮🇳', BR: '🇧🇷', CA: '🇨🇦', AU: '🇦🇺', NL: '🇳🇱', SG: '🇸🇬',
  HK: '🇭🇰', TW: '🇹🇼', UA: '🇺🇦', PL: '🇵🇱', TR: '🇹🇷', MX: '🇲🇽', AR: '🇦🇷',
  BD: '🇧🇩', PK: '🇵🇰', NG: '🇳🇬', ZA: '🇿🇦', IT: '🇮🇹', ES: '🇪🇸', SE: '🇸🇪',
  NO: '🇳🇴', FI: '🇫🇮', DK: '🇩🇰', CH: '🇨🇭', AT: '🇦🇹', BE: '🇧🇪', PT: '🇵🇹',
  CZ: '🇨🇿', RO: '🇷🇴', HU: '🇭🇺', ID: '🇮🇩', TH: '🇹🇭', VN: '🇻🇳', PH: '🇵🇭',
  MY: '🇲🇾', IL: '🇮🇱', AE: '🇦🇪', SA: '🇸🇦', EG: '🇪🇬', KE: '🇰🇪',
};

function getFlagEmoji(countryCode: string): string {
  return COUNTRY_FLAGS[countryCode?.toUpperCase()] ?? '🌐';
}

interface ProxyModalProps {
  existing?: SavedProxy | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  showMsg: (text: string) => void;
}

const IP_CHANNELS = ['IP2Location', 'MaxMind', 'DB-IP', 'IP-API'];

export function ProxyModal({ existing, onClose, onSaved, showMsg }: ProxyModalProps) {
  const editing = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<ProxyType>(
    (existing?.proxy.type?.toUpperCase().includes('SOCKS') ? 'SOCKS5' : 'HTTP') as ProxyType,
  );
  const [host, setHost] = useState(existing?.proxy.host ?? '');
  const [port, setPort] = useState(existing?.proxy.port ?? '');
  const [account, setAccount] = useState(existing?.proxy.account ?? '');
  const [password, setPassword] = useState(existing?.proxy.password ?? '');
  const [ipChannel, setIpChannel] = useState(IP_CHANNELS[0]);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ProxyHealthResult | null>(null);

  const canSubmit = name.trim() && host.trim() && port.trim();

  const runCheck = async () => {
    if (!window.electronAPI || !host.trim() || !port.trim()) {
      showMsg('Enter host and port first');
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const r = await window.electronAPI.checkProxyConfig({
        host: host.trim(),
        port: port.trim(),
        account: account.trim() || undefined,
        password: password || undefined,
        category: '4',
        type,
      });
      setResult(r);
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!window.electronAPI || !canSubmit) return;
    setSaving(true);
    try {
      const config = {
        category: '4',
        type,
        host: host.trim(),
        port: port.trim(),
        account: account.trim() || undefined,
        password: password || undefined,
        country: result?.country,
        city: result?.city,
        timezone: result?.timezone,
        ip: result?.exitIp,
        rotationMode: 'off' as const,
      };
      if (editing && existing) {
        await window.electronAPI.saveProxy({
          ...existing,
          name: name.trim(),
          proxy: { ...existing.proxy, ...config },
          exitIp: result?.exitIp ?? existing.exitIp,
          country: result?.country ?? existing.country,
          lastStatus: result ? (result.online ? 'online' : 'offline') : existing.lastStatus,
          lastLatencyMs: result?.latencyMs ?? existing.lastLatencyMs,
          lastChecked: result ? Date.now() : existing.lastChecked,
        });
      } else {
        await window.electronAPI.createProxy(name.trim(), config);
      }
      await onSaved();
      showMsg(editing ? 'Proxy updated' : 'Proxy added');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 'min(520px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editing ? 'Edit proxy' : 'Add proxy'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {/* Protocol type selector */}
          <div style={{ marginBottom: '1rem' }}>
            <div className="proxy-type-tabs">
              {(['HTTP', 'HTTPS', 'SOCKS5'] as ProxyType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={type === t ? 'active' : ''}
                  onClick={() => setType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Proxy name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. US Residential #1"
              autoFocus
              style={{ width: '100%' }}
            />
          </div>

          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Host / IP</label>
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="123.45.67.89" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Port</label>
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="8080" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Username <span className="label-opt">(optional)</span></label>
              <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="username" />
            </div>
            <div className="field">
              <label>Password <span className="label-opt">(optional)</span></label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
            </div>
          </div>

          <div className="field">
            <label>IP query channel</label>
            <select value={ipChannel} onChange={(e) => setIpChannel(e.target.value)} style={{ width: '100%' }}>
              {IP_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Test section */}
          <div style={{ marginTop: '0.25rem' }}>
            <div className="network-check-row">
              <button
                type="button"
                className="secondary"
                disabled={checking || !host.trim() || !port.trim()}
                onClick={runCheck}
              >
                <IconGlobe size={14} />
                {checking ? 'Detecting…' : 'Test connection'}
              </button>
              <span className="hint">Verify exit IP, location & latency</span>
            </div>

            {result && (
              <div style={{ marginTop: '0.75rem' }}>
                {result.online ? (
                  <div className="ip-check-card" style={{ padding: '12px 16px', gap: '8px' }}>
                    <div className="ip-check-card__header">
                      <span className="ip-check-card__flag" style={{ fontSize: 24 }}>
                        {result.countryCode ? getFlagEmoji(result.countryCode) : '🌐'}
                      </span>
                      <div className="ip-check-card__location">
                        <span className="ip-check-card__ip" style={{ fontSize: 13 }}>{result.exitIp}</span>
                        <span className="ip-check-card__geo" style={{ fontSize: 11 }}>{[result.city, result.country].filter(Boolean).join(', ')}</span>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        <span className={`risk-badge ${result.riskScore && result.riskScore >= 65 ? 'high' : result.riskScore && result.riskScore >= 30 ? 'medium' : 'low'}`} style={{ fontSize: 10 }}>
                          {result.riskScore !== undefined ? `Risk: ${result.riskScore}/100` : 'Connected'}
                        </span>
                      </div>
                    </div>
                    <div className="ip-check-card__grid" style={{ gap: '4px 12px' }}>
                      <div className="ip-check-card__row">
                        <span className="ip-check-card__label" style={{ fontSize: 9 }}>ISP</span>
                        <span className="ip-check-card__value" style={{ fontSize: 11 }} title={result.isp}>{result.isp || '—'}</span>
                      </div>
                      <div className="ip-check-card__row">
                        <span className="ip-check-card__label" style={{ fontSize: 9 }}>ASN</span>
                        <span className="ip-check-card__value" style={{ fontSize: 11 }} title={result.asn}>{result.asn || '—'}</span>
                      </div>
                      <div className="ip-check-card__row">
                        <span className="ip-check-card__label" style={{ fontSize: 9 }}>Timezone</span>
                        <span className="ip-check-card__value" style={{ fontSize: 11 }}>{result.timezone || '—'}</span>
                      </div>
                      <div className="ip-check-card__row">
                        <span className="ip-check-card__label" style={{ fontSize: 9 }}>Latency</span>
                        <span className="ip-check-card__value" style={{ fontSize: 11, color: result.latencyMs < 200 ? 'var(--green)' : result.latencyMs < 500 ? 'var(--orange)' : 'var(--red)' }}>{result.latencyMs} ms</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="proxy-test-result fail" style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8 }}>
                    <p className="text-danger" style={{ fontSize: 12.5, color: 'var(--red)' }}>
                      {result.error ?? 'Connection failed — check host, port and credentials'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button
            style={{ background: 'var(--brand-gradient)', color: '#fff' }}
            disabled={!canSubmit || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add proxy'}
          </button>
        </div>
      </div>
    </div>
  );
}
