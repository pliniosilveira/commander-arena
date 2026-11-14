/**
 * #44: a "you may" trigger that reads "that card" names the card in its dialog, and the name is
 * hoverable (it drives the preview panel). The question is the real one of the engine: Hashaton's
 * trigger (SYNTHETIC Scarab Fist) after a creature card is discarded.
 */
import type { ConfirmOptionalDecision, GameView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { OptionalDialog } from '../src/ui/decisions/OptionalDialog';
import { optionalSubject } from '../src/ui/decisions/optional';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StoreProvider } from '../src/ui/store-context';

const SCARAB = 'SYNTHETIC Scarab Fist';
const TIDY = 'SYNTHETIC Tidy Discard';
const none = () => {};

/** The question after seat 0 discards `card` to a spell with Scarab Fist on the battlefield. */
const asked = (card: string) => {
  const g = scenario()
    .seat(0)
    .life(20)
    .hand(TIDY, card)
    .battlefield(SCARAB, 'Island', 'Island', 'Island', 'Swamp', 'Swamp')
    .library('Plains', { count: 14 })
    .seat(1)
    .life(20)
    .library('Plains', { count: 14 })
    .at('precombatMain')
    .build();
  g.act(0).cast(TIDY, { pay: true });
  g.passAll();
  if (g.state.pending?.kind === 'discard' || g.state.pending?.kind === 'chooseCards') {
    g.act(0).chooseCards(card);
  }
  g.passAll();
  const d = g.state.pending;
  if (d?.kind !== 'confirmOptional') throw new Error(`pending is ${d?.kind}`);
  const view = g.view(0) as GameView;
  return { d: d as ConfirmOptionalDecision, view, index: objectIndex(view) };
};

/** A store with just what a hover needs; the dialog never reads anything else. */
const hoverStore = (log: string[]) => {
  const state = { hover: (id: string | null) => log.push(`hover ${id}`), pin: () => {} };
  return {
    getState: () => state,
    getInitialState: () => state,
    subscribe: () => () => {},
  } as unknown as Parameters<typeof StoreProvider>[0]['store'];
};

describe('the card a trigger is about', () => {
  test('is the discarded card, found in view', () => {
    const { d, index } = asked('Grizzly Bears');
    expect(optionalSubject(d, index)?.name).toBe('Grizzly Bears');
  });

  test('the dialog says "For" and the name, which a hover or focus reaches', () => {
    const { d, view, index } = asked('Llanowar Elves');
    const ui = initialUi(d);
    const ctl: Controller = { act: none, update: none, openChooser: none };
    const subject = optionalSubject(d, index);
    const html = renderToStaticMarkup(
      <StoreProvider store={hoverStore([])}>
        <OptionalDialog d={d} model={buildModel(view, d, ui, ctl)} index={index} />
      </StoreProvider>,
    );
    expect(subject?.name).toBe('Llanowar Elves');
    expect(html).toContain('class="dec-card-link"');
    expect(html).toMatch(
      /For[^<]*(<!-- -->)?\s*<button type="button" class="dec-card-link"[^>]*>Llanowar Elves<\/button>/,
    );
  });

  test('another question has no such line', () => {
    const { d, index } = asked('Grizzly Bears');
    expect(optionalSubject({ ...d, purpose: 'ward' }, index)).toBeNull();
    expect(optionalSubject({ ...d, source: 'o99999' }, index)).toBeNull();
  });
});
