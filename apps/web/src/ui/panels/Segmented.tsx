import './panels.css';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A two-or-more way switch of toggle buttons (exactly one pressed). */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="pnl-segment">
      <legend className="pnl-visually-hidden">{legend}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="pnl-seg-btn"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
