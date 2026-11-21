// "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard" (Muldrotha, the Gravetide; `playFromGraveyardEachType`), as the
// SYNTHETIC cards of `src/cards/fixtures/synthetic-each-type.ts` (the cards package checks that the grammar lowers the real text to the same node).
// Pins: CR 601.2a (casting from the graveyard), CR 305.1 and 305.2 (the land is a land play and uses the turn's land drop), CR 117.1a and 307.1 (the timing of the card is its own),
// CR 118.9 and 601.2f (the cost is paid), CR 205.2a (a card with several permanent types is played as one of them), CR 701.6a (a countered spell has been cast: the slot is used).
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const AVATAR = 'SYNTHETIC Gravetide Avatar';
const GEAR = 'SYNTHETIC Gear Golem'; // {2} artifact creature 2/2
const COG = 'SYNTHETIC Cog Golem'; // {3} artifact creature 3/3
const RELIC = 'SYNTHETIC Brass Relic'; // {1} artifact
const IDOL = 'SYNTHETIC Brass Idol'; // {2} artifact
const SHRINE = 'SYNTHETIC Hushed Chapel'; // {1}{W} enchantment
const SAGE = 'SYNTHETIC Wandering Sage'; // {2}{U} planeswalker
const HEAP = 'SYNTHETIC Bone Heap'; // {1}{B} sorcery
const BEARS = 'Grizzly Bears'; // {1}{G} creature
const SWAMPS = 'Swamp';

describe('the cards are valid', () => {
  test.each([AVATAR, GEAR, COG, RELIC, IDOL, SHRINE, SAGE, HEAP])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

type Builder = ReturnType<typeof scenario>;

/** Seat 0: the avatar and plenty of mana of every color the cards cost, `yard` in the graveyard. */
const rich = (b: Builder, yard: readonly string[], more: readonly string[] = []): Builder =>
  b
    .battlefield(AVATAR, ...more)
    .battlefield(SWAMPS, { count: 6 })
    .battlefield('Plains', { count: 2 })
    .battlefield('Island', { count: 2 })
    .battlefield('Forest', { count: 2 })
    .graveyard(...yard);

/** Whether the legal actions of seat 0 include a cast (or, with `land`, a land play) of the card of that name in its graveyard. */
const offered = (g: ScenarioGame, name: string, land = false): boolean =>
  getLegalActions(g.state, 0).some(
    (a) =>
      a.kind === (land ? 'playLand' : 'castSpell') &&
      g.state.objects[a.object]?.zone === 'graveyard' &&
      g.object(a.object).card === g.object({ name, zone: 'graveyard' }).card,
  );

/** Cast `name` from the graveyard and let it resolve. */
const castAndResolve = (
  g: ScenarioGame,
  name: string,
  permanentType?: 'artifact' | 'creature' | 'enchantment' | 'planeswalker',
) => {
  g.act(0).cast(name, { pay: true, ...(permanentType === undefined ? {} : { permanentType }) });
  g.passAll();
};

describe('one land and one spell of each permanent type', () => {
  test('a card of each type is cast once, from the graveyard, and enters the battlefield', () => {
    const g = twoSeatGame((b) => rich(b, [RELIC, SHRINE, SAGE, BEARS]));
    for (const name of [RELIC, SHRINE, SAGE, BEARS]) {
      expect(offered(g, name), name).toBe(true);
      castAndResolve(g, name);
      g.expect.zone(name, 'battlefield', { seat: 0 });
      g.expect.noObject(name, { zone: 'graveyard' });
    }
    g.expect.invariants();
  });

  test('a second spell of a type already used this turn is not offered, and is refused when tried', () => {
    const g = twoSeatGame((b) => rich(b, [RELIC, IDOL, BEARS]));
    castAndResolve(g, RELIC);
    expect(offered(g, IDOL)).toBe(false);
    g.expect.illegal(0, { cast: IDOL });
    // A spell of another type is still on offer.
    expect(offered(g, BEARS)).toBe(true);
  });

  test('a nonpermanent card is never offered', () => {
    const g = twoSeatGame((b) => rich(b, [HEAP]));
    expect(offered(g, HEAP)).toBe(false);
  });

  test('a card with two permanent types is offered once for each, and an action that names none is accepted', () => {
    const g = twoSeatGame((b) => rich(b, [GEAR]));
    const options = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && g.state.objects[a.object]?.zone === 'graveyard',
    );
    expect(options.map((a) => (a.kind === 'castSpell' ? a.permanentType : null)).sort()).toEqual([
      'artifact',
      'creature',
    ]);
    g.act(0).cast(GEAR, { pay: true });
    g.passAll();
    g.expect.zone(GEAR, 'battlefield', { seat: 0 });
  });

  test('an artifact creature as the artifact spell, then another as the creature spell; no third', () => {
    const g = twoSeatGame((b) => rich(b, [GEAR, COG, IDOL, BEARS]));
    castAndResolve(g, GEAR, 'artifact');
    // Only the creature slot is left for the other golem; the artifact card and the creature card are not offered as their types.
    expect(offered(g, IDOL)).toBe(false);
    const cog = getLegalActions(g.state, 0).filter(
      (a) => a.kind === 'castSpell' && g.object(a.object).zone === 'graveyard',
    );
    expect(cog.some((a) => a.kind === 'castSpell' && a.permanentType === 'artifact')).toBe(false);
    castAndResolve(g, COG, 'creature');
    g.expect.zone(COG, 'battlefield', { seat: 0 });
    expect(offered(g, BEARS)).toBe(false);
    expect(offered(g, IDOL)).toBe(false);
    g.expect.invariants();
  });

  test('a type that is not free, or not a type of the card, is refused', () => {
    const g = twoSeatGame((b) => rich(b, [GEAR, BEARS, RELIC]));
    g.expect.illegal(0, { cast: BEARS, permanentType: 'artifact' });
    castAndResolve(g, GEAR, 'artifact');
    // The golem used the artifact slot, so the artifact card is out, whatever it is cast as.
    g.expect.illegal(0, { cast: RELIC, permanentType: 'artifact' });
    expect(() => g.act(0).cast(BEARS, { permanentType: 'artifact' })).toThrow();
  });

  test('with no type named the engine keeps the slot another card of the graveyard needs', () => {
    const g = twoSeatGame((b) => rich(b, [GEAR, IDOL]));
    // The golem could be the artifact or the creature: the artifact slot is the only one the idol can use, so the golem takes the creature slot.
    castAndResolve(g, GEAR);
    expect(offered(g, IDOL)).toBe(true);
  });

  test('losing the permission after the spell is cast does not affect the spell', () => {
    const g = twoSeatGame(
      (b) => rich(b, [RELIC]),
      (b) => b.hand('Murder').battlefield(SWAMPS, { count: 3 }),
    );
    g.act(0).cast(RELIC, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [AVATAR], pay: true });
    g.passAll();
    g.expect.zone(AVATAR, 'graveyard', { seat: 0 });
    g.expect.zone(RELIC, 'battlefield', { seat: 0 });
  });

  test('the slot is used even when the spell is countered', () => {
    const g = twoSeatGame(
      (b) => rich(b, [RELIC, IDOL]),
      (b) => b.hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(RELIC, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [RELIC], pay: true });
    g.passAll();
    g.expect.zone(RELIC, 'graveyard', { seat: 0 });
    expect(offered(g, IDOL)).toBe(false);
    expect(offered(g, RELIC)).toBe(false);
  });
});

describe('the land play', () => {
  test('a land card is played from the graveyard with the land drop of the turn', () => {
    const g = twoSeatGame((b) => rich(b, ['Mountain']).hand('Plains'));
    expect(offered(g, 'Mountain', true)).toBe(true);
    g.act(0).playLand('Mountain');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    // The land drop is used: neither the hand nor the graveyard offers another land.
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'playLand')).toBe(false);
    g.expect.invariants();
  });

  test('with the land drop already used, a land card of the graveyard is not offered', () => {
    const g = twoSeatGame((b) => rich(b, ['Mountain']).hand('Plains'));
    g.act(0).playLand('Plains');
    expect(offered(g, 'Mountain', true)).toBe(false);
    g.expect.illegal(0, { playLand: 'Mountain' });
  });

  test('the land play does not use the slot of a spell, and a spell does not use the land play', () => {
    const g = twoSeatGame((b) => rich(b, ['Mountain', RELIC, SHRINE]));
    g.act(0).playLand('Mountain');
    expect(offered(g, RELIC)).toBe(true);
    castAndResolve(g, RELIC);
    castAndResolve(g, SHRINE);
    expect(g.state.turnLog.graveyardSlots?.map((u) => u.type).sort()).toEqual([
      'artifact',
      'enchantment',
      'land',
    ]);
  });

  test('a second land card is not offered after the land slot is used, even with a land drop left', () => {
    const g = twoSeatGame((b) => rich(b, ['Mountain', 'Forest', 'Island']));
    g.act(0).playLand('Mountain');
    // A second land drop would be needed (CR 305.2); the slot is used besides.
    expect(offered(g, 'Forest', true)).toBe(false);
  });
});

describe('timing and cost', () => {
  test('a creature card is cast at sorcery timing: not with a spell on the stack, not in the end step', () => {
    const g = twoSeatGame(
      (b) => rich(b, [BEARS]).hand('Lightning Bolt').battlefield('Mountain'),
      (b) => b,
    );
    g.act(0).cast('Lightning Bolt', { targets: [AVATAR], pay: true });
    expect(g.state.stack.length).toBeGreaterThan(0);
    expect(offered(g, BEARS)).toBe(false);
    g.passAll();
    g.advanceTo('end');
    expect(offered(g, BEARS)).toBe(false);
  });

  test('the cost of the card is paid in full: without the mana it is not offered', () => {
    const g = twoSeatGame((b) => b.battlefield(AVATAR).graveyard(BEARS));
    expect(offered(g, BEARS)).toBe(false);
  });

  test('the mana is spent', () => {
    const g = twoSeatGame((b) => b.battlefield(AVATAR, 'Forest', 'Forest').graveyard(BEARS));
    castAndResolve(g, BEARS);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activateAbility')).toBe(false);
  });

  test('it works on the turn of its controller only', () => {
    const g = scenario()
      .seat(0)
      .battlefield(AVATAR)
      .battlefield('Forest', { count: 2 })
      .graveyard(BEARS)
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell')).toBe(false);
  });
});

describe('several permissions and the turn reset', () => {
  test('a second avatar gives a fresh slot for each type', () => {
    const g = twoSeatGame((b) => rich(b, [RELIC, IDOL], [AVATAR]));
    castAndResolve(g, RELIC);
    expect(offered(g, IDOL)).toBe(true);
    castAndResolve(g, IDOL);
    g.expect.zone(IDOL, 'battlefield', { seat: 0 });
  });

  test('a second avatar that comes under control after a card was played gives another play of that type', () => {
    const g = twoSeatGame((b) => rich(b, [RELIC, IDOL]).hand(AVATAR));
    castAndResolve(g, RELIC);
    expect(offered(g, IDOL)).toBe(false);
    castAndResolve(g, AVATAR);
    expect(offered(g, IDOL)).toBe(true);
  });

  test('the slots are free again in the next turn of the controller', () => {
    const g = twoSeatGame((b) => rich(b, [RELIC, IDOL]));
    castAndResolve(g, RELIC);
    expect(offered(g, IDOL)).toBe(false);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(g.state.turnLog.graveyardSlots ?? []).toEqual([]);
    expect(offered(g, IDOL)).toBe(true);
  });
});

describe('a game played through applyAction', () => {
  test('the first graveyard cast the engine lists is applied, paid and resolved', () => {
    const g = twoSeatGame((b) => rich(b, [GEAR, SHRINE]));
    let state = g.state;
    const first = getLegalActions(state, 0).find(
      (a) => a.kind === 'castSpell' && state.objects[a.object]?.zone === 'graveyard',
    );
    if (first === undefined) throw new Error('no graveyard cast listed');
    const result = applyAction(state, 0, first);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    expect(state.turnLog.graveyardSlots).toHaveLength(1);
    expect(state.stack).toHaveLength(1);
  });
});
