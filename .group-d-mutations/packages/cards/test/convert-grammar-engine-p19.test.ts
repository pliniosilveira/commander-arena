// Parsed text is only worth something if the engine runs it as written (stage P19). These tests import
// SYNTHETIC cards through the grammar (never through a fixture), define them in an engine scenario and play
// them through applyAction: the modal spells and abilities of the engine (D-105, D-114) written as Oracle
// text says them, "Choose one —" and its bullets as a spell, as a triggered ability and as an activated
// ability, answered with `chooseModes`. Every card name starts with "SYNTHETIC"; the Oracle text is the
// real text of a shape in reports/template-replay.md where the replay has one (cited in each describe;
// the replay's lines keep their bullets on lines of their own, as here) and SYNTHETIC otherwise, with
// bodies that are one plain effect so that what is tested is the choice of modes. No real card's text is
// claimed; the real cards used as targets (Grizzly Bears, Giant Spider, Sol Ring, Isamaru) are the
// engine's own fixtures.
import type { CardDefinition, ChooseModesDecision, TargetsDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const instant = (name: string, text: string) =>
  parsed(name, 'Instant', text, { manaCost: '{1}{R}', colors: ['R'] });
const sorcery = (name: string, text: string) =>
  parsed(name, 'Sorcery', text, { manaCost: '{1}{R}', colors: ['R'] });
const creature = (name: string, text: string) =>
  parsed(name, 'Creature — Bear', text, {
    manaCost: '{1}{G}',
    power: '2',
    toughness: '2',
    colors: ['G'],
  });
const artifact = (name: string, text: string) =>
  parsed(name, 'Artifact', text, { manaCost: '{2}' });

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const SOL_RING = 'Sol Ring';
const ISAMARU = 'Isamaru, Hound of Konda';

const game = (...cards: readonly CardDefinition[]) =>
  cards.reduce((builder, card) => builder.define(card), scenario());

const modes = (g: ScenarioGame): ChooseModesDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseModes') throw new Error(`expected chooseModes, got ${d?.kind}`);
  return d;
};
const targets = (g: ScenarioGame): TargetsDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
  return d;
};

/** Seat 0 holds `card` with plenty of mana and a library; seat 1 has Bears and Spider. */
function spellGame(card: CardDefinition, ...opposing: readonly string[]) {
  const b = game(card)
    .seat(0)
    .hand(card.name)
    .battlefield('Mountain', { count: 4 })
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1);
  for (const name of opposing) b.battlefield(name, { label: name });
  return b.build();
}

describe('a modal spell (CR 700.2, 700.2a, 601.2b; the charms and commands, replay lines "Choose one — • ~ deals 3 damage to target creature. • Destroy target artifact.")', () => {
  const CHARM = sorcery(
    'SYNTHETIC Parsed Charm',
    'Choose one —\n• ~ deals 3 damage to target creature.\n• Draw a card.\n• You gain 3 life.',
  );

  test('the lead line is the number of modes, and the bullets are the modes in printed order', () => {
    const [face] = CHARM.faces;
    expect(face?.spell?.chooseModes).toEqual({ min: 1, max: 1 });
    expect(face?.spell?.effect).toBeUndefined();
    expect(face?.spell?.targets).toBeUndefined();
    expect(face?.spell?.modes).toHaveLength(3);
  });

  test('the engine asks for the modes first, with the text of each bullet and the card named', () => {
    const g = spellGame(CHARM, BEARS);
    g.act(0).cast(CHARM.name);
    const d = modes(g);
    expect(d).toMatchObject({ purpose: 'spell', min: 1, max: 1, sets: [[0], [1], [2]] });
    expect(d.modes.map((m) => m.text)).toEqual([
      `${CHARM.name} deals 3 damage to target creature.`,
      'Draw a card.',
      'You gain 3 life.',
    ]);
    g.expect.invariants();
  });

  test('the damage mode asks for its target and runs, the others are not asked', () => {
    const g = spellGame(CHARM, BEARS);
    g.act(0).cast(CHARM.name).modes(0);
    expect(targets(g).specs.map((s) => [s.specId, s.mode])).toEqual([['t1', 0]]);
    g.act(0).chooseTargets(BEARS).payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('the draw mode and the life mode', () => {
    const draw = spellGame(CHARM, BEARS);
    draw.act(0).cast(CHARM.name, { modes: [1], pay: true });
    draw.pass();
    draw.pass();
    draw.expect.handSize(0, 1);
    draw.expect.life(0, 40);
    const gain = spellGame(CHARM, BEARS);
    gain.act(0).cast(CHARM.name, { modes: [2], pay: true });
    gain.pass();
    gain.pass();
    gain.expect.life(0, 43);
    gain.expect.handSize(0, 0);
    gain.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('"Choose two —" chooses two modes, each with its own targets, which are asked together under ids that never clash', () => {
    const card = instant(
      'SYNTHETIC Parsed Twin Charm',
      'Choose two —\n• ~ deals 2 damage to target creature.\n• Target creature gets +1/+1 until end of turn.\n• You gain 3 life.',
    );
    const g = spellGame(card, BEARS, SPIDER);
    expect(card.faces[0]?.spell?.chooseModes).toEqual({ min: 2, max: 2 });
    expect(card.faces[0]?.spell?.modes?.map((m) => m.targets?.map((t) => t.id))).toEqual([
      ['t1'],
      ['t2'],
      undefined,
    ]);
    g.act(0).cast(card.name);
    expect(modes(g)).toMatchObject({
      min: 2,
      max: 2,
      sets: [
        [0, 1],
        [0, 2],
        [1, 2],
      ],
    });
    g.act(0).chooseModes(0, 1);
    expect(targets(g).specs.map((s) => [s.specId, s.mode])).toEqual([
      ['t1', 0],
      ['t2', 1],
    ]);
    g.act(0).chooseTargets(BEARS, SPIDER).payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    // The spider got the counter-like bonus until end of turn and is still on the battlefield.
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('"Choose one or both —" is one or two of exactly two modes (replay: 1 card, "Choose one or both")', () => {
    const card = instant(
      'SYNTHETIC Parsed Both Charm',
      'Choose one or both —\n• Draw a card.\n• You gain 4 life.',
    );
    expect(card.faces[0]?.spell?.chooseModes).toEqual({ min: 1, max: 2 });
    const g = spellGame(card);
    g.act(0).cast(card.name);
    expect(modes(g)).toMatchObject({ min: 1, max: 2, sets: [[0], [1], [0, 1]] });
    g.act(0).chooseModes(0, 1).payAuto();
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 44);
  });

  test('"Choose one or more —" is one to all of the modes, four of them (replay: "Exile all artifacts. • Exile all creatures. ...")', () => {
    const card = sorcery(
      'SYNTHETIC Parsed Many Charm',
      'Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.',
    );
    expect(card.faces[0]?.spell?.chooseModes).toEqual({ min: 1, max: 4 });
    const g = spellGame(card, BEARS, SOL_RING);
    g.act(0).cast(card.name);
    expect(modes(g).sets).toHaveLength(15);
    g.act(0).chooseModes(0, 1).payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(SOL_RING, 'exile', { seat: 1 });
    g.expect.invariants();
  });

  test('a mode with no legal target cannot be chosen (CR 700.2a): the engine offers only the others', () => {
    const g = spellGame(CHARM);
    g.act(0).cast(CHARM.name);
    const d = modes(g);
    expect(d.modes.map((m) => m.legal)).toEqual([false, true, true]);
    expect(d.sets).toEqual([[1], [2]]);
  });

  test('the same mode is never chosen twice (CR 700.2d)', () => {
    const g = spellGame(CHARM, BEARS);
    g.act(0).cast(CHARM.name);
    expect(g.legalActions(0).some((a) => a.kind === 'chooseModes' && a.modes.length === 2)).toBe(
      false,
    );
  });

  test('a mode that reads X uses the one X of the spell', () => {
    const card = parsed(
      'SYNTHETIC Parsed X Charm',
      'Instant',
      'Choose one —\n• You gain X life.\n• Draw a card.',
      { manaCost: '{X}{R}', colors: ['R'] },
    );
    expect(card.faces[0]?.spell?.x).toBe(true);
  });
});

describe('"Choose one. If you control a commander as you cast ~, you may choose both instead." (CR 700.2, 903.3d; replay: 2 cards)', () => {
  const COMMAND = instant(
    'SYNTHETIC Parsed Command Charm',
    'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Draw a card.\n• You gain 3 life.',
  );

  test('lowers to `maxIf` with the controlCommander condition and both modes', () => {
    expect(COMMAND.faces[0]?.spell?.chooseModes).toEqual({
      min: 1,
      max: 1,
      maxIf: { condition: { kind: 'controlCommander' }, max: 2 },
    });
  });

  test('without a commander on the battlefield one mode is chosen', () => {
    const g = spellGame(COMMAND);
    g.act(0).cast(COMMAND.name);
    expect(modes(g)).toMatchObject({ min: 1, max: 1, sets: [[0], [1]] });
  });

  test('with a commander on the battlefield both may be chosen, and both run', () => {
    const g = game(COMMAND)
      .seat(0)
      .hand(COMMAND.name)
      .battlefield('Mountain', { count: 4 })
      .battlefield(ISAMARU, { commander: true })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(COMMAND.name);
    expect(modes(g)).toMatchObject({ min: 1, max: 2, sets: [[0], [1], [0, 1]] });
    g.act(0).chooseModes(0, 1).payAuto();
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 43);
  });
});

describe('"When ~ enters, choose one —" (CR 603.3c, 700.2b)', () => {
  const GREETER = creature(
    'SYNTHETIC Parsed Greeter',
    'When ~ enters, choose one —\n• You gain 3 life.\n• ~ deals 2 damage to target creature an opponent controls.',
  );

  function entered(...opposing: readonly string[]): ScenarioGame {
    const b = game(GREETER)
      .seat(0)
      .hand(GREETER.name)
      .battlefield('Forest', { count: 3 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1);
    for (const name of opposing) b.battlefield(name, { label: name });
    const g = b.build();
    g.act(0).cast(GREETER.name, { pay: true });
    g.pass();
    g.pass();
    return g;
  }

  test('the ability has the empty effect, the modes and the number to choose', () => {
    const ability = GREETER.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    if (ability?.kind !== 'triggered') throw new Error('no trigger');
    expect(ability.effect).toEqual({ kind: 'sequence', effects: [] });
    expect(ability.targets).toBeUndefined();
    expect(ability.chooseModes).toEqual({ min: 1, max: 1 });
    expect(ability.modes).toHaveLength(2);
  });

  test('the modes are asked as the ability goes on the stack, and the chosen one runs', () => {
    const g = entered(BEARS, SPIDER);
    expect(modes(g)).toMatchObject({ purpose: 'trigger', forTrigger: true, sets: [[0], [1]] });
    g.act(0).chooseModes(1);
    expect(targets(g).specs.map((s) => [s.specId, s.mode])).toEqual([['t1', 1]]);
    g.act(0).chooseTargets(BEARS);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(0, 40);
  });

  test('the life mode runs without a target', () => {
    const g = entered(BEARS);
    g.act(0).chooseModes(0);
    g.pass();
    g.pass();
    g.expect.life(0, 43);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('with no creature to hit only the life mode is legal: the engine chooses it', () => {
    const g = entered();
    g.expect.pending('priority', 0);
    g.pass();
    g.pass();
    g.expect.life(0, 43);
  });

  test('"Whenever ~ attacks, choose one —" is asked after the attack is declared', () => {
    const raider = creature(
      'SYNTHETIC Parsed Raider',
      'Whenever ~ attacks, choose one —\n• Draw a card.\n• ~ deals 1 damage to target creature an opponent controls.',
    );
    const g = game(raider)
      .seat(0)
      .battlefield(raider.name, { label: 'raider' })
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('raider', { player: 1 });
    expect(modes(g)).toMatchObject({ purpose: 'trigger', sets: [[0], [1]] });
    g.act(0).chooseModes(0);
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
  });

  test('a mode that says "it" of the entering creature means the creature itself', () => {
    const card = creature(
      'SYNTHETIC Parsed Grower',
      'When ~ enters, choose one —\n• Put a +1/+1 counter on it.\n• You gain 2 life.',
    );
    const g = game(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Forest', { count: 3 })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.pass();
    g.pass();
    g.act(0).chooseModes(0);
    g.pass();
    g.pass();
    g.expect.counters(card.name, { '+1/+1': 1 });
  });
});

describe('"{2}, {T}: Choose one —" (CR 602.2b, 700.2a)', () => {
  const TOTEM = artifact(
    'SYNTHETIC Parsed Totem',
    '{1}, {T}: Choose one —\n• Draw a card.\n• ~ deals 2 damage to target creature.\n• You gain 2 life.',
  );

  const totemGame = () =>
    game(TOTEM)
      .seat(0)
      .battlefield(TOTEM.name, { label: 'totem' })
      .battlefield('Mountain', { count: 2 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .build();

  test('the ability keeps its costs, has the empty effect and the modes', () => {
    const ability = TOTEM.faces[0]?.abilities.find((a) => a.kind === 'activated');
    if (ability?.kind !== 'activated') throw new Error('no activated ability');
    expect(ability.cost).toEqual([{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }]);
    expect(ability.effect).toEqual({ kind: 'sequence', effects: [] });
    expect(ability.chooseModes).toEqual({ min: 1, max: 1 });
    expect(ability.modes).toHaveLength(3);
  });

  test('the modes are asked first, then the target and the cost; the chosen mode runs', () => {
    const g = totemGame();
    g.act(0).activate('totem');
    expect(modes(g)).toMatchObject({ purpose: 'ability', sets: [[0], [1], [2]] });
    g.act(0).chooseModes(1);
    expect(targets(g).specs.map((s) => [s.specId, s.mode])).toEqual([['t1', 1]]);
    g.act(0).chooseTargets('bears').payAuto();
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a mode without a target goes straight to the cost', () => {
    const g = totemGame();
    g.act(0).activate('totem', { modes: [2], pay: true });
    g.pass();
    g.pass();
    g.expect.life(0, 42);
    g.expect.tapped('totem', true);
  });

  test('"Activate only as a sorcery." on a line after the bullets is not joined to the ability: the card is unsupported, never half-read', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Slow Totem',
        typeLine: 'Artifact',
        manaCost: '{2}',
        oracleText:
          '{T}: Choose one —\n• Draw a card.\n• You gain 2 life.\nActivate only as a sorcery.',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.stoppedAt)).toEqual([
      'Activate only as a sorcery.',
    ]);
  });
});
