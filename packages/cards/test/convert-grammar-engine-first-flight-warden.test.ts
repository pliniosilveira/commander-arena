// Warden of Evos Isle (First Flight starter Commander decks): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in
// an engine scenario and is played through applyAction. The creature spells it is played with are SYNTHETIC stand-ins. Pins: CR 118.7a (only generic mana is reduced), CR 601.2f
// (the cost is determined with the spell's characteristics on the stack), CR 604.2 (a static ability of a permanent), CR 702.9a (flying).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const WARDEN = real('Warden of Evos Isle');
const FLYER = parsed('SYNTHETIC Cloud Bird', 'Creature — Bird', 'Flying', {
  manaCost: '{2}{U}',
  power: '1',
  toughness: '1',
  colors: ['U'],
});
const GROUND = parsed('SYNTHETIC Plain Mole', 'Creature — Mole', '', {
  manaCost: '{2}{U}',
  power: '1',
  toughness: '1',
  colors: ['U'],
});
const GLIDER = parsed('SYNTHETIC Glide Charm', 'Instant', 'Flying\nYou gain 1 life.', {
  manaCost: '{2}{U}',
  colors: ['U'],
});
const LORD = parsed(
  'SYNTHETIC Wing Lord',
  'Creature — Bird',
  'Creatures you control have flying.',
  {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  },
);

const FILLER = Array.from({ length: 10 }, () => 'Island');
const CARDS = [WARDEN, FLYER, GROUND, GLIDER, LORD];

function game(opts: {
  wardens?: number;
  mine?: readonly string[];
  theirs?: readonly string[];
  extra?: readonly string[];
  lands?: number;
}): ScenarioGame {
  const b = scenario();
  for (const c of CARDS) b.define(c);
  b.seat(0)
    .library(...FILLER)
    .hand(...(opts.mine ?? []))
    .battlefield('Island', { count: opts.lands ?? 4 });
  for (let i = 0; i < (opts.wardens ?? 0); i++) b.battlefield(WARDEN.name);
  for (const e of opts.extra ?? []) b.battlefield(e);
  b.seat(1)
    .library(...FILLER)
    .hand(...(opts.theirs ?? []))
    .battlefield('Island', { count: 4 });
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

const costOf = (g: ScenarioGame, name: string, seat = 0): readonly string[] | undefined =>
  getView(g.state, seat).seats[seat]?.hand?.find((o) => o.name === name)?.castCost;

describe('Warden of Evos Isle', () => {
  test('is valid and supported', () => {
    expect(validateCard(WARDEN)).toEqual([]);
  });

  test('a creature spell with flying costs {1} less; one without flying, or a noncreature spell with flying, does not', () => {
    const g = game({ wardens: 1, mine: [FLYER.name, GROUND.name, GLIDER.name] });
    expect(costOf(g, FLYER.name)).toEqual(['1', 'U']);
    expect(costOf(g, GROUND.name)).toEqual(['2', 'U']);
    expect(costOf(g, GLIDER.name)).toEqual(['2', 'U']);
  });

  test('a creature in hand does not have the flying a lord on the battlefield gives to creatures', () => {
    const g = game({ wardens: 1, mine: [GROUND.name], extra: [LORD.name] });
    expect(costOf(g, GROUND.name)).toEqual(['2', 'U']);
  });

  test("an opponent's creature spell with flying is not reduced", () => {
    const g = game({ wardens: 1, theirs: [FLYER.name] });
    expect(costOf(g, FLYER.name, 1)).toEqual(['2', 'U']);
  });

  test('only generic mana is reduced, and two Wardens stack', () => {
    expect(costOf(game({ wardens: 2, mine: [FLYER.name] }), FLYER.name)).toEqual(['U']);
    expect(costOf(game({ wardens: 3, mine: [FLYER.name] }), FLYER.name)).toEqual(['U']);
  });

  test('a flyer is cast for the reduced cost: two Islands tapped', () => {
    const g = game({ wardens: 1, mine: [FLYER.name], lands: 2 });
    g.expect.legal(0, { cast: FLYER.name });
    g.act(0).cast(FLYER.name, { pay: true });
    g.expect.stack([FLYER.name]);
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
    g.expect.invariants();
  });

  test('without a Warden the same flyer needs three lands', () => {
    const g = game({ mine: [FLYER.name], lands: 2 });
    g.expect.illegal(0, { cast: FLYER.name });
  });
});
