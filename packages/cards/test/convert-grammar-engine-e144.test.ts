// Issue 144: Roaming Throne (REAL, from the golden corpus), Broadside Bombardiers and Great Train Heist (REAL Oracle text, SYNTHETIC mana costs and stats), read through the grammar only and played through applyAction. CR 603.2d (a triggered ability that
// triggers an additional time), CR 607.2d (the creature type chosen as it enters is linked to the ability that names it). Stand-ins are SYNTHETIC with invented power
// and toughness.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const SMALL = { manaCost: '{1}', power: '1', toughness: '1' } as const;
const GOBLIN = parsed('SYNTHETIC Goblin', 'Creature — Goblin', '', SMALL);

describe('Roaming Throne (another creature you control of the chosen type triggers an additional time)', () => {
  const THRONE = real('Roaming Throne');
  const WIZARD = parsed(
    'SYNTHETIC Wizard',
    'Creature — Human Wizard',
    'When ~ enters, you gain 1 life.',
    SMALL,
  );
  const WARRIOR = parsed(
    'SYNTHETIC Warrior',
    'Creature — Human Warrior',
    'When ~ enters, you gain 1 life.',
    SMALL,
  );
  const GOLEM = parsed(
    'SYNTHETIC Golem',
    'Artifact Creature — Golem',
    'When ~ enters, you gain 1 life.',
    SMALL,
  );

  test('reads as a doubling of another creature of the chosen type of the controller (CR 603.2d)', () => {
    expect(
      THRONE.faces[0]?.abilities.find(
        (a) => a.kind === 'static' && a.static.kind === 'doubleTriggers',
      ),
    ).toMatchObject({
      static: {
        kind: 'doubleTriggers',
        subject: {
          kind: 'filter',
          other: true,
          filter: { controller: 'you', chosenType: true },
        },
      },
    });
  });

  const life = (name: string, chosen: string, opponentCasts = false) => {
    const g = scenario()
      .define(THRONE)
      .define(WIZARD)
      .define(WARRIOR)
      .define(GOLEM)
      .seat(0)
      .hand(...(opponentCasts ? [] : [name]))
      .battlefield(THRONE.name, { chosen: { creatureType: chosen } })
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .hand(...(opponentCasts ? [name] : []))
      .battlefield('Island', { count: 3 })
      .library(...FILLER)
      .at('precombatMain', { active: opponentCasts ? 1 : 0, turn: 1 })
      .build();
    const seat = opponentCasts ? 1 : 0;
    g.act(seat).cast(name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.invariants();
    return g.state.seats[seat]?.life;
  };

  test('another creature of the chosen type: its enters trigger happens twice', () => {
    expect(life(WIZARD.name, 'Wizard')).toBe(42);
  });

  test('a creature of another type: once', () => {
    expect(life(WARRIOR.name, 'Wizard')).toBe(41);
  });

  test('the Throne is the chosen type too, but its own triggers are not doubled ("another")', () => {
    // The Golem is a Golem like the Throne, which chose Golem: it is another creature of the chosen type.
    expect(life(GOLEM.name, 'Golem')).toBe(42);
  });

  test('a creature of the chosen type an opponent controls is not doubled', () => {
    expect(life(WIZARD.name, 'Wizard', true)).toBe(41);
  });

  test('no choice recorded: nothing is doubled', () => {
    const g = scenario()
      .define(THRONE)
      .define(WIZARD)
      .seat(0)
      .hand(WIZARD.name)
      .battlefield(THRONE.name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(WIZARD.name, { pay: true });
    g.passAll();
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(41);
  });
});

describe('Broadside Bombardiers (Boast, CR 702.142a: activate only if this creature attacked this turn and only once each turn)', () => {
  const BOMBER = parsed(
    'Broadside Bombardiers',
    'Creature — Goblin Pirate',
    "Menace, haste\nBoast — Sacrifice another creature or artifact: ~ deals damage equal to 2 plus the sacrificed permanent's mana value to any target. (Activate only if this creature attacked this turn and only once each turn.)",
    { manaCost: '{2}{R}', power: '3', toughness: '3' },
  );
  const GADGET = parsed('SYNTHETIC Gadget', 'Artifact', '', { manaCost: '{3}' });

  const game = () =>
    scenario()
      .define(BOMBER)
      .define(GADGET)
      .define(GOBLIN)
      .seat(0)
      .battlefield(BOMBER.name)
      .battlefield(GADGET.name, { label: 'gadget' })
      .battlefield(GOBLIN.name, { label: 'goblin' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('reads as an activated ability with an attacked-this-turn restriction and a once-a-turn limit', () => {
    expect(BOMBER.faces[0]?.abilities.find((a) => a.kind === 'activated')).toMatchObject({
      activateOnlyIf: { kind: 'thisAttackedThisTurn' },
      oncePerTurn: true,
    });
  });

  test('before it attacked, it cannot be activated', () => {
    const g = game();
    expect(() => g.act(0).activate(BOMBER.name, { targets: [{ player: 1 }] })).toThrow();
  });

  test('after it attacked: sacrificing an artifact of mana value 3 deals 2 + 3 damage', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BOMBER.name, target: { player: 1 } }]);
    g.act(0).activate(BOMBER.name, { targets: [{ player: 1 }] });
    g.act(0).choosePermanents('gadget');
    g.passAll();
    g.expect.life(1, 35);
    g.expect.invariants();
  });

  test('a creature of mana value 1 is sacrificed: 2 + 1 damage, and a second activation the same turn is refused', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BOMBER.name, target: { player: 1 } }]);
    g.act(0).activate(BOMBER.name, { targets: [{ player: 1 }] });
    g.act(0).choosePermanents('goblin');
    g.passAll();
    g.expect.life(1, 37);
    expect(() => g.act(0).activate(BOMBER.name, { targets: [{ player: 1 }] })).toThrow();
  });

  test('a creature that did not attack this turn cannot boast, even when another one did', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: GOBLIN.name, target: { player: 1 } }]);
    expect(() => g.act(0).activate(BOMBER.name, { targets: [{ player: 1 }] })).toThrow();
  });
});

describe('Great Train Heist (Spree, CR 702.172a: choose one or more modes and pay the cost of each as an additional cost)', () => {
  const HEIST = parsed(
    'Great Train Heist',
    'Instant',
    "Spree (Choose one or more additional costs.)\n+ {2}{R} — Untap all creatures you control. If it's your combat phase, there is an additional combat phase after this phase.\n+ {2} — Creatures you control get +1/+0 and gain first strike until end of turn.\n+ {R} — Choose target opponent. Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token.",
    { manaCost: '{R}' },
  );
  const spell = HEIST.faces[0]?.spell;

  const game = (lands: number) =>
    scenario()
      .define(HEIST)
      .define(GOBLIN)
      .seat(0)
      .hand(HEIST.name)
      .battlefield(GOBLIN.name, { label: 'one' })
      .battlefield(GOBLIN.name, { label: 'two' })
      .battlefield('Mountain', { count: lands })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const treasures = (g: ReturnType<typeof game>, seat: number) =>
    getView(g.state, seat).battlefield.filter(
      (o) => o.name === 'Treasure' && o.controller === seat,
    );

  test('reads as a modal spell with a mana cost on each of three modes, one or more chosen (CR 700.2h)', () => {
    expect(spell?.modes?.map((m) => m.cost)).toEqual([
      [{ kind: 'mana', symbols: ['2', 'R'] }],
      [{ kind: 'mana', symbols: ['2'] }],
      [{ kind: 'mana', symbols: ['R'] }],
    ]);
    expect(spell?.chooseModes).toMatchObject({ min: 1, max: 3 });
  });

  test('with only three lands the costs of all three modes cannot be paid: that set is not offered', () => {
    const g = game(4);
    g.act(0).cast(HEIST.name);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseModes');
    if (d?.kind !== 'chooseModes') return;
    // {R} base + {2}{R}: 4 mana; {R} + {2}: 3; {R} + {R}: 2; all three: {R}{2}{R}{2}{R} = 7, not offered.
    expect(d.sets).not.toContainEqual([0, 1, 2]);
    expect(d.sets).toContainEqual([0]);
    expect(d.sets).toContainEqual([1, 2]);
  });

  test('+{2}: creatures you control get +1/+0 and first strike until end of turn', () => {
    const g = game(5);
    g.act(0).cast(HEIST.name).modes(1).pay();
    g.passAll();
    g.expect.pt('one', 2, 1);
    g.expect.pt('two', 2, 1);
    g.expect.derived('one', { keywords: ['firstStrike'] });
    g.expect.invariants();
  });

  test('+{2}{R} in a main phase: creatures untap and no combat phase is added', () => {
    const g = game(5);
    g.act(0).cast(HEIST.name).modes(0).pay();
    g.passAll();
    expect(g.state.turn.addedPhases ?? []).toEqual([]);
  });

  test('+{2}{R} in the combat phase: the attackers untap and an additional combat phase follows (CR 500.8)', () => {
    const g = game(5);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'one', target: { player: 1 } },
      { attacker: 'two', target: { player: 1 } },
    ]);
    g.act(0).cast(HEIST.name).modes(0).pay();
    g.passAll();
    expect(g.state.turn.addedPhases?.map((p) => p.phase)).toEqual(['combat']);
    g.expect.invariants();
  });

  test('+{R}: a tapped Treasure for each creature that deals combat damage to the chosen player this turn', () => {
    const g = game(5);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'one', target: { player: 1 } },
      { attacker: 'two', target: { player: 1 } },
    ]);
    g.act(0)
      .cast(HEIST.name)
      .modes(2)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(0);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    const made = treasures(g, 0);
    expect(made).toHaveLength(2);
    expect(made.every((o) => o?.tapped === true)).toBe(true);
    g.expect.invariants();
  });

  test('+{R} cast before attackers: it lasts the whole turn, and damage to a planeswalker or a creature is not damage to the player', () => {
    const g = game(5);
    g.act(0)
      .cast(HEIST.name)
      .modes(2)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'one', target: { player: 1 } }]);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(1);
  });

  test('all three modes at once: every cost is paid (CR 700.2h) and every mode happens', () => {
    const g = game(9);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'one', target: { player: 1 } }]);
    g.act(0)
      .cast(HEIST.name)
      .modes(0, 1, 2)
      .targets([{ player: 1 }])
      .pay();
    g.passAll();
    g.expect.pt('one', 2, 1);
    expect(g.state.turn.addedPhases?.map((p) => p.phase)).toEqual(['combat']);
    g.advanceTo('combatDamage', { attack: false });
    g.passAll();
    expect(treasures(g, 0)).toHaveLength(1);
    // {R} + {2}{R} + {2} + {R}: seven of the nine Mountains.
    expect(
      getView(g.state, 0).battlefield.filter((o) => o.name === 'Mountain' && o.tapped),
    ).toHaveLength(7);
  });
});
