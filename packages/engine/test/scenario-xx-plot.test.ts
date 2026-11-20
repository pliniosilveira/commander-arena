// Plot (CR 702.170), the keyword of Lock and Load and Pyretic Charge (the Quick Draw deck, issue 121): "Any time you have priority during your main phase while the stack is empty, you may
// exile this card from your hand and pay [cost]. It becomes a plotted card." A plotted card's owner "may cast it from exile without paying its mana cost during their main phase while the
// stack is empty during any turn after the turn in which it became plotted." (SYNTHETIC Plot Draw and SYNTHETIC Plot Gain, src/cards/fixtures/synthetic-jump-start.ts.)
// Pins: CR 702.170a-b (a special action, no stack, main phase with an empty stack), 702.170d (cast from exile for free in a later turn, any type, only at sorcery timing), 116.2k, 400.7.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const DRAW = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, plot {1}{U}: draw a card
const GAIN = 'SYNTHETIC Plot Gain'; // {1}{U} instant, plot {U}: gain 2 life
const FILLER = ['Island', 'Island', 'Island', 'Island'] as const;

function game(hand: readonly string[], pool = 'UUUUUU'): ScenarioGame {
  const b = scenario()
    .seat(0)
    .library(...FILLER)
    .pool(pool);
  for (const card of hand) b.hand(card);
  return b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const plotOptions = (g: ScenarioGame, name: string) => {
  const card = g.find({ name, zone: 'hand', seat: 0 })[0];
  return getLegalActions(g.state, 0).filter((a) => a.kind === 'plot' && a.object === card?.id);
};

const freeCasts = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) => {
  const card = g.find({ name, zone: 'exile' })[0];
  return getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === 'free',
  );
};

describe('the cards are valid', () => {
  for (const name of [DRAW, GAIN]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }
  test('a plot cost with X is refused', () => {
    const card = syntheticCard(DRAW);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'keyword',
              keyword: { kind: 'plot', cost: [{ kind: 'mana', symbols: ['X'] }] },
            },
          ],
        },
      ],
    } as never;
    expect(validateCard(bad).some((i) => i.message.includes('plot'))).toBe(true);
  });
});

describe('"Plot [cost]" (CR 702.170a-b)', () => {
  test('in the main phase with an empty stack and the mana to pay, the card can be plotted', () => {
    expect(plotOptions(game([DRAW], 'UU'), DRAW)).toHaveLength(1);
  });

  test('without the mana for the plot cost it is not offered', () => {
    expect(plotOptions(game([DRAW], 'U'), DRAW)).toEqual([]);
  });

  test('not outside the main phase, and not with something on the stack', () => {
    const g = game([DRAW]);
    g.advanceTo('beginningOfCombat');
    expect(plotOptions(g, DRAW)).toEqual([]);
    const busy = game([DRAW, GAIN]);
    busy.act(0).cast(GAIN, { pay: true });
    expect(plotOptions(busy, DRAW)).toEqual([]);
  });

  test('plotting pays the plot cost, exiles the card face up without using the stack, and keeps priority', () => {
    const g = game([DRAW]);
    g.act(0).plot(DRAW, { pay: true });
    g.expect.zone(DRAW, 'exile');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
    g.expect.invariants();
  });

  test('cancelling the payment plots nothing', () => {
    const g = game([DRAW]);
    g.act(0).plot(DRAW);
    g.act(0).cancel();
    g.expect.zone(DRAW, 'hand', { seat: 0 });
  });
});

describe('a plotted card is cast for free in a later turn (CR 702.170d)', () => {
  test('not in the turn it was plotted', () => {
    const g = game([DRAW]);
    g.act(0).plot(DRAW, { pay: true });
    expect(freeCasts(g, DRAW)).toEqual([]);
  });

  test('in a later turn of its owner, in the main phase, it is cast without paying its mana cost', () => {
    const g = game([DRAW], 'UU');
    g.act(0).plot(DRAW, { pay: true });
    // The opponent's turn, then the owner's next turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pending('priority', 0);
    expect(freeCasts(g, DRAW)).toHaveLength(1);
    g.act(0).cast(DRAW, { alternative: 'free' });
    g.expect.stack([DRAW]);
    g.passAll();
    g.expect.zone(DRAW, 'graveyard', { seat: 0 });
    expect(freeCasts(g, DRAW)).toEqual([]);
    g.expect.invariants();
  });

  test('not at the timing of an instant: a plotted instant is cast only in its owner’s main phase with an empty stack', () => {
    const g = game([GAIN]);
    g.act(0).plot(GAIN, { pay: true });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(freeCasts(g, GAIN)).toEqual([]);
    g.advanceTo('precombatMain');
    expect(freeCasts(g, GAIN)).toHaveLength(1);
  });

  test('the opponent cannot cast it', () => {
    const g = game([DRAW]);
    g.act(0).plot(DRAW, { pay: true });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(freeCasts(g, DRAW, 1)).toEqual([]);
  });
});

describe('"for each other instant and sorcery spell you\'ve cast this turn" (Lock and Load, CR 601.2i)', () => {
  const LOCK = 'SYNTHETIC Lock Load'; // {2}{U} sorcery: draw a card, then a card for each other instant and sorcery spell cast this turn
  const library = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;
  const build = (hand: readonly string[]) => {
    const b = scenario()
      .seat(0)
      .library(...library)
      .pool('UUUUUUUUGG');
    for (const card of hand) b.hand(card);
    return b
      .seat(1)
      .library(...library)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('cast alone it draws one card: it does not count itself', () => {
    const g = build([LOCK]);
    g.act(0).cast(LOCK, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
  });

  test('after another instant it draws two, after two spells three', () => {
    const g = build([LOCK, GAIN, DRAW]);
    g.act(0).cast(GAIN, { pay: true });
    g.passAll();
    g.act(0).cast(DRAW, { pay: true });
    g.passAll();
    // GAIN and DRAW are cast; the hand holds the one card DRAW drew and LOCK.
    g.act(0).cast(LOCK, { pay: true });
    g.passAll();
    // LOCK draws 1 + 2 cards.
    expect(g.state.seats[0]?.hand).toHaveLength(1 + 3);
  });

  test('a creature spell cast this turn is not counted', () => {
    const g = build([LOCK, 'Grizzly Bears']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.act(0).cast(LOCK, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
  });
});
