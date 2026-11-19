// Omen cards (Tarkir: Dragonstorm, issue 103): the REAL Oracle text of Stormshriek Feral // Flush Out and Whirlwing Stormbrood // Dynamic Soar (fixtures/omen-cards.jsonl, the
// same records the golden corpus holds) goes through the grammar with no override, and the engine plays what comes out: the Omen half is cast from the hand and shuffled into
// its owner's library as it resolves, the creature half is cast normally, and "You may cast sorcery spells and Dragon spells as though they had flash." lets the controller of
// Whirlwing Stormbrood cast those spells at instant speed (CR 601.3b, 702.8a). The rule text for Omen was not available to check.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CARDS = parseGolden(
  readFileSync(new URL('./fixtures/omen-cards.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = CARDS.find((c) => c.name.startsWith(name));
  if (card === undefined) throw new Error(`${name} is not in the fixture`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FERAL = real('Stormshriek Feral');
const BROOD = real('Whirlwing Stormbrood');
const FERAL_NAME = FERAL.name;
const BROOD_NAME = BROOD.name;

describe('both cards read as supported', () => {
  test('the definitions are adventure-layout cards with an Omen second face the engine accepts', () => {
    for (const def of [FERAL, BROOD]) {
      expect(def.layout).toBe('adventure');
      expect(def.faces[1]?.subtypes).toEqual(['Omen']);
      expect(def.faces[1]?.types).toEqual(['sorcery']);
      expect(validateCard(def)).toEqual([]);
    }
  });

  test('the flash permission is a choice of sorcery spells and Dragon spells for its controller', () => {
    const ability = BROOD.faces[0]?.abilities.find(
      (a) => a.kind === 'static' && a.static.kind === 'castAsThoughFlash',
    );
    expect(ability).toMatchObject({
      static: {
        kind: 'castAsThoughFlash',
        spells: { controller: 'you', anyOf: [{ types: ['sorcery'] }, { subtypes: ['Dragon'] }] },
      },
    });
  });

  test('a sorcery second face without the Adventure or Omen subtype is still refused', () => {
    const first = CARDS[0];
    if (first === undefined) throw new Error('empty fixture');
    const stored = fromGoldenCard(first);
    const faces = stored.faces.map((f, i) => (i === 1 ? { ...f, typeLine: 'Sorcery' } : f));
    const imported = importCard({ ...stored, faces }, undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join(' ')).toContain('Adventure or Omen subtype');
  });
});

describe('the engine plays them', () => {
  test("Dynamic Soar: three +1/+1 counters, then the card is shuffled into its owner's library", () => {
    const g = scenario()
      .define(BROOD)
      .seat(0)
      .hand(BROOD_NAME)
      .library('Forest', 'Forest', 'Forest')
      .battlefield('Forest', 'Forest', 'Forest', 'Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast(BROOD_NAME, { face: 1, targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.pt('Grizzly Bears', 5, 5);
    g.expect.zone(BROOD_NAME, 'library', { seat: 0 });
    g.expect.noObject(BROOD_NAME, { zone: 'exile' });
    g.expect.noObject(BROOD_NAME, { zone: 'graveyard' });
    expect(g.events.some((e) => e.kind === 'libraryShuffled' && e.seat === 0)).toBe(true);
  });

  test('Flush Out: discard a card, if you do draw two, then the shuffle', () => {
    const g = scenario()
      .define(FERAL)
      .seat(0)
      .hand(FERAL_NAME, 'Plains')
      .library('Forest', 'Forest', 'Forest')
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(FERAL_NAME, { face: 1, pay: true });
    g.passAll();
    g.expect.zone(FERAL_NAME, 'library', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
  });

  test('Whirlwing Stormbrood lets its controller cast sorceries and Dragons at instant speed, not other creatures', () => {
    const g = scenario()
      .define(BROOD)
      .define(FERAL)
      .seat(0)
      .hand('Divination', 'Grizzly Bears', FERAL_NAME)
      .library('Island', 'Island')
      .battlefield(BROOD_NAME, 'Island', 'Island', 'Island', 'Island', 'Mountain', 'Mountain')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.legal(0, { cast: 'Divination' });
    g.expect.legal(0, { cast: FERAL_NAME, face: 0 });
    g.expect.legal(0, { cast: FERAL_NAME, face: 1 });
    g.expect.illegal(0, { cast: 'Grizzly Bears' });
  });

  test('Whirlwing Stormbrood has flash itself', () => {
    const g = scenario()
      .define(BROOD)
      .seat(0)
      .hand(BROOD_NAME)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    g.expect.legal(0, { cast: BROOD_NAME, face: 0 });
  });
});
