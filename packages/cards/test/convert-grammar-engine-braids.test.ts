// Braids, Arisen Nightmare (the Meren deck): the REAL Oracle text from the corpus's golden.jsonl goes through the grammar as a card with no override, is compared with the SYNTHETIC
// card of the engine fixtures that the engine scenarios of `scenario-xx-braids-shared-type.test.ts` run, and is played through applyAction.
// Pins: CR 608.2c ("If you do" reads the offer), CR 608.2d and 101.4 (each opponent is asked in turn order), CR 205.2a (a permanent shares a card type with the sacrificed
// permanent when it has any of its card types), CR 701.21a (a player sacrifices only among their own permanents).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard as storedCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const golden = GOLDEN.find((c) => c.name === 'Braids, Arisen Nightmare');
if (golden === undefined) throw new Error('Braids, Arisen Nightmare is not in the golden corpus');
const imported = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
const BRAIDS: CardDefinition = imported.definition;

const abilitiesOf = (card: CardDefinition) => card.faces[0]?.abilities;

describe('the real card is the nodes the engine fixture holds', () => {
  test('it is supported and valid', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(BRAIDS)).toEqual([]);
  });

  test('its ability is the one of the SYNTHETIC Braids', () => {
    expect(abilitiesOf(BRAIDS)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Braids Nightmare')));
  });
});

describe('the sentences are read only as what they say', () => {
  const FIRST =
    'At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker.';
  const SECOND =
    'If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it.';
  const THIRD = "For each opponent who doesn't, that player loses 2 life and you draw a card.";
  const probe = (text: string) =>
    parseOnly(
      storedCard({
        name: 'SYNTHETIC Braids Probe',
        typeLine: 'Legendary Creature — Nightmare',
        manaCost: '{1}{B}{B}',
        power: '3',
        toughness: '3',
        oracleText: text,
      }),
    );

  test('the three sentences together are supported', () => {
    expect(probe(`${FIRST} ${SECOND} ${THIRD}`).support.status).toBe('supported');
  });

  test('without the sentence for the opponents who decline, the first two are supported', () => {
    expect(probe(`${FIRST} ${SECOND}`).support.status).toBe('supported');
  });

  test('"shares a card type with it" without a sacrifice before it is not read', () => {
    const card = probe(
      'At the beginning of your end step, each opponent may sacrifice a permanent of their choice that shares a card type with it.',
    );
    expect(card.support.status).toBe('unsupported');
  });

  test('another count of players or another thing shared is not read', () => {
    expect(
      probe(
        `${FIRST} If you do, each opponent may sacrifice a permanent of their choice that shares a creature type with it.`,
      ).support.status,
    ).toBe('unsupported');
    expect(
      probe(
        `${FIRST} If you do, each player may sacrifice a permanent of their choice that shares a card type with it. ${THIRD}`,
      ).support.status,
    ).toBe('unsupported');
  });

  test('"for each opponent who doesn\'t" after something that asked nobody is not read', () => {
    expect(probe(`${FIRST} ${THIRD}`).support.status).toBe('unsupported');
  });
});

describe('Braids is played', () => {
  const BEARS = 'Grizzly Bears';
  const SOL_RING = 'Sol Ring';
  const build = (
    mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
    theirs: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
  ) =>
    theirs(
      mine(
        scenario()
          .define(BRAIDS)
          .seat(0)
          .library(...Array.from({ length: 8 }, () => 'Plains')),
      )
        .seat(1)
        .library(...Array.from({ length: 8 }, () => 'Plains')),
    )
      .at('precombatMain')
      .build();

  test('you sacrifice a creature, the opponent declines, loses 2 life and you draw', () => {
    const g = build(
      (b) => b.battlefield(BRAIDS.name).battlefield(BEARS),
      (b) => b.battlefield(BEARS, SOL_RING),
    );
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents({ name: BEARS, zone: 'battlefield', seat: 0 });
    g.act(1).decline();
    expect(g.state.seats[1]?.life).toBe(38);
    g.expect.handSize(0, 1);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the opponent sacrifices a permanent that shares the card type: no life lost', () => {
    const g = build(
      (b) => b.battlefield(BRAIDS.name).battlefield(BEARS),
      (b) => b.battlefield(BEARS, SOL_RING),
    );
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents({ name: BEARS, zone: 'battlefield', seat: 0 });
    // Only their creature shares a card type with the creature, so it is taken without a choice.
    g.act(1).accept();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SOL_RING, 'battlefield', { seat: 1 });
    expect(g.state.seats[1]?.life).toBe(40);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});
