// Day and night (CR 731) and Daybound and Nightbound (CR 702.145). The game starts as neither day nor night (CR 731.1). A permanent with daybound makes it day when it is neither
// (CR 702.145d); at each untap step the previous turn's active player's spells decide: day and no spell cast, it becomes night; night and two or more spells, it becomes day (CR 502.2,
// 731.2). Daybound and nightbound permanents transform as it changes (CR 702.145b, 702.145c, 702.145e, 702.145f), a daybound permanent enters transformed at night (CR 702.145b), and
// neither can transform otherwise (CR 702.145b, 702.145e). Cards are SYNTHETIC (src/cards/fixtures/synthetic-daynight.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  type CardDefinition,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const CUB = 'SYNTHETIC Dayfang Cub // Nightfang Wolf'; // {1}{G} 2/2 Daybound; 4/4 Nightbound
const PUP = 'SYNTHETIC Dayfang Pup // Nightfang Hound'; // {G} 1/1 Daybound; 3/3 Nightbound
const SPURT = 'SYNTHETIC Growth Spurt'; // {G} instant: target creature gets +3/+3 until end of turn
const TURN = 'SYNTHETIC Turn Over'; // {1} instant: transform target creature

const lib = { count: 8 };

describe('it becomes day (CR 702.145d)', () => {
  test('the game starts as neither, and a game with no daybound permanent stays so', () => {
    const g = scenario()
      .seat(0)
      .hand(SPURT)
      .battlefield('Forest', 'Forest', 'Grizzly Bears')
      .library('Forest', lib)
      .seat(1)
      .library('Forest', lib)
      .build();
    g.expect.dayNight(null);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight(null); // CR 731.2c: the check does not happen
  });

  test('a daybound permanent entering makes it day, and it stays front face up', () => {
    const g = scenario()
      .seat(0)
      .hand(CUB)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library('Forest', lib)
      .build();
    g.act(0).cast(CUB, { pay: true });
    g.passAll();
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    g.expect.dayNight('day');
    expect(g.object(CUB).face).toBe(0);
    expect(g.events.filter((e) => e.kind === 'dayNightChanged')).toEqual([
      { kind: 'dayNightChanged', from: null, to: 'day' },
    ]);
    g.expect.invariants();
  });

  test('a nightbound permanent alone, with no daybound permanent on the battlefield, makes it night (CR 702.145g)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { face: 1 })
      .seat(1)
      .library('Forest', lib)
      .build({ settle: true });
    g.expect.dayNight('night');
  });

  test('a nightbound permanent with a daybound permanent on the battlefield does not (CR 702.145g)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { face: 1 })
      .battlefield(PUP)
      .seat(1)
      .library('Forest', lib)
      .build({ settle: true });
    g.expect.dayNight('day'); // CR 702.145d
    expect(g.object(CUB).face).toBe(0); // CR 702.145f: it is day, so the nightbound one transforms
  });
});

describe('the untap step check (CR 502.2, 731.2)', () => {
  const day = () =>
    scenario()
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .hand(SPURT, { label: 's1' })
      .hand(SPURT, { label: 's2' })
      .battlefield(CUB, { label: 'cub' })
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(PUP, { label: 'pup' })
      .library('Forest', lib)
      .build();

  test('day and the active player cast no spell: night at the next untap step, and the daybound permanents transform', () => {
    const g = day();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('night');
    expect(g.object('cub').face).toBe(1);
    expect(g.object('pup').face).toBe(1);
    g.expect.pt('cub', 4, 4);
    g.expect.invariants();
  });

  test('day and the active player cast one spell: still day', () => {
    const g = day();
    g.act(0).cast('s1', { targets: ['cub'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('day');
    expect(g.object('cub').face).toBe(0);
  });

  test("only the previous turn's active player counts: the other player's spells do not (CR 731.2)", () => {
    const g = scenario()
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .battlefield(CUB, { label: 'cub' })
      .library('Forest', lib)
      .seat(1)
      .hand(SPURT, { label: 's1' })
      .battlefield('Forest', 'Forest')
      .library('Forest', lib)
      .build();
    g.pass(0);
    g.act(1).cast('s1', { targets: ['cub'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('night');
  });

  const night = () =>
    scenario()
      .at('precombatMain', { active: 0, dayNight: 'night' })
      .seat(0)
      .hand(SPURT, { label: 's1' })
      .hand(SPURT, { label: 's2' })
      .battlefield(CUB, { label: 'cub', face: 1 })
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(PUP, { label: 'pup', face: 1 })
      .library('Forest', lib)
      .build();

  test('night and the active player cast two spells: day at the next untap step, and the nightbound permanents transform back', () => {
    const g = night();
    g.act(0).cast('s1', { targets: ['cub'], pay: true });
    g.passAll();
    g.act(0).cast('s2', { targets: ['cub'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('day');
    expect(g.object('cub').face).toBe(0);
    expect(g.object('pup').face).toBe(0);
    expect(g.events.filter((e) => e.kind === 'dayNightChanged')).toEqual([
      { kind: 'dayNightChanged', from: 'night', to: 'day' },
    ]);
  });

  test('night and the active player cast one spell: still night', () => {
    const g = night();
    g.act(0).cast('s1', { targets: ['cub'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('night');
    expect(g.object('cub').face).toBe(1);
  });

  test('night and no spell: still night, nothing changes', () => {
    const g = night();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.dayNight('night');
    expect(g.events.filter((e) => e.kind === 'dayNightChanged')).toEqual([]);
  });

  test('a day that follows a day: the count restarts each turn', () => {
    const g = day();
    g.act(0).cast('s1', { targets: ['cub'], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' }); // seat 0 cast one: day
    g.advanceTo('upkeep', { turn: 'next' }); // seat 1 cast none: night
    g.expect.dayNight('night');
  });
});

describe('entering at night, and transforming otherwise', () => {
  test('a daybound card that enters at night enters transformed (CR 702.145b, 712.14a)', () => {
    const g = scenario()
      .at('precombatMain', { active: 0, dayNight: 'night' })
      .seat(0)
      .hand(CUB)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library('Forest', lib)
      .build();
    g.act(0).cast(CUB, { pay: true });
    g.passAll();
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    expect(g.object(CUB).face).toBe(1);
    expect(g.object(CUB).transformedAt).toBeUndefined(); // it entered that way, it did not transform
    g.expect.dayNight('night');
    g.expect.invariants();
  });

  test('one that enters at day is front face up', () => {
    const g = scenario()
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .hand(CUB)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library('Forest', lib)
      .build();
    g.act(0).cast(CUB, { pay: true });
    g.passAll();
    expect(g.object(CUB).face).toBe(0);
  });

  test('a spell that transforms it does nothing: it can transform only because of its own daybound or nightbound (CR 702.145b, 702.145e)', () => {
    const g = scenario()
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .hand(TURN)
      .battlefield(CUB, { label: 'cub' })
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library('Forest', lib)
      .build();
    g.act(0).cast(TURN, { targets: ['cub'], pay: true });
    g.passAll();
    expect(g.object('cub').face).toBe(0);
    // Turned over by the spell and straight back by daybound, it would have a transform stamp (CR 712.18).
    expect(g.object('cub').transformedAt).toBeUndefined();
    g.expect.dayNight('day');
  });

  test('the transformed permanent is the same object: counters and damage stay (CR 712.18)', () => {
    const g = scenario()
      .at('precombatMain', { active: 0, dayNight: 'day' })
      .seat(0)
      .battlefield(CUB, { label: 'cub', counters: { '+1/+1': 1 }, tapped: true })
      .seat(1)
      .library('Forest', lib)
      .build();
    const id = g.id('cub');
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.id('cub')).toBe(id);
    expect(g.object('cub').counters['+1/+1']).toBe(1);
    g.expect.pt('cub', 5, 5);
  });
});

describe('the state is part of the game', () => {
  const play = () => {
    const g = scenario()
      .at('precombatMain', { active: 0 })
      .seat(0)
      .hand(CUB)
      .battlefield('Forest', 'Forest')
      .library('Forest', lib)
      .seat(1)
      .library('Forest', lib)
      .build();
    g.act(0).cast(CUB, { pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' }); // seat 0 cast one spell: still day
    g.advanceTo('upkeep', { turn: 'next' }); // seat 1 cast none: night
    return g;
  };

  test('the same actions give the same game, state hash included', () => {
    const a = play();
    const b = play();
    a.expect.dayNight('night');
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  test('it differs in the hash from the same position that is neither', () => {
    const a = play();
    const { dayNight: _gone, ...rest } = a.state;
    expect(stateHash(rest)).not.toBe(stateHash(a.state));
  });

  test('it survives serialization, and the game goes on from the loaded state', () => {
    const g = play();
    const loaded = JSON.parse(JSON.stringify(g.state)) as typeof g.state;
    expect(loaded.dayNight).toBe('night');
    expect(stateHash(loaded)).toBe(stateHash(g.state));
    const seat = g.deciding;
    const r = applyAction(loaded, seat, { kind: 'pass' });
    expect(r.ok).toBe(true);
  });
});

describe('where the keywords may stand (CR 702.145a, 702.145b, 702.145e)', () => {
  const messages = (def: CardDefinition): string[] => validateCard(def).map((i) => i.message);
  const cub = syntheticCard(CUB);

  test('the two faces of a transforming card validate clean', () => {
    expect(messages(cub)).toEqual([]);
  });

  test('Daybound on the back face, Nightbound on the front face and either on a single-faced card are refused', () => {
    const [front, back] = cub.faces;
    if (front === undefined || back === undefined) throw new Error('two faces');
    expect(messages({ ...cub, faces: [back, front] })).toHaveLength(2);
    const single: CardDefinition = { ...cub, layout: 'normal', faces: [front] };
    expect(messages(single).some((m) => m.includes('Daybound'))).toBe(true);
    const modal: CardDefinition = { ...cub, layout: 'modal_dfc' };
    expect(messages(modal)).toHaveLength(2);
  });
});
