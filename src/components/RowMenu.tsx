import { useEffect, useRef, useState } from 'react';
import { IconMoreHoriz } from './Icons';

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface RowMenuProps {
  items: MenuItem[];
}

export function RowMenu({ items }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Determine if popover should open upward
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setUp(rect.bottom + 200 > window.innerHeight);
    }
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button
        className="icon-btn row-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        title="More actions"
      >
        <IconMoreHoriz size={16} />
      </button>
      {open && (
        <div className={`row-menu-popover${up ? ' up' : ''}`} role="menu">
          {items.map((item, i) => (
            <button
              key={i}
              className={`row-menu-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              role="menuitem"
            >
              {item.icon && <span className="row-menu-icon">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
