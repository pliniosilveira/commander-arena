// The counter triggers of the Blight Curse deck (Lorwyn Eclipsed) on hand-written ASTs, through applyAction: the turn log of the counters a player put (`putCountersThisTurn`, CR 122.6), the
// permanent a trigger is about as it last was (`subjectControlledByYou`, `subjectStat`, CR 603.10a, 113.7a), "each other player" (`eachPlayerExcept`, CR 102.1), the counters of every kind
// on a permanent (`countersOn` with no kind, CR 122.1) and "another" besides the card of the creature that died (`notTriggerCard`, CR 400.7, 109.1). The real card texts that use them
// are played in packages/cards/test/convert-grammar-engine-blight-curse-counters.test.ts. Cards are SYNTHETIC, defined here, or fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4 flying
const SPIDER = 'Giant Spider'; // 2/4, {3}{G}
const BOLT = 'Lightning Bolt';
const ROT = 'SYNTHETIC Rot Boon'; // {B}: a -1/-1 counter on target creature
const BOON = 'SYNTHETIC Counter Boon'; // {G}: two +1/+1 counters on target creature
const BLIGHT_IDOL = 'SYNTHETIC Blight Idol'; // all damage is dealt as though its source had wither
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const enchantment = (name: string, ...abilities: Ability[]) =>
  singleFaceCard({
    name,
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: `SYNTHETIC ${name}`,
    abilities,
  });

describe('putCountersThisTurn: the turn log of the counters a player put (CR 122.6)', () => {
  const tally = (
    name: string,
    condition: Extract<Ability, { kind: 'triggered' }>['interveningIf'],
  ) =>
    enchantment(name, {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      ...(condition === undefined ? {} : { interveningIf: condition }),
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    });

  const ANY = tally('SYNTHETIC Tally Any', { kind: 'putCountersThisTurn' });
  const PLUS = tally('SYNTHETIC Tally Plus', { kind: 'putCountersThisTurn', counter: '+1/+1' });
  const LAND = tally('SYNTHETIC Tally Land', { kind: 'putCountersThisTurn', onType: 'land' });

  const start = (idol: string) =>
    scenario()
      .define(ANY)
      .define(PLUS)
      .define(LAND)
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(ROT, BOON, BOLT)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Forest')
      .battlefield('Mountain')
      .battlefield(idol)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(ANGEL, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('no counter put: nothing at the end step', () => {
    const g = start(ANY.name);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 20);
  });

  test('any counter the controller put counts, on any creature', () => {
    const g = start(ANY.name);
    g.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 21);
  });

  test('a kind of counter named: only that kind counts', () => {
    const rotten = start(PLUS.name);
    rotten.act(0).cast(ROT, { targets: ['theirs'], pay: true });
    rotten.passAll();
    rotten.advanceTo('end');
    rotten.passAll();
    rotten.expect.life(0, 20);

    const grown = start(PLUS.name);
    grown.act(0).cast(BOON, { targets: ['mine'], pay: true });
    grown.passAll();
    grown.advanceTo('end');
    grown.passAll();
    grown.expect.life(0, 21);
  });

  test('a card type named: a counter on a creature is no counter on a land', () => {
    const g = start(LAND.name);
    g.act(0).cast(BOON, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 20);
  });

  test('counters no player put (the -1/-1 counters of wither damage) are not recorded', () => {
    const g = start(ANY.name);
    g.act(0).cast(ROT, { targets: ['mine'], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 21);
    const wither = scenario()
      .define(ANY)
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(ANY.name)
      .battlefield(BLIGHT_IDOL)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(ANGEL, { label: 'theirs' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    wither.act(0).cast(BOLT, { targets: ['theirs'], pay: true });
    wither.passAll();
    wither.expect.counters('theirs', { '-1/-1': 3 });
    wither.advanceTo('end');
    wither.passAll();
    wither.expect.life(0, 20);
  });
});

describe('subjectStat and subjectControlledByYou read the creature that died as it last was (CR 603.10a, 113.7a)', () => {
  const DEATH_WATCH = enchantment('SYNTHETIC Death Watch', {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { types: ['creature'] } },
    interveningIf: { kind: 'subjectStat', stat: 'power', compare: { cmp: 'atLeast', value: 3 } },
    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
  });

  const start = () =>
    scenario()
      .define(DEATH_WATCH)
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(BOLT, BOLT, ROT)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Swamp')
      .battlefield(DEATH_WATCH.name)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 } })
      .battlefield(BEARS, { label: 'plain' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a creature with power 3 when it died: the ability triggers (its +1/+1 counter counts)', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 23);
  });

  test('a creature with power 2 when it died: it does not', () => {
    const g = start();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['plain'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 20);
  });

  test('a creature shrunk by a counter as it died has the power it last had: 3 less 1 is 2, so no trigger', () => {
    const g = start();
    g.act(0).cast(ROT, { targets: ['bears'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 20);
  });
});

describe('eachPlayerExcept and countersOn of every kind (CR 102.1, 122.1)', () => {
  const GRIEF = enchantment('SYNTHETIC Counted Grief', {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { types: ['creature'] } },
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'loseLife',
          player: {
            kind: 'eachPlayerExcept',
            except: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
          },
          amount: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
        },
        {
          kind: 'draw',
          player: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
          count: { kind: 'countersOn', of: { kind: 'triggerSubject' } },
        },
      ],
    },
  });

  const start = (counters: Readonly<Record<string, number>>) =>
    scenario()
      .define(GRIEF)
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', { count: 2 })
      .battlefield(GRIEF.name)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(SPIDER, { label: 'spider', counters })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the counters of every kind the creature had are added together: its owner draws that many and every other player loses that much life', () => {
    // A 2/4 with a +1/+1 counter and two stun counters is a 3/5: two Bolts kill it, and it had three counters.
    const g = start({ '+1/+1': 1, stun: 2 });
    g.act(0).cast('Lightning Bolt[0]', { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    expect(g.state.seats[1]?.hand.length).toBe(3);
    g.expect.life(0, 17);
    g.expect.life(1, 20);
  });

  test('a creature that dies with no counters: zero life lost and zero cards drawn', () => {
    const g = start({});
    g.act(0).cast('Lightning Bolt[0]', { targets: ['spider'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: ['spider'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    expect(g.state.seats[1]?.hand.length).toBe(0);
    g.expect.life(0, 20);
  });
});

describe('notTriggerCard: "another target card" is besides the card of the creature that died (CR 400.7, 603.10a, 109.1)', () => {
  const RETURN = enchantment('SYNTHETIC Another Return', {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'graveyard',
            controller: 'you',
            types: ['creature'],
            notTriggerCard: true,
          },
        },
      },
    ],
    effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
  });

  test('with only the creature that died in the graveyard there is no target; with another card the ability returns it', () => {
    const lone = scenario()
      .define(RETURN)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(RETURN.name)
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    lone.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    lone.passAll();
    lone.expect.zone(BEARS, 'graveyard', { seat: 0 });
    lone.expect.stack([]);

    const two = scenario()
      .define(RETURN)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .graveyard(SPIDER)
      .battlefield('Mountain')
      .battlefield(RETURN.name)
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    two.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    two.passAll();
    two.expect.zone(SPIDER, 'hand', { seat: 0 });
    two.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
