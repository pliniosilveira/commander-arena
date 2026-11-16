// Group 1 of the Galadriel deck (issue 43): "Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way, draw a card." (Elven Farsight), "Scry 3,
// then reveal the top card of your library. If it's a creature or land card, draw a card." (Track Down), the planeswalker with X loyalty (Nissa, Steward of Elements: +2 scry 2; 0 look at
// the top card, a land or a creature with mana value up to the loyalty goes onto the battlefield; -6 untap up to two lands that become 5/5 Elementals) and "Destroy target artifact,
// enchantment, or creature with flying. Scry 1." (Shower of Arrows).
// Pins: CR 701.22 (scry), 701.20a (reveal: the card shown stays in the library), 608.2c (what comes after "then" is read as it comes up), 306.5b and 107.3m (a planeswalker with X
// loyalty enters with X loyalty counters, the X of its spell), 704.5i (0 loyalty), 202.3 (mana value; a land card has none), 401.2 and 701.20a (look at the top card: it stays on top
// unless it is put onto the battlefield), 606.4 (loyalty costs), 113.7a (an ability resolves after its walker is gone), 205.1b (still lands), 613.1d and 613.4b (types and base power
// and toughness), 115.1 (the targets).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-galadriel-g1.ts); the real cards are played in packages/cards/test/convert-grammar-engine-galadriel-g1.test.ts.
import { describe, expect, test } from 'vitest';
import type { ObjectId } from '../src/ids';
import { type PendingDecision, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const FAR = 'SYNTHETIC Far Sight'; // {G} sorcery: scry 3, then you may reveal the top card; a creature card draws a card
const RUN = 'SYNTHETIC Run Down'; // {1}{G} sorcery: scry 3, then reveal the top card; a creature or land card draws a card
const SEER = 'SYNTHETIC Seer of Elements'; // {X}{G}{U} planeswalker, printed loyalty X
const RAIN = 'SYNTHETIC Arrow Rain'; // {2}{G} instant: destroy target artifact, enchantment or creature with flying; scry 1
const BEARS = 'Grizzly Bears'; // creature, mana value 2
const SPIDER = 'Giant Spider'; // creature with reach, mana value 4
const BOLT = 'Lightning Bolt';
const HAWK = 'Serra Angel'; // creature with flying
const BAUBLE = 'Sol Ring';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const defs = () =>
  scenario()
    .define(syntheticCard(FAR))
    .define(syntheticCard(RUN))
    .define(syntheticCard(SEER))
    .define(syntheticCard(RAIN));

describe('the cards are valid', () => {
  test.each([FAR, RUN, SEER, RAIN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 casts `card` (paying), lets it resolve and, for a spell that scries 3, keeps the three cards on top in the order the library has them. */
function castAndScry(g: ScenarioGame, card: string, keep: readonly string[]) {
  g.act(0).cast(card, { pay: true });
  g.passAll();
  g.act(0).arrange({ top: keep });
}

describe('Elven Farsight: "you may reveal the top card ... If a creature card is revealed this way, draw a card"', () => {
  const board = (...top: string[]) =>
    defs()
      .seat(0)
      .library(...top, ...LIBRARY)
      .hand(FAR)
      .battlefield('Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature card on top is revealed and draws a card', () => {
    const g = board(BEARS, 'Plains', 'Plains');
    castAndScry(g, FAR, [`${BEARS}[0]`, 'Plains[0]', 'Plains[1]']);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0, names: [BEARS], from: 'library' }], {
      since: 0,
    });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('declining reveals nothing and draws nothing', () => {
    const g = board(BEARS, 'Plains', 'Plains');
    castAndScry(g, FAR, [`${BEARS}[0]`, 'Plains[0]', 'Plains[1]']);
    g.act(0).decline();
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.handSize(0, 0);
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });

  test('a card that is not a creature is revealed and stays on top', () => {
    const g = board(BOLT, 'Plains', 'Plains');
    castAndScry(g, FAR, [`${BOLT}[0]`, 'Plains[0]', 'Plains[1]']);
    g.act(0).accept();
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0, names: [BOLT], from: 'library' }], {
      since: 0,
    });
    g.expect.handSize(0, 0);
    g.expect.zone(BOLT, 'library', { seat: 0 });
  });

  test('the scry comes first: the creature put on top by the scry is the card revealed', () => {
    const g = board('Plains', BEARS, 'Plains');
    castAndScry(g, FAR, [`${BEARS}[0]`, 'Plains[0]', 'Plains[1]']);
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('the creature put on the bottom by the scry is not on top: nothing is drawn', () => {
    const g = board(BEARS, 'Plains', 'Plains');
    g.act(0).cast(FAR, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Plains[0]', 'Plains[1]'], other: [`${BEARS}[0]`] });
    g.act(0).accept();
    g.expect.handSize(0, 0);
  });
});

describe('Track Down: "reveal the top card of your library. If it\'s a creature or land card, draw a card"', () => {
  const board = (...top: string[]) =>
    defs()
      .seat(0)
      .library(...top, ...LIBRARY)
      .hand(RUN)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test.each([
    ['a creature card', BEARS, true],
    ['a land card', 'Island', true],
    ['an instant card', BOLT, false],
    ['an artifact card', BAUBLE, false],
  ])('%s on top: draws a card is %s', (_what, top, draws) => {
    const g = board(top, 'Plains', 'Plains');
    castAndScry(g, RUN, [`${top}[0]`, 'Plains[0]', 'Plains[1]']);
    // The reveal is not optional: no question, the card is shown and the effect is done.
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0, names: [top], from: 'library' }], {
      since: 0,
    });
    g.expect.handSize(0, draws ? 1 : 0);
    g.expect.zone(top, draws ? 'hand' : 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('an empty library after the scry: nothing is revealed and nothing is drawn', () => {
    const g = defs()
      .seat(0)
      .library()
      .hand(RUN)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RUN, { pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.invariants();
  });
});

describe('Nissa, Steward of Elements: a planeswalker with X loyalty', () => {
  const lands = ['Forest', 'Island', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'];
  const board = (opts: { library?: readonly string[]; onBattlefield?: readonly string[] } = {}) => {
    const b = defs()
      .seat(0)
      .library(...(opts.library ?? LIBRARY))
      .hand(SEER)
      .battlefield(...lands);
    const withExtra = (opts.onBattlefield ?? []).reduce(
      (acc, name, i) => acc.battlefield(name, { label: `extra${i}` }),
      b,
    );
    return withExtra
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('cast with X = 3 it enters with 3 loyalty counters (CR 306.5b, 107.3m)', () => {
    const g = board();
    g.act(0).cast(SEER, { x: 3, pay: true });
    g.passAll();
    g.expect.counters(SEER, { loyalty: 3 });
    g.expect.zone(SEER, 'battlefield', { seat: 0 });
  });

  test('cast with X = 0 it enters with no counters and goes to the graveyard (CR 704.5i)', () => {
    const g = board();
    g.act(0).cast(SEER, { x: 0, pay: true });
    g.passAll();
    g.expect.zone(SEER, 'graveyard', { seat: 0 });
  });

  test('+2: scry 2, and the loyalty goes up by 2', () => {
    const g = board();
    g.act(0).cast(SEER, { x: 3, pay: true });
    g.passAll();
    g.act(0).activate(SEER, { ability: 1 });
    g.expect.counters(SEER, { loyalty: 5 });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
    expect(d.cards).toHaveLength(2);
    expect(d.purpose).toBe('scry');
  });

  /** Seat 0 casts the walker with X and activates its 0 ability with the library the board was built with; answers nothing. */
  const lookWith = (g: ScenarioGame, x: number) => {
    g.act(0).cast(SEER, { x, pay: true });
    g.passAll();
    g.act(0).activate(SEER, { ability: 2 });
    g.passAll();
  };

  test('0: a land card on top may be put onto the battlefield (untapped)', () => {
    const g = board({ library: ['Swamp', ...LIBRARY] });
    lookWith(g, 3);
    const d: PendingDecision | null = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards('Swamp');
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.tapped('Swamp', false);
    g.expect.counters(SEER, { loyalty: 3 });
  });

  test('0: choosing no card leaves it on top of the library (the choice is "you may")', () => {
    const g = board({ library: ['Swamp', ...LIBRARY] });
    lookWith(g, 3);
    g.act(0).chooseCards();
    g.expect.zone('Swamp', 'library', { seat: 0 });
    g.expect.librarySize(0, 11);
  });

  test('0: a creature card with mana value up to the loyalty may be put onto the battlefield', () => {
    const g = board({ library: [BEARS, ...LIBRARY] });
    lookWith(g, 3); // loyalty 3, Grizzly Bears has mana value 2
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('0: a creature card with mana value equal to the loyalty is enough ("less than or equal to")', () => {
    const g = board({ library: [SPIDER, ...LIBRARY] });
    lookWith(g, 4); // loyalty 4, Giant Spider has mana value 4
    g.act(0).chooseCards(SPIDER);
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
  });

  test('0: a creature card with a greater mana value is not offered and stays on top', () => {
    const g = board({ library: [SPIDER, ...LIBRARY] });
    lookWith(g, 3); // loyalty 3, Giant Spider has mana value 4
    g.expect.pending('priority', 0);
    g.expect.zone(SPIDER, 'library', { seat: 0 });
  });

  test('0: any other card is not offered either', () => {
    const g = board({ library: [BOLT, ...LIBRARY] });
    lookWith(g, 5);
    g.expect.pending('priority', 0);
    g.expect.zone(BOLT, 'library', { seat: 0 });
  });

  test('-6: untap up to two lands, which become 5/5 Elemental flying haste creatures until end of turn and are still lands', () => {
    const g = board();
    g.act(0).cast(SEER, { x: 6, pay: true });
    g.passAll();
    // All eight lands paid for the walker (X = 6 and {G}{U}): they are tapped, and the ability untaps two of them.
    g.expect.tapped('Forest');
    g.expect.tapped('Island');
    g.act(0).activate(SEER, { ability: 3, targets: ['Forest', 'Island'] });
    // CR 704.5i: the loyalty cost took all 6 counters; the ability is on the stack and resolves anyway (CR 113.7a).
    g.expect.zone(SEER, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.tapped('Forest', false);
    g.expect.tapped('Island', false);
    g.expect.derived('Forest', {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Elemental'],
      keywords: ['flying', 'haste'],
    });
    g.expect.pt('Forest', 5, 5);
    g.expect.pt('Island', 5, 5);
    // The other lands are untouched.
    g.expect.derived({ name: 'Plains', zone: 'battlefield', nth: 0 }, { types: ['land'] });
    // Until end of turn: after the cleanup step they are plain lands again.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived('Forest', { types: ['land'], subtypes: ['Forest'], keywords: [] });
  });

  test('-6 with no land chosen does nothing but still takes the loyalty ("up to two")', () => {
    const g = board();
    g.act(0).cast(SEER, { x: 6, pay: true });
    g.passAll();
    g.act(0).activate(SEER, { ability: 3, targets: [] });
    g.passAll();
    g.expect.zone(SEER, 'graveyard', { seat: 0 });
    g.expect.derived('Forest', { types: ['land'], subtypes: ['Forest'], keywords: [] });
  });

  test('-6 needs 6 loyalty counters (CR 606.6)', () => {
    const g = board();
    g.act(0).cast(SEER, { x: 5, pay: true });
    g.passAll();
    expect(g.act(0).try.activate(SEER, { ability: 3 }).ok).toBe(false);
  });
});

describe('Shower of Arrows: "Destroy target artifact, enchantment, or creature with flying. Scry 1."', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(RAIN)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BAUBLE, { label: 'ring' })
      .battlefield(HAWK, { label: 'hawk' })
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield('Forest', { label: 'forest' })
      .at('precombatMain', { active: 0 })
      .build();

  test('the artifact and the creature with flying are legal targets; a creature without flying and a land are not', () => {
    const g = board();
    g.act(0).cast(RAIN);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = new Set<ObjectId>(
      (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : [])),
    );
    expect(legal.has(g.id('ring'))).toBe(true);
    expect(legal.has(g.id('hawk'))).toBe(true);
    expect(legal.has(g.id('spider'))).toBe(false);
    expect(legal.has(g.id('forest'))).toBe(false);
  });

  test('destroys the creature with flying and scries 1', () => {
    const g = board();
    g.act(0).cast(RAIN, { targets: ['hawk'], pay: true });
    g.passAll();
    g.expect.zone(HAWK, 'graveyard', { seat: 1 });
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
    expect(d.cards).toHaveLength(1);
    expect(d.purpose).toBe('scry');
  });

  test('destroys the artifact', () => {
    const g = board();
    g.act(0).cast(RAIN, { targets: ['ring'], pay: true });
    g.passAll();
    g.expect.zone(BAUBLE, 'graveyard', { seat: 1 });
  });
});
