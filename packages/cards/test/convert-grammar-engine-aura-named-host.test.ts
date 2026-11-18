// Issue 89 (Silverquill Influence): the real Forum Filibuster and the real Gift of Immortality (the golden corpus holds both) go through the grammar with no override (NO_OVERRIDES),
// are validated, and are played through applyAction, so the nodes the parser writes are what the engine runs.
// Pins: CR 603.12 (a reflexive ability: its target is chosen as it goes on the stack, and it knows the token the resolution before it made), CR 303.4f and 303.4g (an Aura or
// Equipment put onto the battlefield attached to the object the effect names; an Aura that cannot enchant it stays), CR 603.7c and 400.7 (the delayed ability is about the creature
// that came back, a new object, and the Aura's own card), CR 603.10a (the "dies" ability looks back).
// The board is the engine's own fixtures (Grizzly Bears, Lightning Bolt, the basic lands) and SYNTHETIC cards made from the real wording of an Aura and an Equipment.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const FILIBUSTER = real('Forum Filibuster');
const GIFT = real('Gift of Immortality');
const BOOST = parsed(
  'SYNTHETIC Boost Aura',
  'Enchantment — Aura',
  'Enchant creature\nEnchanted creature gets +2/+2.',
  { manaCost: '{1}{W}', colors: ['W'] },
);
const LAND_AURA = parsed('SYNTHETIC Land Aura', 'Enchantment — Aura', 'Enchant land', {
  manaCost: '{W}',
  colors: ['W'],
});
const BLADE = parsed(
  'SYNTHETIC Blade',
  'Artifact — Equipment',
  'Equipped creature gets +1/+1.\nEquip {1}',
  { manaCost: '{1}' },
);
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('both cards are supported and validate', () => {
  test.each([FILIBUSTER, GIFT])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Forum Filibuster: "create a 2/1 Inkling token. When you do, return up to one target Aura or Equipment card from your graveyard ... attached to that token"', () => {
  test('the lowering: a token, then a reflexive ability that carries it', () => {
    const [trigger] = FILIBUSTER.faces[0]?.abilities ?? [];
    expect(trigger).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', count: 1 },
          {
            kind: 'reflexive',
            carriesMoved: true,
            targets: [
              {
                what: {
                  kind: 'object',
                  filter: {
                    zone: 'graveyard',
                    controller: 'you',
                    anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
                  },
                },
                min: 0,
                max: 1,
              },
            ],
            effect: {
              kind: 'moveToZone',
              to: 'battlefield',
              controller: 'you',
              attachTo: { kind: 'moved' },
            },
          },
        ],
      },
    });
  });

  const upkeep = (graveyard: readonly string[]) => {
    const b = scenario()
      .define(FILIBUSTER)
      .define(BOOST)
      .define(LAND_AURA)
      .define(BLADE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FILIBUSTER.name);
    for (const card of graveyard) b.graveyard(card);
    return b
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
  };

  test('an Aura card of the graveyard returns attached to the new token and does its work', () => {
    const g = upkeep([BOOST.name, BLADE.name]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets(BOOST.name);
    g.passAll();
    g.expect.attached(BOOST.name, { name: 'Inkling', seat: 0 });
    g.expect.pt('Inkling', 4, 3);
    // The Equipment was not chosen: it stays where it was.
    g.expect.zone(BLADE.name, 'graveyard', { seat: 0 });
  });

  test('an Equipment card returns attached to the token as well', () => {
    const g = upkeep([BLADE.name]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets(BLADE.name);
    g.passAll();
    g.expect.attached(BLADE.name, { name: 'Inkling', seat: 0 });
    g.expect.pt('Inkling', 3, 2);
  });

  test('an Aura that cannot enchant a creature stays in the graveyard (CR 303.4g)', () => {
    const g = upkeep([LAND_AURA.name]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseTargets(LAND_AURA.name);
    g.passAll();
    g.expect.zone(LAND_AURA.name, 'graveyard', { seat: 0 });
    g.expect.pt('Inkling', 2, 1);
  });

  test('nothing to return: the token is still created and nothing else happens', () => {
    const g = upkeep([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.pt('Inkling', 2, 1);
    g.expect.stack([]);
  });
});

describe('Gift of Immortality: "When enchanted creature dies, return that card ... Return this card to the battlefield attached to that creature at the beginning of the next end step."', () => {
  test("the lowering: the dying creature's card now, the Aura's own card attached to it later", () => {
    const trigger = GIFT.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      trigger: { kind: 'dies', what: { kind: 'attached' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'moveToZone',
            objects: { kind: 'triggerCard' },
            to: 'battlefield',
            controller: 'owner',
          },
          {
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'each' },
            effect: {
              kind: 'moveToZone',
              objects: { kind: 'thisCard' },
              to: 'battlefield',
              attachTo: { kind: 'moved' },
            },
          },
        ],
      },
    });
  });

  const board = () =>
    scenario()
      .define(GIFT)
      .seat(0)
      .hand(BOLT)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(GIFT.name, { attachedTo: BEARS })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test("the creature returns under its owner's control and the Aura follows at the end step", () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(GIFT.name, 'graveyard', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(GIFT.name, 'battlefield', { seat: 1 });
    g.expect.attached(GIFT.name, { name: BEARS, seat: 1 });
  });
});
