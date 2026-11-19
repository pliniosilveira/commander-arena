// Syr Konrad, the Grim and Insidious Roots: the real Oracle lines read through the whole pipeline, the nodes they lower to, SYNTHETIC variants and the near misses.
// "a creature card leaves your graveyard", "one or more creature cards leave your graveyard", "a creature card is put into a graveyard from anywhere other than the battlefield"
// and a trigger that joins events with ", or" (CR 603.2, 603.2c, 400.7, 404.1, 700.4). The engine runs what is lowered in
// packages/engine/test/scenario-xx-graveyard-events.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Knight']).abilities;
const triggers = (text: string) =>
  creature(text).flatMap((a) => (a.kind === 'triggered' ? [a.trigger] : []));

const CREATURE = { types: ['creature'] };
const DAMAGE = '~ deals 1 damage to each opponent.';

describe('the trigger of Syr Konrad: three events joined with ", or" (CR 603.2c)', () => {
  const real = `Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, ${DAMAGE}`;

  test('one engine ability for each event, with the same effect', () => {
    const abilities = creature(real);
    expect(abilities).toHaveLength(3);
    expect(abilities.map((a) => a.kind === 'triggered' && a.effect)).toEqual([
      { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
      { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
      { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
    ]);
    expect(triggers(real)).toEqual([
      { kind: 'dies', what: { types: ['creature'], other: true } },
      { kind: 'putIntoGraveyard', who: 'any', from: 'notBattlefield', filter: CREATURE },
      { kind: 'leftGraveyard', who: 'you', filter: CREATURE, each: true },
    ]);
  });

  test('two of the events, with and without a comma (SYNTHETIC)', () => {
    expect(
      triggers(
        `Whenever another creature dies, or a creature card leaves your graveyard, ${DAMAGE}`,
      ),
    ).toEqual([
      { kind: 'dies', what: { types: ['creature'], other: true } },
      { kind: 'leftGraveyard', who: 'you', filter: CREATURE, each: true },
    ]);
    expect(
      triggers(
        `Whenever a creature card is put into a graveyard from anywhere other than the battlefield or a creature card leaves your graveyard, ${DAMAGE}`,
      ),
    ).toEqual([
      { kind: 'putIntoGraveyard', who: 'any', from: 'notBattlefield', filter: CREATURE },
      { kind: 'leftGraveyard', who: 'you', filter: CREATURE, each: true },
    ]);
  });

  test.each([
    `Whenever another creature dies, or another creature dies, ${DAMAGE}`,
    `Whenever another creature dies, or a creature card leaves an opponent's graveyard, ${DAMAGE}`,
    `Whenever another creature dies, or a creature card is put into a graveyard from anywhere, ${DAMAGE}`,
    `Whenever another creature dies, or a creature card leaves your graveyard and a creature card is put into a graveyard from anywhere other than the battlefield, ${DAMAGE}`,
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Knight']).text).toBe(text);
  });
});

describe('one event of a card leaving or entering a graveyard', () => {
  test('"a creature card leaves your graveyard": once for each card', () => {
    expect(triggers(`Whenever a creature card leaves your graveyard, ${DAMAGE}`)).toEqual([
      { kind: 'leftGraveyard', who: 'you', filter: CREATURE, each: true },
    ]);
  });

  test('"a creature card is put into a graveyard from anywhere other than the battlefield" (SYNTHETIC)', () => {
    expect(
      triggers(
        `Whenever a creature card is put into a graveyard from anywhere other than the battlefield, ${DAMAGE}`,
      ),
    ).toEqual([{ kind: 'putIntoGraveyard', who: 'any', from: 'notBattlefield', filter: CREATURE }]);
  });

  test('"one or more creature cards leave your graveyard": a batch, the line of Insidious Roots', () => {
    const [ability] = creature(
      'Whenever one or more creature cards leave your graveyard, create a 0/1 green Plant creature token, then put a +1/+1 counter on each Plant you control.',
    );
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'leftGraveyard', who: 'you', filter: CREATURE },
    });
    expect(ability?.kind === 'triggered' && ability.trigger).not.toHaveProperty('each');
  });

  test('"a card leaves your graveyard": any card, once for each card (SYNTHETIC)', () => {
    expect(triggers(`Whenever a card leaves your graveyard, ${DAMAGE}`)).toEqual([
      { kind: 'leftGraveyard', who: 'you', each: true },
    ]);
  });

  test('"one or more cards leave your graveyard" keeps no filter', () => {
    expect(triggers(`Whenever one or more cards leave your graveyard, ${DAMAGE}`)).toEqual([
      { kind: 'leftGraveyard', who: 'you' },
    ]);
  });

  test.each([
    `Whenever a creature card leaves a graveyard, ${DAMAGE}`,
    `Whenever one or more creature cards leave an opponent's graveyard, ${DAMAGE}`,
    `Whenever a creature card is put into a graveyard from anywhere other than the library, ${DAMAGE}`,
    `Whenever an creature card leaves your graveyard, ${DAMAGE}`,
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Knight']).text).toBe(text);
  });
});
