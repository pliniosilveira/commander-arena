// "You may cast a spell with mana value 5 or less from your hand without paying its mana cost." (D-145): the effect `castFree` over a card
// chosen from the hand, and `play` for lands.
// Pins: CR 608.2g (a spell cast during resolution: the steps of CR 601.2a-i, no timing restriction, no player receives priority, the
// resolution goes on), CR 118.9 (cast without paying its mana cost: additional costs are still paid; X is 0, CR 107.3b), CR 601.2c (targets
// are chosen as it is cast), CR 305.1, 305.2a and 305.3 (a land play: only on the player's own turn, using the land drop, not cast), CR 733
// (a cast can be taken back), CR 202.3 (mana value). Cards are SYNTHETIC (src/cards/fixtures/synthetic-free-cast.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const RITE = 'SYNTHETIC Free Cast Rite'; // sorcery {1}{G}: a spell with mana value 5 or less from your hand
const SMALL = 'SYNTHETIC Small Free Rite'; // sorcery: mana value 3 or less
const QUICK = 'SYNTHETIC Quick Free Rite'; // instant: mana value 5 or less
const PLAY = 'SYNTHETIC Free Play Rite'; // sorcery: a card (land too) with mana value 5 or less, played or cast
const BOLT = 'Lightning Bolt'; // {R}, mana value 1
const ANGEL = 'Serra Angel'; // {3}{W}{W}, mana value 5
const SPIDER = 'Giant Spider'; // {3}{G}, mana value 4
const BEARS = 'Grizzly Bears'; // mana value 2
const MURDER = 'Murder'; // {1}{B}{B}, mana value 3
const WRATH = 'SYNTHETIC Wrath'; // {2}{W}{W}, mana value 4
const XSPELL = 'SYNTHETIC X Draw'; // {X}{U}

const forests = (g: ScenarioGame) => g.find({ name: 'Forest', zone: 'battlefield' });

describe('the cards are valid', () => {
  test.each([
    RITE,
    SMALL,
    QUICK,
    PLAY,
    'SYNTHETIC Free Spell Rite',
    'SYNTHETIC Quick Free Play Rite',
  ])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('the choice: only cards that could be cast, with the limit on mana value', () => {
  const game = (hand: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(RITE, ...hand)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .build();

  test('the cards of mana value 5 or less are offered, none or one may be chosen', () => {
    const g = game([BOLT, ANGEL, SPIDER]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.zone).toBe('hand');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.legal).toHaveLength(3);
  });

  test('a smaller limit leaves out the bigger spell: mana value 3 or less offers the Bolt and the Bears, not the Angel', () => {
    const g = scenario()
      .seat(0)
      .hand(SMALL, BOLT, ANGEL, BEARS)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .battlefield('Typhoid Rats')
      .build();
    g.act(0).cast(SMALL, { pay: true });
    g.passAll();
    expect([...chooseCardsDecision(g).legal].sort()).toEqual([g.id(BOLT), g.id(BEARS)].sort());
  });

  test('a land is not a spell: it is not offered without "play"', () => {
    const g = game([BOLT, 'Mountain']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BOLT)]);
  });

  test('a spell with nothing to target is not offered: Murder with no creature on the board', () => {
    const g = scenario().seat(0).hand(RITE, MURDER, BEARS).battlefield('Forest', 'Forest').build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BEARS)]);
  });

  test('nothing that could be cast: nothing is asked and the effect does nothing', () => {
    const g = game([ANGEL, 'Mountain']);
    // The Angel is castable free (mana value 5): remove it from the hand to leave nothing.
    const none = scenario().seat(0).hand(RITE, 'Mountain').battlefield('Forest', 'Forest').build();
    none.act(0).cast(RITE, { pay: true });
    none.passAll();
    none.expect.pending('priority', 0);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('the player may choose none', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BOLT, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
  });
});

describe('the cast (CR 608.2g): without paying, targets as it is cast, no priority in between', () => {
  const game = (
    hand: readonly string[],
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .seat(0)
        .life(20)
        .hand(RITE, ...hand)
        .battlefield('Forest', 'Forest'),
    )
      .seat(1)
      .life(20)
      .battlefield(BEARS, { label: 'bears' })
      .build();

  test('a Bolt: its target is chosen, it goes on the stack, resolves, and no mana was spent on it', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    expect(g.state.pending?.kind).toBe('targets');
    g.act(0).chooseTargets({ player: 1 });
    // The Bolt is on the stack and nobody has priority yet for the Rite: the rest of the effect is over, then priority.
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 17);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    // Only the two Forests that paid for the Rite are tapped.
    expect(forests(g).filter((o) => o.tapped)).toHaveLength(2);
  });

  test('a creature spell: it enters and its mana cost was never paid', () => {
    const g = game([ANGEL]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(ANGEL);
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('the cast can be taken back at its first question: the question is asked again (CR 733)', () => {
    const g = game([BOLT]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BOLT);
    g.act(0).cancel();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BOLT)]);
    g.expect.zone(BOLT, 'hand', { seat: 0 });
  });

  test('X is 0 for a spell cast without paying its mana cost (CR 107.3b)', () => {
    const g = game([XSPELL]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(XSPELL);
    g.passAll();
    g.expect.zone(XSPELL, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('timing: an instant cast on the opponent turn may cast a sorcery too', () => {
    const g = scenario()
      .seat(0)
      .hand(QUICK, WRATH)
      .battlefield('Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .battlefield('Typhoid Rats')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.pass();
    g.act(0).cast(QUICK, { pay: true });
    g.passAll();
    g.act(0).chooseCards(WRATH);
    g.passAll();
    // The sorcery resolved in the opponent turn: every creature was destroyed.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
  });
});

describe('a free cast still pays the additional costs: an escalate cost (CR 118.9, 702.120a)', () => {
  const PAIR = 'SYNTHETIC Fixed Pair'; // {1}{R}, Escalate {1}, choose two modes

  test('with no mana left for the escalate cost a spell that must choose two modes is not offered', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE, PAIR)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(PAIR, 'hand', { seat: 0 });
  });

  test('with the mana for it the spell is offered, and the escalate cost is what is paid', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE, PAIR)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(PAIR)]);
    g.act(0).chooseCards(PAIR);
    g.act(0).choose({ kind: 'chooseModes', modes: [1, 2] });
    g.act(0).chooseTargets({ player: 0 });
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['1']);
  });
});

describe('"cast" never offers a land card, whatever the filter says (CR 305.1)', () => {
  test('a filter that does not exclude lands still offers only the spells', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Free Spell Rite', 'Mountain', BOLT)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Free Spell Rite', { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BOLT)]);
  });
});

describe('"play": a land card is played, using the land drop (CR 305.1, 305.2a, 305.3)', () => {
  const game = (opts: { landsPlayed?: number } = {}) => {
    const b = scenario().seat(0).hand(PLAY, 'Mountain', BOLT).battlefield('Forest', 'Forest');
    if (opts.landsPlayed !== undefined) b.landsPlayed(opts.landsPlayed);
    return b.seat(1).build();
  };

  test('the land is offered with the spells and played onto the battlefield, untapped, as the land play of the turn', () => {
    const g = game();
    g.act(0).cast(PLAY, { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toHaveLength(2);
    g.act(0).chooseCards('Mountain');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.tapped('Mountain', false);
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
    expect(g.eventsSince(0).some((e) => e.kind === 'landPlayed')).toBe(true);
    g.expect.pending('priority', 0);
  });

  test('with the land drop already used the land is not offered', () => {
    const g = game({ landsPlayed: 1 });
    g.act(0).cast(PLAY, { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BOLT)]);
  });

  test('on the opponent turn nobody plays a land (CR 305.3)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Quick Free Play Rite', 'Mountain', BOLT)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.pass();
    g.act(0).cast('SYNTHETIC Quick Free Play Rite', { pay: true });
    g.passAll();
    // Only the Bolt is offered; the Mountain cannot be played on the opponent's turn.
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BOLT)]);
  });

  test('a land played this way is not cast: no spell goes on the stack and nothing can respond', () => {
    const g = game();
    g.act(0).cast(PLAY, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Mountain');
    g.expect.stack([]);
  });
});

describe('validation', () => {
  const withEffect = (e: object) =>
    ({
      ...syntheticCard(RITE),
      faces: [{ ...syntheticCard(RITE).faces[0], spell: { effect: e } }],
    }) as unknown as Parameters<typeof validateCard>[0];
  const choose = (extra: object = {}, filter: object = { zone: 'hand', notTypes: ['land'] }) => ({
    kind: 'choose',
    filter,
    ...extra,
  });

  test('the good shapes validate', () => {
    expect(validateCard(withEffect({ kind: 'castFree', objects: choose() }))).toEqual([]);
    expect(validateCard(withEffect({ kind: 'castFree', objects: choose(), play: true }))).toEqual(
      [],
    );
  });

  test.each([
    ['a filter outside the hand', { kind: 'castFree', objects: choose({}, { zone: 'graveyard' }) }],
    ['a count', { kind: 'castFree', objects: choose({ count: 2 }) }],
    ['play false', { kind: 'castFree', objects: choose(), play: false }],
    ['a target', { kind: 'castFree', objects: { kind: 'target', id: 't1' } }],
    ['a reference to this', { kind: 'castFree', objects: { kind: 'this' } }],
  ])('%s is refused', (_name, effect) => {
    expect(validateCard(withEffect(effect)).length).toBeGreaterThan(0);
  });
});
