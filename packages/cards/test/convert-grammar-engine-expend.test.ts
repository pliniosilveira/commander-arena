// The Animated Army deck (issue 110), the expend group: the REAL Oracle text of Teapot Slinger, Wandertale Mentor, Trailtracker Scout and Pyreswipe Hawk (the corpus's golden.jsonl)
// goes through the grammar as cards with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what
// the engine runs. Pins: CR 700.14 (expend), CR 601.2h (the mana spent on a spell), CR 603.3d (the targets of a triggered ability, "up to one"), CR 613.1b and 611.2b (a
// control-changing effect "for as long as you control this creature"), CR 608.2h (an amount is worked out once, as the ability resolves), CR 120.3 (damage to each opponent).
// The rulings of 2024-07-26: an expend ability triggers once a turn; Pyreswipe Hawk's X is calculated once; if the Hawk leaves before its last ability resolves, control does not change.
// The SYNTHETIC lines are near misses of the real wording.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { ScenarioError, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // {1}{G}
const SPIDER = 'Giant Spider'; // {3}{G}
const BOLT = 'Lightning Bolt'; // {R}
const MURDER = 'Murder'; // {1}{B}{B}
const SOL_RING = 'Sol Ring'; // artifact, mana value 1
const SIX = 'SYNTHETIC Expend Six'; // artifact, mana value 2
const KICKER = 'SYNTHETIC Kicker Gain'; // {W} instant, kicker {1}
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');
const FORESTS = (n: number) => Array.from({ length: n }, () => 'Forest');
const h = (name: string) => ({ name, zone: 'hand', seat: 0, nth: 0 }) as const;

describe('the lowering of "Whenever you expend N"', () => {
  const creature = (text: string) => readAll(text, 'creature', []).abilities;

  test('the expend trigger with its number', () => {
    expect(creature('Whenever you expend 4, put a +1/+1 counter on this creature.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'expend', amount: 4 },
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
      },
    ]);
  });

  test('"gain control of up to one target artifact for as long as you control this creature"', () => {
    expect(
      creature(
        'Whenever you expend 6, gain control of up to one target artifact for as long as you control this creature.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'expend', amount: 6 },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'gainControl',
          objects: { kind: 'target', id: 't1' },
          duration: 'forAsLongAsYouControlThis',
        },
      },
    ]);
  });

  test.each([
    'Whenever you expend 4 or more, draw a card.',
    'Whenever you expend X, draw a card.',
    'Whenever you expend 0, draw a card.',
    'Whenever an opponent expends 4, draw a card.',
    'Whenever you expend 4 mana, draw a card.',
    'Whenever you expend 6, gain control of up to two target artifacts for as long as you control this creature.',
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    // The segmenter writes the card's own name and "this creature" as "~".
    expect(dropped(text, 'creature', []).text).toBe(text.replace('this creature', '~'));
  });
});

describe('Teapot Slinger', () => {
  const slinger = real('Teapot Slinger');

  test('three seats: the fourth mana spent on spells deals 2 damage to each opponent, once a turn', () => {
    const g = scenario({ seats: 3 })
      .define(slinger)
      .seat(0)
      .hand(BEARS, BEARS, SPIDER)
      .battlefield(slinger.name, ...FORESTS(8))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(h(BEARS), { pay: true });
    g.passAll();
    for (const seat of [0, 1, 2] as const) g.expect.life(seat, 40);
    g.act(0).cast(h(BEARS), { pay: true });
    g.expect.stack([`${slinger.name} (ability)`, BEARS]);
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 38);
    g.expect.life(2, 38);
    // Four more mana the same turn: it has already triggered.
    g.act(0).cast(SPIDER, { pay: true });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(2, 38);
    g.expect.invariants();
  });

  test('cast for its four mana, it does not trigger the turn it enters', () => {
    const g = scenario({ seats: 3 })
      .define(slinger)
      .seat(0)
      .hand(slinger.name, BEARS)
      .battlefield('Mountain', ...FORESTS(5))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(slinger.name, { pay: true });
    g.passAll();
    g.expect.zone(slinger.name, 'battlefield', { seat: 0 });
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });
});

describe('Wandertale Mentor', () => {
  const mentor = real('Wandertale Mentor');

  test('a +1/+1 counter as you expend 4, and its own mana counts when spent on a spell', () => {
    const g = scenario()
      .define(mentor)
      .seat(0)
      .hand(SPIDER)
      .battlefield(mentor.name, ...FORESTS(3))
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0)
      .cast(SPIDER)
      .payManual([{ source: mentor.name, color: 'G' }, 'Forest[0]', 'Forest[1]', 'Forest[2]']);
    g.passAll();
    g.expect.counters(mentor.name, { '+1/+1': 1 });
    g.expect.pt(mentor.name, 3, 3);
  });
});

describe('Trailtracker Scout', () => {
  const scout = real('Trailtracker Scout');

  const start = () =>
    scenario()
      .define(scout)
      .seat(0)
      .hand(SPIDER, SPIDER)
      .graveyard(BEARS, BOLT)
      .battlefield(scout.name, ...FORESTS(8))
      .library(...LIBRARY)
      .seat(1)
      .graveyard(SOL_RING)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  const toEight = (g: ReturnType<typeof start>) => {
    g.act(0).cast(h(SPIDER), { pay: true });
    g.passAll();
    g.act(0).cast(h(SPIDER), { pay: true });
    g.expect.pending('targets', 0);
  };

  test('the eighth mana: a permanent card of your graveyard returns to your hand', () => {
    const g = start();
    toEight(g);
    g.act(0).chooseTargets({ name: BEARS, zone: 'graveyard' });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('an instant card and a card of another graveyard are no targets', () => {
    for (const target of [
      { name: BOLT, zone: 'graveyard' },
      { name: SOL_RING, zone: 'graveyard' },
    ] as const) {
      const g = start();
      toEight(g);
      expect(() => g.act(0).chooseTargets(target)).toThrow(ScenarioError);
    }
  });

  test('"up to one": no target may be chosen, and then nothing returns', () => {
    const g = start();
    toEight(g);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });
});

describe('Pyreswipe Hawk', () => {
  const hawk = real('Pyreswipe Hawk');
  const HAWK = hawk.name;

  const start = () =>
    scenario()
      .define(hawk)
      .seat(0)
      .hand(SPIDER, BEARS, KICKER, KICKER, KICKER)
      .battlefield(HAWK, SOL_RING, ...FORESTS(6))
      .battlefield(...Array.from({ length: 6 }, () => 'Plains'))
      .library(...LIBRARY)
      .seat(1)
      .hand(MURDER)
      .battlefield(SIX, { label: 'theirs' })
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();

  const toSix = (g: ReturnType<typeof start>) => {
    g.act(0)
      .cast(SPIDER)
      .payManual(FORESTS(4).map((_, i) => `Forest[${i}]`));
    g.passAll();
    g.act(0).cast(BEARS).payManual(['Forest[4]', 'Forest[5]']);
    g.expect.pending('targets', 0);
  };

  test('the sixth mana: control of the target artifact for as long as you control the Hawk', () => {
    const g = start();
    toSix(g);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    expect(g.view(0).battlefield.find((p) => p.name === SIX)?.controller).toBe(0);
    // The Hawk leaves: the effect ends (CR 611.2b).
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [HAWK], pay: true });
    g.passAll();
    g.expect.zone(HAWK, 'graveyard', { seat: 0 });
    expect(g.view(0).battlefield.find((p) => p.name === SIX)?.controller).toBe(1);
    g.expect.invariants();
  });

  test('the Hawk leaves before the ability resolves: control does not change at all', () => {
    const g = start();
    toSix(g);
    g.act(0).chooseTargets('theirs');
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [HAWK], pay: true });
    g.passAll(); // Murder resolves
    g.expect.zone(HAWK, 'graveyard', { seat: 0 });
    g.passAll(); // the ability, then the spell under it
    g.passAll();
    expect(g.view(0).battlefield.find((p) => p.name === SIX)?.controller).toBe(1);
  });

  test('"up to one": with no target chosen nothing changes hands', () => {
    const g = start();
    toSix(g);
    g.act(0).chooseTargets();
    g.passAll();
    expect(g.view(0).battlefield.find((p) => p.name === SIX)?.controller).toBe(1);
    expect(g.view(0).battlefield.find((p) => p.name === SOL_RING)?.controller).toBe(0);
  });

  test('attacking: +X/+0 with X the greatest mana value among your artifacts, worked out once as it resolves', () => {
    const g = start();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: HAWK }]);
    g.passAll();
    g.expect.pt(HAWK, 5, 4); // Sol Ring has mana value 1
    // Six mana of instants in the same step take an artifact of mana value 2: the bonus stays what it was.
    for (let i = 0; i < 3; i += 1) {
      g.act(0)
        .cast(h(KICKER), { kicked: true })
        .payManual([`Plains[${2 * i}]`, `Plains[${2 * i + 1}]`]);
      if (i < 2) g.passAll();
    }
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    expect(g.view(0).battlefield.find((p) => p.name === SIX)?.controller).toBe(0);
    g.expect.pt(HAWK, 5, 4);
  });
});
