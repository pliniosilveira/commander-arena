// Copying a spell (CR 707.10, 707.10a, 707.10c, 707.10f, 704.5e, D-129): "Copy target instant or sorcery spell. You may
// choose new targets for the copy.", "Whenever you cast an instant or sorcery spell, copy that spell." and the activated
// form. Pins: CR 707.10 (a copy is a spell that is not cast, with the characteristics and every decision made for the
// original: modes, targets, X, kicker; it is controlled by the player who put it on the stack), 707.10a and 704.5e (a copy
// that leaves the stack ceases to exist), 707.10c (new targets: any number may stay, even illegal ones; new ones must be
// legal), 608.2b (a copy with an illegal target does what it can), 603.2 and 601.2i (a copy is not cast, so no cast
// trigger sees it), 608.2h and 113.7a (a spell that left the stack is copied from last-known information).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-copies.ts, synthetic-kicker.ts, synthetic-x.ts, synthetic-modal.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants, type GameObject, getLegalActions, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { targetsDecision } from './pending-helpers';

const TWIN = 'SYNTHETIC Twin Spell'; // {U}{U} instant: copy target instant or sorcery spell, new targets
const EXACT = 'SYNTHETIC Exact Twin'; // {U} instant: copy target instant or sorcery spell, same targets
const TWIN_DRAW = 'SYNTHETIC Twin Then Draw'; // {1}{U}: copy it, then draw a card
const CHAMBER = 'SYNTHETIC Echo Chamber'; // {2} artifact: whenever you cast an instant or sorcery, copy that spell
const MIRROR = 'SYNTHETIC Echo Mirror'; // {2}{R} enchantment: the same, may choose new targets
const ENGINE = 'SYNTHETIC Mirror Engine'; // {1} artifact: {2},{T}: copy target instant or sorcery you control
const BOLT = 'SYNTHETIC Copy Bolt'; // {R} instant: 2 damage to any target
const SPLIT = 'SYNTHETIC Split Bolt'; // {1}{R} sorcery: 1 to target creature, 1 to any other target, draw a card
const KICKER_BOLT = 'SYNTHETIC Kicker Bolt'; // {1}{R} sorcery, kicker {2}: 2 (4 kicked) damage to target creature
const X_BURN = 'SYNTHETIC X Burn'; // {X}{R} instant: X damage to any target
const CHARM = 'SYNTHETIC Three Way Charm'; // {1}{R} instant: choose one: 3 damage to a creature / draw / gain 3
const PROWESS = 'SYNTHETIC Prowess Adept'; // {1}{W} 2/2 prowess
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4
const COUNTERSPELL = 'Counterspell';
const LIGHTNING = 'Lightning Bolt';

const WARD = 'SYNTHETIC Copy Ward Bear'; // 2/2, ward {2} (CR 702.21a)
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

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 3, with libraries that do not run out. */
function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(scenario().seat(0).life(20))
    .seat(0)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .build();
}

/** The spells on the stack that are copies, top first. */
const copies = (g: ScenarioGame): GameObject[] =>
  [...g.state.stack]
    .reverse()
    .map((id) => g.state.objects[id])
    .filter((o): o is GameObject => o?.copyOf !== undefined);

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

/** Casts BOLT at the opponent with the answer to the targets question, leaving it on the stack. */
const castBolt = (g: ScenarioGame, seat = 0, at: { player: number } = { player: 1 }) =>
  g.act(seat).cast(BOLT, { targets: [at], pay: true });

describe('a copy of a spell on the stack (CR 707.10)', () => {
  test('puts a copy on the stack above the original, controlled by the copier, with the same targets', () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT, TWIN).battlefield('Mountain').battlefield('Island', { count: 2 }),
    );
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.expect.stack([TWIN, BOLT]);
    resolveTop(g);
    // The question comes with the copy already on the stack (CR 707.10c).
    g.expect.pending('targets', 0);
    const [copy] = copies(g);
    expect(copy).toBeDefined();
    expect(copy?.card).toBeNull();
    expect(copy?.token).toBeNull();
    expect(copy?.controller).toBe(0);
    expect(copy?.owner).toBe(0);
    expect(copy?.stack?.chosenTargets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT, BOLT]);
    g.expect.invariants();
  });

  test('the copy is not cast: no spellCast event, not counted, and it leaves the cast triggers alone', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT, EXACT)
        .battlefield(PROWESS)
        .battlefield('Mountain')
        .battlefield('Island'),
    );
    castBolt(g);
    g.act(0).cast(EXACT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    const mark = g.mark();
    resolveTop(g); // the prowess trigger of the copier
    resolveTop(g); // the copier
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'spellCast')).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    g.passAll();
    g.passAll();
    g.passAll();
    // Two spells were cast (the bolt and the copier); prowess triggered for those two and for nothing else.
    g.expect.pt(PROWESS, 4, 4);
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(2);
    g.expect.invariants();
  });

  test('the event names the original and the copy, and the copy is marked in every view', () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT, EXACT).battlefield('Mountain').battlefield('Island'),
    );
    castBolt(g);
    g.act(0).cast(EXACT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    const mark = g.mark();
    resolveTop(g);
    const original = g.find({ name: BOLT, zone: 'stack' }).find((o) => o.copyOf === undefined);
    const [copy] = copies(g);
    expect(g.eventsSince(mark)).toContainEqual({
      kind: 'spellCopied',
      seat: 0,
      original: original?.id,
      copy: copy?.id,
    });
    for (const viewer of [0, 1]) {
      const view = getView(g.state, viewer);
      const [top, below] = [...view.stack].reverse();
      expect(top).toMatchObject({ name: BOLT, copy: true, controller: 0, types: ['instant'] });
      expect(top?.targets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
      expect(top?.oracleText).toBe('This spell deals 2 damage to any target.');
      expect(below?.copy).toBeUndefined();
    }
  });

  test('both resolve, the copy first; the copy then ceases to exist and only the card goes to the graveyard', () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT, EXACT).battlefield('Mountain').battlefield('Island'),
    );
    castBolt(g);
    g.act(0).cast(EXACT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // the copier
    g.expect.stack([BOLT, BOLT]);
    resolveTop(g); // the copy
    g.expect.life(1, 18);
    g.expect.stack([BOLT]);
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
    expect(g.find({ name: BOLT })).toHaveLength(1);
    resolveTop(g); // the original
    g.expect.life(1, 16);
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(1);
    expect(g.find({ name: BOLT })).toHaveLength(1);
    expect(Object.values(g.state.objects).filter((o) => o.copyOf !== undefined)).toHaveLength(0);
    g.expect.invariants();
  });

  test('a copy that is countered ceases to exist: it goes to no graveyard', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT, EXACT)
        .battlefield('Mountain')
        .battlefield('Island')
        .seat(1)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 }),
    );
    castBolt(g);
    g.act(0).cast(EXACT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.stack([BOLT, BOLT]);
    // The opponent counters the copy (it is a spell, CR 707.10).
    g.pass(0);
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack', nth: 1 }], pay: true });
    const [copy] = copies(g);
    expect(copy).toBeDefined();
    const mark = g.mark();
    resolveTop(g);
    expect(g.state.objects[copy?.id ?? ('o0' as never)]).toBeUndefined();
    // It ceased to exist where it was: it went to no zone (nothing moved, nothing triggers on it).
    expect(
      g.eventsSince(mark).filter((e) => e.kind === 'zoneChanged' && e.from === copy?.id),
    ).toHaveLength(0);
    expect(g.eventsSince(mark)).toContainEqual({ kind: 'countered', object: copy?.id });
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
    g.expect.noObject(BOLT, { zone: 'exile' });
    g.expect.stack([BOLT]);
    resolveTop(g);
    g.expect.life(1, 18);
    g.expect.invariants();
  });

  test('a spell with no targets is copied without a question', () => {
    const g = game((b) =>
      b.seat(0).hand(CHARM, EXACT).battlefield('Mountain', { count: 2 }).battlefield('Island'),
    );
    g.act(0).cast(CHARM, { modes: [2], pay: true });
    g.act(0).cast(EXACT, { targets: [{ name: CHARM, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.stack([CHARM, CHARM]);
    expect(copies(g)[0]?.stack?.chosenModes).toEqual([2]);
    resolveTop(g);
    resolveTop(g);
    g.expect.life(0, 26);
  });
});

describe('what a copy copies (CR 707.10, 707.2)', () => {
  test('a copy of an X spell has the same X', () => {
    const g = game((b) =>
      b.seat(0).hand(X_BURN, EXACT).battlefield('Mountain', { count: 5 }).battlefield('Island'),
    );
    g.act(0).cast(X_BURN, { x: 3, targets: [{ player: 1 }], pay: true });
    g.act(0).cast(EXACT, { targets: [{ name: X_BURN, zone: 'stack' }], pay: true });
    resolveTop(g);
    expect(copies(g)[0]?.stack?.x).toBe(3);
    expect(getView(g.state, 1).stack.at(-1)?.x).toBe(3);
    resolveTop(g);
    g.expect.life(1, 17);
    resolveTop(g);
    g.expect.life(1, 14);
  });

  test('a copy of a kicked spell is kicked', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(KICKER_BOLT, EXACT)
        .battlefield('Mountain', { count: 4 })
        .battlefield('Island')
        .seat(1)
        .battlefield(SPIDER),
    );
    g.act(0).cast(KICKER_BOLT, { kicked: true, targets: [SPIDER], pay: true });
    g.act(0).cast(EXACT, { targets: [{ name: KICKER_BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    const [copy] = copies(g);
    expect(copy?.stack?.kicked).toBe(true);
    expect(getView(g.state, 0).stack.at(-1)?.kicked).toBe(true);
    resolveTop(g);
    // The copy dealt 4 damage (kicked), which kills the 2/4 Spider; the original then has no target.
    g.expect.noObject(SPIDER, { zone: 'battlefield' });
  });

  test('a copy of a modal spell has the same modes and the targets of those modes', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(CHARM, TWIN)
        .battlefield('Mountain', { count: 2 })
        .battlefield('Island', { count: 2 })
        .seat(1)
        .battlefield(SPIDER)
        .battlefield(BEARS),
    );
    g.act(0).cast(CHARM, { modes: [0], targets: [SPIDER], pay: true });
    g.act(0).cast(TWIN, { targets: [{ name: CHARM, zone: 'stack' }], pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.specs.map((s) => s.specId)).toEqual(['kill']);
    expect(d.specs[0]?.mode).toBe(0);
    const [copy] = copies(g);
    expect(copy?.stack?.chosenModes).toEqual([0]);
    // The Bears are a new legal target for the copy.
    g.act(0).chooseTargets(BEARS);
    expect(getView(g.state, 0).stack.at(-1)?.modes).toEqual([0]);
    resolveTop(g);
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    resolveTop(g);
    g.expect.damage(SPIDER, 3);
  });
});

describe('new targets for the copy (CR 707.10c)', () => {
  const twinGame = () =>
    game((b) =>
      b
        .seat(0)
        .hand(BOLT, TWIN, TWIN_DRAW, EXACT)
        .battlefield('Mountain')
        .battlefield('Island', { count: 3 })
        .battlefield(BEARS)
        .seat(1)
        .battlefield(SPIDER),
    );

  test('the controller of the copy is asked; the decision lists every legal target and what the copy has now', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.forCopy).toBe(true);
    expect(d.forTrigger).toBeUndefined();
    expect(d.seat).toBe(0);
    expect(d.source).toBe(copies(g)[0]?.id);
    expect(d.current).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    const [slot] = d.specs;
    expect(slot).toMatchObject({ specId: 't1', min: 1, max: 1 });
    expect(slot?.legal.map((t) => (t.kind === 'player' ? `p${t.seat}` : t.id))).toEqual([
      g.id(BEARS),
      g.id(SPIDER),
      'p0',
      'p1',
    ]);
    // Every legal answer is a legal action, and there is no cancel (the copy is on the stack already).
    const actions = getLegalActions(g.state, 0);
    expect(actions.filter((a) => a.kind === 'chooseTargets')).toHaveLength(4);
    expect(actions.some((a) => a.kind === 'cancel')).toBe(false);
  });

  test('the player may leave the target as it is', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)[0]?.stack?.chosenTargets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    resolveTop(g);
    resolveTop(g);
    g.expect.life(1, 16);
  });

  test('or choose a new one: the copy and the original hit different targets', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.act(0).chooseTargets(SPIDER);
    expect(copies(g)[0]?.stack?.chosenTargets).toEqual([
      { kind: 'object', id: g.id(SPIDER), specId: 't1' },
    ]);
    resolveTop(g);
    g.expect.damage(SPIDER, 2);
    g.expect.life(1, 20);
    resolveTop(g);
    g.expect.life(1, 18);
  });

  test('a target that is not legal is refused unless the copy already has it', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    const land = g.id({ name: 'Island', zone: 'battlefield', nth: 0 });
    const result = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: land, specId: 't1' }],
    });
    expect(result.ok).toBe(false);
    g.expect.pending('targets', 0);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the original keeps its targets, whatever the copy chose', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.act(0).chooseTargets({ player: 0 });
    const original = g.find({ name: BOLT, zone: 'stack' }).find((o) => o.copyOf === undefined);
    expect(original?.stack?.chosenTargets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    resolveTop(g);
    g.expect.life(0, 18);
  });

  test('the effect that copies goes on after the question', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(TWIN_DRAW, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.pending('targets', 0);
    g.expect.handSize(0, 2); // Twin Spell, Exact Twin: the draw has not happened yet
    g.act(0).chooseTargets({ player: 1 });
    g.expect.handSize(0, 3);
  });

  test('"copy it" without new targets asks nothing', () => {
    const g = twinGame();
    castBolt(g);
    g.act(0).cast(EXACT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    expect(copies(g)).toHaveLength(1);
  });

  test('an illegal target may stay, and the copy then does what it can (CR 707.10c, 608.2b)', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(SPLIT, TWIN, LIGHTNING)
        .battlefield('Mountain', { count: 3 })
        .battlefield('Island', { count: 2 })
        .battlefield(BEARS)
        .seat(1)
        .battlefield('Giant Spider'),
    );
    g.act(0).cast(SPLIT, { targets: [BEARS, { player: 1 }], pay: true });
    g.act(0).cast(TWIN, { targets: [{ name: SPLIT, zone: 'stack' }], pay: true });
    g.act(0).cast(LIGHTNING, { targets: [BEARS], pay: true });
    resolveTop(g); // Lightning Bolt kills the Bears
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    resolveTop(g); // Twin Spell
    const d = targetsDecision(g);
    const creatureSlot = d.specs.find((s) => s.specId === 't1');
    // The Bears are gone, yet they stay on offer because the copy has them as its target.
    expect(creatureSlot?.legal.map((t) => (t.kind === 'object' ? t.id : '-'))).toContain(
      d.current?.[0]?.kind === 'object' ? d.current[0].id : '',
    );
    g.act(0).choose({ kind: 'chooseTargets', targets: d.current ?? [] });
    resolveTop(g); // the copy: one target is illegal, the other is hit, it draws
    g.expect.life(1, 19);
    expect(g.state.seats[0]?.hand.length).toBe(1);
  });
});

describe('who controls the copy, and what it targets (CR 707.10, 702.21a)', () => {
  test("the opponent's copy of my spell is theirs: they choose its targets and it is controlled and owned by them", () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT)
        .battlefield('Mountain')
        .seat(1)
        .hand(TWIN)
        .battlefield('Island', { count: 2 }),
    );
    castBolt(g);
    g.pass(0);
    g.act(1).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.pass(1);
    g.pass(0);
    const d = targetsDecision(g);
    expect(d.seat).toBe(1);
    const [copy] = copies(g);
    expect(copy).toMatchObject({ controller: 1, owner: 1 });
    // Seat 1 points the copy at seat 0, though the original aims at seat 1.
    g.act(1).chooseTargets({ player: 0 });
    resolveTop(g);
    g.expect.life(0, 18);
    g.expect.life(1, 20);
    resolveTop(g);
    g.expect.life(1, 18);
  });

  test('a copy that targets a permanent with ward triggers it again, whether or not the target is changed', () => {
    const g = scenario()
      .define(wardBear)
      .seat(0)
      .life(20)
      .hand(BOLT, EXACT)
      .battlefield('Mountain')
      .battlefield('Island')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(WARD)
      .library(...FILLER)
      .build();
    g.act(0).cast(BOLT, { targets: [WARD], pay: true });
    g.expect.stack([`${WARD} (ability)`, BOLT]);
    g.act(0).cast(EXACT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // Exact Twin: the copy has the same target and triggers ward on its own
    g.expect.stack([`${WARD} (ability)`, BOLT, `${WARD} (ability)`, BOLT]);
    expect(copies(g)).toHaveLength(1);
  });
});

describe('copying from a trigger (CR 603.2, 707.10)', () => {
  test('"copy that spell" puts the copy above the spell, with the same targets, and a copy triggers nothing', () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(CHAMBER).battlefield('Mountain'));
    castBolt(g);
    g.expect.stack([`${CHAMBER} (ability)`, BOLT]);
    g.pass(); // the trigger resolves
    g.pass(1);
    g.expect.stack([BOLT, BOLT]);
    expect(copies(g)).toHaveLength(1);
    g.expect.pending('priority', 0);
    resolveTop(g);
    resolveTop(g);
    g.expect.life(1, 16);
  });

  test('"you may choose new targets for the copy" asks the controller of the trigger', () => {
    const g = game((b) =>
      b.seat(0).hand(BOLT).battlefield(MIRROR).battlefield('Mountain').seat(1).battlefield(SPIDER),
    );
    castBolt(g);
    g.pass();
    g.pass(1);
    g.expect.pending('targets', 0);
    expect(targetsDecision(g).forCopy).toBe(true);
    g.act(0).chooseTargets(SPIDER);
    g.expect.stack([BOLT, BOLT]);
  });

  test('the spell is copied from last-known information when it was countered in response to the trigger', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT)
        .battlefield(CHAMBER)
        .battlefield('Mountain')
        .seat(1)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 }),
    );
    castBolt(g);
    g.pass(0);
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // the counterspell resolves: the bolt goes to the graveyard
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.stack([`${CHAMBER} (ability)`]);
    resolveTop(g); // the trigger still resolves, copying what the bolt was
    g.expect.stack([BOLT]);
    expect(copies(g)[0]?.stack?.chosenTargets).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    resolveTop(g);
    g.expect.life(1, 18);
    // The copy ceased to exist; the card is still the one in the graveyard.
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('copying with an activated ability (CR 707.10)', () => {
  test('copies a spell its controller controls, with new targets for the copy', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT)
        .battlefield(ENGINE)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .battlefield(SPIDER),
    );
    castBolt(g);
    g.act(0).activate(ENGINE, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.expect.stack([`${ENGINE} (ability)`, BOLT]);
    resolveTop(g);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.expect.stack([BOLT, BOLT]);
    expect(copies(g)[0]?.controller).toBe(0);
  });

  test('cannot target an opponent\'s spell when the text says "you control"', () => {
    const g = game((b) =>
      b
        .seat(0)
        .battlefield(ENGINE)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .hand(BOLT)
        .battlefield('Mountain'),
    );
    g.pass(0);
    castBolt(g, 1, { player: 0 });
    expect(() =>
      g.act(0).activate(ENGINE, { targets: [{ name: BOLT, zone: 'stack' }], pay: true }),
    ).toThrow();
  });

  test('a target that is no longer on the stack leaves nothing to copy (CR 608.2b)', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(BOLT, TWIN)
        .battlefield('Mountain')
        .battlefield('Island', { count: 2 })
        .seat(1)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 }),
    );
    castBolt(g);
    g.act(0).cast(TWIN, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.pass(0);
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // the counterspell: the bolt is gone
    resolveTop(g); // the twin spell fizzles
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    expect(g.eventsSince(0).filter((e) => e.kind === 'spellCopied')).toHaveLength(0);
  });
});
