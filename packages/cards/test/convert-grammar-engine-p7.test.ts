// Parsed text is only worth something if the engine runs it as written (stage P7a). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: a Fog read from text stopping combat damage
// (CR 615.1, 615.6), a shield "to you" against a Lightning Bolt (CR 615.1), a shield of 3 absorbing
// two spells (CR 615.7), a shield to and by one creature (CR 609.7a) and one to you and the creatures
// you control (CR 611.2c). Every card name starts with "SYNTHETIC"; the Oracle text is template text
// from the corpus backlog (reports/backlog.md) or marked SYNTHETIC where no real line has the shape.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario, type TargetRef } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

/** Imports a white instant through the grammar only, and requires that it is fully supported. */
function shieldSpell(name: string, text: string, manaCost = '{W}'): CardDefinition {
  const imported = parseOnly(
    syntheticCard({ name, typeLine: 'Instant', oracleText: text, manaCost, colors: ['W'] }),
  );
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FOG = shieldSpell(
  'SYNTHETIC Parsed Fog',
  'Prevent all combat damage that would be dealt this turn.',
);
const SELF_WARD = shieldSpell(
  'SYNTHETIC Parsed Self Ward',
  'Prevent all damage that would be dealt to you this turn.',
  '{1}{W}',
);
const SHIELD3 = shieldSpell(
  'SYNTHETIC Parsed Shield Three',
  'Prevent the next 3 damage that would be dealt to any target this turn.',
);
const STANDOFF = shieldSpell(
  'SYNTHETIC Parsed Standoff',
  'Prevent all combat damage that would be dealt to and dealt by target creature this turn.',
  '{1}{W}',
);
const HOUSEHOLD = shieldSpell(
  'SYNTHETIC Parsed Household Ward',
  'Prevent all damage that would be dealt to you and creatures you control this turn.',
  '{1}{W}',
);

const BEARS = 'Grizzly Bears'; // 2/2
const BOLT = 'Lightning Bolt';
const BOLT2 = 'SYNTHETIC Bolt Two'; // 2 damage to each opponent, then you gain 2 life
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

/** Seat 0 attacks with `attackers`, seat 1 blocks as told and then holds priority (Fog window). */
function toFogWindow(
  g: G,
  attackers: readonly string[],
  blocks: readonly { blocker: string; attacker: string }[] = [],
): void {
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers(blocks);
  g.act(0).pass();
}

/** Casts a card from the hand of `seat`, paying with the planner. */
function cast(g: G, seat: 0 | 1, card: string, targets?: readonly TargetRef[]): void {
  if (g.state.pending?.kind === 'priority' && g.deciding !== seat && g.state.stack.length === 0) {
    g.pass();
  }
  g.act(seat).cast(`${card}[0]`, { pay: true, ...(targets === undefined ? {} : { targets }) });
}

describe('a Fog read from text: "Prevent all combat damage that would be dealt this turn."', () => {
  function fogged() {
    const g = scenario()
      .define(FOG)
      .seat(0)
      .battlefield(V33, V22)
      .seat(1)
      .life(10)
      .battlefield('Plains', BEARS)
      .hand(FOG.name)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V33, V22], [{ blocker: BEARS, attacker: V22 }]);
    cast(g, 1, FOG.name);
    g.passAll();
    g.advanceTo('endOfCombat');
    return g;
  }

  test('the parsed spell is the engine fixture, which is what the other tests then play', () => {
    expect(FOG.faces[0]?.spell?.effect).toEqual({
      kind: 'preventDamage',
      scope: 'combat',
      amount: 'all',
      to: { kind: 'any' },
      duration: 'untilEndOfTurn',
    });
  });

  test('no combat damage is dealt either way: the player, the attacker and the blocker are untouched', () => {
    const g = fogged();
    g.expect.life(1, 10);
    g.expect.damage(BEARS, 0);
    g.expect.damage(V22, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(FOG.name, 'graveyard', { seat: 1 });
  });

  test('it does not cover spell damage: a Lightning Bolt the same turn still hurts', () => {
    const g = scenario()
      .define(FOG)
      .seat(0)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield('Plains')
      .hand(FOG.name)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, FOG.name);
    g.passAll();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('"Prevent all damage that would be dealt to you this turn." against a Lightning Bolt', () => {
  function board() {
    return scenario()
      .define(SELF_WARD)
      .seat(0)
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .seat(1)
      .life(20)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(SELF_WARD.name)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
  }

  test('a Bolt at the player is prevented: the life total does not move', () => {
    const g = board();
    cast(g, 1, SELF_WARD.name);
    g.passAll();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('the player is protected and the creatures are not: a Bolt at the Bears kills them', () => {
    const g = board();
    cast(g, 1, SELF_WARD.name);
    g.passAll();
    cast(g, 0, BOLT, [BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});

describe('"Prevent the next 3 damage that would be dealt to any target this turn." absorbs twice (CR 615.7)', () => {
  test('a Bolt Two takes 2 of the shield, the next takes the last 1 and deals 1, the third deals all', () => {
    const g = scenario()
      .define(SHIELD3)
      .seat(0)
      .battlefield('Plains', 'Mountain', 'Mountain', 'Mountain')
      .hand(SHIELD3.name)
      .hand(BOLT2, { count: 3 })
      .seat(1)
      .build();
    cast(g, 0, SHIELD3.name, [{ player: 1 }]);
    g.passAll();
    cast(g, 0, BOLT2);
    g.passAll();
    g.expect.life(1, 40);
    cast(g, 0, BOLT2);
    g.passAll();
    g.expect.life(1, 39);
    cast(g, 0, BOLT2);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('the same shield on a creature protects the creature, not its controller', () => {
    const g = scenario()
      .define(SHIELD3)
      .seat(0)
      .battlefield('Plains', 'Mountain', 'Mountain')
      .hand(SHIELD3.name)
      .hand(BOLT, { count: 2 })
      .seat(1)
      .battlefield(BEARS)
      .build();
    cast(g, 0, SHIELD3.name, [BEARS]);
    g.passAll();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
    cast(g, 0, BOLT, [BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
  });
});

describe('"... dealt to and dealt by target creature ..." is two shields on one target (CR 609.7a)', () => {
  test('a blocked attacker and its blocker deal and take nothing, an unblocked creature still hits', () => {
    const g = scenario()
      .define(STANDOFF)
      .seat(0)
      .battlefield(V33, V22)
      .seat(1)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(STANDOFF.name)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V33, V22], [{ blocker: BEARS, attacker: V33 }]);
    cast(g, 1, STANDOFF.name, [BEARS]);
    g.passAll();
    g.advanceTo('endOfCombat');
    // The Bears were dealt no damage by the 3/3 and dealt none back.
    g.expect.damage(BEARS, 0);
    g.expect.damage(V33, 0);
    // The creature nobody blocked deals its damage: the shield is about the Bears only.
    g.expect.life(1, 38);
  });
});

describe('"... dealt to you and creatures you control ..." covers the player and the creatures (CR 611.2c)', () => {
  test('a Bolt at the player and a Bolt at a creature are both prevented, the opponent is not protected', () => {
    const g = scenario()
      .define(HOUSEHOLD)
      .seat(0)
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .seat(1)
      .life(20)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(HOUSEHOLD.name)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, HOUSEHOLD.name);
    g.passAll();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 20);
    cast(g, 0, BOLT, [BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
  });
});
