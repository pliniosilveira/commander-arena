// SYNTHETIC lines after the shape of the "choose a creature type" effects of the Lorwyn Eclipsed deck (CR 608.2d, 205.3m, 701.20, 701.24, 702.143a): the type chosen as the spell
// resolves is what "of the chosen type" and "of that type" read, in a reveal until X creature cards, in the choice of cards of a graveyard, and in the cards a foretold spell returns.
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const REVEAL =
  'Choose a creature type. Reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library.';
const RETURN =
  'Choose a creature type. Return up to two creature cards of that type from your graveyard to the battlefield. If ~ was foretold, return all creature cards of that type from your graveyard to the battlefield instead.\nForetell {5}{B}{B}';

describe('reveal until X creature cards of the chosen type', () => {
  test('the reveal reads the chosen type in its filter and in its count, then shuffles', () => {
    const def = parsed('SYNTHETIC Kin Reveal', 'Instant', REVEAL, { manaCost: '{5}{G}{G}' });
    const effect = def.faces[0]?.spell?.effect;
    expect(effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'chooseCreatureType' },
        {
          kind: 'revealUntil',
          filter: { types: ['creature'], chosenType: true },
          count: {
            kind: 'countOf',
            filter: { types: ['creature'], controller: 'you', chosenType: true },
          },
          put: 'battlefield',
          rest: 'stay',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
      ],
    });
  });

  test('without a choice of a creature type right before it, the reveal is not read', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Kin Reveal Blind',
        manaCost: '{5}{G}{G}',
        typeLine: 'Instant',
        oracleText: REVEAL.replace('Choose a creature type. ', 'Draw a card. '),
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });

  test('a different destination is not read', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Kin Reveal Hand',
        manaCost: '{5}{G}{G}',
        typeLine: 'Instant',
        oracleText: REVEAL.replace('onto the battlefield', 'into your hand'),
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('return up to two creature cards of the chosen type, all of them if foretold', () => {
  test('the choice is optional with a count of two, the foretold branch returns each card', () => {
    const def = parsed('SYNTHETIC Kin Return', 'Sorcery', RETURN, { manaCost: '{4}{B}{B}' });
    const graveyardCreatures = {
      zone: 'graveyard',
      types: ['creature'],
      controller: 'you',
      chosenType: true,
    };
    expect(def.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'chooseCreatureType' },
        {
          kind: 'conditional',
          condition: { kind: 'foretold' },
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'each', filter: graveyardCreatures },
            to: 'battlefield',
            controller: 'you',
          },
          else: {
            kind: 'moveToZone',
            objects: { kind: 'choose', filter: graveyardCreatures, count: 2, optional: true },
            to: 'battlefield',
            controller: 'you',
          },
        },
      ],
    });
  });

  test('"was foretold" on a card with no foretell cost is refused by the card check', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Kin Return NoCost',
        manaCost: '{4}{B}{B}',
        typeLine: 'Sorcery',
        oracleText: RETURN.replace('\nForetell {5}{B}{B}', ''),
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });

  test('"it was foretold" is not read (which object "it" is would be a guess)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Kin Return It',
        manaCost: '{4}{B}{B}',
        typeLine: 'Sorcery',
        oracleText: RETURN.replace('~ was foretold', 'it was foretold'),
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});
