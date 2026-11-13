// The Hashaton deck (issue 31), group 4 (D-1120 to D-1124): the REAL Oracle text of Gleaming Overseer and Enter the Avatar State (the corpus's golden.jsonl, taken from the
// issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the
// real text are what the engine runs. The helper cards are SYNTHETIC (src/cards/fixtures) or old fixtures. Pins: CR 701.47a (amass), CR 111.4 (a token is named for its
// subtypes), CR 205.1b and 613.1d (a type in addition to the others), CR 613.1f (the keywords), CR 702.11b (hexproof), CR 702.111b (menace), CR 611.2a (until end of turn).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FOUR = ['flying', 'firstStrike', 'lifelink', 'hexproof'];

describe('Gleaming Overseer: "When this creature enters, amass Zombies 1." and "Zombie tokens you control have hexproof and menace."', () => {
  const overseer = real('Gleaming Overseer');
  const OVERSEER = overseer.name;

  const start = (board: readonly string[] = [], theirs: readonly string[] = []) =>
    scenario()
      .define(overseer)
      .seat(0)
      .hand(OVERSEER)
      .battlefield('Island', 'Swamp', 'Swamp', ...board)
      .library(...FILLER)
      .seat(1)
      .hand(...theirs)
      .battlefield(...(theirs.length > 0 ? ['Mountain'] : []))
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const mine = (g: ReturnType<typeof start>) =>
    getView(g.state, 0).battlefield.filter((o) => o.controller === 0);

  test('the card is valid', () => {
    expect(validateCard(overseer)).toEqual([]);
  });

  test('with no Army: a 0/0 black Zombie Army token gets one +1/+1 counter and is a 1/1 with hexproof and menace', () => {
    const g = start();
    g.act(0).cast(OVERSEER, { pay: true });
    g.passAll();
    g.passAll();
    const [token, ...others] = mine(g).filter((o) => o.isToken);
    expect(others).toEqual([]);
    expect(token).toMatchObject({
      name: 'Zombie Army',
      types: ['creature'],
      colors: ['B'],
      power: 1,
      toughness: 1,
      counters: { '+1/+1': 1 },
    });
    expect(token?.subtypes).toEqual(['Zombie', 'Army']);
    g.expect.derived('Zombie Army', { keywords: ['hexproof', 'menace'] });
    // Gleaming Overseer is a Zombie, but not a token: it has neither.
    g.expect.derived(OVERSEER, { keywords: [] });
    g.expect.invariants();
  });

  test('the opponent cannot target the token, but can target the Overseer itself (hexproof)', () => {
    const g = start([], [BOLT]);
    g.act(0).cast(OVERSEER, { pay: true });
    g.passAll();
    // The trigger resolves, then seat 0 passes with an empty stack and seat 1 has priority.
    g.act(0).pass();
    g.act(1).pass();
    g.act(0).pass();
    g.act(1).cast(BOLT);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    const token = mine(g).find((o) => o.isToken);
    expect(legal.some((t) => t.kind === 'object' && t.id === token?.id)).toBe(false);
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(OVERSEER))).toBe(true);
  });

  test('with an Army already (a SYNTHETIC Army creature): no token; the Army gets the counter and becomes a Zombie, with no keywords as it is no token', () => {
    const g = start(['SYNTHETIC Orc Army Veteran']);
    g.act(0).cast(OVERSEER, { pay: true });
    g.passAll();
    g.passAll();
    expect(mine(g).filter((o) => o.isToken)).toEqual([]);
    g.expect.counters('SYNTHETIC Orc Army Veteran', { '+1/+1': 1 });
    g.expect.derived('SYNTHETIC Orc Army Veteran', {
      subtypes: ['Orc', 'Army', 'Zombie'],
      keywords: [],
    });
  });
});

describe('Enter the Avatar State: "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof."', () => {
  const avatar = real('Enter the Avatar State');
  const AVATAR = avatar.name;

  const start = () =>
    scenario()
      .define(avatar)
      .seat(0)
      .hand(AVATAR)
      .battlefield('Plains', BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(avatar)).toEqual([]);
  });

  test('the target becomes an Avatar besides its other types and has the four keywords; the other creatures do not', () => {
    const g = start();
    g.act(0).cast(AVATAR, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.derived(
      { name: BEARS, seat: 0 },
      { types: ['creature'], subtypes: ['Bear', 'Avatar'], keywords: FOUR },
    );
    g.expect.derived({ name: BEARS, seat: 1 }, { subtypes: ['Bear'], keywords: [] });
    g.expect.invariants();
  });
});
