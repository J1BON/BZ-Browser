export interface ParsedProxy {
  type: 'HTTP' | 'HTTPS' | 'SOCKS5' | 'SOCKS4';
  host: string;
  port: string;
  account: string;
  password: string;
}

function normalizeType(raw: string): ParsedProxy['type'] {
  const t = raw.toLowerCase().replace(/:\/\//, '');
  if (t.startsWith('socks5') || t === 'socks') return 'SOCKS5';
  if (t.startsWith('socks4')) return 'SOCKS4';
  if (t.startsWith('https')) return 'HTTPS';
  return 'HTTP';
}

/** Parse pasted proxy strings in common antidetect / provider formats. */
export function parseProxyPaste(raw: string): ParsedProxy {
  const empty: ParsedProxy = { type: 'HTTP', host: '', port: '', account: '', password: '' };
  let s = raw.trim();
  if (!s) return empty;

  // Strip wrapping quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  // URL: scheme://[user:pass@]host:port
  const urlRe = /^(?:(socks5?|socks4|https?):\/\/)?(?:([^:@\s]+):([^@\s]+)@)?([^\s:/]+):(\d+)\s*$/i;
  const urlMatch = s.match(urlRe);
  if (urlMatch) {
    return {
      type: normalizeType(urlMatch[1] ?? 'http'),
      account: decodeURIComponent(urlMatch[2] ?? ''),
      password: decodeURIComponent(urlMatch[3] ?? ''),
      host: urlMatch[4],
      port: urlMatch[5],
    };
  }

  // user:pass@host:port (no scheme)
  const atMatch = s.match(/^([^:@\s]+):([^@\s]+)@([^:\s]+):(\d+)$/);
  if (atMatch) {
    return {
      type: 'HTTP',
      account: atMatch[1],
      password: atMatch[2],
      host: atMatch[3],
      port: atMatch[4],
    };
  }

  // host:port:user:pass (most common paste)
  if (s.includes(':')) {
    const parts = s.split(':');
    if (parts.length >= 4 && /^\d+$/.test(parts[1])) {
      return {
        type: 'HTTP',
        host: parts[0],
        port: parts[1],
        account: parts[2],
        password: parts.slice(3).join(':'),
      };
    }
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
      return { type: 'HTTP', host: parts[0], port: parts[1], account: '', password: '' };
    }
    if (parts.length === 3 && /^\d+$/.test(parts[1])) {
      return { type: 'HTTP', host: parts[0], port: parts[1], account: parts[2], password: '' };
    }
  }

  // space or tab separated: host port user pass [type]
  const tokens = s.split(/[\s\t]+/).filter(Boolean);
  if (tokens.length >= 2 && /^\d+$/.test(tokens[1])) {
    const maybeType = tokens[tokens.length - 1]?.toLowerCase();
    const hasType = ['http', 'https', 'socks5', 'socks4', 'socks'].includes(maybeType);
    const type = hasType ? normalizeType(maybeType) : 'HTTP';
    const end = hasType ? tokens.length - 1 : tokens.length;
    return {
      type,
      host: tokens[0],
      port: tokens[1],
      account: end > 2 ? tokens[2] : '',
      password: end > 3 ? tokens.slice(3, end).join(' ') : '',
    };
  }

  return { ...empty, host: s };
}

export function formatProxyDisplay(p: ParsedProxy): string {
  if (!p.host) return '';
  const auth = p.account ? `${p.account}:***@` : '';
  const scheme = p.type === 'HTTP' ? '' : `${p.type.toLowerCase()}://`;
  return `${scheme}${auth}${p.host}:${p.port}`;
}
