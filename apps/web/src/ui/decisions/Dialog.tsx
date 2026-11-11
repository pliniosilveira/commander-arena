import type { ReactNode } from 'react';

/** A centered modal card over the board: one decision, with its own buttons. */
export function Dialog({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="dec-overlay">
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
