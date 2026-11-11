import type { ButtonSpec } from './model';

/** The buttons of the action bar model; the primary one carries `data-dec-primary`. */
export function BarButtons({ buttons }: { buttons: readonly ButtonSpec[] }) {
  return (
    <div className="dec-buttons" data-count={buttons.length}>
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          className={`dec-btn dec-btn-${b.variant}`}
          disabled={b.disabled}
          title={b.hint ?? undefined}
          aria-label={b.ariaLabel}
          data-dec-primary={b.variant === 'primary' ? '' : undefined}
          onClick={b.run}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
