// Eidolon of Countless Battles (Bestow): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and
// is played through applyAction: cast for its bestow cost on a creature, resolved, and left unattached when its target is illegal or its host dies.
// Pins: CR 702.103 (Bestow; the rules text was not available, so the subrule letters are unchecked), CR 118.9 (an alternative cost), CR 303.4a and 608.3c (an Aura spell
// targets and enters attached), CR 611.3a and 613.4c (a "+1/+1 for each" follows the board), CR 205.1a (a creature that is not one has no creature types).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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

const EIDOLON = real('Eidolon of Countless Battles');
const NAME = EIDOLON.name;
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

test('the card is valid and lowers to a bestow cost and two counted boosts for itself and its host', () => {
  expect(validateCard(EIDOLON)).toEqual([]);
  const face = EIDOLON.faces[0];
  expect(face?.alternativeCosts).toEqual([
    { kind: 'bestow', cost: [{ kind: 'mana', symbols: ['2', 'W', 'W'] }] },
  ]);
  const statics = face?.abilities.filter((a) => a.kind === 'static') ?? [];
  expect(statics).toHaveLength(2);
  for (const a of statics) {
    expect(a).toMatchObject({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'attached', types: ['creature'], andThis: true },
      },
    });
  }
});

describe('cast for its mana cost: a creature that counts', () => {
  test('0/0 plus one for each creature you control (itself included) and none for Auras', () => {
    const g = scenario()
      .define(EIDOLON)
      .seat(0)
      .hand(NAME)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    // Two creatures: Bears and itself.
    g.expect.pt(NAME, 2, 2);
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('cast for its bestow cost (CR 702.103)', () => {
  const build = () =>
    scenario()
      .define(EIDOLON)
      .seat(0)
      .hand(NAME)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();

  test('the bestow option costs {2}{W}{W} and is its own cast', () => {
    const g = build();
    g.expect.legal(0, { cast: NAME });
    g.expect.legal(0, { cast: NAME, alternative: 'bestow' });
  });

  test('on a creature: it is an Aura, not a creature, and the host gets +1/+1 for each creature and each Aura', () => {
    const g = build();
    g.act(0).cast(NAME, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(NAME, BEARS);
    // One creature (Bears, the Aura is not one) and one Aura: Bears 2/2 + 2.
    g.expect.pt(BEARS, 4, 4);
    g.expect.invariants();
  });

  test('the host dies in response: it resolves as a creature and counts itself', () => {
    const g = build();
    g.act(0).cast(NAME, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    expect(g.object(NAME).attachedTo).toBeNull();
    g.expect.pt(NAME, 1, 1);
    g.expect.invariants();
  });

  test('the host dies later: the permanent becomes a creature and stays', () => {
    const g = scenario()
      .define(EIDOLON)
      .seat(0)
      .hand(NAME)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', { count: 2 })
      .build();
    g.act(0).cast(NAME, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [BEARS], pay: true });
    g.act(1).cast(`${BOLT}[0]`, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.noObject(NAME, { zone: 'graveyard' });
    g.expect.pt(NAME, 1, 1);
    g.expect.invariants();
  });
});
