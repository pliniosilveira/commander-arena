import type { ReactNode } from 'react';

/** A centered modal card over the board: one decision, with its own buttons. */
export function Dialog({
  label,
  className = '',
  popup = false,
  children,
}: {
  label: string;
  className?: string;
  /** Over the whole window, not only over the board (the opening hand, issue 48). */
  popup?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={popup ? 'dec-overlay dec-overlay-popup' : 'dec-overlay'}>
      <section
        className={`dec-dialog dec-panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </section>
    </div>
  );
}
