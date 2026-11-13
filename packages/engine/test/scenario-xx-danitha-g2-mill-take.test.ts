// "Mill four cards. You may put a land card from among them into your hand." and its riders (Danitha deck group 2, D-1220 and D-1221 provisional): the cards a mill puts into the
// graveyard are the only candidates of a later choice (`ChooseSelector.fromMoved`); the choice is the offer itself, so `didPrevious` ("If you don't, put a +1/+1 counter on this
// creature") reads whether a card was put into the hand and not what the mill did; "If you put a Town card into your hand this way" reads the card in the hand
// (`objectMatches` with `inZone`).
// Pins: CR 701.17a (Mill), CR 400.7j / 400.7 (the cards milled are new objects in the graveyard), CR 608.2c (a later instruction reads what an earlier one did), CR 608.2d (a player who
// may do something chooses as the instruction comes up), CR 121.4 (milling is not drawing).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g2.ts) or basic lands and real fixtures.
import { describe, expect, test } from 'vitest';
import { SYNTHETIC_DANITHA_G2_LIST } from '../src/cards/fixtures/synthetic-danitha-g2';
import { applyAction, type CardDefinition, type Effect, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { graveyardNames, handNames, kinds, libraryNames } from './scry-helpers';

const SCOUT = 'SYNTHETIC Mill Three Scout';
const CHAPLAIN = 'SYNTHETIC Mill Three Chaplain';
const GRAB = 'SYNTHETIC Mill Four Grab';
const SAVING = 'SYNTHETIC Mill Four Saving';
const GREETER = 'SYNTHETIC Mill Four Greeter';
const TILLING = 'SYNTHETIC Mill Four Tilling';
const SQUIRREL = 'SYNTHETIC Squirrel Card';
const TOWN = 'SYNTHETIC Town Land';

const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'];

interface Options {
  readonly where?: 'hand' | 'battlefield';
  readonly graveyard?: readonly string[];
  readonly battlefield?: readonly string[];
  readonly below?: readonly string[];
}

/** Seat 0 holds `card` (and {1}{G}{W} mana); its library is `top` (labelled a, b, c, ...), then `below`. */
function game(card: string, top: readonly string[], opts: Options = {}): ScenarioGame {
  let b = scenario().seat(0);
  b = opts.where === 'battlefield' ? b.battlefield(card) : b.hand(card);
  b = b.pool('GWC');
  for (const name of opts.graveyard ?? []) b = b.graveyard(name);
  for (const name of opts.battlefield ?? []) b = b.battlefield(name);
  for (const [i, name] of top.entries()) b = b.library(name, { label: LABELS[i] ?? `x${i}` });
  for (const [i, name] of (opts.below ?? ['Swamp', 'Plains']).entries()) {
    b = b.library(name, { label: `z${i + 1}` });
  }
  return b
    .seat(1)
    .library('Llanowar Elves')
    .library('Llanowar Elves')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

/** Casts the card and lets everything on the stack resolve, up to the first question (or priority). */
function run(card: string, top: readonly string[], opts: Options = {}): ScenarioGame {
  const g = game(card, top, opts);
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

const MILLED = ['Island', 'Grizzly Bears', 'Forest', 'Serra Angel'];

describe('a land card from among the cards milled, or a +1/+1 counter (the Scout)', () => {
  test('three are milled; the question offers only the lands among them (not a land already in the graveyard, not the card below)', () => {
    const g = run(SCOUT, ['Island', 'Grizzly Bears', 'Forest', 'Mountain'], {
      graveyard: ['Swamp'],
    });
    expect(graveyardNames(g).sort()).toEqual(['Forest', 'Grizzly Bears', 'Island', 'Swamp']);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('move');
    expect(d.zone).toBe('graveyard');
    // Island and Forest; the Swamp was in the graveyard before the mill and the Mountain was not milled.
    expect(d.legal).toHaveLength(2);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.prompt).toContain('from among the cards put into your graveyard');
    expect(d.prompt).toContain('into your hand');
    expect(libraryNames(g)).toEqual(['Mountain', 'Swamp', 'Plains']);
  });

  test('taking a land puts it into the hand and no counter is put on the creature', () => {
    const g = run(SCOUT, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
    g.act(0).chooseCards('a');
    expect(handNames(g)).toEqual(['Island']);
    expect(graveyardNames(g).sort()).toEqual(['Forest', 'Grizzly Bears']);
    g.expect.pt(SCOUT, 1, 1);
    g.expect.counters(SCOUT, {});
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('"If you don\'t": taking none puts a +1/+1 counter on the creature (CR 608.2c)', () => {
    const g = run(SCOUT, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
    g.act(0).chooseCards();
    expect(handNames(g)).toEqual([]);
    expect(graveyardNames(g)).toHaveLength(3);
    g.expect.pt(SCOUT, 2, 2);
    g.expect.counters(SCOUT, { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('no land among the three: nobody is asked and the counter is put on the creature', () => {
    const g = run(SCOUT, ['Grizzly Bears', 'Serra Angel', 'Lightning Bolt', 'Island']);
    g.expect.pending('priority', 0);
    expect(handNames(g)).toEqual([]);
    expect(libraryNames(g)).toEqual(['Island', 'Swamp', 'Plains']);
    g.expect.counters(SCOUT, { '+1/+1': 1 });
  });

  test('a library of two: both are milled (milling is not drawing, CR 121.4), and an empty library mills nothing and still puts the counter', () => {
    const two = run(SCOUT, ['Island', 'Grizzly Bears'], { below: [] });
    g2(two);
    const none = run(SCOUT, [], { below: [] });
    none.expect.pending('priority', 0);
    none.expect.counters(SCOUT, { '+1/+1': 1 });
    none.expect.hasLost(0, false);
  });

  function g2(two: ScenarioGame) {
    expect(chooseCardsDecision(two).legal).toHaveLength(1);
    two.act(0).chooseCards('a');
    expect(handNames(two)).toEqual(['Island']);
    two.expect.counters(SCOUT, {});
  }

  test('only a land card of the milled ones, and at most one, is a legal answer', () => {
    const g = run(SCOUT, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
    const before = g.hash();
    for (const objects of [
      [g.id('b')],
      [g.id('d')],
      [g.id('a'), g.id('c')],
      [g.id('z1')],
      [g.id('a'), g.id('a')],
    ]) {
      expect(applyAction(g.state, 0, { kind: 'chooseCards', objects }).ok).toBe(false);
    }
    expect(applyAction(g.state, 1, { kind: 'chooseCards', objects: [g.id('a')] }).ok).toBe(false);
    expect(g.hash()).toBe(before);
  });

  test('the card taken is a new object in the hand and the rest stay in the graveyard (CR 400.7)', () => {
    const g = run(SCOUT, ['Island', 'Grizzly Bears', 'Forest', 'Mountain']);
    const before = g.id('c');
    g.act(0).chooseCards('c');
    expect(g.state.objects[before]?.zone).not.toBe('hand');
    expect(handNames(g)).toEqual(['Forest']);
    expect(kinds(g.eventsSince(0))).toContain('milled');
  });
});

describe('a Plains card or a creature card with mana value 3 or less (the Chaplain)', () => {
  test('both kinds are legal, a bigger creature and another land are not', () => {
    const g = run(CHAPLAIN, ['Island', 'Plains', 'Serra Angel', 'Grizzly Bears']);
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('b')]);
    g.act(0).chooseCards('b');
    expect(handNames(g)).toEqual(['Plains']);
    g.expect.counters(CHAPLAIN, {});
  });

  test('a creature card with mana value 3 or less', () => {
    const g = run(CHAPLAIN, ['Grizzly Bears', 'Serra Angel', 'Island', 'Plains']);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a')]);
    g.act(0).chooseCards('a');
    expect(handNames(g)).toEqual(['Grizzly Bears']);
  });

  test('neither kind: nobody is asked and the counter is put on it', () => {
    const g = run(CHAPLAIN, ['Serra Angel', 'Island', 'Lightning Bolt', 'Forest']);
    g.expect.pending('priority', 0);
    g.expect.counters(CHAPLAIN, { '+1/+1': 1 });
    g.expect.derived(CHAPLAIN, { keywords: ['flying'] });
  });

  test('declining a card that could be taken puts the counter on it', () => {
    const g = run(CHAPLAIN, ['Plains', 'Grizzly Bears', 'Island', 'Forest']);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a'), g.id('b')]);
    g.act(0).chooseCards();
    g.expect.counters(CHAPLAIN, { '+1/+1': 1 });
  });
});

describe('"you may put a permanent card from among the cards milled this way into your hand" (the instants)', () => {
  test('four are milled; the instant among them is not a permanent card', () => {
    const g = run(TILLING, ['Lightning Bolt', 'Island', 'Grizzly Bears', 'Serra Angel']);
    // The spell is still on the stack while it resolves: the four cards milled are all that is in the graveyard.
    expect(graveyardNames(g)).toHaveLength(4);
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('b'), g.id('c'), g.id('d')]);
    g.act(0).chooseCards('d');
    expect(handNames(g)).toEqual(['Serra Angel']);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('"then you may return": taking none leaves all four in the graveyard', () => {
    const g = run(TILLING, ['Lightning Bolt', 'Island', 'Grizzly Bears', 'Serra Angel']);
    g.act(0).chooseCards();
    expect(handNames(g)).toEqual([]);
    expect(libraryNames(g)).toEqual(['Swamp', 'Plains']);
  });

  test('only instants and sorceries milled: nobody is asked', () => {
    const g = run(TILLING, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
    ]);
    g.expect.pending('priority', 0);
  });

  test('the spell itself goes to the graveyard when it finishes, after the choice, and is no candidate', () => {
    const g = run(TILLING, ['Island', 'Island', 'Island', 'Island']);
    expect(chooseCardsDecision(g).legal).toHaveLength(4);
    expect(graveyardNames(g)).not.toContain(TILLING);
    g.act(0).chooseCards('a');
    expect(graveyardNames(g)).toContain(TILLING);
    expect(handNames(g)).toEqual(['Island']);
  });

  test('a permanent card already in the graveyard is not offered', () => {
    const g = run(TILLING, ['Lightning Bolt', 'Lightning Bolt', 'Island', 'Lightning Bolt'], {
      graveyard: ['Serra Angel'],
    });
    expect(chooseCardsDecision(g).legal).toEqual([g.id('c')]);
  });
});

describe('a rider after the choice', () => {
  test('"You gain 1 life" is done whether or not a card is taken', () => {
    const took = run(SAVING, MILLED);
    took.act(0).chooseCards('a');
    took.expect.life(0, 41);
    const none = run(SAVING, MILLED);
    none.act(0).chooseCards();
    none.expect.life(0, 41);
    const nothing = run(SAVING, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
    ]);
    nothing.expect.life(0, 41);
  });

  test('"If you put a Town card into your hand this way, you gain 2 life": a Town is taken', () => {
    const g = run(GREETER, [TOWN, 'Island', 'Grizzly Bears', 'Forest']);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a'), g.id('b'), g.id('d')]);
    g.act(0).chooseCards('a');
    expect(handNames(g)).toEqual([TOWN]);
    g.expect.life(0, 42);
  });

  test('another land is taken, or none: no life is gained', () => {
    const island = run(GREETER, [TOWN, 'Island', 'Grizzly Bears', 'Forest']);
    island.act(0).chooseCards('b');
    expect(handNames(island)).toEqual(['Island']);
    island.expect.life(0, 40);
    const none = run(GREETER, [TOWN, 'Island', 'Grizzly Bears', 'Forest']);
    none.act(0).chooseCards();
    none.expect.life(0, 40);
    // A Town milled and not taken is not "put into your hand".
    expect(handNames(none)).toEqual([]);
  });

  test('no land milled: nobody is asked and no life is gained', () => {
    const g = run(GREETER, ['Grizzly Bears', 'Serra Angel', 'Lightning Bolt', 'Llanowar Elves']);
    g.expect.pending('priority', 0);
    g.expect.life(0, 40);
  });

  test('a Squirrel card returned to the hand makes a Food token', () => {
    const g = run(GRAB, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a'), g.id('b'), g.id('d')]);
    g.act(0).chooseCards('a');
    expect(handNames(g)).toEqual([SQUIRREL]);
    g.expect.zone('Food', 'battlefield', { seat: 0 });
  });

  test('another permanent card and no Squirrel on the battlefield: no Food token', () => {
    const g = run(GRAB, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    g.act(0).chooseCards('b');
    expect(handNames(g)).toEqual(['Island']);
    g.expect.noObject('Food', { zone: 'battlefield' });
  });

  test('controlling a Squirrel is enough, whatever is taken (or nothing)', () => {
    const took = run(GRAB, ['Island', 'Lightning Bolt', 'Forest', 'Mountain'], {
      battlefield: [SQUIRREL],
    });
    took.act(0).chooseCards('a');
    took.expect.zone('Food', 'battlefield', { seat: 0 });
    const none = run(GRAB, ['Island', 'Lightning Bolt', 'Forest', 'Mountain'], {
      battlefield: [SQUIRREL],
    });
    none.act(0).chooseCards();
    none.expect.zone('Food', 'battlefield', { seat: 0 });
  });

  test('a Squirrel card milled and not taken is not "returned to your hand"', () => {
    const g = run(GRAB, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    g.act(0).chooseCards('b');
    g.expect.noObject('Food', { zone: 'battlefield' });
    const none = run(GRAB, [SQUIRREL, 'Island', 'Lightning Bolt', 'Forest']);
    none.act(0).chooseCards();
    none.expect.noObject('Food', { zone: 'battlefield' });
  });

  test('a Squirrel card that was already in the graveyard is not among the cards milled', () => {
    const g = run(GRAB, ['Island', 'Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt'], {
      graveyard: [SQUIRREL],
    });
    expect(chooseCardsDecision(g).legal).toEqual([g.id('a')]);
  });
});

describe('the fixtures', () => {
  test('every card of the slice is a valid card definition', () => {
    expect(SYNTHETIC_DANITHA_G2_LIST).toHaveLength(8);
    for (const card of SYNTHETIC_DANITHA_G2_LIST) expect(validateCard(card), card.name).toEqual([]);
  });

  const scout = SYNTHETIC_DANITHA_G2_LIST.find((c) => c.name === TILLING) as CardDefinition;
  const withEffect = (effect: Effect): CardDefinition => ({
    ...scout,
    faces: scout.faces.map((f) => ({ ...f, spell: { effect } })),
  });
  const take = (extra: object, to: 'hand' | 'battlefield' = 'hand', zone = 'graveyard'): Effect =>
    ({
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone, controller: 'you', types: ['land'] },
        fromMoved: true,
        ...extra,
      },
      to,
    }) as Effect;
  const mill: Effect = { kind: 'mill', player: { kind: 'you' }, count: 4 };

  test('the validator accepts the choice after a mill', () => {
    expect(validateCard(withEffect({ kind: 'sequence', effects: [mill, take({})] }))).toEqual([]);
  });

  test('the validator refuses "from among them" with no effect before it that moved cards', () => {
    const issues = validateCard(withEffect(take({})));
    expect(issues.map((i) => i.message).join('\n')).toContain('fromMoved');
  });

  test('the validator refuses "from among them" outside the graveyard or anywhere but the hand', () => {
    const hand = validateCard(
      withEffect({ kind: 'sequence', effects: [mill, take({}, 'hand', 'hand')] }),
    );
    expect(hand.map((i) => i.message).join('\n')).toContain('graveyard');
    const field = validateCard(
      withEffect({ kind: 'sequence', effects: [mill, take({}, 'battlefield')] }),
    );
    expect(field.map((i) => i.message).join('\n')).toContain('hand');
  });

  test('the validator refuses inZone other than the hand', () => {
    const issues = validateCard(
      withEffect({
        kind: 'sequence',
        effects: [
          mill,
          take({}),
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { subtypes: ['Town'] },
              inZone: 'battlefield',
            } as never,
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          },
        ],
      }),
    );
    expect(issues.map((i) => i.message).join('\n')).toContain('inZone');
  });
});
