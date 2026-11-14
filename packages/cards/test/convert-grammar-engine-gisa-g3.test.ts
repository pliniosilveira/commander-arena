// The Gisa deck (issue 41), group 3 (D-484 to D-492): the REAL Oracle text of Liliana, Dreadhorde General, Priest of Forgotten Gods, Krav, the Unredeemed and Plumb the Forbidden
// (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is compared with the SYNTHETIC cards of the engine fixtures the engine scenarios of
// `scenario-xx-gisa-g3-*.test.ts` run, and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 608.2d, 701.21a and 101.4
// (the opponent's choice of a permanent of each type, and the sacrifice of the rest), CR 118.3, 602.2b and 115.1 (the cost of two other creatures and the targets), CR 107.3a (X as the
// number sacrificed), CR 702.124j (partner with), CR 118.8, 601.2b and 707.10 (the optional sacrifice and the copies of the spell).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const LILIANA = real('Liliana, Dreadhorde General');
const PRIEST = real('Priest of Forgotten Gods');
const KRAV = real('Krav, the Unredeemed');
const PLUMB = real('Plumb the Forbidden');

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};
const abilitiesOf = (card: CardDefinition) => faceOf(card).abilities;

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the real cards are the nodes the engine fixtures hold', () => {
  test.each([LILIANA, PRIEST, KRAV, PLUMB])('%s is valid', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Liliana: the minus nine of the SYNTHETIC Culling Walker', () => {
    expect(abilitiesOf(LILIANA)[3]).toEqual(
      abilitiesOf(syntheticCard('SYNTHETIC Culling Walker'))[0],
    );
  });

  test('Priest of Forgotten Gods: the ability of the SYNTHETIC Sacrifice Priest', () => {
    expect(abilitiesOf(PRIEST)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Sacrifice Priest')));
  });

  test('Krav: Partner with Regna, the Redeemer, and the ability of the SYNTHETIC Sacrifice Demon', () => {
    const [partner, ability] = abilitiesOf(KRAV);
    expect(partner).toEqual({
      kind: 'keyword',
      keyword: { kind: 'partnerWith', name: 'Regna, the Redeemer' },
    });
    expect(ability).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Sacrifice Demon'))[0]);
    expect(abilitiesOf(KRAV)).toHaveLength(2);
  });

  test('Plumb the Forbidden: the cost, the cast trigger and the spell of the SYNTHETIC Forbidden Rite', () => {
    const rite = faceOf(syntheticCard('SYNTHETIC Forbidden Rite'));
    expect(faceOf(PLUMB).additionalCosts).toEqual(rite.additionalCosts);
    expect(faceOf(PLUMB).abilities).toEqual(rite.abilities);
    expect(faceOf(PLUMB).spell).toEqual(rite.spell);
  });
});

const names = (
  g: ScenarioGame,
  seat: 0 | 1,
  zone: 'battlefield' | 'graveyard' | 'hand',
): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === zone && o.owner === seat)
    .map((o) => {
      const card = o.card === null ? undefined : g.state.cards[o.card];
      return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    })
    .sort();

describe('Liliana, Dreadhorde General is played: the minus nine', () => {
  test('the opponent keeps a permanent of each type they control and sacrifices the rest', () => {
    const g = scenario()
      .define(LILIANA)
      .seat(0)
      .battlefield(LILIANA.name, { counters: { loyalty: 9 } })
      .battlefield(BEARS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(BEARS, SPIDER, 'Island', 'Island', 'Sol Ring')
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LILIANA.name, { ability: 3 });
    g.passAll();
    // The artifact (the Sol Ring alone) needs no choice; the creatures and the lands do, and the opponent makes them.
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    expect(d.spare).toEqual({ player: 1, type: 'creature', own: true });
    g.act(1).choosePermanents({ name: SPIDER, seat: 1 });
    const e = g.state.pending;
    if (e?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${e?.kind}`);
    expect(e.spare).toEqual({ player: 1, type: 'land', own: true });
    g.act(1).choosePermanents({ name: 'Island', seat: 1, nth: 0 });
    g.passAll();
    expect(names(g, 1, 'battlefield')).toEqual(['Island', 'Sol Ring', SPIDER].sort());
    expect(names(g, 0, 'battlefield')).toContain(BEARS);
    g.expect.invariants();
  });
});

describe('Priest of Forgotten Gods is played', () => {
  test('two other creatures are sacrificed, the target loses 2 life and sacrifices a creature, B B and a card', () => {
    const g = scenario()
      .define(PRIEST)
      .seat(0)
      .battlefield(PRIEST.name, BEARS, SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(ANGEL)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(PRIEST.name, { ability: 0, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
    expect(names(g, 1, 'graveyard')).toEqual([ANGEL]);
    g.expect.pool(0, 'BB');
    g.expect.handSize(0, 1);
    expect(names(g, 0, 'graveyard')).toEqual([BEARS, SPIDER].sort());
    g.expect.invariants();
  });
});

describe('Krav, the Unredeemed is played', () => {
  test('X creatures are sacrificed, the target draws X cards and gains X life, Krav gets X counters', () => {
    const g = scenario()
      .define(KRAV)
      .seat(0)
      .battlefield(KRAV.name, BEARS, SPIDER, 'Swamp')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(KRAV.name, { ability: 1, x: 2, targets: [{ player: 0 }], pay: true });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(0, 42);
    g.expect.counters(KRAV.name, { '+1/+1': 2 });
    g.expect.invariants();
  });

  test('when it enters, its partner with trigger lets a player search for the named card', () => {
    const g = scenario()
      .define(KRAV)
      .seat(0)
      .hand(KRAV.name)
      .battlefield('Swamp', { count: 5 })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(KRAV.name, { pay: true });
    g.pass();
    g.pass();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    // No card of the library is named Regna, the Redeemer: the search is offered and finds nothing.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.librarySize(0, 12);
  });
});

describe('Plumb the Forbidden is played', () => {
  test('two creatures sacrificed: two copies of the spell, three cards drawn and 3 life lost', () => {
    const g = scenario()
      .define(PLUMB)
      .seat(0)
      .hand(PLUMB.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield(BEARS, SPIDER, ANGEL)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(PLUMB.name, { pay: true });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.life(0, 37);
    g.expect.invariants();
  });

  test('no creature sacrificed: one resolution only', () => {
    const g = scenario()
      .define(PLUMB)
      .seat(0)
      .hand(PLUMB.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield(BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(PLUMB.name, { pay: true });
    g.act(0).choosePermanents();
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
  });
});
