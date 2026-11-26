// Flint deck (issue 685), group 1: "an outlaw you control" and "another outlaw you control" as the subject of a trigger (CR 700.12): Rakish Crew and Vial Smasher, Gleeful Grenadier,
// read from their REAL Oracle text (fixtures/corpus/golden.jsonl) as cards with no override and run through applyAction. Three seats, so "each opponent" is every opponent
// (CR 102.2). The outlaws are SYNTHETIC copies of Rogues; the real Grizzly Bears is no outlaw.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const CREW = real('Rakish Crew');
const SMASHER = real('Vial Smasher, Gleeful Grenadier');
const ROGUE = parsed('SYNTHETIC Dock Rogue', 'Creature — Human Rogue', '', {
  manaCost: '{R}',
  power: '1',
  toughness: '1',
  colors: ['R'],
});
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Rakish Crew: whenever an outlaw you control dies, each opponent loses 1 life and you gain 1 life (CR 700.12, 603.10a)', () => {
  test('both cards are valid and read the subject as an outlaw you control', () => {
    expect(validateCard(CREW)).toEqual([]);
    expect(validateCard(SMASHER)).toEqual([]);
    expect(CREW.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { outlaw: true, controller: 'you' } },
    });
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(CREW)
      .define(ROGUE)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(BOLT)
      .pool('RR')
      .battlefield(CREW.name)
      .battlefield(ROGUE.name, { label: 'rogue' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER);

  test('an outlaw of yours dying drains every opponent', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['rogue']).pay();
    g.passAll();
    g.expect.zone(ROGUE.name, 'graveyard', { seat: 0 });
    g.expect.life(0, 21);
    g.expect.life(1, 19);
    g.expect.life(2, 19);
  });

  test('a creature that is no outlaw dying does nothing', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BOLT).targets(['bears']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(0, 20);
    g.expect.life(1, 20);
    g.expect.life(2, 20);
  });
});

describe('Vial Smasher: whenever another outlaw you control enters, 1 damage to target opponent (CR 700.12, 603.2)', () => {
  const table = () =>
    scenario({ seats: 3 })
      .define(SMASHER)
      .define(ROGUE)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(ROGUE.name, BEARS)
      .pool('RGG')
      .battlefield(SMASHER.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER);

  test('another outlaw entering pings the chosen opponent only', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(ROGUE.name).pay();
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone(ROGUE.name, 'battlefield', { seat: 0 });
    g.expect.life(1, 19);
    g.expect.life(2, 20);
  });

  test('a creature that is no outlaw entering does nothing', () => {
    const g = table().at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(BEARS).pay();
    g.passAll();
    g.expect.life(1, 20);
    g.expect.life(2, 20);
  });
});
