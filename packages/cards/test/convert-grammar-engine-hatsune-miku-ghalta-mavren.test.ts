// Ghalta and Mavren (issue 145): the REAL Oracle text from the golden corpus, read through the grammar only (no override), defined in an engine scenario and played
// through applyAction. "Whenever you attack, choose one - Create a tapped and attacking X/X green Dinosaur creature token with trample, where X is the greatest power among
// other attacking creatures. / Create X 1/1 white Vampire creature tokens with lifelink, where X is the number of other attacking creatures."
// Pins: CR 508.1 and 603.2 (it triggers once for the declaration), CR 700.2 (a mode is chosen as the ability is put on the stack), CR 508.4 (a token put onto the battlefield
// attacking was never declared as an attacker), CR 107.3c (X is the amount the text names), CR 608.2h (X is read as the ability resolves).
import { readFileSync } from 'node:fs';
import { type CardDefinition, type GameState, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function find(name: string): GoldenCard {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return card;
}

function real(name: string): CardDefinition {
  const imported = importCard(fromGoldenCard(find(name)), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** The first face of a golden card with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = find(name);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const GHALTA = real('Ghalta and Mavren');
const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears'; // 2/2
const HAWK = "Healer's Hawk"; // 1/1

const game = (...others: readonly string[]) => {
  const g = scenario()
    .define(GHALTA)
    .seat(0)
    .library(...FILLER)
    .battlefield(GHALTA.name, ...others)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
};

/** The tokens of a name (a token is named for its creature types) on the battlefield. */
const tokens = (state: GameState, name: string) =>
  Object.values(state.objects).filter(
    (o) => o.zone === 'battlefield' && o.token !== null && o.token.characteristics.name === name,
  );

describe('Ghalta and Mavren', () => {
  test('the card is valid and its modal attack trigger reads as the engine shape', () => {
    expect(validateCard(GHALTA)).toEqual([]);
    const triggered = GHALTA.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(triggered).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
    });
    expect(JSON.stringify(triggered)).toContain('"enterAttacking"');
  });

  test('mode 1: a tapped Dinosaur attacks as big as the greatest OTHER attacker (Ghalta 12 does not count)', () => {
    const g = game(BEARS, HAWK);
    g.act(0).attack([GHALTA.name, BEARS, HAWK]);
    g.act(0).chooseModes(0);
    g.passAll();
    const [dino] = tokens(g.state, 'Dinosaur');
    expect(dino).toBeDefined();
    if (dino === undefined) return;
    g.expect.pt({ name: 'Dinosaur', zone: 'battlefield' }, 2, 2);
    g.expect.tapped({ name: 'Dinosaur', zone: 'battlefield' }, true);
    // CR 508.4: it is attacking, but it was never declared as an attacker.
    expect(g.state.combat?.attackers.some((a) => a.object === dino.id)).toBe(true);
    g.expect.invariants();
  });

  test('mode 1 with Ghalta attacking alone: X is 0 and the 0/0 token dies', () => {
    const g = game();
    g.act(0).attack([GHALTA.name]);
    g.act(0).chooseModes(0);
    g.passAll();
    expect(tokens(g.state, 'Dinosaur')).toHaveLength(0);
  });

  test('mode 2: one 1/1 lifelink Vampire for each OTHER attacking creature', () => {
    const g = game(BEARS, HAWK);
    g.act(0).attack([GHALTA.name, BEARS, HAWK]);
    g.act(0).chooseModes(1);
    g.passAll();
    const vampires = tokens(g.state, 'Vampire');
    expect(vampires).toHaveLength(2);
    for (const [nth, v] of vampires.entries()) {
      const ref = { name: 'Vampire', zone: 'battlefield' as const, nth };
      g.expect.pt(ref, 1, 1);
      // untapped and not attacking: only mode 1 puts a token into the combat
      g.expect.tapped(ref, false);
      expect(g.state.combat?.attackers.some((a) => a.object === v.id)).toBe(false);
    }
    g.expect.invariants();
  });

  test('mode 2 counts the creatures attacking now, not the batch: Ghalta alone makes none', () => {
    const g = game(BEARS);
    g.act(0).attack([GHALTA.name]);
    g.act(0).chooseModes(1);
    g.passAll();
    expect(tokens(g.state, 'Vampire')).toHaveLength(0);
  });

  test('it triggers once for the declaration and not for the token that entered attacking', () => {
    const g = game(BEARS);
    g.act(0).attack([GHALTA.name, BEARS]);
    g.act(0).chooseModes(0);
    g.passAll();
    expect(tokens(g.state, 'Dinosaur')).toHaveLength(1);
    g.expect.stack([]);
    expect(g.state.pending?.kind).not.toBe('chooseModes');
  });
});

describe('the wordings stay as unsupported as they should', () => {
  test.each([
    // "attacking" with no tapped
    'Whenever you attack, create an attacking X/X green Dinosaur creature token with trample, where X is the greatest power among other attacking creatures.',
    // outside an attack trigger an entering attacker has no combat to join
    'When ~ enters, create a tapped and attacking 2/2 green Dinosaur creature token.',
    // a count of permanents with no controller and no battlefield
    'Whenever you attack, create X 1/1 white Vampire creature tokens with lifelink, where X is the number of other creatures.',
  ])('%s', (text) => {
    expect(withText('Ghalta and Mavren', text).support.status).not.toBe('supported');
  });
});
