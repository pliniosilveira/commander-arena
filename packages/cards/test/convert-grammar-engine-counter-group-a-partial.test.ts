// The Final Fantasy X counter deck, group A (partial cards): Resourceful Defense's first ability, Yuna's second ability and Tromell's static ability, each as a SYNTHETIC card that carries only
// the text of the REAL card this group reads, played through applyAction. The real cards keep an ability another group builds, so they stay unsupported (a card is supported or not, never
// partly): the last block says which text is the one still not read. Pins: CR 122.6 (putting counters), CR 603.10a and 113.7a (a permanent that left the battlefield is read as it last was:
// its counters of every kind), CR 603.4 (intervening "if"), CR 614.1c and 122.6a (a permanent that enters with counters: the player who controls it puts them).
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function imported(name: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
}

const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const ELVES = 'Llanowar Elves'; // 1/1, {G}
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

describe('Resourceful Defense: "Whenever a permanent you control leaves the battlefield, if it had counters on it, put those counters on target permanent you control."', () => {
  const defense = parsed(
    'SYNTHETIC Resourceful Defense Trigger',
    'Enchantment',
    'Whenever a permanent you control leaves the battlefield, if it had counters on it, put those counters on target permanent you control.',
    { manaCost: '{2}{W}' },
  );
  const DEFENSE = defense.name;

  const start = () =>
    scenario()
      .define(defense)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(DEFENSE)
      .battlefield(BEARS, { label: 'dying', counters: { '+1/+1': 1, charge: 2 } })
      .battlefield(ELVES, { label: 'bare' })
      .battlefield('Sol Ring', { label: 'ring' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(defense)).toEqual([]);
    expect(defense.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'leavesBattlefield',
        what: { controller: 'you', hasCounter: true },
      },
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
        },
      ],
      effect: {
        kind: 'putCountersOf',
        from: { kind: 'triggerSubject' },
        to: { kind: 'target', id: 't1' },
      },
    });
  });

  test('a permanent with counters dies: every kind of counter it had is put on the target permanent (CR 603.10a, 113.7a)', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).chooseTargets('bare');
    g.passAll();
    g.expect.counters('bare', { '+1/+1': 1, charge: 2 });
    g.expect.invariants();
  });

  test('the target can be another permanent you control of any type, even the enchantment itself', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).chooseTargets('ring');
    g.passAll();
    g.expect.counters('ring', { '+1/+1': 1, charge: 2 });
  });

  test('a permanent with no counters leaving is no trigger', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['bare'], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });

  test('a permanent an opponent controls leaving is no trigger', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.counters('bare', {});
  });
});

describe('Yuna, Grand Summoner: "Whenever another permanent you control is put into a graveyard from the battlefield, if it had one or more counters on it, you may put that number of +1/+1 counters on target creature."', () => {
  const yuna = parsed(
    'SYNTHETIC Yuna Trigger',
    'Legendary Creature — Human Cleric',
    'Whenever another permanent you control is put into a graveyard from the battlefield, if it had one or more counters on it, you may put that number of +1/+1 counters on target creature.',
    { manaCost: '{1}{G}{W}{U}', power: '1', toughness: '5' },
  );
  const YUNA = yuna.name;

  const start = () =>
    scenario()
      .define(yuna)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(YUNA, { label: 'yuna' })
      .battlefield(BEARS, { label: 'dying', counters: { '+1/+1': 1, charge: 2 } })
      .battlefield(ELVES, { label: 'bare' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs', counters: { '+1/+1': 1 } })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(yuna)).toEqual([]);
    expect(yuna.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: expect.objectContaining({ what: expect.objectContaining({ hasCounter: true }) }),
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'addCounters',
        objects: { kind: 'target', id: 't1' },
        counter: '+1/+1',
        count: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
      },
      optional: true,
    });
  });

  test('another permanent with counters goes to the graveyard: you may put that many +1/+1 counters, counting every kind', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).chooseTargets('bare');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // One +1/+1 counter and two charge counters: three +1/+1 counters.
    g.expect.counters('bare', { '+1/+1': 3 });
  });

  test('the controller may decline', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).chooseTargets('bare');
    g.passAll();
    g.act(0).decline();
    g.expect.counters('bare', {});
  });

  test('the target can be a creature an opponent controls', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['dying'], pay: true });
    g.passAll();
    g.act(0).chooseTargets('theirs');
    g.passAll();
    g.act(0).accept();
    g.expect.counters('theirs', { '+1/+1': 4 });
  });

  test('a permanent without counters, and one an opponent controls, are no trigger', () => {
    const g = start();
    g.act(0).cast(BOLT, { targets: ['bare'], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
  });
});

describe('Tromell, Seymour\'s Butler: "Each other nontoken creature you control enters with an additional +1/+1 counter on it."', () => {
  const tromell = parsed(
    'SYNTHETIC Tromell Static',
    'Legendary Creature — Elf Advisor',
    'Each other nontoken creature you control enters with an additional +1/+1 counter on it.',
    { manaCost: '{2}{G}', power: '2', toughness: '3' },
  );
  const TROMELL = tromell.name;

  const start = () =>
    scenario()
      .define(tromell)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, ELVES)
      .battlefield('Forest', { count: 3 })
      .battlefield(TROMELL)
      .seat(1)
      .library(...LIBRARY)
      .hand('SYNTHETIC Vanilla 1/1')
      .battlefield('Forest', { count: 2 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(tromell)).toEqual([]);
  });

  test('a creature you cast enters with a +1/+1 counter, and its power and toughness show it (CR 122.6, 614.1c)', () => {
    const g = start();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.pt(BEARS, 3, 3);
  });

  test('Tromell itself, "other", enters without one', () => {
    const g = start();
    g.expect.counters(TROMELL, {});
  });
});

describe('the real cards stay unsupported while another group builds their other ability', () => {
  // [name, the start of the text that is still not read]
  const REST: readonly (readonly [string, string])[] = [
    ['Blitzball Stadium', 'Go for the Goal!'],
    ['Rikku, Resourceful Guardian', 'Steal'],
    ['Resourceful Defense', '{4}{W}: Move any number of counters'],
    ["Tromell, Seymour's Butler", '{1}, {T}: Proliferate X times'],
    ['Yuna, Grand Summoner', 'Grand Summon'],
  ];

  test.each(REST)('%s: only %s is left', (name, start) => {
    const card = imported(name);
    expect(card.support.status).toBe('unsupported');
    expect(card.support.unparsed.map((u) => u.text.slice(0, start.length))).toEqual([start]);
  });
});
