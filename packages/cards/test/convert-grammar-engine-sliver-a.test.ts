// The Sliver Swarm deck (issue 133), group A: the real Brood Sliver, Synapse Sliver, Diffusion Sliver and Shifting Sliver (the golden corpus holds all four) go through the grammar with
// no override (NO_OVERRIDES), are validated, and are played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 603.2 (a trigger for each Sliver that deals combat damage, whoever controls it), CR 109.4 and 608.2d ("its controller" is the player asked, and acts: the token is theirs, CR
// 111.2), CR 702.21a and 118.12a (the Ward shape written out: the controller of the spell or ability may pay {2}, or it is countered), CR 509.1b (an evasion restriction on every Sliver).
// The board is the engine's own fixtures (Grizzly Bears, Lightning Bolt, the basic lands) and a SYNTHETIC vanilla Sliver.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BROOD = real('Brood Sliver');
const SYNAPSE = real('Synapse Sliver');
const DIFFUSION = real('Diffusion Sliver');
const SHIFTING = real('Shifting Sliver');
const VANILLA = parsed('SYNTHETIC Vanilla Sliver', 'Creature — Sliver', 'Vigilance', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('all four cards are supported and validate', () => {
  test.each([BROOD, SYNAPSE, DIFFUSION, SHIFTING])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Brood Sliver: "Whenever a Sliver deals combat damage to a player, its controller may create a 1/1 colorless Sliver creature token."', () => {
  test('the lowering: any Sliver, damage to a player, the controller of that Sliver is asked', () => {
    const json = JSON.stringify(BROOD.faces[0]?.abilities);
    expect(json).toContain('"dealsCombatDamage"');
    expect(json).toContain('"playersMay"');
    expect(json).toContain('"controllerOf"');
    expect(json).toContain('"triggerSubject"');
  });

  const board = (attacker: 0 | 1) =>
    scenario()
      .define(BROOD)
      .define(VANILLA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BROOD.name)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA.name)
      .at('precombatMain', { active: attacker, turn: 1 })
      .build();

  test('a Sliver of the controller connects: the controller may create the token, and it is theirs', () => {
    const g = board(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BROOD.name, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Sliver', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt({ name: 'Sliver', seat: 0 }, 1, 1);
    g.expect.derived({ name: 'Sliver', seat: 0 }, { colors: [], subtypes: ['Sliver'] });
  });

  test('declining creates nothing', () => {
    const g = board(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BROOD.name, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.act(0).decline();
    g.expect.noObject('Sliver', { zone: 'battlefield' });
  });

  test("an opponent's Sliver connects: that opponent is asked, and the token is theirs (CR 111.2)", () => {
    const g = board(1);
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: VANILLA.name, seat: 1 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.zone('Sliver', 'battlefield', { seat: 1, count: 1 });
    g.expect.noObject('Sliver', { zone: 'battlefield', seat: 0 });
  });

  test('a creature that is not a Sliver does not trigger it', () => {
    const g = board(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 38);
    g.expect.pending('priority');
    g.expect.noObject('Sliver', { zone: 'battlefield' });
  });
});

describe('Synapse Sliver: "Whenever a Sliver deals combat damage to a player, its controller may draw a card."', () => {
  const board = (attacker: 0 | 1) =>
    scenario()
      .define(SYNAPSE)
      .define(VANILLA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SYNAPSE.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA.name)
      .at('precombatMain', { active: attacker, turn: 1 })
      .build();

  test('the controller of the Sliver that connected may draw', () => {
    const g = board(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: SYNAPSE.name, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
  });

  test("an opponent's Sliver: that opponent draws, not the controller of Synapse Sliver", () => {
    const g = board(1);
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: VANILLA.name, seat: 1 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 0);
  });

  test('declining draws nothing', () => {
    const g = board(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: SYNAPSE.name, seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.act(0).decline();
    g.expect.handSize(0, 0);
  });
});

describe('"its controller may" is read for other wordings and refused where it would be guessed', () => {
  test('"that creature\'s controller may draw a card" says the same', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Curious Sliver',
        typeLine: 'Creature — Sliver',
        manaCost: '{2}{U}',
        oracleText:
          "Whenever a Sliver deals combat damage to a player, that creature's controller may draw a card.",
        power: '1',
        toughness: '1',
      }),
    );
    expect(imported.support.status).toBe('supported');
  });

  test('a "for each creature you control" count stays unread: "you" would be the asked player', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Greedy Sliver',
        typeLine: 'Creature — Sliver',
        manaCost: '{2}{U}',
        oracleText:
          'Whenever a Sliver deals combat damage to a player, its controller may draw a card for each creature you control.',
        power: '1',
        toughness: '1',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('Diffusion Sliver: "Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}."', () => {
  test('the lowering: a trigger about a Sliver you control targeted by an opponent, Ward-style counter', () => {
    const abilities = DIFFUSION.faces[0]?.abilities ?? [];
    expect(abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: expect.objectContaining({ kind: 'becomesTarget', by: 'opponent' }),
      }),
    );
    expect(JSON.stringify(abilities)).toContain(
      '"effect":{"kind":"counterUnlessPays","objects":{"kind":"triggerSubject"}',
    );
  });

  // Seat 0 (active, with priority) holds Bolts and Mountains; seat 1 has Diffusion Sliver and a Grizzly Bears.
  const board = (mountains: number) =>
    scenario()
      .define(DIFFUSION)
      .seat(0)
      .hand(BOLT, { label: 'bolt1' })
      .hand(BOLT, { label: 'bolt2' })
      .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
      .library(...LIBRARY)
      .seat(1)
      .battlefield(DIFFUSION.name, { label: 'sliver' })
      .battlefield(BEARS)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const askPay = (g: ScenarioGame) => {
    g.act(0).cast('bolt1', { targets: ['sliver'], pay: true });
    g.passAll();
  };

  test('targeting the Sliver asks the caster of the spell, not the controller of Diffusion Sliver', () => {
    const g = board(3);
    askPay(g);
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2'] }]);
    g.expect.stack([`${DIFFUSION.name} (ability)`, BOLT]);
  });

  test('paying {2} lets the spell resolve: the Sliver takes the damage and dies', () => {
    const g = board(3);
    askPay(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.noEvent({ kind: 'countered' });
    g.passAll();
    g.expect.zone(DIFFUSION.name, 'graveyard', { seat: 1 });
  });

  test('declining counters the spell: the Sliver is unharmed', () => {
    const g = board(3);
    askPay(g);
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.zone(DIFFUSION.name, 'battlefield', { seat: 1 });
    g.expect.damage({ name: DIFFUSION.name, seat: 1 }, 0);
  });

  test('a creature that is not a Sliver does not trigger it', () => {
    const g = board(3);
    g.act(0).cast('bolt1', { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('"that spell" is only said of a trigger about spells', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Spell-Only Sliver',
        typeLine: 'Creature — Sliver',
        manaCost: '{1}{U}',
        oracleText:
          'Whenever ~ becomes the target of a spell, counter that spell unless its controller pays {1}.',
        power: '1',
        toughness: '1',
      }),
    );
    expect(imported.support.status).toBe('supported');
    // "that spell" is only said of a trigger about spells: with "or ability" in the trigger it is not read.
    const both = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Both Sliver',
        typeLine: 'Creature — Sliver',
        manaCost: '{1}{U}',
        oracleText:
          'Whenever ~ becomes the target of a spell or ability, counter that spell unless its controller pays {1}.',
        power: '1',
        toughness: '1',
      }),
    );
    expect(both.support.status).toBe('unsupported');
  });

  test('"counter that spell or ability" outside a trigger about becoming a target is not read', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Misplaced Counter',
        typeLine: 'Creature — Sliver',
        manaCost: '{1}{U}',
        oracleText:
          'Whenever you cast a spell, counter that spell or ability unless its controller pays {2}.',
        power: '1',
        toughness: '1',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('Shifting Sliver: "Slivers can\'t be blocked except by Slivers."', () => {
  test('the lowering: every Sliver, blockers that are not Slivers cannot block it', () => {
    const json = JSON.stringify(SHIFTING.faces[0]?.abilities);
    expect(json).toContain('"cantBeBlockedBy"');
    expect(json).toContain('"notSubtypes":["Sliver"]');
  });

  const board = (attacker: 0 | 1) =>
    scenario()
      .define(SHIFTING)
      .define(VANILLA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SHIFTING.name, { label: 'shifting' })
      .battlefield(BEARS, { label: 'myBears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA.name, { label: 'theirSliver' })
      .battlefield(BEARS, { label: 'theirBears' })
      .at('precombatMain', { active: attacker, turn: 1 })
      .build();

  test('a Sliver attacking can be blocked by a Sliver and by nothing else', () => {
    const g = board(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('shifting');
    g.passAll();
    g.expect.canBlock('theirBears', 'shifting', false);
    g.expect.canBlock('theirSliver', 'shifting', true);
  });

  test("it covers every Sliver, whoever controls it: an opponent's Sliver is blocked by Slivers only", () => {
    const g = board(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('theirSliver');
    g.passAll();
    g.expect.canBlock('myBears', 'theirSliver', false);
    g.expect.canBlock('shifting', 'theirSliver', true);
  });

  test('a creature that is not a Sliver is blocked as usual', () => {
    const g = board(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('myBears');
    g.passAll();
    g.expect.canBlock('theirBears', 'myBears', true);
  });
});
