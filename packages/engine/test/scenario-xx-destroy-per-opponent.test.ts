// "For each opponent, destroy up to one target artifact or enchantment that player controls" on a sorcery (D-273, the slot of D-149 with destroy).
// Pins: CR 115.1 and 601.2c (a target slot: up to one target for each opponent, controlled by that opponent, chosen as the spell is cast),
// CR 701.8a (destroy: move the permanent from the battlefield to its owner's graveyard).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-destroy-per-opponent.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { targetAnswerError } from '../src/rules/target-choice';
import { scenario } from '../src/testing/index';

const SWEEP = 'SYNTHETIC Razing Sweep';
const CULL = 'SYNTHETIC Culling Sweep';
const SINGLE = 'SYNTHETIC Single Razing';
const AURA = 'SYNTHETIC Mighty Aura';
const ENCH = 'SYNTHETIC Grasp of Law';
const BEARS = 'Grizzly Bears';
const RING = 'Sol Ring';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([SWEEP, CULL, SINGLE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 has the sorcery in hand and mana; seat 1 has what `theirs` puts on the battlefield; `mine` is on seat 0's side. */
const game = (
  card: string,
  theirs: readonly string[],
  mine: readonly string[] = [],
  attach = false,
) => {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(card)
    .battlefield('Plains', 'Plains', 'Plains', 'Swamp', ...mine)
    .seat(1)
    .library(...LIBRARY);
  if (attach) b.battlefield(BEARS).battlefield(AURA, { attachedTo: BEARS });
  return b.battlefield(...theirs).build();
};

type G = ReturnType<typeof game>;

/** Casts the sorcery up to the choice of targets. */
const cast = (g: G, card = SWEEP) => g.act(0).cast(card);

/** Chooses the targets, pays, and lets the spell resolve. */
const resolveWith = (g: G, targets: readonly string[], card = SWEEP) => {
  cast(g, card)
    .targets([...targets])
    .pay();
  g.passAll();
};

const targetsDecision = (g: G) => {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
  return d;
};

describe('the slot: up to one target for each opponent', () => {
  test('none at least, one at most (one opponent), grouped by the opponent', () => {
    const g = game(SWEEP, [RING, BEARS]);
    cast(g);
    const spec = targetsDecision(g).specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(1);
    expect(spec?.onePerGroup).toBe(true);
    expect(spec?.legal.every((t) => t.kind === 'object' && t.group === 1)).toBe(true);
  });

  test('only the artifacts and enchantments of the opponent are offered: not a creature, a land, or anything of mine', () => {
    const g = game(SWEEP, [RING, BEARS, 'Forest'], [ENCH]);
    cast(g);
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    expect(legal.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([g.id(RING)]);
  });

  test('the opponent with nothing of the kind: the slot has no legal target and the spell is cast with none', () => {
    const g = game(SWEEP, [BEARS, 'Forest']);
    cast(g);
    // With no legal target the decision offers nothing; answering with none is legal.
    expect(targetsDecision(g).specs[0]?.legal.length).toBe(0);
    g.act(0).chooseTargets();
    g.choose({ kind: 'payAuto' });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(SWEEP, 'graveyard', { seat: 0 });
  });

  test('two targets for one opponent are refused (at most one for each)', () => {
    const g = game(SWEEP, [RING, ENCH]);
    cast(g);
    expect(targetsDecision(g).specs[0]?.legal.length).toBe(2);
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [
          { kind: 'object', id: g.id(RING), specId: 't1' },
          { kind: 'object', id: g.id(ENCH), specId: 't1' },
        ],
      }).ok,
    ).toBe(false);
  });

  test('a target that is not legal for the slot is refused', () => {
    const g = game(SWEEP, [RING, BEARS]);
    cast(g);
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [{ kind: 'object', id: g.id(BEARS), specId: 't1' }],
      }).ok,
    ).toBe(false);
  });
});

describe('what the sorcery does', () => {
  test('the artifact chosen is destroyed', () => {
    const g = game(SWEEP, [RING, ENCH]);
    resolveWith(g, [RING]);
    g.expect.zone(RING, 'graveyard', { seat: 1 });
    g.expect.zone(ENCH, 'battlefield', { seat: 1 });
  });

  test('an enchantment chosen is destroyed', () => {
    const g = game(SWEEP, [RING, ENCH]);
    resolveWith(g, [ENCH]);
    g.expect.zone(ENCH, 'graveyard', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });

  test('choosing none (up to one) destroys nothing', () => {
    const g = game(SWEEP, [RING]);
    resolveWith(g, []);
    g.expect.zone(RING, 'battlefield', { seat: 1 });
    g.expect.zone(SWEEP, 'graveyard', { seat: 0 });
  });

  test('my own artifact is never destroyed, even when I choose nothing', () => {
    const g = game(SWEEP, [RING], [ENCH]);
    resolveWith(g, [RING]);
    g.expect.zone(ENCH, 'battlefield', { seat: 0 });
  });

  test('an Aura is an enchantment: destroyed, it goes to the graveyard of its owner and the creature stays', () => {
    const g = game(SWEEP, [], [], true);
    resolveWith(g, [AURA]);
    g.expect.zone(AURA, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

describe('a creature version is the same slot with another filter', () => {
  test('only creatures of the opponent are offered and one is destroyed', () => {
    const g = game(CULL, [BEARS, RING]);
    const h = cast(g, CULL);
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    expect(legal.length).toBe(1);
    h.targets([BEARS]).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });
});

describe('a single target is not the per-opponent slot', () => {
  test('exactly one target is required, and the decision is not grouped', () => {
    const g = game(SINGLE, [RING, ENCH]);
    cast(g, SINGLE);
    const spec = targetsDecision(g).specs[0];
    expect(spec?.min).toBe(1);
    expect(spec?.max).toBe(1);
    expect(spec?.onePerGroup).toBeUndefined();
  });
});

describe('one target for each opponent, with several opponents', () => {
  // The scenario's two seats cannot show it, so the answer check is pinned with the decision a three-player game would ask.
  const legal = [
    { kind: 'object' as const, id: 'o1' as never, specId: 't1', group: 1 },
    { kind: 'object' as const, id: 'o2' as never, specId: 't1', group: 1 },
    { kind: 'object' as const, id: 'o3' as never, specId: 't1', group: 2 },
  ];
  const pending = { specs: [{ specId: 't1', min: 0, max: 2, onePerGroup: true as const, legal }] };

  test('one target of each opponent is fine', () => {
    expect(targetAnswerError(pending, [legal[0], legal[2]] as never)).toBeNull();
  });

  test('two targets of one opponent are refused', () => {
    expect(targetAnswerError(pending, [legal[0], legal[1]] as never)).toContain('at most one');
  });
});
