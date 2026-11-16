// The Galadriel deck (issue 43), group 1: the REAL Oracle text of Elrond, Lord of Rivendell, Galadriel of Lothlorien, Matoya, Archon Elder, Elven Farsight, Track Down, Nissa, Steward of
// Elements and Shower of Arrows (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the
// engine fixtures (`synthetic-galadriel-g1.ts`), which the engine tests and the AI soak play. Pins: CR 701.22 (scry), CR 701.25 (surveil), CR 603.2c, CR 608.2c, CR 701.54a (the Ring
// tempts you), CR 701.20a (reveal), CR 306.5b and 107.3m (loyalty X), CR 202.3, CR 205.1b, CR 613.4b.
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const RITE = 'SYNTHETIC Ring Rite'; // the Ring tempts you
const SIGHT = 'SYNTHETIC Clear Sight'; // scry 2
const QUIET = 'SYNTHETIC Quiet Look'; // surveil 2

const elrond = real('Elrond, Lord of Rivendell');
const galadriel = real('Galadriel of Lothlórien');
const matoya = real('Matoya, Archon Elder');
const farsight = real('Elven Farsight');
const trackDown = real('Track Down');
const nissa = real('Nissa, Steward of Elements');
const shower = real('Shower of Arrows');

const helpers = () =>
  scenario().define(syntheticCard(RITE)).define(syntheticCard(SIGHT)).define(syntheticCard(QUIET));

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test.each([
    ['Elrond, Lord of Rivendell', elrond, 'SYNTHETIC Rivendell Warden'],
    ['Galadriel of Lothlórien', galadriel, 'SYNTHETIC Lorien Lady'],
    ['Matoya, Archon Elder', matoya, 'SYNTHETIC Archon Seer'],
    ['Elven Farsight', farsight, 'SYNTHETIC Far Sight'],
    ['Track Down', trackDown, 'SYNTHETIC Run Down'],
    ['Nissa, Steward of Elements', nissa, 'SYNTHETIC Seer of Elements'],
    ['Shower of Arrows', shower, 'SYNTHETIC Arrow Rain'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const face = card.faces[0];
    const twin = syntheticCard(sibling).faces[0];
    expect(face?.abilities).toEqual(twin?.abilities);
    expect(face?.spell).toEqual(twin?.spell);
    expect(face?.loyalty).toEqual(twin?.loyalty);
  });
});

describe('Matoya, Archon Elder', () => {
  const board = () =>
    helpers()
      .define(matoya)
      .seat(0)
      .library(...LIBRARY)
      .hand(SIGHT, QUIET)
      .battlefield('Island', 'Island')
      .battlefield(matoya.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('a scry and a surveil each draw a card', () => {
    const g = board();
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.passAll();
    g.expect.handSize(0, 2);
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });
});

describe('Elrond, Lord of Rivendell', () => {
  test('a second creature in the turn: scry 1 and the Ring tempts you; the Ring-bearer is the creature you choose', () => {
    const g = helpers()
      .define(elrond)
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, BEARS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(elrond.name, { label: 'elrond' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    for (const nth of [0, 1]) {
      g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true });
      g.passAll();
      g.passAll();
      g.act(0).arrange({ top: ['Island[0]'] });
      if (nth === 0) g.expect.ringLevel(0, 0);
    }
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('elrond');
    g.expect.ringLevel(0, 1);
    g.expect.ringBearer(0, 'elrond');
    g.expect.invariants();
  });
});

describe('Galadriel of Lothlórien', () => {
  const board = (library: readonly string[]) =>
    helpers()
      .define(galadriel)
      .seat(0)
      .library(...library)
      .hand(RITE)
      .battlefield('Swamp', 'Swamp')
      .battlefield(galadriel.name, { label: 'galadriel' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the Ring tempts you and you choose another creature: scry 3, and a land revealed by the scry enters tapped', () => {
    const g = board(['Forest', 'Island', 'Island', 'Island']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('bears');
    g.passAll(); // scry 3
    g.act(0).arrange({ top: ['Forest[0]', 'Island[0]', 'Island[1]'] });
    g.passAll(); // the trigger of the scry
    g.act(0).accept();
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest');
    g.expect.invariants();
  });

  test('choosing Galadriel herself: nothing scries', () => {
    const g = board(['Forest', 'Island', 'Island', 'Island']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('galadriel');
    g.expect.stack([]);
    g.expect.ringBearer(0, 'galadriel');
  });
});

describe('Elven Farsight and Track Down', () => {
  test('Elven Farsight: scry 3, then you may reveal; a creature card draws a card', () => {
    const g = helpers()
      .define(farsight)
      .seat(0)
      .library(BEARS, 'Island', 'Island', ...LIBRARY)
      .hand(farsight.name)
      .battlefield('Forest')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(farsight.name, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: [`${BEARS}[0]`, 'Island[0]', 'Island[1]'] });
    g.act(0).accept();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('Track Down: scry 3, then reveal; a land card draws a card, a spell does not', () => {
    const run = (top: string) => {
      const g = helpers()
        .define(trackDown)
        .seat(0)
        .library(top, 'Island', 'Island', ...LIBRARY)
        .hand(trackDown.name)
        .battlefield('Forest', 'Forest')
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).cast(trackDown.name, { pay: true });
      g.passAll();
      g.act(0).arrange({ top: [`${top}[0]`, 'Island[0]', 'Island[1]'] });
      return g;
    };
    run('Swamp').expect.handSize(0, 1);
    run(SPIDER).expect.handSize(0, 1);
    run('Lightning Bolt').expect.handSize(0, 0);
  });
});

describe('Nissa, Steward of Elements', () => {
  const lands = ['Forest', 'Island', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'];
  const board = (library: readonly string[]) =>
    helpers()
      .define(nissa)
      .seat(0)
      .library(...library)
      .hand(nissa.name)
      .battlefield(...lands)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('cast for X = 4 she enters with 4 loyalty counters (the printed loyalty is X)', () => {
    const g = board(LIBRARY);
    g.act(0).cast(nissa.name, { x: 4, pay: true });
    g.passAll();
    g.expect.counters(nissa.name, { loyalty: 4 });
  });

  test('the 0 ability puts a land from the top onto the battlefield', () => {
    const g = board(['Swamp', ...LIBRARY]);
    g.act(0).cast(nissa.name, { x: 3, pay: true });
    g.passAll();
    g.act(0).activate(nissa.name, { ability: 2 });
    g.passAll();
    g.act(0).chooseCards('Swamp');
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the 0 ability with a creature of mana value 4 and 3 loyalty counters: it stays on top', () => {
    const g = board([SPIDER, ...LIBRARY]);
    g.act(0).cast(nissa.name, { x: 3, pay: true });
    g.passAll();
    g.act(0).activate(nissa.name, { ability: 2 });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(SPIDER, 'library', { seat: 0 });
  });

  test('the -6 ability makes two lands 5/5 flying haste Elementals that are still lands', () => {
    const g = board(LIBRARY);
    g.act(0).cast(nissa.name, { x: 6, pay: true });
    g.passAll();
    const island = { name: 'Island', zone: 'battlefield', seat: 0 } as const;
    g.act(0).activate(nissa.name, { ability: 3, targets: ['Forest', island] });
    g.passAll();
    g.expect.derived('Forest', {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Elemental'],
      keywords: ['flying', 'haste'],
    });
    g.expect.pt(island, 5, 5);
    g.expect.tapped('Forest', false);
  });
});

describe('Shower of Arrows', () => {
  test('destroys a creature with flying and scries 1', () => {
    const g = helpers()
      .define(shower)
      .seat(0)
      .library(...LIBRARY)
      .hand(shower.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Serra Angel', { label: 'angel' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(shower.name, { targets: ['angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.pending('arrangeCards', 0);
  });
});
