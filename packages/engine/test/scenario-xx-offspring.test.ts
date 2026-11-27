// Offspring (CR 702.175): "You may pay an additional [cost] as you cast this spell" and "When this permanent enters, if its offspring cost was paid, create a token that's a
// copy of it, except it's 1/1."
// Pins: CR 702.175a (the two abilities), CR 601.2b and 601.2f (the cost is announced as the spell is cast and is part of the total), CR 603.4 (the intervening "if" is checked as
// the ability triggers and as it resolves), CR 608.2h and 113.7a (last-known information of a permanent that left), CR 707.2 and 707.9b (a copy has the copiable values, and the
// exception is one of them), CR 603.6a (the token's own enters abilities trigger), CR 733 (cancelling rewinds the cast), and the rulings of the cards with offspring: the cost is
// paid at most once, a countered spell makes no token, the token is not cast and makes no other token, a creature without the ability as it enters does not trigger.
// Cards: the SYNTHETIC cards of this file, and the real Lightning Bolt, Counterspell and basic lands.
import { describe, expect, test } from 'vitest';
import { checkInvariants, getLegalActions, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { confirmOptionalDecision } from './pending-helpers';

const HOUND = 'SYNTHETIC Offspring Hound';
const MOUSE = 'SYNTHETIC Offspring Mouse';
const HUSH = 'SYNTHETIC Hush Field';
const BOLT = 'Lightning Bolt';

/** A 3/3 for {2}{G} with Offspring {2} that enters with a +1/+1 counter and gains 1 life as it enters. */
const hound = singleFaceCard({
  name: HOUND,
  manaCost: ['2', 'G'],
  types: ['creature'],
  subtypes: ['Dog'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 3,
  toughness: 3,
  oracleText:
    'Offspring {2}. This creature enters with a +1/+1 counter on it. When this creature enters, you gain 1 life.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    {
      kind: 'replacement',
      replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 1 },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

/** A 2/2 for {1}{W} with Offspring {1} and nothing else. */
const mouse = singleFaceCard({
  name: MOUSE,
  manaCost: ['1', 'W'],
  types: ['creature'],
  subtypes: ['Mouse'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText: 'Offspring {1}',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'offspring', cost: [{ kind: 'mana', symbols: ['1'] }] } },
  ],
});

/** "Creatures lose all abilities." */
const hush = singleFaceCard({
  name: HUSH,
  manaCost: ['2', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Creatures lose all abilities.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'loseAllAbilities',
        subject: { kind: 'filter', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    },
  ],
});

const game = (lands: number, card = MOUSE, land = 'Plains') =>
  scenario()
    .seat(0)
    .define(hound)
    .define(mouse)
    .define(hush)
    .hand(card)
    .battlefield(land, { count: lands })
    .seat(1)
    .hand(BOLT, 'Counterspell')
    .battlefield('Island', { count: 2 })
    .battlefield('Mountain')
    .build();

const tapped = (g: ScenarioGame, land = 'Plains'): number =>
  g.find({ name: land, zone: 'battlefield' }).filter((o) => o.tapped).length;

const onBattlefield = (g: ScenarioGame, name: string) =>
  g
    .find({ name, zone: 'battlefield' })
    .sort((a, b) => Number(a.token !== null) - Number(b.token !== null));

describe('the offspring question (CR 702.175a, 601.2b)', () => {
  test('is asked as the spell is cast, with the cost, before anything is paid', () => {
    const g = game(3);
    g.act(0).cast(MOUSE);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('offspring');
    expect(d.seat).toBe(0);
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    expect(d.source).toBe(g.id({ name: MOUSE, zone: 'stack' }));
    expect(g.state.casting?.stage).toBe('kicker');
    expect(tapped(g)).toBe(0);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'cancel',
      'concede',
    ]);
    g.expect.invariants();
  });

  test('paid: the total has the offspring cost, and the spell and the cast event say so', () => {
    const g = game(3);
    const mark = g.mark();
    g.act(0).cast(MOUSE);
    g.act(0).accept();
    g.act(0).payAuto();
    expect(tapped(g)).toBe(3);
    expect(g.find({ name: MOUSE, zone: 'stack' })[0]?.stack?.offspringPaid).toBe(true);
    const cast = g.eventsSince(mark).find((e) => e.kind === 'spellCast');
    expect(cast?.kind === 'spellCast' && cast.offspring).toBe(true);
    g.expect.invariants();
  });

  test('declined: the spell costs its mana cost and makes no token', () => {
    const g = game(3);
    const mark = g.mark();
    g.act(0).cast(MOUSE);
    g.act(0).decline();
    g.act(0).payAuto();
    expect(tapped(g)).toBe(2);
    const cast = g.eventsSince(mark).find((e) => e.kind === 'spellCast');
    expect(cast?.kind === 'spellCast' && cast.offspring).toBeUndefined();
    g.passAll();
    expect(onBattlefield(g, MOUSE)).toHaveLength(1);
    expect(onBattlefield(g, MOUSE)[0]?.offspringPaid).toBeUndefined();
    g.expect.invariants();
  });

  test('is not asked when the total with the offspring cost cannot be paid', () => {
    const g = game(2);
    g.act(0).cast(MOUSE);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    expect(onBattlefield(g, MOUSE)).toHaveLength(1);
  });

  test('the cost is paid at most once: one question, one token, however much mana is left', () => {
    const g = game(8);
    g.act(0).cast(MOUSE);
    g.act(0).accept();
    // No second offspring question: the cast goes on to the payment.
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    expect(tapped(g)).toBe(3);
    g.passAll();
    expect(onBattlefield(g, MOUSE)).toHaveLength(2);
  });

  test('cancel takes the cast back (CR 733)', () => {
    const g = game(3);
    g.act(0).cast(MOUSE);
    g.act(0).cancel();
    g.expect.zone(MOUSE, 'hand', { seat: 0 });
    expect(g.state.casting ?? null).toBeNull();
    g.expect.invariants();
  });
});

describe('the offspring trigger (CR 702.175a, 603.4)', () => {
  test('paid: the permanent remembers it and a token copy that is 1/1 is created', () => {
    const g = game(3);
    g.act(0).cast(MOUSE);
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).pass(); // the Mouse resolves; its offspring trigger goes on the stack
    g.expect.stack([`${MOUSE} (ability)`]);
    expect(onBattlefield(g, MOUSE)[0]?.offspringPaid).toBe(true);
    g.passAll();
    const [card, token] = onBattlefield(g, MOUSE);
    expect(card?.token).toBeNull();
    expect(token?.token).not.toBeNull();
    const view = g.view(0);
    const seen = (id: unknown) => view.battlefield.find((o) => o.id === id);
    expect([seen(card?.id)?.power, seen(card?.id)?.toughness]).toEqual([2, 2]);
    expect([seen(token?.id)?.power, seen(token?.id)?.toughness]).toEqual([1, 1]);
    // CR 707.2: the name, the mana cost, the types and the abilities are copied.
    expect(seen(token?.id)?.name).toBe(MOUSE);
    expect(seen(token?.id)?.manaCost).toEqual(['1', 'W']);
    expect(seen(token?.id)?.subtypes).toEqual(['Mouse']);
    expect(seen(token?.id)?.colors).toEqual(['W']);
    g.expect.invariants();
  });

  test('a countered spell makes no token', () => {
    const g = game(3);
    g.act(0).cast(MOUSE);
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [MOUSE], pay: true });
    g.passAll();
    g.expect.zone(MOUSE, 'graveyard', { seat: 0 });
    expect(g.find({ name: MOUSE, zone: 'battlefield' })).toHaveLength(0);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the creature left before the trigger resolved: the token is still created (CR 608.2h)', () => {
    const g = game(3);
    g.act(0).cast(MOUSE);
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).pass();
    g.expect.stack([`${MOUSE} (ability)`]);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [MOUSE], pay: true });
    g.passAll(); // the Bolt kills the Mouse, then the trigger resolves
    g.expect.zone(MOUSE, 'graveyard', { seat: 0 });
    const left = g.find({ name: MOUSE, zone: 'battlefield' });
    expect(left).toHaveLength(1);
    expect(left[0]?.token).not.toBeNull();
    const seen = g.view(0).battlefield.find((o) => o.id === left[0]?.id);
    expect([seen?.power, seen?.toughness]).toEqual([1, 1]);
    g.expect.invariants();
  });

  test('the token copies the printed card, not its counters; its own enters abilities work, and it makes no other token', () => {
    const g = game(5, HOUND, 'Forest');
    g.act(0).cast(HOUND);
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).pass(); // the Hound resolves: its two enters triggers are ordered (CR 603.3b)
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // The token's own enters trigger resolved too.
    const hounds = onBattlefield(g, HOUND);
    // One card and one token: the token was not cast, so its offspring cost was not paid.
    expect(hounds).toHaveLength(2);
    const [card, token] = hounds;
    expect(token?.offspringPaid).toBeUndefined();
    const view = g.view(0);
    const seen = (id: unknown) => view.battlefield.find((o) => o.id === id);
    // The card: 3/3 with its counter. The token: 1/1 (the exception), with the one counter its own "enters with" gave it, not a copy of the card's.
    expect([seen(card?.id)?.power, seen(card?.id)?.toughness]).toEqual([4, 4]);
    expect(token?.counters).toEqual({ '+1/+1': 1 });
    expect([seen(token?.id)?.power, seen(token?.id)?.toughness]).toEqual([2, 2]);
    // "When this creature enters, you gain 1 life" triggered for the card and for the token.
    g.expect.life(0, 42);
    g.expect.invariants();
  });

  test('a creature that has lost offspring as it enters does not trigger, though the cost was paid', () => {
    const g = scenario()
      .seat(0)
      .define(hound)
      .define(mouse)
      .define(hush)
      .hand(MOUSE)
      .battlefield('Plains', { count: 3 })
      .battlefield(HUSH)
      .seat(1)
      .build();
    g.act(0).cast(MOUSE);
    g.act(0).accept();
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).pass(); // the Mouse resolves with no abilities
    g.expect.stack([]);
    expect(onBattlefield(g, MOUSE)).toHaveLength(1);
    expect(onBattlefield(g, MOUSE)[0]?.offspringPaid).toBe(true);
    g.expect.invariants();
  });
});

describe('validateCard and offspring (CR 702.175a)', () => {
  const withOffspring = (cost: unknown, type: 'creature' | 'sorcery' = 'creature', times = 1) => ({
    ...mouse,
    faces: [
      {
        ...mouse.faces[0],
        types: [type],
        ...(type === 'sorcery' ? { power: null, toughness: null, subtypes: [] } : {}),
        abilities: Array.from({ length: times }, () => ({
          kind: 'keyword',
          keyword: { kind: 'offspring', cost },
        })),
      },
    ],
  });
  const messages = (card: unknown) => validateCard(card).map((i) => i.message);

  test('a mana cost on a permanent is valid', () => {
    expect(messages(mouse)).toEqual([]);
    expect(messages(hound)).toEqual([]);
  });

  test('a cost that is not mana, an {X}, an empty cost and an instant or sorcery are refused', () => {
    expect(messages(withOffspring([{ kind: 'payLife', amount: 2 }])).join()).toContain('mana only');
    expect(messages(withOffspring([{ kind: 'mana', symbols: ['X'] }])).join()).toContain('X in an');
    expect(messages(withOffspring([])).join()).toContain('needs a cost');
    expect(messages(withOffspring([{ kind: 'mana', symbols: ['1'] }], 'sorcery')).join()).toContain(
      'permanent spell',
    );
  });

  test('"if its offspring cost was paid" needs the keyword', () => {
    const card = {
      ...mouse,
      faces: [
        {
          ...mouse.faces[0],
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
              interveningIf: { kind: 'offspringPaid' },
              effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
            },
          ],
        },
      ],
    };
    expect(messages(card).join()).toContain('needs an offspring ability');
  });
});
