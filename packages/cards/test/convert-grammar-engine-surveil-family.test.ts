// The surveil family of the Revenant Recon deck: the REAL Oracle text of Unshakable Tail, Whispering Snitch, Watcher of Hours, Dream Eater, Enhanced Surveillance and Eye of Duskmantle (the
// corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the
// real text are what the engine runs. Pins: CR 701.25a (surveil), CR 701.25d (an empty library), CR 603.2 (triggers, "for the first time each turn"), CR 603.12 (a reflexive trigger),
// CR 702.62a (Suspend), CR 113.6b, CR 601.2a and CR 305.1 (cast and play from the graveyard), CR 118.9 and CR 202.3 (life paid for the mana cost). Not checked against the CR text (the
// file was not available): the numbers are those the code and the docs already cite. Spells that surveil are the SYNTHETIC "Quiet Look" of the engine fixtures (an instant, "Surveil 2.").
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const TAIL = real('Unshakable Tail');
const SNITCH = real('Whispering Snitch');
const WATCHER = real('Watcher of Hours');
const EATER = real('Dream Eater');
const SURVEILLANCE = real('Enhanced Surveillance');
const EYE = real('Eye of Duskmantle');

const QUIET = 'SYNTHETIC Quiet Look'; // {U} instant: surveil 2
/** Library filler: seat 0's is Plains and every other seat's is Mountain, so a reference like `Plains[0]` is a card of the library of seat 0. */
const PLAINS = Array.from({ length: 12 }, () => 'Plains');
const MOUNTAINS = Array.from({ length: 12 }, () => 'Mountain');

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const inHand = (seat: 0 | 1 | 2) => ({ name: QUIET, zone: 'hand', seat, nth: 0 }) as const;

describe('every card is valid', () => {
  test.each([
    ['Unshakable Tail', TAIL],
    ['Whispering Snitch', SNITCH],
    ['Watcher of Hours', WATCHER],
    ['Dream Eater', EATER],
    ['Enhanced Surveillance', SURVEILLANCE],
    ['Eye of Duskmantle', EYE],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Unshakable Tail: "When ~ enters and at the beginning of your upkeep, surveil 1."', () => {
  test('it has the enters trigger and the upkeep trigger, each a surveil 1', () => {
    const triggers = faceOf(TAIL).abilities.filter((a) => a.kind === 'triggered');
    expect(triggers.slice(0, 2)).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'surveil', count: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: { kind: 'surveil', count: 1 },
      },
    ]);
  });

  test('entering surveils 1: the card looked at goes into the graveyard if the player says so', () => {
    const g = scenario()
      .define(TAIL)
      .seat(0)
      .hand(TAIL.name)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library('Forest', 'Forest', ...PLAINS)
      .seat(1)
      .library(...MOUNTAINS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(TAIL.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['Forest[0]'] });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('each upkeep of its controller surveils 1, and the upkeep of another player does not', () => {
    const g = scenario()
      .define(TAIL)
      .seat(0)
      .battlefield(TAIL.name)
      .library('Forest', ...PLAINS)
      .seat(1)
      .library(...MOUNTAINS)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
    // The upkeep of seat 1 (turn 4) is not an upkeep of seat 0.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.passAll();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['Forest'] });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Whispering Snitch: "Whenever you surveil for the first time each turn, ~ deals 1 damage to each opponent and you gain 1 life."', () => {
  const board = (seats: 2 | 3 = 2, active: 0 | 1 = 0) => {
    let b = scenario({ seats })
      .define(SNITCH)
      .define(syntheticCard(QUIET))
      .seat(0)
      .battlefield(SNITCH.name, 'Island', 'Island')
      .hand(QUIET, QUIET)
      .library(...PLAINS)
      .seat(1)
      .battlefield('Island')
      .hand(QUIET)
      .library(...MOUNTAINS);
    if (seats === 3) b = b.seat(2).library(...MOUNTAINS);
    return b.at('precombatMain', { active, turn: 3 + active }).build();
  };
  const surveil = (g: ReturnType<typeof board>, seat: 0 | 1 = 0) => {
    g.act(seat).cast(inHand(seat), { pay: true });
    g.passAll();
    g.act(seat).arrange(
      seat === 0 ? { top: ['Plains[0]', 'Plains[1]'] } : { top: ['Mountain[0]', 'Mountain[1]'] },
    );
  };

  test('the first surveil of the turn triggers it, the second does not (CR 603.2)', () => {
    const g = board();
    surveil(g);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 41);
    surveil(g);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 41);
    g.expect.invariants();
  });

  test('each opponent is dealt the damage, in a game of three', () => {
    const g = board(3);
    surveil(g);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(2, 39);
    g.expect.life(0, 41);
  });

  test('a surveil of another player does not trigger it', () => {
    const g = board(2, 1);
    surveil(g, 1);
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('a surveil of the next turn of the player is the first of that turn', () => {
    const g = board();
    surveil(g);
    g.passAll();
    g.expect.life(1, 39);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    surveil(g);
    g.passAll();
    g.expect.life(1, 38);
  });
});

describe('Dream Eater: "When ~ enters, surveil 4. When you do, you may return target nonland permanent an opponent controls to its owner’s hand."', () => {
  const board = (opponents: 'two' | 'lands' = 'two') => {
    let b = scenario({ seats: 3 })
      .define(EATER)
      .seat(0)
      .hand(EATER.name)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .library('Forest', 'Forest', 'Forest', 'Forest', ...PLAINS)
      .seat(1)
      .battlefield(...(opponents === 'two' ? ['Grizzly Bears', 'Mountain'] : ['Mountain']))
      .library(...MOUNTAINS)
      .seat(2)
      .battlefield(...(opponents === 'two' ? ['Giant Spider'] : ['Mountain']))
      .library(...MOUNTAINS);
    b = b.at('precombatMain', { active: 0, turn: 3 });
    return b.build();
  };
  const FORESTS = ['Forest[0]', 'Forest[1]', 'Forest[2]', 'Forest[3]'];

  /** Casts Dream Eater and resolves its enters trigger up to the question about the surveil. */
  const entersAndSurveil = (g: ReturnType<typeof board>) => {
    g.act(0).cast(EATER.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('arrangeCards', 0);
  };

  test('surveil 4 looks at four cards', () => {
    const g = board();
    entersAndSurveil(g);
    const d = g.state.pending;
    expect(d?.kind === 'arrangeCards' && d.cards).toHaveLength(4);
  });

  test('the reflexive ability returns the permanent of an opponent the player chooses, if the player accepts', () => {
    const g = board();
    entersAndSurveil(g);
    g.act(0).arrange({ top: [], other: FORESTS });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('Giant Spider');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Giant Spider', 'hand', { seat: 2 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the player may decline, and nothing is returned', () => {
    const g = board();
    entersAndSurveil(g);
    g.act(0).arrange({ top: FORESTS });
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('putting every card back on top is still a surveil that was done: the ability is created', () => {
    const g = board();
    entersAndSurveil(g);
    g.act(0).arrange({ top: FORESTS });
    g.expect.pending('targets', 0);
  });

  test('with no nonland permanent of an opponent to target the ability is removed from the stack', () => {
    const g = board('lands');
    entersAndSurveil(g);
    g.act(0).arrange({ top: FORESTS });
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Enhanced Surveillance: "You may look at an additional two cards each time you surveil."', () => {
  /** `mine` copies of the enchantment for seat 0, or one for seat 1 with `mine` 0; a library of `library` cards for seat 0. */
  const board = (mine: number, library = 8) => {
    let b = scenario()
      .define(syntheticCard(QUIET))
      .define(SURVEILLANCE)
      .seat(0)
      .hand(QUIET)
      .battlefield('Island');
    for (let i = 0; i < mine; i += 1) b = b.battlefield(SURVEILLANCE.name);
    for (let i = 0; i < library; i += 1) b = b.library('Plains');
    let s = b.seat(1).library(...MOUNTAINS);
    if (mine === 0) s = s.battlefield(SURVEILLANCE.name);
    return s.at('precombatMain', { active: 0, turn: 3 }).build();
  };
  const looked = (g: ReturnType<typeof board>): number => {
    g.act(0).cast(inHand(0), { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
    return d.cards.length;
  };

  test('surveil 2 looks at four cards while the player controls it', () => {
    expect(looked(board(1))).toBe(4);
  });

  test('two of them add up', () => {
    expect(looked(board(2))).toBe(6);
  });

  test('with the enchantment of an opponent, a surveil looks at exactly the cards it says', () => {
    expect(looked(board(0))).toBe(2);
  });

  test('a library of fewer cards than that is looked at whole', () => {
    expect(looked(board(1, 3))).toBe(3);
  });

  test('the cards not put into the graveyard go back on top, the extra ones included', () => {
    const g = board(1);
    looked(g);
    g.act(0).arrange({
      top: ['Plains[3]', 'Plains[0]'],
      other: ['Plains[1]', 'Plains[2]'],
    });
    expect(g.state.seats[0]?.graveyard).toHaveLength(3); // the two surveiled cards and the spell
    expect(g.state.seats[0]?.library).toHaveLength(6);
    g.expect.invariants();
  });

  test('the second ability of the card is still read: exile it to shuffle the graveyard into the library', () => {
    expect(faceOf(SURVEILLANCE).abilities).toHaveLength(2);
  });
});

describe('Watcher of Hours: "Whenever you remove a time counter from this card while it’s exiled, surveil 1."', () => {
  test('suspended, each time the upkeep of its owner removes a time counter, they surveil 1', () => {
    const g = scenario()
      .define(WATCHER)
      .seat(0)
      .hand(WATCHER.name)
      .battlefield('Island', 'Island')
      .library('Forest', ...PLAINS)
      .seat(1)
      .library(...MOUNTAINS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).suspend(WATCHER.name, { pay: true });
    g.expect.counters(WATCHER.name, { time: 6 });
    // The upkeep of seat 1 is not an upkeep of seat 0: no counter comes off.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.counters(WATCHER.name, { time: 6 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    // The suspend ability removes the counter as it resolves; the removal triggers the surveil.
    g.passAll();
    g.expect.counters(WATCHER.name, { time: 5 });
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: [], other: ['Forest'] });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the ability is the card’s own and says time counters, in exile', () => {
    expect(faceOf(WATCHER).abilities).toContainEqual({
      kind: 'triggered',
      trigger: { kind: 'removesCounterWhileExiled', counter: 'time' },
      effect: { kind: 'surveil', count: 1 },
    });
  });

  test('on the battlefield it does nothing', () => {
    const g = scenario()
      .define(WATCHER)
      .seat(0)
      .battlefield(WATCHER.name, { counters: { time: 2 } })
      .library('Forest', ...PLAINS)
      .seat(1)
      .library(...MOUNTAINS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.noEvent({ kind: 'surveiled' });
  });
});

describe('Eye of Duskmantle: play and cast the cards you surveilled this turn, for life', () => {
  const BOLT = 'Lightning Bolt';
  const board = (library: readonly string[]) =>
    scenario()
      .define(EYE)
      .define(syntheticCard(QUIET))
      .seat(0)
      .battlefield(EYE.name, 'Island')
      .hand(QUIET)
      .graveyard('Giant Spider')
      .library(...library, ...PLAINS)
      .seat(1)
      .library(...MOUNTAINS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  /** Surveils 2: the cards named go into the graveyard and the rest of the two looked at stay on top. */
  const surveilTwo = (g: ReturnType<typeof board>, other: readonly string[]) => {
    g.act(0).cast(inHand(0), { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
    const name = (id: string): string => {
      const card = g.state.objects[id as keyof typeof g.state.objects]?.card;
      const def = card == null ? undefined : g.state.cards[card]?.definition;
      return def === undefined ? '?' : (g.state.definitions[def]?.name ?? '?');
    };
    const goes = d.cards.filter((id) => other.includes(name(id)));
    g.act(0).arrange({ top: d.cards.filter((id) => !goes.includes(id)), other: goes });
  };
  const options = (g: ReturnType<typeof board>, seat: 0 | 1 = 0) =>
    getLegalActions(g.state, seat).filter(
      (a) =>
        (a.kind === 'castSpell' || a.kind === 'playLand') &&
        g.state.objects[a.object]?.zone === 'graveyard',
    );
  const describeOption = (g: ReturnType<typeof board>, a: ReturnType<typeof options>[number]) => {
    const obj = a.kind === 'castSpell' || a.kind === 'playLand' ? g.state.objects[a.object] : null;
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    const name = card === undefined ? '?' : g.state.definitions[card.definition]?.name;
    return `${a.kind}:${name}:${a.kind === 'castSpell' ? (a.alternative ?? '') : ''}`;
  };

  test('its text is the permission of the engine, in one ability', () => {
    expect(faceOf(EYE).abilities).toContainEqual({
      kind: 'static',
      static: { kind: 'playSurveiledFromGraveyard' },
    });
  });

  test('nothing in the graveyard is offered before a surveil put a card there', () => {
    const g = board(['Grizzly Bears', 'Forest']);
    expect(options(g)).toEqual([]);
  });

  test('the land and the creature the surveil put into the graveyard are offered, the creature only for life, and the card that was there before is not', () => {
    const g = board(['Grizzly Bears', 'Forest']);
    surveilTwo(g, ['Grizzly Bears', 'Forest']);
    expect(
      options(g)
        .map((a) => describeOption(g, a))
        .sort(),
    ).toEqual(['castSpell:Grizzly Bears:lifeForMana', 'playLand:Forest:']);
  });

  test('the creature is cast for life equal to its mana value, with no mana', () => {
    const g = board(['Grizzly Bears', 'Forest']);
    surveilTwo(g, ['Grizzly Bears']);
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'graveyard' }, { alternative: 'lifeForMana' });
    g.expect.life(0, 38);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the land is played from the graveyard, and uses the land drop', () => {
    const g = board(['Forest', 'Plains']);
    surveilTwo(g, ['Forest']);
    g.act(0).playLand({ name: 'Forest', zone: 'graveyard' });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a card that was not surveilled is not offered', () => {
    const g = board(['Grizzly Bears', 'Forest']);
    surveilTwo(g, ['Forest']);
    expect(options(g).map((a) => describeOption(g, a))).toEqual(['playLand:Forest:']);
  });

  test('an instant surveilled during the turn of another player is cast then, for life: the permission is not limited to your own turn', () => {
    const g = board([BOLT, 'Forest']);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 4 });
    // The active player passes, and seat 0 has priority in the upkeep of seat 1.
    g.act(1).pass();
    surveilTwo(g, [BOLT]);
    g.act(1).pass();
    g.act(0).cast(
      { name: BOLT, zone: 'graveyard' },
      { alternative: 'lifeForMana', targets: [{ player: 1 }] },
    );
    g.expect.life(0, 39); // Lightning Bolt has mana value 1
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('the permission ends with the turn: later the card is no longer one surveilled this turn', () => {
    const g = board(['Grizzly Bears', 'Forest']);
    surveilTwo(g, ['Grizzly Bears']);
    expect(options(g)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(options(g)).toEqual([]);
  });

  test('a surveil of another player gives no permission to this player', () => {
    const g = scenario()
      .define(EYE)
      .define(syntheticCard(QUIET))
      .seat(0)
      .battlefield(EYE.name)
      .library(...PLAINS)
      .seat(1)
      .battlefield('Island')
      .hand(QUIET)
      .library('Grizzly Bears', 'Forest', ...MOUNTAINS)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).cast(inHand(1), { pay: true });
    g.passAll();
    g.act(1).arrange({ top: [], other: ['Grizzly Bears', 'Forest'] });
    // The cards are in the graveyard of seat 1, which the Eye of seat 0 does not read, and seat 1 has no Eye.
    expect(options(g, 0)).toEqual([]);
    expect(options(g, 1)).toEqual([]);
  });
});
