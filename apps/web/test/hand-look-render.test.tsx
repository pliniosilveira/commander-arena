/**
 * "Look at defending player's hand. You may put a creature card from it onto the battlefield ..." (CR 402.3) drawn: the question lists the creature cards that can be chosen and
 * shows the rest of the hand apart, only to the player who looks. The card is the SYNTHETIC `SYNTHETIC Pack Kobold` with its first effect replaced by the choice from the
 * defending player's hand (the shape the parser gives Zara, Renegade Recruiter); the host reads the faces of the other cards from the state (`looked-cards.ts`).
 */
import { getView, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// The picker hovers cards through the store, which this render does not have: no hover here.
vi.mock('../src/ui/decisions/hover', () => ({ useHoverProps: () => () => ({}) }));

import { lookedCards } from '../src/game/looked-cards';
import { CardPickerPanel } from '../src/ui/decisions/CardPickerPanel';
import { initialUi } from '../src/ui/decisions/ui-state';
import { StoreProvider } from '../src/ui/store-context';

const LOOKER = 'SYNTHETIC Pack Kobold';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

/** The Kobold, whose attack trigger now looks at the defending player's hand and puts a creature card from it onto the battlefield tapped and attacking. */
function looker() {
  const card = syntheticCard(LOOKER);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  const replace = (a: unknown): unknown => {
    const ability = a as { kind: string; interveningIf?: unknown; effect?: { kind: string } };
    if (ability.kind !== 'triggered') return a;
    const { interveningIf: _total, ...rest } = ability;
    return {
      ...rest,
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'moveToZone',
            objects: {
              kind: 'choose',
              filter: { zone: 'hand', types: ['creature'], controller: 'you', card: true },
              optional: true,
              fromHandOf: { kind: 'defendingPlayer' },
            },
            to: 'battlefield',
            tapped: true,
            controller: 'you',
          },
          {
            kind: 'enterAttacking',
            objects: { kind: 'moved' },
            thatPlayerOrTheirPlaneswalkers: true,
          },
        ],
      },
    };
  };
  return { ...card, faces: [{ ...face, abilities: face.abilities.map(replace) }] } as never;
}

const attack = (...theirHand: readonly string[]) => {
  const g = scenario()
    .define(looker())
    .seat(0)
    .battlefield(LOOKER)
    .seat(1)
    .hand(...theirHand)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: LOOKER }]);
  g.passAll();
  return g;
};

/** A store that holds only what the panel reads: the cards the host sent with the snapshot. */
function fakeStore(others: ReturnType<typeof lookedCards>) {
  const state = { snapshot: { lookedCards: others } };
  return {
    subscribe: () => () => undefined,
    getState: () => state,
    getInitialState: () => state,
  } as never;
}

function render(g: ReturnType<typeof attack>) {
  const view = getView(g.state, 0);
  const d = view.pending;
  if (d?.kind !== 'chooseCards') throw new Error('no chooseCards decision');
  return renderToStaticMarkup(
    <StoreProvider store={fakeStore(lookedCards(g.state, 0))}>
      <CardPickerPanel decision={d} view={view} ui={initialUi(d)} update={() => {}} />
    </StoreProvider>,
  );
}

describe('the hand looked at', () => {
  test('the host sends the faces of the cards that cannot be chosen, to the viewer alone', () => {
    const g = attack(BEARS, BOLT);
    expect(lookedCards(g.state, 0).map((c) => c.name)).toEqual([BOLT]);
    expect(lookedCards(g.state, 1)).toEqual([]);
  });

  test('the panel lists the creature to choose and the rest of the hand apart', () => {
    const html = render(attack(BEARS, BOLT));
    expect(html).toContain('aria-label="Cards to put onto the battlefield"');
    expect(html).toContain('Only you see their hand.');
    expect(html).toContain('Also in their hand (cannot be chosen):');
    expect(html).toContain('aria-label="Other cards in their hand"');
    expect(html).toContain(BEARS);
    expect(html).toContain(BOLT);
  });

  test('a hand with no creature card is still shown, with nothing to choose', () => {
    const html = render(attack(BOLT));
    expect(html).toContain('No card in their hand can be put onto the battlefield');
    expect(html).not.toContain('Choose 0 cards');
    expect(html).toContain('Also in their hand (cannot be chosen):');
    expect(html).toContain(BOLT);
  });
});
