// Plaguecrafter (the Meren deck): the REAL Oracle text from the corpus's golden.jsonl goes through the grammar as a card with no override, is compared with the SYNTHETIC
// card of the engine fixtures that the engine scenarios of `scenario-xx-plague-reaper.test.ts` run, and is played through applyAction.
// Pins: CR 701.21a (each player sacrifices among their own permanents), CR 101.4 (the players choose in turn order; the chosen permanents are sacrificed at once),
// CR 701.9 (the players who could not sacrifice choose a card and discard it).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly, spellCard } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const golden = GOLDEN.find((c) => c.name === 'Plaguecrafter');
if (golden === undefined) throw new Error('Plaguecrafter is not in the golden corpus');
const imported = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
const PLAGUECRAFTER: CardDefinition = imported.definition;

const abilitiesOf = (card: CardDefinition) => card.faces[0]?.abilities;

describe('the real card is the nodes the engine fixture holds', () => {
  test('it is supported and valid', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(PLAGUECRAFTER)).toEqual([]);
  });

  test('its ability is the one of the SYNTHETIC Plague Reaper', () => {
    expect(abilitiesOf(PLAGUECRAFTER)).toEqual(
      abilitiesOf(syntheticCard('SYNTHETIC Plague Reaper')),
    );
  });
});

describe('the second sentence is read only as what it says', () => {
  const edict = (text: string) =>
    parseOnly(spellCard('SYNTHETIC Edict Probe', text, { type: 'Sorcery' }));
  const SAC = 'Each player sacrifices a creature or planeswalker of their choice.';

  test('a sacrifice followed by "each player who can\'t" lowers to a together discard', () => {
    const card = edict(`${SAC} Each player who can't discards a card.`);
    expect(card.support.status).toBe('supported');
    expect(card.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'sacrifice',
          objects: {
            kind: 'choose',
            filter: { anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }] },
          },
          player: { kind: 'eachPlayer' },
        },
        {
          kind: 'discard',
          player: { kind: 'couldntSacrificeThisWay' },
          count: 1,
          together: true,
        },
      ],
    });
  });

  test('"each player who can\'t" with nothing sacrificed before it is not read', () => {
    expect(edict("Each player who can't discards a card.").support.status).toBe('unsupported');
  });

  test('another subject or verb is not read', () => {
    expect(edict(`${SAC} Each opponent who can't discards a card.`).support.status).toBe(
      'unsupported',
    );
    expect(edict(`${SAC} Each player who can discards a card.`).support.status).toBe('unsupported');
  });
});

describe('Plaguecrafter is played', () => {
  const BEARS = 'Grizzly Bears';
  const SPIDER = 'Giant Spider';
  const build = (
    mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
    theirs: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
  ) =>
    theirs(
      mine(
        scenario()
          .define(PLAGUECRAFTER)
          .seat(0)
          .library(...Array.from({ length: 8 }, () => 'Plains')),
      )
        .seat(1)
        .library(...Array.from({ length: 8 }, () => 'Plains')),
    )
      .at('precombatMain')
      .build();

  test('each player sacrifices a creature or planeswalker; a player with none discards', () => {
    const g = build(
      (b) => b.hand(PLAGUECRAFTER.name).battlefield('Swamp', { count: 3 }).battlefield(BEARS),
      (b) => b.hand('Island', 'Mountain'),
    );
    g.act(0).cast(PLAGUECRAFTER.name, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Island');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone(PLAGUECRAFTER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('it may be the permanent its controller sacrifices; the other player sacrifices theirs', () => {
    const g = build(
      (b) => b.hand(PLAGUECRAFTER.name).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(SPIDER).hand('Island'),
    );
    g.act(0).cast(PLAGUECRAFTER.name, { pay: true });
    g.passAll();
    g.expect.zone(PLAGUECRAFTER.name, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    // Both sacrificed, so nobody discards.
    g.expect.zone('Island', 'hand', { seat: 1 });
    g.expect.invariants();
  });
});
