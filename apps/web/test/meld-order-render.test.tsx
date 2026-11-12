/**
 * The question of the order of the two cards of a melded permanent that left the battlefield (D-993; CR 712.21a, 712.21b), drawn from the engine's own decision:
 * the dialog "Order the two cards" with one button for each card, the prompt for a graveyard, a library and exile, and its routing in the modal overlays.
 * Cards are SYNTHETIC (the engine's fixtures `SYNTHETIC Dusk Squire` and `SYNTHETIC Dawn Squire`).
 */
import type { ChooseOptionDecision, GameView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { NamedOptionDialog } from '../src/ui/decisions/NamedOptionDialog';
import { ModalOverlay } from '../src/ui/decisions/Overlays';
import {
  isMeldOrderChoice,
  meldOrderPrompt,
  namedOptionPrompt,
} from '../src/ui/decisions/option-names';
import { initialUi } from '../src/ui/decisions/ui-state';

const DUSK = 'SYNTHETIC Dusk Squire';
const DAWN = 'SYNTHETIC Dawn Squire';
const none = () => {};

/** The real pending question after a melded permanent of seat 0 leaves for the zone `spell` sends it to. */
const asked = (spell: string, caster: 0 | 1 = 0) => {
  const g = scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Plains', 'Island', 'Island')
    .hand(...(caster === 0 ? [spell] : []))
    .library('Island', { count: 6 })
    .seat(1)
    .battlefield(...(caster === 1 ? ['Swamp', 'Swamp', 'Swamp', 'Plains', 'Island'] : ['Island']))
    .hand(...(caster === 1 ? [spell] : []))
    .library('Island', { count: 6 })
    .at('precombatMain', { active: caster, turn: 4, priority: caster })
    .build();
  g.act(caster).cast(spell, { targets: ['dusk'], pay: true });
  g.passAll();
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('no chooseOption pending');
  return { g, d: d as ChooseOptionDecision };
};

describe('the dialog', () => {
  test('is "Order the two cards", names the source, and offers one button for each card', () => {
    const { d } = asked('Murder');
    expect(isMeldOrderChoice(d)).toBe(true);
    const html = renderToStaticMarkup(<NamedOptionDialog d={d} act={none} />);
    expect(html).toContain('aria-label="Order the two cards"');
    expect(html).toContain(`>${DUSK} and ${DAWN}</h2>`);
    expect(html).toContain(`data-option="${DUSK}"`);
    expect(html).toContain(`data-option="${DAWN}"`);
    expect(html).not.toContain('>Cancel<');
  });

  test('says which card goes on top of the graveyard', () => {
    const { d } = asked('Murder');
    expect(d.meldOrder?.zone).toBe('graveyard');
    expect(renderToStaticMarkup(<NamedOptionDialog d={d} act={none} />)).toContain(
      `${DUSK} and ${DAWN} were one permanent. Choose which card goes on top of your graveyard.`,
    );
  });

  test('says which card goes on top of the library and that the order is not revealed', () => {
    const { d } = asked('SYNTHETIC Meld Tuck');
    expect(d.meldOrder?.zone).toBe('library');
    expect(namedOptionPrompt(d)).toBe(
      `${DUSK} and ${DAWN} were one permanent. Choose which card goes on top of your library (the order is not revealed).`,
    );
  });

  test('says which card is exiled last, and asks the player who exiled it', () => {
    const { d } = asked('SYNTHETIC Meld Exile', 1);
    expect(d.meldOrder?.zone).toBe('exile');
    expect(d.seat).toBe(1);
    expect(namedOptionPrompt(d)).toBe(
      `${DUSK} and ${DAWN} were one permanent. Choose which card is exiled last (has the later timestamp).`,
    );
  });

  test('the prompt of a zone that is not given is the graveyard one', () => {
    expect(meldOrderPrompt('A and B', undefined)).toBe(
      'A and B were one permanent. Choose which card goes on top of your graveyard.',
    );
  });
});

describe('the modal overlay', () => {
  test('routes the question to the dialog of named options', () => {
    const { g, d } = asked('Murder');
    const view = g.view(0) as GameView;
    const ui = initialUi(d);
    const ctl: Controller = { act: none, update: none, openChooser: none };
    const node = ModalOverlay({
      view,
      pending: d,
      ui,
      model: buildModel(view, d, ui, ctl),
      update: none,
      act: none,
      error: null,
    });
    expect(renderToStaticMarkup(<>{node}</>)).toContain('aria-label="Order the two cards"');
  });
});
