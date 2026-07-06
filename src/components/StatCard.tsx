import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  accent?: boolean;
}

export function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div style={{
      background: accent ? 'var(--accent-dim)' : 'var(--surface-2)',
      border: `1px solid ${accent ? 'rgba(79,142,247,0.25)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '0.85rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}>
      {icon && (
        <div style={{
          width: 36, height: 36,
          borderRadius: 10,
          background: accent ? 'var(--accent-dim-2)' : 'var(--surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent ? 'var(--accent)' : 'var(--text-secondary)',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
