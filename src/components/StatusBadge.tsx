interface StatusBadgeProps {
  status: 'online' | 'offline' | 'unchecked' | 'direct' | 'running';
  pulse?: boolean;
  label?: string;
}

export function StatusBadge({ status, pulse, label }: StatusBadgeProps) {
  const statusLabels: Record<string, string> = {
    online: 'Online',
    offline: 'Failed',
    unchecked: 'Unchecked',
    direct: 'Direct',
    running: 'Running',
  };

  const cls = status === 'running' ? 'online' : status;
  const displayLabel = label ?? statusLabels[status];

  return (
    <span className={`proxy-status-pill ${cls}`}>
      <span className={`status-dot-sm${pulse ? ' pulse' : ''}`} />
      {displayLabel}
    </span>
  );
}
