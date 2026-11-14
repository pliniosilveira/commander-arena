// Copy effects (CR 707, 613.2a, 111.4): a token that is a copy of a permanent, and a permanent that
// becomes a copy of another.
// Pins: CR 707.2 (Copying Objects): a copy acquires the copiable values of the original (printed
// characteristics as modified by copy effects) and nothing else: not counters, damage, tapped
// status, "until end of turn" pumps or keyword grants, "becomes a Frog" effects; CR 111.4: a token
// that's a copy has the original's name; CR 707.5: it enters with the replacement effects of the
// copied text ("enters tapped", "enters with counters") and its enters abilities can trigger;
// CR 707.2a: abilities are copied with the text, so a copy of a ward creature has ward; CR 707.3:
// a copy of a copy has the first copy's values; CR 613.1, 613.2a: layer 1 applies first, so a pump
// or "loses all abilities" effect created before a copy effect still applies after it (CR 613.7
// timestamps order only within a layer); CR 608.2h: a copy of a creature that has left is made from
// its last-known information; CR 707.2b: the values a "becomes a copy" effect gives are fixed when
// it resolves; CR 514.2: it ends at the cleanup step.
// Cards (SYNTHETIC, defined in this file unless noted): "SYNTHETIC Mirror Image" (token copy of
// target creature), "SYNTHETIC Shapeshift" (becomes a copy until end of turn), "SYNTHETIC Phoenix
// Rite" (whenever a creature you control dies, a token copy of it), "SYNTHETIC Attack Mirror"
// (whenever a creature you control attacks, a token copy of it), "SYNTHETIC Cloner" ({1}: a token
// copy of this creature), "SYNTHETIC Sluggish Bear" (enters tapped with a +1/+1 counter), a ward
// bear and the real Grizzly Bears; fixture cards Growth Spurt, Gust of Wings and Frog Hex.
import { describe, expect, test } from 'vitest';
import type { GameObject } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BEARS = 'Grizzly Bears';
const MIRROR = 'SYNTHETIC Mirror Image';
const SHIFT = 'SYNTHETIC Shapeshift';
const KNIGHT = 'SYNTHETIC Legendary Knight';
const WARD = 'SYNTHETIC Ward Bear';
const SLUGGISH = 'SYNTHETIC Sluggish Bear';
const CLONER = 'SYNTHETIC Cloner';

const CREATURE = { zone: 'battlefield', types: ['creature'] } as const;
const THIS = { kind: 'this' } as const;

const mirror = singleFaceCard({
  name: MIRROR,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Create a token that's a copy of target creature.",
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE } }],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});
const shapeshift = singleFaceCard({
  name: SHIFT,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target creature becomes a copy of another target creature until end of turn.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: CREATURE } },
      { id: 't2', what: { kind: 'object', filter: CREATURE } },
    ],
    effect: {
      kind: 'becomeCopy',
      objects: { kind: 'target', id: 't1' },
      of: { kind: 'target', id: 't2' },
      duration: 'untilEndOfTurn',
    },
  },
});
const knight = singleFaceCard({
  name: KNIGHT,
  manaCost: ['2', 'W'],
  supertypes: ['legendary'],
  types: ['creature'],
  subtypes: ['Knight'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 3,
  toughness: 3,
  oracleText: 'When this creature dies, you gain 2 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: THIS },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
    },
  ],
});
const wardBear = singleFaceCard({
  name: WARD,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Ward {2}',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] } },
  ],
});
const sluggish = singleFaceCard({
  name: SLUGGISH,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'This creature enters tapped. This creature enters with a +1/+1 counter on it.',
  abilities: [
    { kind: 'replacement', replacement: { kind: 'entersTapped' } },
    {
      kind: 'replacement',
      replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 1 },
    },
  ],
});
const phoenixRite = singleFaceCard({
  name: 'SYNTHETIC Phoenix Rite',
  manaCost: ['2', 'R'],
  types: ['enchantment'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: "Whenever a creature you control dies, create a token that's a copy of it.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], controller: 'you' } },
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'triggerSubject' } },
        count: 1,
      },
    },
  ],
});
const attackMirror = singleFaceCard({
  name: 'SYNTHETIC Attack Mirror',
  manaCost: ['2', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Whenever a creature you control attacks, create a token that's a copy of it.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { types: ['creature'], controller: 'you' } },
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'triggerSubject' } },
        count: 1,
      },
    },
  ],
});
const cloner = singleFaceCard({
  name: CLONER,
  manaCost: ['1', 'U'],
  types: ['creature'],
  subtypes: ['Shapeshifter'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText: "{1}: Create a token that's a copy of this creature.",
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      effect: { kind: 'createToken', token: { kind: 'copyOf', object: THIS }, count: 1 },
    },
  ],
});

type Builder = ReturnType<typeof scenario>;
const defined = (b: Builder) =>
  [mirror, shapeshift, knight, wardBear, sluggish, phoenixRite, attackMirror, cloner].reduce(
    (acc, card) => acc.define(card),
    b,
  );

const tokensNamed = (g: ScenarioGame, name: string): GameObject[] =>
  g.find({ name, zone: 'battlefield' }).filter((o) => o.token !== null);

function cast(g: ScenarioGame, spell: string, targets: string[]) {
  g.act(0).cast(spell, { targets, pay: true });
  g.passAll();
}

/** Seat 0 with Mirror Image in hand and mana for several spells. */
function board(extra: (b: Builder) => Builder = (b) => b) {
  return extra(
    defined(
      scenario()
        .seat(0)
        .hand(MIRROR, { label: 'mirror' })
        .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Forest', 'Forest')
        .seat(1),
    ),
  ).build();
}

describe('a token that is a copy of a permanent (CR 707.2, 111.4)', () => {
  test("it has the original's name, types, subtypes, power and toughness, and is a token of the caster", () => {
    const g = board((b) => b.seat(1).battlefield(BEARS, { label: 'bears' }));
    cast(g, 'mirror', ['bears']);
    const [token] = tokensNamed(g, BEARS);
    expect(token).toBeDefined();
    const t = token as GameObject;
    expect(t.card).toBeNull();
    expect(t.controller).toBe(0);
    expect(t.owner).toBe(0);
    g.expect.derived(t.id, { types: ['creature'], subtypes: ['Bear'], colors: ['G'] });
    g.expect.pt(t.id, 2, 2);
    g.expect.eventLog([{ kind: 'tokenCreated', seat: 0, name: BEARS }]);
    // The original is untouched and still seat 1's.
    expect(g.object('bears').controller).toBe(1);
    expect(g.view(0).battlefield.find((o) => o.id === t.id)?.isToken).toBe(true);
  });

  test('counters, damage, tapped status, pumps and granted keywords are not copied (CR 707.2)', () => {
    const g = board((b) =>
      b
        .seat(0)
        .hand('SYNTHETIC Growth Spurt')
        .hand('SYNTHETIC Gust of Wings')
        .seat(1)
        .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 2 }, damage: 1, tapped: true }),
    );
    cast(g, 'SYNTHETIC Growth Spurt', ['bears']);
    cast(g, 'SYNTHETIC Gust of Wings', ['bears']);
    g.expect.pt('bears', 7, 7);
    g.expect.derived('bears', { keywords: ['flying'] });
    cast(g, 'mirror', ['bears']);
    const t = tokensNamed(g, BEARS)[0] as GameObject;
    g.expect.pt(t.id, 2, 2);
    g.expect.derived(t.id, { keywords: [] });
    g.expect.counters(t.id, {});
    g.expect.damage(t.id, 0);
    g.expect.tapped(t.id, false);
  });

  test('a copy of a creature that became a blue Frog is the printed creature, not the Frog (CR 707.2)', () => {
    const g = board((b) =>
      b.seat(0).hand('SYNTHETIC Frog Hex').seat(1).battlefield(BEARS, { label: 'bears' }),
    );
    cast(g, 'SYNTHETIC Frog Hex', ['bears']);
    g.expect.derived('bears', { colors: ['U'], subtypes: ['Frog'] });
    cast(g, 'mirror', ['bears']);
    const t = tokensNamed(g, BEARS)[0] as GameObject;
    g.expect.derived(t.id, { colors: ['G'], subtypes: ['Bear'] });
    g.expect.pt(t.id, 2, 2);
  });

  test('a copy of a token is a copy of that token, and of its copy effects (CR 707.3)', () => {
    const g = board((b) => b.seat(1).battlefield(BEARS, { label: 'bears' }).seat(0).hand(MIRROR));
    cast(g, 'mirror', ['bears']);
    const first = tokensNamed(g, BEARS)[0] as GameObject;
    g.act(0).cast({ name: MIRROR, zone: 'hand' }, { targets: [first.id], pay: true });
    g.passAll();
    expect(tokensNamed(g, BEARS)).toHaveLength(2);
    for (const t of tokensNamed(g, BEARS)) g.expect.pt(t.id, 2, 2);
  });

  test('abilities are copied with the text: a copy of a ward creature has ward (CR 707.2a)', () => {
    const g = board((b) => b.seat(0).battlefield(WARD, { label: 'ward' }));
    cast(g, 'mirror', ['ward']);
    const t = tokensNamed(g, WARD)[0] as GameObject;
    g.expect.derived(t.id, { keywords: ['ward'] });
    expect(derive(g.state, t).abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });

  test('it enters with the copied replacement effects: tapped, with its own counter (CR 707.5)', () => {
    const g = board((b) =>
      b
        .seat(1)
        .battlefield(SLUGGISH, { label: 'sluggish', counters: { '+1/+1': 3 }, tapped: false }),
    );
    cast(g, 'mirror', ['sluggish']);
    const t = tokensNamed(g, SLUGGISH)[0] as GameObject;
    g.expect.tapped(t.id, true);
    // One counter from "enters with", not the original's three.
    g.expect.counters(t.id, { '+1/+1': 1 });
    g.expect.pt(t.id, 3, 3);
  });

  test('"a copy of this creature" from an activated ability copies the source, abilities included', () => {
    const g = defined(scenario().seat(0).battlefield(CLONER, 'Island', 'Island').seat(1)).build();
    const original = g.object(CLONER);
    g.act(0).activate(CLONER, { pay: true });
    g.passAll();
    const t = tokensNamed(g, CLONER)[0] as GameObject;
    expect(t.id).not.toBe(original.id);
    expect(derive(g.state, t).abilities.map((a) => a.kind)).toEqual(['activated']);
    g.expect.pt(t.id, 1, 1);
  });
});

describe("a copy of a trigger's permanent (triggerSubject)", () => {
  test('"whenever a creature you control dies, a token copy of it": made from last-known information', () => {
    const g = defined(
      scenario()
        .seat(0)
        .hand('Lightning Bolt')
        .battlefield('Mountain', 'SYNTHETIC Phoenix Rite', BEARS)
        .seat(1),
    ).build();
    g.act(0).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    // The Bears died and left a token copy of itself, named like the card.
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    expect(tokensNamed(g, BEARS)).toHaveLength(1);
    g.expect.pt((tokensNamed(g, BEARS)[0] as GameObject).id, 2, 2);
  });

  test('"whenever a creature you control attacks, a token copy of it": the copy is not attacking', () => {
    const g = defined(
      scenario().seat(0).battlefield('SYNTHETIC Attack Mirror', BEARS).seat(1),
    ).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS);
    g.passAll();
    expect(tokensNamed(g, BEARS)).toHaveLength(1);
    const token = tokensNamed(g, BEARS)[0] as GameObject;
    expect(g.state.combat?.attackers.map((a) => a.object)).not.toContain(token.id);
  });
});

/** Bears, a Cloner and a ward bear of seat 0, and two Shapeshifts in hand. */
function twoShifts() {
  return defined(
    scenario()
      .seat(0)
      .hand(SHIFT, { label: 'shift1' })
      .hand(SHIFT, { label: 'shift2' })
      .battlefield('Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(CLONER, { label: 'cloner' })
      .battlefield(WARD, { label: 'ward' })
      .seat(1),
  ).build();
}

describe('becomes a copy (CR 707.2, 613.2a)', () => {
  const shifted = (extra: (b: Builder) => Builder = (b) => b) =>
    extra(
      defined(
        scenario()
          .seat(0)
          .hand(SHIFT)
          .battlefield('Island', 'Island', 'Island', 'Island')
          .battlefield(BEARS, { label: 'bears' })
          .battlefield(KNIGHT, { label: 'knight' })
          .seat(1),
      ),
    ).build();

  test('the creature has the copiable values of the other: name, supertype, types, P/T, abilities', () => {
    const g = shifted();
    // Keep the Knight: the Bears (now a second Knight) is the one to answer for.
    g.act(0).cast(SHIFT, { targets: ['bears', 'knight'], pay: true });
    g.passAll();
    const bears = g.object('bears');
    const d = derive(g.state, bears);
    expect(d.name).toBe(KNIGHT);
    expect(d.supertypes).toEqual(['legendary']);
    expect(d.subtypes).toEqual(['Knight']);
    expect(d.colors).toEqual(['W']);
    expect([d.power, d.toughness]).toEqual([3, 3]);
    expect(d.abilities.map((a) => a.kind)).toEqual(['triggered']);
    g.expect.pending('choosePermanent', 0);
  });

  test('counters stay on it, and the copy dies as the Knight it was: the dies ability triggers (CR 603.10a)', () => {
    const g = defined(
      scenario()
        .seat(0)
        .hand(SHIFT)
        .battlefield('Island', 'Island')
        .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 } })
        .battlefield(KNIGHT, { label: 'knight' })
        .seat(1),
    ).build();
    g.act(0).cast(SHIFT, { targets: ['bears', 'knight'], pay: true });
    g.passAll();
    // The Knight's 3/3 with the Bears' own counter on top (CR 707.2: counters are not copied, and
    // they do not go away).
    g.expect.pt('bears', 4, 4);
    // Legend rule: keep the original Knight; the shifted Bears goes to the graveyard as itself.
    g.act(0).choosePermanents('knight');
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    // The scenario names a stack object after its card; the player is shown the Knight's ability.
    g.expect.stack([`${BEARS} (ability)`]);
    const top = g.view(0).stack[0];
    expect(top?.name).toBe(KNIGHT);
    expect(top?.oracleText).toBe('When this creature dies, you gain 2 life.');
    g.passAll();
    g.expect.life(0, 42);
  });

  test('a +1/+1 counter and a pump created before the copy still apply on top of it (CR 613.1)', () => {
    const g = shifted((b) =>
      b.seat(0).hand('SYNTHETIC Growth Spurt').battlefield('Forest').seat(1),
    );
    g.act(0).cast('SYNTHETIC Growth Spurt', { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pt('bears', 5, 5);
    g.act(0).cast(SHIFT, { targets: ['bears', 'knight'], pay: true });
    g.passAll();
    // The copy effect is newer, but layer 1 applies first: 3/3 from the Knight, +3/+3 on top.
    g.expect.pt('bears', 6, 6);
  });

  test('"loses all abilities" from before the copy still removes the abilities it copied (layer 6 after layer 1)', () => {
    const g = shifted((b) => b.seat(0).hand('SYNTHETIC Frog Hex').battlefield('Plains').seat(1));
    g.act(0).cast('SYNTHETIC Frog Hex', { targets: ['bears'], pay: true });
    g.passAll();
    g.act(0).cast(SHIFT, { targets: ['bears', 'knight'], pay: true });
    g.passAll();
    const d = derive(g.state, g.object('bears'));
    expect(d.abilities).toHaveLength(0);
    // The Frog Hex's base 1/1 (layer 7b) also still applies after the Knight's 3/3.
    expect([d.power, d.toughness]).toEqual([1, 1]);
  });

  test('it ends at the cleanup step: the creature is the Bears again (CR 514.2)', () => {
    const g = twoShifts();
    g.act(0).cast('shift1', { targets: ['bears', 'cloner'], pay: true });
    g.passAll();
    expect(derive(g.state, g.object('bears')).name).toBe(CLONER);
    g.expect.pt('bears', 1, 1);
    g.advanceTo('upkeep', { turn: 4 });
    expect(derive(g.state, g.object('bears')).name).toBe(BEARS);
    g.expect.pt('bears', 2, 2);
    expect(g.state.continuousEffects).toHaveLength(0);
  });

  test('the values are fixed when it resolves: later changes of the original do not reach it (CR 707.2b)', () => {
    const g = twoShifts();
    g.act(0).cast('shift1', { targets: ['bears', 'cloner'], pay: true });
    g.passAll();
    // Now the original Cloner becomes a copy of the ward bear.
    g.act(0).cast('shift2', { targets: ['cloner', 'ward'], pay: true });
    g.passAll();
    expect(derive(g.state, g.object('cloner')).name).toBe(WARD);
    // The Bears copied the Cloner as it was: still a Cloner, with the Cloner's ability.
    const bears = derive(g.state, g.object('bears'));
    expect(bears.name).toBe(CLONER);
    expect(bears.abilities.map((a) => a.kind)).toEqual(['activated']);
  });

  test('a copy of a creature that is itself a copy has the values of the first copy (CR 707.3)', () => {
    const g = twoShifts();
    g.act(0).cast('shift1', { targets: ['bears', 'ward'], pay: true });
    g.passAll();
    g.act(0).cast('shift2', { targets: ['cloner', 'bears'], pay: true });
    g.passAll();
    const d = derive(g.state, g.object('cloner'));
    expect(d.name).toBe(WARD);
    expect(d.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });
});
