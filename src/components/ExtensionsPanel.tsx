import { useState } from 'react';
import type { ExtensionEntry } from '../types/phase4';
import { IconExtension, IconTrash, IconUpload, IconDownload } from './Icons';

interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  chromeStoreId?: string;
}

interface ExtensionsPanelProps {
  extensions: ExtensionEntry[];
  marketplace: MarketplaceItem[];
  onRefresh: () => Promise<void>;
  showMsg: (text: string) => void;
}

export function ExtensionsPanel({ extensions, marketplace, onRefresh, showMsg }: ExtensionsPanelProps) {
  const [storeUrl, setStoreUrl] = useState('');
  const [installing, setInstalling] = useState(false);

  const installFromStore = async (urlOrId: string) => {
    if (!window.electronAPI) return;
    setInstalling(true);
    try {
      const r = await window.electronAPI.installExtensionFromStore(urlOrId);
      if (r.error) showMsg(r.error);
      else showMsg(`Added ${r.name ?? 'extension'}`);
      setStoreUrl('');
      await onRefresh();
    } finally {
      setInstalling(false);
    }
  };

  const uploadFolder = async () => {
    if (!window.electronAPI) return;
    setInstalling(true);
    try {
      const r = await window.electronAPI.importExtensionFolder();
      if (r.canceled) return;
      if (r.error) showMsg(r.error);
      else showMsg(`Added ${r.name ?? 'extension'}`);
      await onRefresh();
    } finally {
      setInstalling(false);
    }
  };

  const uploadCrx = async () => {
    if (!window.electronAPI) return;
    setInstalling(true);
    try {
      const r = await window.electronAPI.importExtensionCrx();
      if (r.canceled) return;
      if (r.error) showMsg(r.error);
      else showMsg(`Added ${r.name ?? 'extension'}`);
      await onRefresh();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="content-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">Extensions</h2>
          <p className="panel-desc">Add extensions once — enable them per profile when editing.</p>
        </div>
      </div>

      {/* Add extension card */}
      <div className="ext-add-card" style={{ marginBottom: '1.25rem' }}>
        <label>Install from Chrome Web Store</label>
        <div className="create-row" style={{ marginBottom: '0.65rem' }}>
          <input
            style={{ flex: 1 }}
            placeholder="https://chromewebstore.google.com/detail/…"
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && storeUrl.trim() && installFromStore(storeUrl)}
          />
          <button
            disabled={installing || !storeUrl.trim()}
            style={{ background: 'var(--brand-gradient)', color: '#fff', minWidth: 80 }}
            onClick={() => installFromStore(storeUrl)}
          >
            {installing ? '…' : 'Install'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="secondary" disabled={installing} onClick={uploadFolder} style={{ fontSize: 12 }}>
            <IconUpload size={13} /> Upload folder
          </button>
          <button className="secondary" disabled={installing} onClick={uploadCrx} style={{ fontSize: 12 }}>
            <IconDownload size={13} /> Upload .crx
          </button>
        </div>
      </div>

      {/* Marketplace */}
      {marketplace.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Popular extensions
          </h3>
          <div className="marketplace-grid">
            {marketplace.slice(0, 6).map((ext) => (
              <div key={ext.id} className="marketplace-card">
                <div>
                  <div className="marketplace-card-name">{ext.name}</div>
                  <div className="marketplace-card-desc">{ext.description}</div>
                </div>
                {ext.chromeStoreId && (
                  <button
                    className="ghost sm"
                    disabled={installing}
                    onClick={() => installFromStore(ext.chromeStoreId!)}
                    style={{ marginTop: '0.5rem', width: '100%' }}
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Installed */}
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Installed ({extensions.length})
        </h3>
        {extensions.length === 0 ? (
          <div className="empty-hero small">
            <div className="empty-icon"><IconExtension size={26} /></div>
            <h3>No extensions</h3>
            <p>Add extensions from the Chrome Web Store or upload a folder.</p>
          </div>
        ) : (
          <div className="table-card">
            <ul className="ext-list">
              {extensions.map((ext) => (
                <li key={ext.id} style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ width: 32, height: 32, background: 'var(--surface-2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                    <IconExtension size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 13, display: 'block' }}>{ext.name}</strong>
                    {ext.version && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{ext.version}</span>}
                  </div>
                  <button
                    className="icon-btn ghost"
                    title="Remove extension"
                    style={{ color: 'var(--red)' }}
                    onClick={async () => {
                      await window.electronAPI!.removeExtension(ext.id);
                      await onRefresh();
                      showMsg('Extension removed');
                    }}
                  >
                    <IconTrash size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
