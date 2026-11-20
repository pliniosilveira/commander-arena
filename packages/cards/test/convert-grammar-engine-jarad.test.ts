// Parsed text is only worth something if the engine runs it as written. A SYNTHETIC card with the wording of Jarad, Golgari Lich Lord is imported through the grammar (never through
// a fixture) and played through applyAction: "Each opponent loses life equal to the sacrificed creature's power" (CR 602.2c, 113.7a: the power the creature last had on the
// battlefield) and "Sacrifice a Swamp and a Forest: Return this card from your graveyard to your hand" (CR 701.21a, 118.3, 113.6b: a different land for each part, and an ability
// that works from the graveyard). No real card's text is claimed beyond the wording of its abilities; every name starts with "SYNTHETIC".
import type { Action, ObjectId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const JARAD = parsed(
  'SYNTHETIC Parsed Lich Lord',
  'Legendary Creature — Zombie Elf',
  "~ gets +1/+1 for each creature card in your graveyard.\n{1}{B}{G}, Sacrifice another creature: Each opponent loses life equal to the sacrificed creature's power.\nSacrifice a Swamp and a Forest: Return this card from your graveyard to your hand.",
  { manaCost: '{B}{B}{G}{G}', colors: ['B', 'G'], power: '2', toughness: '2' },
);
const BOG = parsed('SYNTHETIC Parsed Bog', 'Land — Swamp', '');
const WOOD = parsed('SYNTHETIC Parsed Wood', 'Land — Forest', '');
const BOG_WOOD = parsed('SYNTHETIC Parsed Bog Wood', 'Land — Swamp Forest', '');
const BOG_TWO = parsed('SYNTHETIC Parsed Bog Two', 'Land — Swamp', '');
const PLAIN = parsed('SYNTHETIC Parsed Plain', 'Land — Plains', '');
const WALL = parsed('SYNTHETIC Parsed Wall', 'Creature — Wall', '', {
  manaCost: '{1}',
  power: '0',
  toughness: '4',
});
const BEARS = 'Grizzly Bears'; // 2/2
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(mine: (b: Builder) => Builder): ScenarioGame {
  return mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .define(JARAD)
      .define(BOG)
      .define(WOOD)
      .define(BOG_WOOD)
      .define(BOG_TWO)
      .define(PLAIN),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
}

/** The name of a permanent or card of the game, from its id. */
const nameOf =
  (g: ScenarioGame) =>
  (id: ObjectId): string => {
    const card = g.state.objects[id]?.card;
    const definition = card == null ? undefined : g.state.cards[card]?.definition;
    return (
      (definition === undefined ? undefined : g.state.definitions[definition]?.faces[0]?.name) ?? id
    );
  };

/** The answer that chooses the lands with these names from the battlefield. */
const choose = (g: ScenarioGame, ...names: string[]): Action => ({
  kind: 'choosePermanents',
  objects: names.map((name) => {
    const found = g.state.battlefield.find((id) => nameOf(g)(id) === name);
    if (found === undefined) throw new Error(`no ${name}`);
    return found;
  }),
});

const DRAIN = 1;
const RETURN = 2;

const canActivate = (g: ScenarioGame, abilityIndex: number): boolean =>
  g.legalActions(0).some((a) => a.kind === 'activate' && a.abilityIndex === abilityIndex);

describe('"{1}{B}{G}, Sacrifice another creature: Each opponent loses life equal to the sacrificed creature\'s power."', () => {
  const withMana = (b: Builder) =>
    b.battlefield('Swamp').battlefield('Forest').battlefield('Plains');

  test('each opponent loses the power the sacrificed creature had, counters included', () => {
    const g = game((b) =>
      withMana(b)
        .battlefield(JARAD.name)
        .battlefield(BEARS, { counters: { '+1/+1': 2 } }),
    );
    g.act(0).activate(JARAD.name, { ability: DRAIN, pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    // Grizzly Bears is a 2/2 and has two +1/+1 counters: it was a 4/4 as it was sacrificed.
    g.expect.life(1, 16);
    g.expect.life(0, 20);
    g.expect.invariants();
  });

  test('the drain is the power the creature had, and Jarad then grows by the creature card in the graveyard', () => {
    const g = game((b) => withMana(b).battlefield(JARAD.name).battlefield(BEARS));
    g.act(0).activate(JARAD.name, { ability: DRAIN, pay: true });
    g.passAll();
    g.expect.life(1, 18);
    g.expect.pt(JARAD.name, 3, 3);
  });

  test('Jarad cannot sacrifice himself: "another creature"', () => {
    const g = game((b) => withMana(b).battlefield(JARAD.name));
    expect(canActivate(g, DRAIN)).toBe(false);
  });

  test('a creature with no power drains nothing', () => {
    const g = game((b) => withMana(b).define(WALL).battlefield(JARAD.name).battlefield(WALL.name));
    g.act(0).activate(JARAD.name, { ability: DRAIN, pay: true });
    g.passAll();
    g.expect.zone(WALL.name, 'graveyard', { seat: 0 });
    g.expect.life(1, 20);
  });
});

describe('"Sacrifice a Swamp and a Forest: Return this card from your graveyard to your hand."', () => {
  test('a Swamp and a Forest are sacrificed and the card returns to the hand', () => {
    const g = game((b) => b.graveyard(JARAD.name).battlefield(BOG.name).battlefield(WOOD.name));
    g.act(0).activate(JARAD.name, { ability: RETURN });
    g.passAll();
    g.expect.zone(BOG.name, 'graveyard', { seat: 0 });
    g.expect.zone(WOOD.name, 'graveyard', { seat: 0 });
    g.expect.zone(JARAD.name, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('both lands are needed: a Swamp alone, or a Forest alone, cannot pay it', () => {
    expect(
      canActivate(
        game((b) => b.graveyard(JARAD.name).battlefield(BOG.name)),
        RETURN,
      ),
    ).toBe(false);
    expect(
      canActivate(
        game((b) => b.graveyard(JARAD.name).battlefield(WOOD.name)),
        RETURN,
      ),
    ).toBe(false);
    expect(
      canActivate(
        game((b) => b.graveyard(JARAD.name).battlefield(BOG.name).battlefield(PLAIN.name)),
        RETURN,
      ),
    ).toBe(false);
  });

  test('a land that is both a Swamp and a Forest pays only one of the parts', () => {
    const alone = game((b) => b.graveyard(JARAD.name).battlefield(BOG_WOOD.name));
    expect(canActivate(alone, RETURN)).toBe(false);
    // Together with a Swamp the dual land is the Forest, and the Swamp pays the other part.
    const pair = game((b) =>
      b.graveyard(JARAD.name).battlefield(BOG_WOOD.name).battlefield(BOG.name),
    );
    expect(canActivate(pair, RETURN)).toBe(true);
  });

  test('the assignment must leave a land for every part: the dual land cannot be chosen twice over', () => {
    const g = game((b) => b.graveyard(JARAD.name).battlefield(BOG_WOOD.name).battlefield(BOG.name));
    g.act(0).activate(JARAD.name, { ability: RETURN });
    g.passAll();
    // Only one way pays it: the dual land is the Forest and the Swamp is the Swamp (the engine chose, as nothing else was possible).
    g.expect.zone(BOG_WOOD.name, 'graveyard', { seat: 0 });
    g.expect.zone(BOG.name, 'graveyard', { seat: 0 });
    g.expect.zone(JARAD.name, 'hand', { seat: 0 });
  });

  test('any land with the subtype qualifies, and the player chooses which when there is a choice', () => {
    const g = game((b) =>
      b
        .graveyard(JARAD.name)
        .battlefield(BOG.name)
        .battlefield(BOG_WOOD.name)
        .battlefield(WOOD.name),
    );
    g.act(0).activate(JARAD.name, { ability: RETURN });
    expect(g.state.pending?.kind).toBe('choosePermanent');
    // The Swamp and the dual land, the Swamp and the Forest, the dual land and the Forest: three ways to pay it, each a different land for each part.
    const offered = g
      .legalActions(0)
      .filter((a) => a.kind === 'choosePermanents')
      .map((a) => (a.kind === 'choosePermanents' ? a.objects.map(nameOf(g)).sort() : []));
    expect(offered).toHaveLength(3);
    g.act(0).choosePermanents(BOG.name, BOG_WOOD.name);
    g.passAll();
    g.expect.zone(BOG.name, 'graveyard', { seat: 0 });
    g.expect.zone(BOG_WOOD.name, 'graveyard', { seat: 0 });
    g.expect.zone(WOOD.name, 'battlefield', { seat: 0 });
    g.expect.zone(JARAD.name, 'hand', { seat: 0 });
  });

  test('a choice that leaves a part without a land of its own is refused', () => {
    const g = game((b) =>
      b
        .graveyard(JARAD.name)
        .battlefield(BOG.name)
        .battlefield(BOG_TWO.name)
        .battlefield(BOG_WOOD.name),
    );
    g.act(0).activate(JARAD.name, { ability: RETURN });
    // Two Swamps have no Forest among them; one land alone is one too few; a land that is no Swamp or Forest is not offered.
    expect(g.act(0).try.action(choose(g, BOG.name, BOG_TWO.name)).ok).toBe(false);
    expect(g.act(0).try.action(choose(g, BOG_WOOD.name)).ok).toBe(false);
    expect(g.state.pending?.kind).toBe('choosePermanent');
    // The dual land is the Forest, and either Swamp pays the other part.
    g.act(0).choosePermanents(BOG_TWO.name, BOG_WOOD.name);
    g.passAll();
    g.expect.zone(BOG_TWO.name, 'graveyard', { seat: 0 });
    g.expect.zone(BOG_WOOD.name, 'graveyard', { seat: 0 });
    g.expect.zone(BOG.name, 'battlefield', { seat: 0 });
    g.expect.zone(JARAD.name, 'hand', { seat: 0 });
  });

  test('the sacrifice can be taken back: the activation is rewound', () => {
    const g = game((b) =>
      b
        .graveyard(JARAD.name)
        .battlefield(BOG.name)
        .battlefield(BOG_TWO.name)
        .battlefield(BOG_WOOD.name),
    );
    g.act(0).activate(JARAD.name, { ability: RETURN });
    g.act(0).cancel();
    g.expect.zone(BOG.name, 'battlefield', { seat: 0 });
    g.expect.zone(JARAD.name, 'graveyard', { seat: 0 });
  });

  test('it works from the graveyard only: not from the battlefield', () => {
    const g = game((b) => b.battlefield(JARAD.name).battlefield(BOG.name).battlefield(WOOD.name));
    expect(canActivate(g, RETURN)).toBe(false);
  });
});
