// The Hashaton deck program (issue 31), group 2 (D-1110 to D-1112, provisional): the REAL Oracle text of Archfiend of Despair, Ob Nixilis, the Ascended and
// Niv-Mizzet, Ghost Counsel (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario
// and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The helper cards are old fixtures. Pins: CR 119.7
// (can't gain life), CR 119.3 (life lost), CR 119.4 (paying life), CR 603.4 (the intervening "if"), CR 702.15b (lifelink).
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const HAWK = "Healer's Hawk"; // flying, lifelink 1/1
const MEND = 'SYNTHETIC Mend'; // {W}: gain 3 life
const BEARS = 'Grizzly Bears';

describe('Archfiend of Despair: "Your opponents can\'t gain life." and the end step loss', () => {
  const archfiend = real('Archfiend of Despair');
  const ARCHFIEND = archfiend.name;

  test('the card is valid', () => {
    expect(validateCard(archfiend)).toEqual([]);
  });

  test('an opponent gains no life from a spell, and the same player loses what they lost at the end step', () => {
    const g = scenario()
      .define(archfiend)
      .seat(0)
      .battlefield(ARCHFIEND)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(MEND, BOLT)
      .battlefield('Plains', 'Mountain')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 14);
    g.expect.life(0, 40);
  });

  test("lifelink damage of an opponent's creature gains them nothing", () => {
    const g = scenario()
      .define(archfiend)
      .seat(0)
      .battlefield(ARCHFIEND)
      .life(30)
      .library(...FILLER)
      .seat(1)
      .battlefield(HAWK)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(HAWK);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 29);
    g.expect.life(1, 20);
    g.expect.invariants();
  });

  test('my own life gain is as ever', () => {
    const g = scenario()
      .define(archfiend)
      .seat(0)
      .battlefield(ARCHFIEND, 'Plains')
      .hand(MEND)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });
});

describe('Ob Nixilis, the Ascended: the end step Angel and the enters trigger', () => {
  const ob = real('Ob Nixilis, the Ascended');
  const OB = ob.name;

  test('the card is valid', () => {
    expect(validateCard(ob)).toEqual([]);
  });

  test('life gained by lifelink damage this turn: a 4/4 Angel with flying at the end step', () => {
    const g = scenario()
      .define(ob)
      .seat(0)
      .battlefield(OB, HAWK)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HAWK);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Angel', 'battlefield', { seat: 0 });
    g.expect.pt('Angel', 4, 4);
    g.expect.derived('Angel', { keywords: ['flying'], colors: ['W'] });
  });

  test('no life gained: no Angel', () => {
    const g = scenario()
      .define(ob)
      .seat(0)
      .battlefield(OB)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Angel');
  });

  test('it enters: the opponent tapped creature is destroyed, 1 life for each, and the end step Angel follows', () => {
    const g = scenario()
      .define(ob)
      .seat(0)
      .hand(OB)
      .battlefield('Plains', { count: 7 })
      .life(20)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { tapped: true })
      .battlefield('Giant Spider')
      .library(...FILLER)
      .build();
    g.act(0).cast(OB, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.life(0, 21);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Angel', 'battlefield', { seat: 0 });
  });

  test('on an opponent end step too ("each end step"): gained life this turn counts', () => {
    const g = scenario()
      .define(ob)
      .seat(0)
      .battlefield(OB, 'Plains')
      .hand(MEND)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).pass();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Angel', 'battlefield', { seat: 0 });
  });
});

describe('Niv-Mizzet, Ghost Counsel: "Whenever you gain life, you may pay that much life. If you do, draw that many cards."', () => {
  const niv = real('Niv-Mizzet, Ghost Counsel');
  const NIV = niv.name;

  const start = (life = 20) =>
    scenario()
      .define(niv)
      .seat(0)
      .battlefield(NIV, 'Plains')
      .hand(MEND)
      .life(life)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('the card is valid', () => {
    expect(validateCard(niv)).toEqual([]);
  });

  test('3 life gained: I pay 3 life and draw 3 cards', () => {
    const g = start();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind !== 'confirmOptional') return;
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 3 }]);
    g.act(0).accept();
    g.expect.life(0, 20);
    g.expect.handSize(0, 3);
  });

  test('declining draws nothing and pays nothing', () => {
    const g = start();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.life(0, 23);
    g.expect.handSize(0, 0);
  });

  test('the tap ability gains 1 life, which triggers it: pay 1, draw 1', () => {
    const g = start();
    g.act(0).activate(NIV);
    g.passAll();
    g.expect.life(0, 21);
    g.expect.life(1, 39);
    g.act(0).accept();
    g.expect.life(0, 20);
    g.expect.handSize(0, 2); // Mend and one drawn card
  });

  test('an opponent with Archfiend of Despair: the gain does not happen, so nothing is asked', () => {
    const archfiend = real('Archfiend of Despair');
    const g = scenario()
      .define(niv)
      .define(archfiend)
      .seat(0)
      .battlefield(NIV, 'Plains')
      .hand(MEND)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .battlefield(archfiend.name)
      .library(...FILLER)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 20);
  });
});
