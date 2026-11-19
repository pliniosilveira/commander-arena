// Issue 89 (Silverquill Influence), Animate Dead: "Enchant creature card in a graveyard. When this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and
// gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the
// battlefield, that creature's controller sacrifices it. Enchanted creature gets -1/-0." goes through the grammar as a card with no override (NO_OVERRIDES), with the Oracle text of the golden
// corpus, and is played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 702.5a, 303.4a (the spell targets a creature card of any graveyard), CR 608.3c (it enters attached to it), CR 603.4 (the intervening "if"), CR 613.1f (the enchant ability it has
// afterwards), CR 400.7 (the creature is a new object under the Aura controller's control), CR 603.10a, 701.21a (its controller sacrifices it), CR 704.5m (the Aura goes when the creature does).
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type GoldenCard, parseGolden } from '../src/index';
import { parsed } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const real = (name: string): GoldenCard => {
  const card = parseGolden(readFileSync(CORPUS, 'utf8')).find((c) => c.name === name);
  if (card === undefined) throw new Error(`the golden corpus has no ${name}`);
  return card;
};

const GOLDEN = real('Animate Dead');
const face = GOLDEN.faces[0];
if (face === undefined) throw new Error('Animate Dead has no face');

const ANIMATE = parsed(GOLDEN.name, face.typeLine, face.oracleText, {
  manaCost: face.manaCost,
  colors: [...face.colors],
});
const DISENCHANT = parsed('Test Disenchant', 'Instant', 'Destroy target enchantment.', {
  manaCost: '{U}',
  colors: ['U'],
});
const EXILE = parsed('Test Exile', 'Instant', 'Exile target card from a graveyard.', {
  manaCost: '{U}',
  colors: ['U'],
});
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Swamp');
const inGraveyard = (name: string, seat: 0 | 1) => ({ name, zone: 'graveyard' as const, seat });

/** Seat 0 holds Animate Dead with two Swamps and a Bolt in the graveyard; seat 1 has the Bears in the graveyard and two spells with three Islands. */
const board = () =>
  scenario()
    .define(ANIMATE)
    .define(DISENCHANT)
    .define(EXILE)
    .seat(0)
    .library(...LIBRARY)
    .hand(ANIMATE.name)
    .battlefield('Swamp', { count: 2 })
    .graveyard(BOLT)
    .seat(1)
    .library(...LIBRARY)
    .graveyard(BEARS)
    .hand(DISENCHANT.name, EXILE.name)
    .battlefield('Island', { count: 2 })
    .at('precombatMain', { active: 0 })
    .build();

const cast = (g: ReturnType<typeof board>) => {
  g.act(0).cast(ANIMATE.name, { targets: [inGraveyard(BEARS, 1)], pay: true });
};

describe('Animate Dead: the lowering', () => {
  const abilities = ANIMATE.faces[0]?.abilities ?? [];

  test('an enchant ability of a creature card in a graveyard', () => {
    expect(abilities[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'enchant', filter: { zone: 'graveyard', types: ['creature'] } },
    });
  });

  test('the enters ability swaps the enchant ability, returns the card and attaches the Aura', () => {
    expect(abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      interveningIf: { kind: 'thisOnBattlefield' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'replaceEnchant',
            objects: { kind: 'this' },
            loses: { kind: 'enchant', filter: { zone: 'graveyard', types: ['creature'] } },
            gains: { kind: 'enchant', filter: { types: ['creature'], putWithSource: true } },
          },
          {
            kind: 'moveToZone',
            objects: { kind: 'attached' },
            to: 'battlefield',
            controller: 'you',
            putWithSource: true,
          },
          { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
        ],
      },
    });
  });

  test('the leaves ability has the creature put onto the battlefield sacrificed by its controller, and the static gives -1/-0', () => {
    expect(abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
      effect: { kind: 'sacrifice', objects: { kind: 'putWithThis' }, byController: true },
    });
    expect(abilities[3]).toMatchObject({
      kind: 'static',
      static: { kind: 'modifyPt', power: -1, toughness: 0 },
    });
  });
});

describe('Animate Dead: played through the engine', () => {
  test('only a creature card of a graveyard can be targeted', () => {
    const g = board();
    g.act(0).cast(ANIMATE.name);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
    const legal = (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
    expect(legal).toEqual([g.id(inGraveyard(BEARS, 1))]);
  });

  test("it returns the opponent's creature under its controller's control, attached, with -1/-0", () => {
    const g = board();
    cast(g);
    g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    expect(bears).toBeDefined();
    if (bears === undefined) return;
    // No control-changing effect is in play: the player it entered under controls it (CR 110.2a).
    expect(bears.controller).toBe(0);
    expect(bears.owner).toBe(1);
    g.expect.attached(ANIMATE.name, BEARS);
    g.expect.pt(BEARS, 1, 2);
    g.expect.invariants();
  });

  test("when Animate Dead is destroyed the creature is sacrificed and goes to its owner's graveyard", () => {
    const g = board();
    cast(g);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT.name, { targets: [ANIMATE.name], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('it leaves in response to its own enters ability: nothing returns', () => {
    const g = board();
    cast(g);
    g.pass();
    g.pass();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT.name, { targets: [ANIMATE.name], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the card is exiled before it resolves: the spell fizzles', () => {
    const g = board();
    cast(g);
    g.act(0).pass();
    g.act(1).cast(EXILE.name, { targets: [inGraveyard(BEARS, 1)], pay: true });
    g.passAll();
    g.expect.zone(ANIMATE.name, 'graveyard', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'exile' })).toHaveLength(1);
    g.expect.invariants();
  });
});
