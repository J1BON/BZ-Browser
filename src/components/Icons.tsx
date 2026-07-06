import React from 'react';

// ── Generic SVG wrapper ──────────────────────────────────────────────
interface IconProps { size?: number; className?: string; style?: React.CSSProperties; }

const Icon = ({ d, size = 16, className, style, viewBox = '0 0 16 16', fill = 'none', children }: IconProps & { d?: string; viewBox?: string; fill?: string; children?: React.ReactNode }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {d && <path d={d} />}
    {children}
  </svg>
);

// ── Navigation Icons ─────────────────────────────────────────────────
export const IconProfiles = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </Icon>
);

export const IconProxy = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </Icon>
);

export const IconGroups = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </Icon>
);

export const IconExtension = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.5 2.5 0 0 1 5 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/>
  </Icon>
);

export const IconSettings = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </Icon>
);

// ── Action Icons ─────────────────────────────────────────────────────
export const IconPlay = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5,3 19,12 5,21" stroke="none"/>
  </Icon>
);

export const IconStop = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" stroke="none"/>
  </Icon>
);

export const IconPlus = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M12 5v14M5 12h14"/>
  </Icon>
);

export const IconRefresh = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M23 4v6h-6"/>
    <path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </Icon>
);

export const IconSearch = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
  </Icon>
);

export const IconEdit = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </Icon>
);

export const IconTrash = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </Icon>
);

export const IconCopy = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </Icon>
);

export const IconClose = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M18 6 6 18M6 6l12 12"/>
  </Icon>
);

export const IconCloud = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </Icon>
);

export const IconShield = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </Icon>
);

export const IconChevronDown = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6"/>
  </Icon>
);

export const IconChevronRight = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M9 18l6-6-6-6"/>
  </Icon>
);

export const IconMoreHoriz = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="1" stroke="none"/>
    <circle cx="19" cy="12" r="1" stroke="none"/>
    <circle cx="5" cy="12" r="1" stroke="none"/>
  </Icon>
);

export const IconCheck = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12"/>
  </Icon>
);

export const IconArrowLeft = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </Icon>
);

export const IconGlobe = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </Icon>
);

export const IconBell = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </Icon>
);

export const IconKey = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="M21 2l-9.6 9.6"/>
    <path d="M15.5 7.5l3 3L22 7l-3-3"/>
  </Icon>
);

export const IconDownload = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </Icon>
);

export const IconUpload = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </Icon>
);

export const IconCookie = ({ size = 16 }: IconProps) => (
  <Icon size={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8.5 8.5v.01M12 12v.01M15.5 15.5v.01M8.5 15.5v.01"/>
  </Icon>
);

// ── Device / OS Icons ────────────────────────────────────────────────
export const IconWindows = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
  </svg>
);

export const IconMacos = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.16 1.26-2.14 3.76.03 2.99 2.63 3.99 2.66 4-.03.07-.41 1.4-1.37 2.76M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

export const IconAndroid = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.523 15.341c-.47 0-.853-.382-.853-.854 0-.47.382-.853.853-.853.47 0 .853.382.853.853 0 .472-.382.854-.853.854M6.477 15.341c-.47 0-.853-.382-.853-.854 0-.47.382-.853.853-.853.47 0 .853.382.853.853 0 .472-.382.854-.853.854M17.705 6.588l1.443-2.498a.3.3 0 0 0-.11-.41.3.3 0 0 0-.41.11l-1.463 2.532a9.006 9.006 0 0 0-3.165-.573 9 9 0 0 0-3.165.573L9.372 3.79a.3.3 0 0 0-.41-.11.3.3 0 0 0-.11.41l1.443 2.498C7.67 7.788 6 10.025 6 12.593h12c0-2.568-1.67-4.805-4.295-6.005"/>
  </svg>
);

export const IconIos = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
    <line x1="9" y1="6" x2="15" y2="6"/>
  </svg>
);

export const IconLinux = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.504 0c-.155 0-.315.008-.48.021C7.576.336 3.59 2.542 2.005 6.003c-.686 1.495-1.009 3.13-1.003 5.073.005 2.126.408 4.245 1.45 6.123.617 1.12 1.416 2.09 2.418 2.87.86.66 1.814 1.19 2.893 1.52.595.18 1.185.28 1.79.31.38.019.75.027 1.104.027 1.067 0 2.195-.14 3.305-.38 1.135-.25 2.23-.636 3.22-1.206 1.116-.64 2.1-1.5 2.85-2.59.96-1.39 1.56-3.02 1.78-4.77.14-1.1.14-2.22-.025-3.32-.36-2.36-1.57-4.41-3.43-5.75C16.12.62 14.34.002 12.504 0zM9.434 5.683c.14 0 .268.027.386.08.396.18.623.59.555 1.012-.07.42-.415.73-.843.76-.028.002-.055.003-.082.003a.91.91 0 0 1-.38-.08c-.397-.18-.623-.59-.555-1.012.068-.42.415-.73.843-.76a.97.97 0 0 1 .076-.003zm5.13 0c.027 0 .054.002.08.004.428.03.775.34.843.76.068.422-.158.832-.555 1.012a.91.91 0 0 1-.38.08.97.97 0 0 1-.082-.003c-.428-.03-.775-.34-.843-.76-.068-.422.158-.832.556-1.012.117-.053.245-.08.38-.08zM12 8c1.105 0 2 .447 2 1s-.895 1-2 1-2-.447-2-1 .895-1 2-1zm-4.5 3c.83 0 1.5.448 1.5 1s-.67 1-1.5 1S6 12.552 6 12s.67-1 1.5-1zm9 0c.83 0 1.5.448 1.5 1s-.67 1-1.5 1-1.5-.448-1.5-1 .67-1 1.5-1zm-4.5 2.5c2.21 0 4 1.343 4 3s-1.79 3-4 3-4-1.343-4-3 1.79-3 4-3z"/>
  </svg>
);

// Composite device icon used in tables/drawers
export const DeviceIcon = ({ device, formFactor, size = 16 }: { device: string; formFactor: string; size?: number }) => {
  if (formFactor === 'mobile') {
    return device === 'iOS' ? <IconIos size={size} /> : <IconAndroid size={size} />;
  }
  switch (device) {
    case 'MacOS': return <IconMacos size={size} />;
    case 'Linux': return <IconLinux size={size} />;
    default: return <IconWindows size={size} />;
  }
};

// OS Picker icon (larger, labeled)
export const OsPickerIcon = ({ os, size = 22 }: { os: string; size?: number }) => {
  switch (os) {
    case 'macos': return <IconMacos size={size} />;
    case 'android': return <IconAndroid size={size} />;
    case 'ios': return <IconIos size={size} />;
    case 'linux': return <IconLinux size={size} />;
    default: return <IconWindows size={size} />;
  }
};

// Chrome icon
export const IconChrome = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 8h9.5M8.5 14 4 6M15.5 14 8 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const IconFirefox = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M17.5 8.5C16.8 6.5 15 5 12.5 5c-3.9 0-7 3.1-7 7s3.1 7 7 7c2.2 0 4.2-1.1 5.5-2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

export const IconRisk = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export const IconIPCheck = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
  </svg>
);
