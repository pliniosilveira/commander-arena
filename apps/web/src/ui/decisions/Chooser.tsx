import type { Action, PendingDecision } from '@commander-arena/engine';
import { ManaSymbol } from '../mana';
import { AbilityChooser } from './AbilityChooser';
import { type Index, nameOf } from './lookup';
import { comboListText, comboText, lifeCostOf, lifeNote } from './mana-choice';
import { Popover } from './Popover';
import { setTapColor, setTapCombination, setTapSacrifice } from './payment';
import { clickOutcome } from './priority';
import type { UiState } from './ui-state';

/**
 * The popover that asks which color of mana (or which ability) a source should use: at priority
 * for a mana ability with a choice, and while paying manually for a source of any color.
 */
export function ChooserPopover({
  pending,
  ui,
  act,
  update,
  close,
  index,
}: {
  pending: PendingDecision;
  ui: UiState;
  act: (action: Action) => void;
  update: (change: (ui: UiState) => UiState) => void;
  close: () => void;
  /** The objects of the view, to name the abilities in the menu. */
  index?: Index;
}) {
  const anchor = ui.chooser;
  if (anchor === null) return null;
  const closeButton = (
    <button type="button" className="dec-chip" aria-label="Close" onClick={close}>
      ×
    </button>
  );
  if (pending.kind === 'payMana') {
    const sources = pending.manaSources;
    // The colors the engine offers for the ability being asked about, in its order.
    const ability = sources.find(
      (s) => s.object === anchor.object && s.abilityIndex === anchor.abilityIndex,
    );
    const colors = ability?.colors ?? [];
    const combinations = ability?.combinations ?? [];
    // D-222 (CR 601.2b): "Sacrifice a Spirit: Add {R}.": the player chooses the permanent first; an ability that also asks a color asks it next.
    const gives = ability?.sacrifices ?? [];
    if (gives.length > 1 && anchor.sacrifice === undefined) {
      const asksMore = colors.length > 1 || combinations.length > 1;
      return (
        <Popover anchor={anchor} className="dec-ability-chooser">
          <legend className="dec-popover-title">Sacrifice which permanent?</legend>
          <ul className="dec-ability-list">
            {gives.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="dec-chip"
                  onClick={() =>
                    update((u) =>
                      asksMore
                        ? { ...u, chooser: { ...anchor, sacrifice: id } }
                        : {
                            ...u,
                            taps: setTapSacrifice(
                              u.taps,
                              sources,
                              anchor.object,
                              anchor.abilityIndex ?? 0,
                              id,
                            ),
                            chooser: null,
                          },
                    )
                  }
                >
                  {index === undefined ? id : nameOf(index, id)}
                </button>
              </li>
            ))}
            <li>{closeButton}</li>
          </ul>
        </Popover>
      );
    }
    const life = lifeCostOf(index?.get(anchor.object), colors[0] ?? null, combinations[0]);
    if (combinations.length > 0) {
      return (
        <Popover anchor={anchor}>
          <legend className="dec-popover-title">Add {comboListText(combinations)}?</legend>
          <div className="dec-popover-row">
            {combinations.map((combination) => (
              <button
                key={combination.join('')}
                type="button"
                className="dec-chip dec-chip-mana"
                aria-label={`Add ${comboText(combination)}`}
                onClick={() =>
                  update((u) => ({
                    ...u,
                    taps: setTapCombination(
                      u.taps,
                      sources,
                      anchor.object,
                      anchor.abilityIndex ?? 0,
                      combination,
                      anchor.sacrifice,
                    ),
                    chooser: null,
                  }))
                }
              >
                <ManaSymbols symbols={combination} />
              </button>
            ))}
            {closeButton}
          </div>
        </Popover>
      );
    }
    return (
      <Popover anchor={anchor}>
        <legend className="dec-sr">Choose a color of mana</legend>
        <div className="dec-popover-row">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className="dec-chip dec-chip-mana"
              aria-label={`Add ${color}${life > 0 ? ` (${lifeNote(life).toLowerCase()})` : ''}`}
              onClick={() =>
                update((u) => ({
                  ...u,
                  taps: setTapColor(
                    u.taps,
                    sources,
                    anchor.object,
                    anchor.abilityIndex ?? 0,
                    color,
                    anchor.sacrifice,
                  ),
                  chooser: null,
                }))
              }
            >
              <ManaSymbol symbol={color} />
              {life > 0 && <span className="dec-chip-note">{`-${life} life`}</span>}
            </button>
          ))}
          {closeButton}
        </div>
      </Popover>
    );
  }
  if (pending.kind !== 'priority') return null;
  const outcome = clickOutcome(pending, anchor.object, index);
  if (outcome.kind === 'menu') {
    return (
      <AbilityChooser
        items={outcome.items}
        anchor={anchor}
        pick={(i) => act(i.action)}
        close={close}
      />
    );
  }
  if (outcome.kind !== 'choose') return null;
  // A filter land asks which combination, in words as well as symbols (D-099). Its plain tap, which
  // the view does not say what it makes, is a button of its own and is left out of the sentence.
  const asksCombination = outcome.choices.some((c) => c.combination !== undefined);
  const wanted = outcome.choices.flatMap((c) =>
    c.combination !== undefined ? [c.combination] : c.color === null ? [] : [[c.color]],
  );
  return (
    <Popover anchor={anchor}>
      {asksCombination ? (
        <legend className="dec-popover-title">Add {comboListText(wanted)}?</legend>
      ) : (
        <legend className="dec-sr">Choose mana</legend>
      )}
      <div className="dec-popover-row">
        {outcome.choices.map((c) => (
          <button
            key={`${c.action.abilityIndex}-${c.combination?.join('') ?? c.color ?? 'x'}-${c.sacrifice ?? ''}`}
            type="button"
            className="dec-chip dec-chip-mana"
            aria-label={`${c.sacrificeName === undefined ? c.label : `${c.label}, sacrificing ${c.sacrificeName}`}${c.life > 0 ? ` (${lifeNote(c.life).toLowerCase()})` : ''}`}
            title={c.life > 0 ? lifeNote(c.life) : undefined}
            onClick={() => act(c.action)}
          >
            {c.sacrificeName !== undefined ? (
              <>
                Sacrifice {c.sacrificeName}
                {c.color === null ? null : <ManaSymbol symbol={c.color} />}
              </>
            ) : c.combination !== undefined ? (
              <ManaSymbols symbols={c.combination} />
            ) : c.color === null ? (
              c.label
            ) : (
              <ManaSymbol symbol={c.color} />
            )}
            {c.life > 0 && <span className="dec-chip-note">{`-${c.life} life`}</span>}
          </button>
        ))}
        {closeButton}
      </div>
    </Popover>
  );
}

/** Several mana symbols in a row, as a combination reads: {R}{W}. */
function ManaSymbols({ symbols }: { symbols: readonly string[] }) {
  return (
    <span className="dec-symbols">
      {symbols.map((symbol, i) => (
        // A combination can repeat a color ({R}{R}), so the position is the only stable key.
        // biome-ignore lint/suspicious/noArrayIndexKey: positional list of symbols
        <ManaSymbol key={i} symbol={symbol} />
      ))}
    </span>
  );
}
