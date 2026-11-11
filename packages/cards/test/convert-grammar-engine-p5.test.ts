// Parsed text is only worth something if the engine runs it as written (stage P5). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: Giant Growth then Turn to Frog reproducing SPEC test
// 17's 5/5 blue Frog with no abilities, keyword gains seen in combat, a flicker (SPEC test 3's new
// object), Prowess (SPEC test 20) and the pronoun "it". Every card name starts with "SYNTHETIC";
// the Oracle text is template text from the corpus backlog (reports/backlog.md) or marked
// SYNTHETIC where no real line has the shape. The texts of Giant Growth and Turn to Frog are from
// memory and UNVERIFIED against Scryfall, which is why the cards here are not named like them.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import type { ColorLetter } from '../src/index';
import { parsed } from './convert-grammar-helpers';

const instant = (name: string, text: string, manaCost: string, colors: ColorLetter[]) =>
  parsed(name, 'Instant', text, { manaCost, colors });
const creature = (name: string, text: string, manaCost = '{1}{G}', power = '2', toughness = '2') =>
  parsed(name, 'Creature — Bear', text, { manaCost, power, toughness, colors: ['G'] });

const BEARS = 'Grizzly Bears'; // 2/2
const BOLT = 'Lightning Bolt';

const GROWTH = instant(
  'SYNTHETIC Parsed Growth',
  'Target creature gets +3/+3 until end of turn.',
  '{G}',
  ['G'],
);
const FROG = instant(
  'SYNTHETIC Parsed Frog Hex',
  'Target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1 until end of turn.',
  '{1}{U}',
  ['U'],
);
/** 2/2 with flying, an attack trigger and a {T} ability: abilities of three kinds to lose. */
const BEAR = creature(
  'SYNTHETIC Parsed Layered Bear',
  'Flying\nWhenever ~ attacks, you gain 1 life.\n{T}: You gain 1 life.',
);

/** Seat 0 owns the bear (with a +1/+1 counter) and Giant Growth; seat 1 holds Turn to Frog. */
function layersBoard(extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario().define(GROWTH).define(FROG).define(BEAR);
  b.seat(0).hand(GROWTH.name).battlefield('Forest', 'Forest', 'Forest', 'Forest');
  b.battlefield(BEAR.name, { label: 'bear', counters: { '+1/+1': 1 } });
  b.library('Forest', 'Forest', 'Forest');
  b.seat(1).hand(FROG.name);
  b.battlefield('Island', 'Island', 'Island', 'Island');
  b.library('Forest', 'Forest', 'Forest');
  b.seat(0);
  extra?.(b);
  return b.build();
}

const castBy0 = (g: ScenarioGame, card: string, target: string) => {
  g.act(0).cast(card, { targets: [target], pay: true });
  g.passAll();
};
const castBy1 = (g: ScenarioGame, card: string, target: string) => {
  g.act(0).pass();
  g.act(1).cast(card, { targets: [target], pay: true });
  g.passAll();
};

describe('SPEC 17 through parsed text: a pump, then "loses all abilities and becomes a blue Frog" (CR 613)', () => {
  test('before any spell it is a 3/3 green Bear with flying', () => {
    const g = layersBoard();
    g.expect.pt('bear', 3, 3);
    g.expect.derived('bear', {
      types: ['creature'],
      subtypes: ['Bear'],
      colors: ['G'],
      keywords: ['flying'],
    });
  });

  test('the parsed spells are exactly the engine fixtures (what the engine tests of layers run)', () => {
    expect(GROWTH.faces[0]?.spell?.effect).toMatchObject({ kind: 'modifyPt', power: 3 });
    expect(FROG.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'loseAllAbilities' },
        { kind: 'setTypes', subtypes: ['Frog'] },
        { kind: 'setColors', colors: ['U'] },
        { kind: 'setPt', power: 1, toughness: 1 },
      ],
    });
  });

  test('Giant Growth, then Turn to Frog: a 5/5 blue Frog with no abilities (1/1 base, +1 counter, +3)', () => {
    const g = layersBoard();
    castBy0(g, GROWTH.name, 'bear');
    g.expect.pt('bear', 6, 6);
    castBy1(g, FROG.name, 'bear');
    g.expect.pt('bear', 5, 5);
    g.expect.derived('bear', {
      types: ['creature'],
      subtypes: ['Frog'],
      colors: ['U'],
      keywords: [],
    });
    expect(g.object('bear').counters).toEqual({ '+1/+1': 1 });
  });

  test('in the other order the result is the same (timestamps, CR 613.7)', () => {
    const g = layersBoard((b) => b.seat(1).hand(GROWTH.name));
    castBy1(g, FROG.name, 'bear');
    g.expect.pt('bear', 2, 2);
    g.act(0).cast(GROWTH.name, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.pt('bear', 5, 5);
  });

  test('it has no ability left to use: no {T} ability offered, no trigger when it attacks', () => {
    const g = layersBoard();
    castBy1(g, FROG.name, 'bear');
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
    g.advanceTo('declareAttackers');
    g.act(0).attack('bear');
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('at cleanup every effect ends: a 3/3 green flying Bear again', () => {
    const g = layersBoard();
    castBy0(g, GROWTH.name, 'bear');
    castBy1(g, FROG.name, 'bear');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 3, 3);
    g.expect.derived('bear', { colors: ['G'], subtypes: ['Bear'], keywords: ['flying'] });
  });

  test('"loses all abilities until end of turn" alone leaves the types and colors', () => {
    const hush = instant(
      'SYNTHETIC Parsed Hush',
      'Target creature loses all abilities until end of turn.',
      '{U}',
      ['U'],
    );
    const g = layersBoard((b) => b.define(hush).seat(1).hand(hush.name));
    castBy1(g, hush.name, 'bear');
    g.expect.derived('bear', { colors: ['G'], subtypes: ['Bear'], keywords: [] });
    g.expect.pt('bear', 3, 3);
  });

  test('"becomes a blue Frog" alone keeps the abilities and the power and toughness', () => {
    const turn = instant(
      'SYNTHETIC Parsed Hop',
      'Target creature becomes a blue Frog until end of turn.',
      '{U}',
      ['U'],
    );
    const g = layersBoard((b) => b.define(turn).seat(1).hand(turn.name));
    castBy1(g, turn.name, 'bear');
    g.expect.derived('bear', { colors: ['U'], subtypes: ['Frog'], keywords: ['flying'] });
    g.expect.pt('bear', 3, 3);
  });

  test('"has base power and toughness 4/4" sets the base: the counter still applies on top', () => {
    const embiggen = instant(
      'SYNTHETIC Parsed Embiggen',
      'Target creature has base power and toughness 4/4 until end of turn.',
      '{U}',
      ['U'],
    );
    const g = layersBoard((b) => b.define(embiggen).seat(1).hand(embiggen.name));
    castBy1(g, embiggen.name, 'bear');
    g.expect.pt('bear', 5, 5);
  });
});

describe('keyword gains are seen by the engine (CR 613.1f)', () => {
  const wings = instant(
    'SYNTHETIC Parsed Wings',
    'Target creature gains flying until end of turn.',
    '{U}',
    ['U'],
  );

  test('"gains flying": the attacker can be blocked only by flying or reach', () => {
    const g = scenario()
      .define(wings)
      .seat(0)
      .hand(wings.name)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'attacker' })
      .seat(1)
      .battlefield(BEARS, { label: 'blocker' })
      .build();
    g.act(0).cast(wings.name, { targets: ['attacker'], pay: true });
    g.passAll();
    g.expect.derived('attacker', { keywords: ['flying'] });
    g.advanceTo('declareAttackers');
    g.act(0).attack('attacker');
    g.advanceTo('declareBlockers');
    g.expect.illegal(1, { declareBlockers: [{ blocker: 'blocker', attacker: 'attacker' }] });
  });

  test('the control: without the spell the same creature can be blocked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { label: 'attacker' })
      .seat(1)
      .battlefield(BEARS, { label: 'blocker' })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('attacker');
    g.advanceTo('declareBlockers');
    g.expect.canBlock('blocker', 'attacker', true);
  });

  test('"gets +2/+2 and gains first strike": both change, and both end at cleanup', () => {
    const rush = instant(
      'SYNTHETIC Parsed Rush',
      'Target creature gets +2/+2 and gains first strike until end of turn.',
      '{R}',
      ['R'],
    );
    const g = scenario()
      .define(rush)
      .seat(0)
      .hand(rush.name)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'bear' })
      .seat(1)
      .build();
    g.act(0).cast(rush.name, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.pt('bear', 4, 4);
    g.expect.derived('bear', { keywords: ['firstStrike'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bear', 2, 2);
    g.expect.derived('bear', { keywords: [] });
  });

  test('two keywords are both granted: "gains flying and first strike"', () => {
    const both = instant(
      'SYNTHETIC Parsed Both',
      'Target creature gains flying and first strike until end of turn.',
      '{U}',
      ['U'],
    );
    const g = scenario()
      .define(both)
      .seat(0)
      .hand(both.name)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'bear' })
      .seat(1)
      .build();
    g.act(0).cast(both.name, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.derived('bear', { keywords: ['firstStrike', 'flying'] });
  });

  test('"Creatures you control gain trample": mine only, and only those there when it resolves', () => {
    const stampede = instant(
      'SYNTHETIC Parsed Stampede',
      'Creatures you control gain trample until end of turn.',
      '{G}',
      ['G'],
    );
    const g = scenario()
      .define(stampede)
      .seat(0)
      .hand(stampede.name, BEARS)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.act(0).cast(stampede.name, { pay: true });
    g.passAll();
    g.expect.derived('mine', { keywords: ['trample'] });
    g.expect.derived('theirs', { keywords: [] });
    // CR 611.2c: the set is fixed when the effect resolves; a creature cast afterwards has none.
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    const fresh = g
      .find({ name: BEARS, zone: 'battlefield' })
      .filter((o) => o.controller === 0 && o.id !== g.id('mine'));
    expect(fresh).toHaveLength(1);
    g.expect.derived(fresh[0]?.id ?? 'none', { keywords: [] });
  });

  test('"{1}: ~ gains flying until end of turn." is an activation on the stack, ended in cleanup', () => {
    const sprite = creature('SYNTHETIC Parsed Sprite', '{1}: ~ gains flying until end of turn.');
    const g = scenario().define(sprite).seat(0).battlefield(sprite.name, 'Forest').seat(1).build();
    g.expect.derived(sprite.name, { keywords: [] });
    g.act(0).activate(sprite.name, { pay: true });
    g.expect.stack([`${sprite.name} (ability)`]);
    g.expect.derived(sprite.name, { keywords: [] });
    g.passAll();
    g.expect.derived(sprite.name, { keywords: ['flying'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(sprite.name, { keywords: [] });
  });
});

describe('flicker: "Exile target creature you control, then return it ..." (CR 400.7, 400.7j)', () => {
  const CHANGES = 'SYNTHETIC Parsed Enters Drawer';
  const drawer = () => creature(CHANGES, 'When ~ enters, draw a card.');
  const blink = instant(
    'SYNTHETIC Parsed Blink',
    "Exile target creature you control, then return it to the battlefield under its owner's control.",
    '{U}',
    ['U'],
  );

  test('the creature comes back as a new object with no counters or damage, and its enters trigger again', () => {
    const card = drawer();
    const g = scenario()
      .define(blink)
      .define(card)
      .seat(0)
      .hand(blink.name)
      .battlefield('Island')
      .battlefield(card.name, { label: 'creature', counters: { '+1/+1': 2 }, damage: 1 })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    const first = g.id('creature');
    g.act(0).cast(blink.name, { targets: ['creature'], pay: true });
    g.expect.handSize(0, 0);
    g.passAll();
    expect(g.id('creature')).not.toBe(first);
    g.expect.counters('creature', {});
    g.expect.damage('creature', 0);
    g.expect.zone(card.name, 'battlefield', { seat: 0 });
    // CR 603.6a: the new object entered, so "when ~ enters, draw a card" triggered again.
    g.expect.handSize(0, 1);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(card.name, false); // CR 302.6: summoning sick
  });

  test('exile and return are two zone changes, and the return finds the exiled object', () => {
    const g = scenario()
      .define(blink)
      .seat(0)
      .hand(blink.name)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .build();
    g.act(0).cast(blink.name, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.eventLog([
      { kind: 'zoneChanged', cardName: BEARS, fromZone: 'battlefield', toZone: 'exile' },
      { kind: 'zoneChanged', cardName: BEARS, fromZone: 'exile', toZone: 'battlefield' },
    ]);
  });

  test('"under your control" gives you the creature of the target\'s owner', () => {
    const steal = instant(
      'SYNTHETIC Parsed Flicker Steal',
      'Exile target creature, then return it to the battlefield under your control.',
      '{1}{U}',
      ['U'],
    );
    const g = scenario()
      .define(steal)
      .seat(0)
      .hand(steal.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.act(0).cast(steal.name, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'battlefield', seat: 1 });
  });

  test('"under its owner\'s control" gives a stolen creature back to its owner', () => {
    const give = instant(
      'SYNTHETIC Parsed Flicker Return',
      "Exile target creature, then return it to the battlefield under its owner's control.",
      '{1}{U}',
      ['U'],
    );
    const g = scenario()
      .define(give)
      .seat(0)
      .hand(give.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield(BEARS, { label: 'borrowed', controller: 0 })
      .build();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.act(0).cast(give.name, { targets: ['borrowed'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('the "that card" wording (backlog: Cloudshift) is the same flicker', () => {
    const shift = instant(
      'SYNTHETIC Parsed Shift',
      'Exile target creature you control, then return that card to the battlefield under your control.',
      '{W}',
      ['W'],
    );
    const card = drawer();
    const g = scenario()
      .define(shift)
      .define(card)
      .seat(0)
      .hand(shift.name)
      .battlefield('Plains')
      .battlefield(card.name, { label: 'creature' })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(shift.name, { targets: ['creature'], pay: true });
    g.passAll();
    g.expect.zone(card.name, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 1);
  });

  test('a token does not come back (CR 111.8)', () => {
    const tokenMaker = creature(
      'SYNTHETIC Parsed Token Maker',
      'When ~ enters, create a Treasure token.',
    );
    const g = scenario()
      .define(blink)
      .define(tokenMaker)
      .seat(0)
      .hand(blink.name)
      .battlefield('Island')
      .battlefield(tokenMaker.name, { label: 'maker' })
      .seat(1)
      .build();
    g.act(0).cast(blink.name, { targets: ['maker'], pay: true });
    g.passAll();
    g.expect.zone(tokenMaker.name, 'battlefield', { seat: 0 });
  });
});

describe('Prowess through parsed text (SPEC 20, CR 702.108a)', () => {
  const monk = creature(
    'SYNTHETIC Parsed Prowess Monk',
    'Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
    '{W}',
  );

  const board = () =>
    scenario()
      .define(monk)
      .seat(0)
      .hand(BOLT, BEARS)
      .battlefield('Mountain', 'Mountain', 'Forest', 'Forest')
      .battlefield(monk.name)
      .seat(1)
      .build();

  test('a noncreature spell makes it a 3/3 until end of turn, before the spell resolves', () => {
    const g = board();
    g.expect.pt(monk.name, 2, 2);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${monk.name} (ability)`, BOLT]);
    g.passAll();
    g.expect.pt(monk.name, 3, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(monk.name, 2, 2);
  });

  test('a creature spell does not trigger it', () => {
    const g = board();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.pt(monk.name, 2, 2);
  });

  test('"Prowess, prowess" is two triggers (CR 702.108b)', () => {
    const twin = creature('SYNTHETIC Parsed Twin Monk', 'Prowess, prowess', '{1}{W}');
    const g = scenario()
      .define(twin)
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(twin.name)
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pt(twin.name, 4, 4);
  });
});

describe('the pronoun "it" in a trigger about ~ is ~ (D-082 follow-up)', () => {
  test('"When ~ enters, put two +1/+1 counters on it." enters with two counters', () => {
    const hydra = creature(
      'SYNTHETIC Parsed Grower',
      'When ~ enters, put two +1/+1 counters on it.',
      '{G}',
      '1',
      '1',
    );
    const g = scenario()
      .define(hydra)
      .seat(0)
      .hand(hydra.name)
      .battlefield('Forest')
      .seat(1)
      .build();
    g.act(0).cast(hydra.name, { pay: true });
    g.passAll();
    g.expect.counters(hydra.name, { '+1/+1': 2 });
    g.expect.pt(hydra.name, 3, 3);
  });

  test('"Whenever ~ attacks, it gets +1/+0 until end of turn." pumps the attacker, not others', () => {
    const rager = creature(
      'SYNTHETIC Parsed Rager',
      'Whenever ~ attacks, it gets +1/+0 until end of turn.',
      '{1}{R}',
    );
    const g = scenario()
      .define(rager)
      .seat(0)
      .battlefield(rager.name)
      .battlefield(BEARS, { label: 'other' })
      .seat(1)
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(rager.name);
    g.passAll();
    g.expect.pt(rager.name, 3, 2);
    g.expect.pt('other', 2, 2);
  });

  test('"Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn."', () => {
    const veil = instant(
      'SYNTHETIC Parsed Veil',
      'Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.',
      '{G}',
      ['G'],
    );
    const g = scenario()
      .define(veil)
      .seat(0)
      .hand(veil.name)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'bear' })
      .seat(1)
      .build();
    g.act(0).cast(veil.name, { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.counters('bear', { '+1/+1': 1 });
    g.expect.derived('bear', { keywords: ['hexproof'] });
  });
});

describe('the dash forms with a period', () => {
  test('"Cycling—Pay 2 life." cycles for 2 life (CR 702.29a)', () => {
    const wraith = creature('SYNTHETIC Parsed Wraith', 'Cycling—Pay 2 life.', '{3}{B}');
    const g = scenario()
      .define(wraith)
      .seat(0)
      .hand(wraith.name)
      .library('Island', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(wraith.name);
    g.expect.life(0, 38);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('"Equip—Pay 2 life." equips for 2 life (CR 702.6a)', () => {
    const blade = parsed(
      'SYNTHETIC Parsed Blood Blade',
      'Artifact — Equipment',
      'Equipped creature gets +3/+0.\nEquip—Pay 2 life.',
      { manaCost: '{1}' },
    );
    const g = scenario()
      .define(blade)
      .seat(0)
      .life(20)
      .battlefield(blade.name, BEARS)
      .seat(1)
      .build();
    g.act(0).activate(blade.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.pt(BEARS, 5, 2);
  });
});
