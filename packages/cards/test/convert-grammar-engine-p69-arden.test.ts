// The Bruna deck (issue 5), Arden Angel (D-941): "At the beginning of your upkeep, if ~ is in your graveyard, roll a four-sided die. If the result is 1, return ~ from your
// graveyard to the battlefield." The REAL card of the golden corpus, read through the grammar only and played through applyAction: the roll is one draw of the seeded
// generator of the state (CR 706.1a, SPEC 4.2), the card returns exactly when the die shows 1 (CR 706.3b), and the trigger works from the graveyard only (CR 113.6b, 113.6m).
import { readFileSync } from 'node:fs';
import { type CardDefinition, nextInt } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const ARDEN = real('Arden Angel');
const FILLER = Array.from({ length: 30 }, () => 'Plains');
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

/** Seat 0 at the beginning of its own upkeep, with the card in `zone`. */
function upkeep(seed: number, zone: 'graveyard' | 'battlefield' | 'hand' | 'exile') {
  const b = scenario()
    .define(ARDEN)
    .seed(seed)
    .seat(0)
    .life(20)
    .library(...FILLER);
  const placed =
    zone === 'graveyard'
      ? b.graveyard(ARDEN.name)
      : zone === 'battlefield'
        ? b.battlefield(ARDEN.name)
        : zone === 'hand'
          ? b.hand(ARDEN.name)
          : b.exile(ARDEN.name);
  const g = placed
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  g.advanceTo('upkeep', { turn: 'next' });
  g.expect.step('upkeep', { active: 0 });
  return g;
}

describe('Arden Angel', () => {
  test('is a 4/4 flier whose graveyard trigger rolls a four-sided die', () => {
    const face = ARDEN.faces[0];
    expect(face?.power).toBe(4);
    expect(face?.toughness).toBe(4);
    expect(face?.abilities).toMatchObject([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: { kind: 'thisInYourGraveyard' },
        functionsIn: 'graveyard',
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'rollDie', sides: 4 }, { kind: 'conditional' }],
        },
      },
    ]);
  });

  test('in the graveyard it rolls one die at my upkeep and returns exactly when the die shows 1', () => {
    let back = 0;
    let stayed = 0;
    for (const seed of SEEDS) {
      const g = upkeep(seed, 'graveyard');
      const want = (nextInt(g.state.rng, 4)[0] ?? -1) + 1;
      expect(g.state.stack).toHaveLength(1);
      g.passAll();
      const rolled = g.events.filter((e) => e.kind === 'dieRolled');
      expect(rolled).toEqual([{ kind: 'dieRolled', seat: 0, sides: 4, result: want }]);
      if (want === 1) {
        g.expect.zone(ARDEN.name, 'battlefield', { seat: 0 });
        back += 1;
      } else {
        g.expect.zone(ARDEN.name, 'graveyard', { seat: 0 });
        stayed += 1;
      }
      g.expect.invariants();
    }
    // About a quarter of the seeds bring it back; both outcomes are reached.
    expect(back).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(back);
  });

  test('the same seed gives the same game, and one roll uses one draw of the generator', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a = upkeep(seed, 'graveyard');
      const b = upkeep(seed, 'graveyard');
      const after = nextInt(a.state.rng, 4)[1];
      a.passAll();
      b.passAll();
      expect(a.hash()).toBe(b.hash());
      expect(a.state.rng).toEqual(after);
    }
  });

  test('on the battlefield, in hand or in exile it does not roll', () => {
    for (const zone of ['battlefield', 'hand', 'exile'] as const) {
      const g = upkeep(1, zone);
      expect(g.state.stack, zone).toHaveLength(0);
      g.passAll();
      expect(
        g.events.filter((e) => e.kind === 'dieRolled'),
        zone,
      ).toEqual([]);
    }
  });

  test('at the opponent\'s upkeep nothing happens ("your upkeep")', () => {
    const g = scenario()
      .define(ARDEN)
      .seed(1)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .graveyard(ARDEN.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('upkeep');
    g.expect.step('upkeep', { active: 1 });
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    expect(g.events.filter((e) => e.kind === 'dieRolled')).toEqual([]);
  });
});
