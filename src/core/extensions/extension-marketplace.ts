/** Curated extension marketplace entries (load unpacked from known sources) */
export interface MarketplaceExtension {
  id: string;
  name: string;
  description: string;
  category: string;
  chromeStoreId?: string;
  broearnBundled?: boolean;
}

export const EXTENSION_MARKETPLACE: MarketplaceExtension[] = [
  { id: 'ublock', name: 'uBlock Origin', description: 'Ad blocker', category: 'privacy', chromeStoreId: 'cjpalhdlnbpafiamejdnhcphjbkeiagm' },
  { id: 'cookie-editor', name: 'Cookie-Editor', description: 'View/edit cookies', category: 'tools', chromeStoreId: 'hlkenndednhfkekjgcdcmfbjjkdaojbc' },
  { id: 'user-agent-switcher', name: 'User-Agent Switcher', description: 'UA management', category: 'fingerprint', chromeStoreId: 'bhchdcejhohkmalllnnjafjhppblljkb' },
  { id: 'webRTC-control', name: 'WebRTC Control', description: 'WebRTC leak control', category: 'privacy', chromeStoreId: 'eiadeoaijlgfihjailjmomakpmljcgbg' },
  { id: 'canvas-defender', name: 'Canvas Defender', description: 'Canvas fingerprint protection', category: 'fingerprint', chromeStoreId: 'kbfnbcaeplbcioakkpcpgfkobkghlhen' },
  { id: 'proxy-helper', name: 'Proxy Helper', description: 'Per-tab proxy rules', category: 'proxy', chromeStoreId: 'mnloefcpaepkpmhaoipjkpikbnkmbnic' },
  { id: 'tampermonkey', name: 'Tampermonkey', description: 'Userscript manager', category: 'automation', chromeStoreId: 'dhdgffkkebhmkfjojejmpbldmpobfkfo' },
  { id: 'metamask', name: 'MetaMask', description: 'Crypto wallet', category: 'web3', chromeStoreId: 'nkbihfbeogaeaoehlefnkodbefgpgknn' },
];

export function listMarketplace(): MarketplaceExtension[] {
  return EXTENSION_MARKETPLACE;
}

export function getMarketplaceExtension(id: string): MarketplaceExtension | undefined {
  return EXTENSION_MARKETPLACE.find((e) => e.id === id);
}
