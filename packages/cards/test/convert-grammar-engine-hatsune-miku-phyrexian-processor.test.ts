// Phyrexian Processor: the REAL card of the golden corpus, read through the grammar only and played through applyAction. "As this artifact enters, pay any amount of life." is the
// engine's `asEntersChoose` of `lifePaid` (CR 119.4, 614.12, 614.12a: a choice made before it enters, 0 can always be paid); "{4}, {T}: Create an X/X black Phyrexian Minion creature
// token, where X is the life paid as this artifact entered." is a custom token whose power and toughness are `lifePaidAsEntered`, which the permanent remembers (CR 400.7: a new
// object after a zone change forgets it) and which is read as the token is created (CR 111.4). Texts of the `withText` block are SYNTHETIC and must stay unsupported.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, `${name}: ${JSON.stringify(imported.support)}`).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const PROCESSOR = real('Phyrexian Processor');
const NAME = PROCESSOR.name;
const FILLER = Array.from({ length: 20 }, () => 'Island');

/** Seat 0 holds the Processor with four lands, at `life`; the game stops at the cast. */
const game = (life = 40) =>
  scenario()
    .define(PROCESSOR)
    .seat(0)
    .life(life)
    .hand(NAME)
    .battlefield('Island', 'Island', 'Island', 'Island')
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .build();

describe('the card reads as a choice as it enters and a token ability', () => {
  test('the abilities', () => {
    const abilities = PROCESSOR.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind)).toEqual(['replacement', 'activated']);
    expect(abilities[0]).toEqual({
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'lifePaid' },
    });
    expect(JSON.stringify(abilities[1])).toContain('"ptAmount":{"kind":"lifePaidAsEntered"}');
  });
});

describe('As this artifact enters, pay any amount of life', () => {
  test('the controller is asked before it enters, with every amount from 0 to their life total', () => {
    const g = game(5);
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.purpose).toBe('lifePaid');
    expect(d.options).toEqual(['0', '1', '2', '3', '4', '5']);
    g.expect.zone(NAME, 'stack', { seat: 0 });
  });

  test('the life is lost as it enters and the permanent remembers the amount', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('7');
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.life(0, 33);
    g.expect.chosen(NAME, { lifePaid: 7 });
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('0 can be paid: no life is lost and it remembers 0 (CR 119.4b)', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('0');
    g.expect.life(0, 40);
    g.expect.chosen(NAME, { lifePaid: 0 });
  });

  test('no more than the life total can be paid (CR 119.4)', () => {
    const g = game(3);
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseOption('4')).toThrow();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('3');
    g.expect.life(0, 0);
  });
});

describe('{4}, {T}: create an X/X black Phyrexian Minion, X the life paid as it entered', () => {
  const entered = (life: number, pay: number) => {
    const g = game(life);
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption(String(pay));
    return g;
  };

  test('the token has the life paid as power and toughness, and is black', () => {
    const g = scenario()
      .define(PROCESSOR)
      .seat(0)
      .battlefield(NAME, { chosen: { lifePaid: 6 } })
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(NAME, { pay: true });
    g.passAll();
    g.expect.pt('Phyrexian Minion', 6, 6);
    const token = g.find({ name: 'Phyrexian Minion', zone: 'battlefield' });
    expect(token).toHaveLength(1);
    g.expect.derived('Phyrexian Minion', { colors: ['B'], subtypes: ['Phyrexian', 'Minion'] });
    g.expect.tapped(NAME);
  });

  test('cast and entered with 4 life paid: the token is 4/4 and the life stays paid', () => {
    const g = entered(20, 4);
    g.expect.life(0, 16);
    // the lands paid for the cast: the ability is activated on the controller's next turn
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(0).activate(NAME, { pay: true });
    g.passAll();
    g.expect.pt('Phyrexian Minion', 4, 4);
  });

  test('paying 0 makes a 0/0 token that dies at once (CR 704.5f)', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('0');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(0).activate(NAME, { pay: true });
    g.passAll();
    g.expect.noObject('Phyrexian Minion', { zone: 'battlefield' });
  });

  test('the amount is read when the token is made: gaining life later changes nothing', () => {
    const g = scenario()
      .define(PROCESSOR)
      .seat(0)
      .life(40)
      .battlefield(NAME, { chosen: { lifePaid: 3 } })
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(NAME, { pay: true });
    g.passAll();
    g.expect.pt('Phyrexian Minion', 3, 3);
  });
});

describe('the amounts the grammar reads and the ones it does not', () => {
  const status = (oracle: string) => {
    const golden = cards.find((c) => c.name === 'Phyrexian Processor');
    if (golden === undefined) throw new Error('missing');
    const face = golden.faces[0];
    if (face === undefined) throw new Error('missing face');
    return importCard(
      fromGoldenCard({
        ...golden,
        name: 'SYNTHETIC Processor',
        faces: [{ ...face, name: 'SYNTHETIC Processor', oracleText: oracle }],
      }),
      undefined,
      NO_OVERRIDES,
    ).support.status;
  };

  test('the reading of the card itself is supported', () => {
    expect(
      status(cards.find((c) => c.name === 'Phyrexian Processor')?.faces[0]?.oracleText ?? ''),
    ).toBe('supported');
  });

  test('a token that reads the life paid on a card that pays none is refused (validateCard)', () => {
    expect(
      status(
        '{4}, {T}: Create an X/X black Phyrexian Minion creature token, where X is the life paid as this artifact entered.',
      ),
    ).toBe('unsupported');
  });

  test('"you may pay", a fixed amount and a missing period are not read', () => {
    const token =
      '\n{4}, {T}: Create an X/X black Phyrexian Minion creature token, where X is the life paid as this artifact entered.';
    expect(status(`As this artifact enters, you may pay any amount of life.${token}`)).toBe(
      'unsupported',
    );
    expect(status(`As this artifact enters, pay 2 life.${token}`)).toBe('unsupported');
    expect(status(`As this artifact enters, pay any amount of life${token}`)).toBe('unsupported');
  });

  test('"where X is the life paid" with another noun is not read', () => {
    expect(
      status(
        'As this artifact enters, pay any amount of life.\n{4}, {T}: Create an X/X black Phyrexian Minion creature token, where X is the mana paid as this artifact entered.',
      ),
    ).toBe('unsupported');
  });
});
