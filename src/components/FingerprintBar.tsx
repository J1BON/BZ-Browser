interface FingerprintBarProps {
  score: number;          // 0–100
  level: 'strong' | 'fair' | 'weak';
  issues?: { severity: 'error' | 'warn'; text: string }[];
  compact?: boolean;
}

export function FingerprintBar({ score, level, issues, compact }: FingerprintBarProps) {
  const levelLabel = level === 'strong' ? 'Strong' : level === 'fair' ? 'Fair' : 'Weak';
  const labelColor = level === 'strong' ? 'var(--green)' : level === 'fair' ? 'var(--orange)' : 'var(--red)';

  return (
    <div className="fp-health-bar-wrap">
      <div className="fp-health-bar-label">
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fingerprint health</span>
        <span style={{ color: labelColor, fontWeight: 700, fontSize: 12 }}>{levelLabel} · {score}%</span>
      </div>
      <div className="fp-health-bar-track">
        <div
          className={`fp-health-bar-fill ${level}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {!compact && issues && issues.length > 0 && (
        <div style={{ marginTop: '0.6rem' }}>
          {issues.map((issue, i) => (
            <div key={i} className={`fp-issue ${issue.severity}`}>
              {issue.text}
            </div>
          ))}
        </div>
      )}
      {!compact && (!issues || issues.length === 0) && (
        <div style={{
          marginTop: '0.6rem',
          fontSize: 12,
          color: 'var(--green)',
          background: 'var(--green-dim)',
          border: '1px solid rgba(35,199,142,0.2)',
          borderRadius: 'var(--radius)',
          padding: '0.45rem 0.65rem',
        }}>
          ✓ All fingerprint checks passed
        </div>
      )}
    </div>
  );
}
