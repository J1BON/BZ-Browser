import type { ProxyDisplay } from '../utils/format';

interface ProxyDisplayCellProps {
  display: ProxyDisplay;
}

export function ProxyDisplayCell({ display }: ProxyDisplayCellProps) {
  const dotClass =
    display.status === 'online' ? 'dot-online' :
    display.status === 'offline' ? 'dot-offline' :
    display.status === 'direct' ? 'dot-direct' :
    'dot-unchecked';

  return (
    <div className="proxy-display-cell">
      <span className={`status-dot ${dotClass}`} />
      <div className="proxy-display-text">
        <span className="proxy-line1">{display.line1}</span>
        {display.line2 && <span className="proxy-line2">{display.line2}</span>}
      </div>
    </div>
  );
}
