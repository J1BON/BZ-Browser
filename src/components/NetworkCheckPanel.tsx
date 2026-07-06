import { useState } from 'react';
import type { ProxyHealthResult } from '../types/phase4';
import { parseProxyPaste } from '../utils/proxy-parse';
import { IconGlobe } from './Icons';

interface NetworkCheckPanelProps {
  proxyPaste: string;
  proxyId?: string;
  proxies?: { id: string; name: string }[];
  onCheckConfig?: (config: { host: string; port: string; account?: string; password?: string; category: string; type: string }) => Promise<ProxyHealthResult>;
  onCheckSaved?: (id: string) => Promise<ProxyHealthResult>;
}

export function NetworkCheckPanel({ proxyPaste, proxyId, onCheckConfig, onCheckSaved }: NetworkCheckPanelProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ProxyHealthResult | null>(null);

  const runCheck = async () => {
    if (!window.electronAPI) return;
    setChecking(true);
    setResult(null);
    try {
      let r: ProxyHealthResult;
      if (proxyId && onCheckSaved) {
        r = await onCheckSaved(proxyId);
      } else {
        const parsed = parseProxyPaste(proxyPaste);
        if (!parsed) {
          setResult({ id: 'inline', online: false, latencyMs: 0, error: 'Invalid format — use host:port or host:port:user:pass' });
          return;
        }
        r = onCheckConfig
          ? await onCheckConfig({
              host: parsed.host,
              port: parsed.port,
              account: parsed.account,
              password: parsed.password,
              category: '4',
              type: 'CustomProxy',
            })
          : await window.electronAPI.checkProxyConfig({
              host: parsed.host,
              port: parsed.port,
              account: parsed.account,
              password: parsed.password,
              category: '4',
              type: 'CustomProxy',
            });
      }
      setResult(r);
    } finally {
      setChecking(false);
    }
  };

  const canCheck = !!proxyId || proxyPaste.trim().length > 0;

  return (
    <div>
      <div className="network-check-row">
        <button type="button" className="secondary" disabled={checking || !canCheck} onClick={runCheck} style={{ gap: '0.4rem' }}>
          <IconGlobe size={14} />
          {checking ? 'Detecting…' : 'Network detection'}
        </button>
        <span className="hint">Verify exit IP, country and latency</span>
      </div>
      {result && (
        <div className={`network-result ${result.online ? 'ok' : 'fail'}`} style={{ marginTop: '0.75rem' }}>
          {result.online ? (
            <>
              <div className="network-result-row"><span>Status</span><strong className="text-success">✓ Connected</strong></div>
              <div className="network-result-row"><span>Exit IP</span><strong style={{ fontFamily: 'monospace' }}>{result.exitIp ?? '—'}</strong></div>
              <div className="network-result-row"><span>Location</span><strong>{[result.country, result.city].filter(Boolean).join(' / ') || '—'}</strong></div>
              <div className="network-result-row"><span>Timezone</span><strong>{result.timezone ?? '—'}</strong></div>
              <div className="network-result-row"><span>Latency</span><strong>{result.latencyMs} ms</strong></div>
            </>
          ) : (
            <p className="text-danger" style={{ fontSize: 12.5 }}>{result.error ?? 'Connection failed'}</p>
          )}
        </div>
      )}
    </div>
  );
}
