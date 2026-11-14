// Parsed text is only worth something if the engine runs it as written (stage P27). These tests import SYNTHETIC cards
// through the grammar (never through a fixture), define them in an engine scenario and play them through applyAction:
// the copy slice of D-129 (ENGINE_VERSION 27): Storm (CR 702.40a: one copy for each spell cast before it this turn),
// Replicate (CR 702.56a: the cost paid any number of times, one copy for each) and the effect that copies a target
// spell with new targets for the copy (CR 707.10, 707.10c), in a spell, in an activated ability, in an enters trigger
// and in a cast trigger that copies its subject. Every card name starts with "SYNTHETIC"; the lines are the real
// ones of reports/templates.json ("Storm", "Replicate {M}", "Copy target instant or sorcery spell. You may choose new
// targets for the copy.", "{M}, {T}: Copy target instant or sorcery spell you control. ...", "When ~ enters, copy
// target instant or sorcery spell. ...", "Whenever you cast a spell of the chosen type, copy that spell."), the costs
// and the bodies are SYNTHETIC. No real card's text is claimed; Lightning Bolt and Giant Spider are the engine's own
// test cards.
import { type CardDefinition, type GameObject, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const LIGHTNING = 'Lightning Bolt';
const SPIDER = 'Giant Spider'; // 2/4

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 3; libraries that do not run out. */
function game(place: (b: Builder) => Builder): ScenarioGame {
  return place(scenario().seat(0).life(20))
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const copies = (g: ScenarioGame): GameObject[] =>
  [...g.state.stack]
    .reverse()
    .map((id) => g.state.objects[id])
    .filter((o): o is GameObject => o?.copyOf !== undefined);

const DRAIN = parsed(
  'SYNTHETIC Parsed Storm Drain',
  'Sorcery',
  'Each opponent loses 2 life.\nStorm',
  { manaCost: '{B}', colors: ['B'] },
);

const BURN = parsed(
  'SYNTHETIC Parsed Replicate Burn',
  'Instant',
  'Replicate {R}\n~ deals 1 damage to any target.',
  { manaCost: '{R}', colors: ['R'] },
);

const TWIN = parsed(
  'SYNTHETIC Parsed Twin Spell',
  'Instant',
  'Copy target instant or sorcery spell. You may choose new targets for the copy.',
  { manaCost: '{U}{U}', colors: ['U'] },
);

const EXACT = parsed(
  'SYNTHETIC Parsed Exact Twin',
  'Instant',
  'Copy target instant or sorcery spell.',
  { manaCost: '{U}{U}', colors: ['U'] },
);

describe('"Storm" (backlog: 33 cards; CR 702.40a)', () => {
  test('the lowering is the engine keyword with no data', () => {
    expect(DRAIN.faces[0]?.abilities).toEqual([{ kind: 'keyword', keyword: { kind: 'storm' } }]);
  });

  const withDrain = (b: Builder) =>
    b
      .define(DRAIN)
      .seat(0)
      .hand(DRAIN.name, LIGHTNING, LIGHTNING)
      .battlefield('Swamp')
      .battlefield('Mountain', { count: 2 });

  const castBolts = (g: ScenarioGame, n: number): void => {
    for (let i = 0; i < n; i += 1) {
      g.act(0).cast(
        { name: LIGHTNING, zone: 'hand', nth: 0 },
        { targets: [{ player: 1 }], pay: true },
      );
      resolveTop(g);
    }
  };

  test('two spells cast before it make two copies, and every copy resolves', () => {
    const g = game(withDrain);
    castBolts(g, 2);
    g.expect.life(1, 14);
    g.act(0).cast(DRAIN.name, { pay: true });
    g.expect.stack([`${DRAIN.name} (ability)`, DRAIN.name]);
    resolveTop(g);
    expect(copies(g)).toHaveLength(2);
    g.expect.stack([DRAIN.name, DRAIN.name, DRAIN.name]);
    for (let i = 0; i < 3; i += 1) resolveTop(g);
    g.expect.life(1, 8);
    g.expect.stack([]);
    // The copies are not cast: only the three spells were.
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3);
    g.expect.invariants();
  });

  test('with no spell cast before it there is nothing to copy', () => {
    const g = game(withDrain);
    g.act(0).cast(DRAIN.name, { pay: true });
    resolveTop(g);
    expect(copies(g)).toHaveLength(0);
    resolveTop(g);
    g.expect.life(1, 18);
  });
});

describe('"Replicate {M}" (backlog: 16 cards; CR 702.56a)', () => {
  test('the lowering is the engine keyword with its mana cost', () => {
    expect(BURN.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'replicate', cost: [{ kind: 'mana', symbols: ['R'] }] },
    });
  });

  test('paid twice, the spell is copied twice and each copy may choose new targets', () => {
    const g = game((b) =>
      b
        .define(BURN)
        .seat(0)
        .hand(BURN.name)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .battlefield(SPIDER),
    );
    g.act(0).cast(BURN.name, { replicas: 2, targets: [{ player: 1 }], pay: true });
    expect(getView(g.state, 1).stack.find((o) => o.name === BURN.name)?.replicated).toBe(2);
    resolveTop(g); // the replicate trigger
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    expect(copies(g)).toHaveLength(2);
    g.expect.stack([BURN.name, BURN.name, BURN.name]);
    g.passAll();
    g.expect.life(1, 18);
    g.expect.damage(SPIDER, 1);
    g.expect.invariants();
  });

  test('paid no time there is no trigger and no copy', () => {
    const g = game((b) =>
      b.define(BURN).seat(0).hand(BURN.name).battlefield('Mountain', { count: 3 }),
    );
    g.act(0).cast(BURN.name, { replicas: 0, targets: [{ player: 1 }], pay: true });
    g.expect.stack([BURN.name]);
    g.passAll();
    g.expect.life(1, 19);
  });
});

describe('"Copy target instant or sorcery spell. You may choose new targets for the copy." (6 cards; CR 707.10c)', () => {
  const nodeOf = (card: CardDefinition) => card.faces[0]?.spell;

  test('the lowering is a copySpell of a target spell on the stack, with new targets', () => {
    expect(nodeOf(TWIN)).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'stack',
              stackKind: 'spell',
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
            },
          },
        },
      ],
      effect: { kind: 'copySpell', spell: { kind: 'target', id: 't1' }, newTargets: 'may' },
    });
  });

  const twinGame = (card: CardDefinition) =>
    game((b) =>
      b
        .define(card)
        .seat(0)
        .hand(LIGHTNING, card.name)
        .battlefield('Mountain')
        .battlefield('Island', { count: 2 })
        .seat(1)
        .battlefield(SPIDER),
    );

  test('the copy of Lightning Bolt goes to a new target and the original keeps its own', () => {
    const g = twinGame(TWIN);
    g.act(0).cast(LIGHTNING, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(TWIN.name, { targets: [{ name: LIGHTNING, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.expect.stack([LIGHTNING, LIGHTNING]);
    g.passAll();
    g.expect.damage(SPIDER, 3);
    g.expect.life(1, 17);
    g.expect.invariants();
  });

  test('without the sentence about new targets nothing is asked and the copy has the same target', () => {
    expect(nodeOf(EXACT)?.effect).toMatchObject({ kind: 'copySpell', newTargets: 'no' });
    const g = twinGame(EXACT);
    g.act(0).cast(LIGHTNING, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(EXACT.name, { targets: [{ name: LIGHTNING, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.stack([LIGHTNING, LIGHTNING]);
    g.passAll();
    g.expect.life(1, 14);
  });

  const STAFF = parsed(
    'SYNTHETIC Parsed Copy Staff',
    'Artifact',
    '{1}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.',
    { manaCost: '{2}' },
  );

  test('the activated form copies a spell its controller controls, with new targets for the copy', () => {
    const g = game((b) =>
      b
        .define(STAFF)
        .seat(0)
        .hand(LIGHTNING)
        .battlefield(STAFF.name)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .battlefield(SPIDER),
    );
    g.act(0).cast(LIGHTNING, { targets: [{ player: 1 }], pay: true });
    g.act(0).activate(STAFF.name, { targets: [{ name: LIGHTNING, zone: 'stack' }], pay: true });
    resolveTop(g);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.expect.damage(SPIDER, 3);
    g.expect.life(1, 17);
  });

  test('"you control": a spell of the opponent is not a legal target of the activated form', () => {
    const g = game((b) =>
      b
        .define(STAFF)
        .seat(0)
        .battlefield(STAFF.name)
        .battlefield('Mountain', { count: 3 })
        .seat(1)
        .hand(LIGHTNING)
        .battlefield('Mountain'),
    );
    g.pass(0);
    g.act(1).cast(LIGHTNING, { targets: [{ player: 0 }], pay: true });
    expect(() =>
      g.act(0).activate(STAFF.name, { targets: [{ name: LIGHTNING, zone: 'stack' }], pay: true }),
    ).toThrow();
  });

  test('the enters trigger copies a spell as it enters (flash creature cast in response)', () => {
    const MAGE = parsed(
      'SYNTHETIC Parsed Copy Mage',
      'Creature — Wizard',
      'Flash\nWhen ~ enters, copy target instant or sorcery spell. You may choose new targets for the copy.',
      { manaCost: '{1}{U}', power: '2', toughness: '2', colors: ['U'] },
    );
    const g = game((b) =>
      b
        .define(MAGE)
        .seat(0)
        .hand(LIGHTNING, MAGE.name)
        .battlefield('Mountain')
        .battlefield('Island', { count: 2 })
        .seat(1)
        .battlefield(SPIDER),
    );
    g.act(0).cast(LIGHTNING, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(MAGE.name, { pay: true });
    resolveTop(g); // the creature spell
    g.expect.zone(MAGE.name, 'battlefield', { seat: 0 });
    resolveTop(g); // the enters trigger
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(SPIDER);
    g.passAll();
    g.expect.damage(SPIDER, 3);
    g.expect.life(1, 17);
  });
});

describe('"Whenever you cast a spell of the chosen type, copy that spell." (Reflections of Littjara)', () => {
  const ECHO = parsed(
    'SYNTHETIC Parsed Chosen Echo',
    'Enchantment',
    'As ~ enters, choose a creature type.\nWhenever you cast a creature spell of the chosen type, copy that spell.',
    { manaCost: '{3}{U}{U}', colors: ['U'] },
  );
  const WIZARD = parsed(
    'SYNTHETIC Parsed Echo Wizard',
    'Creature — Wizard',
    'When ~ enters, you gain 1 life.',
    { manaCost: '{1}{U}', power: '1', toughness: '1', colors: ['U'] },
  );

  test('the lowering is a cast trigger whose effect copies the triggering spell with no new targets', () => {
    expect(ECHO.faces[0]?.abilities.at(-1)).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', by: 'you' },
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'no' },
    });
  });

  const place = (b: Builder) =>
    b
      .define(ECHO)
      .define(WIZARD)
      .seat(0)
      .hand(WIZARD.name, 'Grizzly Bears')
      .battlefield(ECHO.name, { chosen: { creatureType: 'Wizard' } })
      .battlefield('Island', { count: 4 })
      .battlefield('Forest', { count: 2 });

  test('a creature spell of the chosen type is copied: the copy becomes a token and both enter', () => {
    const g = game(place);
    g.act(0).cast(WIZARD.name, { pay: true });
    g.expect.stack([`${ECHO.name} (ability)`, WIZARD.name]);
    resolveTop(g); // the copy trigger: no question, the copy has no new targets
    g.expect.pending('priority', 0);
    expect(copies(g)).toHaveLength(1);
    g.expect.stack([WIZARD.name, WIZARD.name]);
    // The copy is not cast: it triggers nothing and is not counted.
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(1);
    resolveTop(g); // the copy: a token that enters
    expect(g.find({ name: WIZARD.name, zone: 'battlefield' })).toHaveLength(1);
    g.passAll();
    expect(g.find({ name: WIZARD.name, zone: 'battlefield' })).toHaveLength(2);
    g.expect.life(0, 22);
    g.expect.invariants();
  });

  test('a creature spell of another type is not copied', () => {
    const g = game(place);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.expect.stack(['Grizzly Bears']);
  });
});
