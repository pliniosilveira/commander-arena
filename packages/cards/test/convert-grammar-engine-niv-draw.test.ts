// The Niv-Mizzet deck (issue 25), group 2b-a (D-940 to D-942): the REAL Oracle text of Living Conundrum and Niv-Mizzet, Visionary (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. The helper cards are SYNTHETIC (src/cards/fixtures) or old
// fixtures. Pins: CR 614.11 and 121.6a (a replacement of a draw applies even with an empty library), CR 121.4 and 704.5b (a player loses only for
// attempting a draw from an empty library), CR 613.4b (base power and toughness), CR 120.2b (noncombat damage by any source), CR 603.2c, CR 402.2 and
// 514.1 (no maximum hand size).
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

const FILLER = Array.from({ length: 12 }, () => 'Forest');
const BOLT = 'Lightning Bolt'; // {R}: 3 damage to any target
const DRAW3 = 'SYNTHETIC Draw Three Gain Five'; // {2}{U}: draw three cards, gain 5 life
const PINGER = 'SYNTHETIC Spark Pinger'; // {T}: 2 damage to any target
const WAVE = 'SYNTHETIC Scorch Wave'; // sorcery: 2 damage to each opponent

describe('Living Conundrum: "Hexproof. If you would draw a card while your library has no cards in it, skip that draw instead. As long as there are no cards in your library, ..."', () => {
  const conundrum = real('Living Conundrum');
  const LIVING = conundrum.name;

  const base = (library: number) => {
    const b = scenario()
      .define(conundrum)
      .seat(0)
      .life(20)
      .hand(DRAW3)
      .battlefield(LIVING, 'Island', 'Island', 'Island');
    if (library > 0) b.library('Forest', { count: library });
    return b
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
  };

  test('the card is valid', () => {
    expect(validateCard(conundrum)).toEqual([]);
  });

  test('with cards in the library it is a 2/5 with hexproof, and draws are drawn', () => {
    const g = base(3);
    g.expect.pt(LIVING, 2, 5);
    g.expect.derived(LIVING, { keywords: ['hexproof'] });
    g.act(0).cast(DRAW3, { pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.noEvent({ kind: 'drawSkipped' });
    g.expect.hasLost(0, false);
  });

  test('with no cards in the library it is a 10/10 flying vigilance creature and every draw is skipped: the player does not lose (CR 614.11, 121.4)', () => {
    const g = base(0);
    g.expect.pt(LIVING, 10, 10);
    g.expect.derived(LIVING, { keywords: ['hexproof', 'flying', 'vigilance'] });
    g.act(0).cast(DRAW3, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(3);
    g.expect.noEvent({ kind: 'drewFromEmptyLibrary' });
    g.expect.life(0, 25);
    g.expect.hasLost(0, false);
  });

  test('the draw step: the turn goes on with an empty library', () => {
    const g = scenario()
      .define(conundrum)
      .seat(0)
      .battlefield(LIVING)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('draw', { turn: 3 });
    g.passAll();
    g.expect.hasLost(0, false);
    g.expect.noEvent({ kind: 'drewFromEmptyLibrary' });
  });

  test('it protects only its controller: the opponent with an empty library still loses', () => {
    const g = scenario()
      .define(conundrum)
      .seat(0)
      .life(20)
      .battlefield(LIVING)
      .library(...FILLER)
      .seat(1)
      .hand(DRAW3)
      .battlefield('Island', { count: 3 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(DRAW3, { pay: true });
    g.passAll();
    g.expect.hasLost(1);
  });
});

describe('Niv-Mizzet, Visionary: "Flying. You have no maximum hand size. Whenever a source you control deals noncombat damage to an opponent, you draw that many cards."', () => {
  const niv = real('Niv-Mizzet, Visionary');
  const NIV = niv.name;

  const base = (
    hand: readonly string[],
    mine: readonly string[] = [],
    theirs: readonly string[] = [],
  ) =>
    scenario()
      .define(niv)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(...hand)
      .battlefield(NIV, ...mine)
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand(BOLT)
      .battlefield(...theirs)
      .battlefield('Mountain', { count: 3 })
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(niv)).toEqual([]);
  });

  test('a Lightning Bolt to the face draws three cards', () => {
    const g = base([BOLT]);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.handSize(0, 3);
  });

  test('an ability of a permanent, a spell that hits each opponent, and a Bolt at a creature that draws nothing', () => {
    const g = base([WAVE, BOLT], [PINGER], ['SYNTHETIC Vanilla 2/2']);
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.handSize(0, 2 + 2); // two cards in hand to begin with, two drawn
    g.act(0).cast(WAVE, { pay: true });
    g.passAll();
    g.expect.handSize(0, 3 + 2); // the Wave left the hand, two drawn
    g.act(0).cast(BOLT, { targets: [{ name: 'SYNTHETIC Vanilla 2/2', seat: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 4);
    g.expect.life(1, 16);
  });

  test("damage dealt to me, or by the opponent's own spell to itself, draws nothing", () => {
    const g = base([]);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('combat damage draws nothing (CR 120.2a)', () => {
    const g = base([], ['SYNTHETIC Vanilla 2/2']);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: 'SYNTHETIC Vanilla 2/2', seat: 0 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 18);
    g.expect.handSize(0, 0);
  });

  test('no maximum hand size: nine cards in hand at the end of the turn are all kept (CR 402.2, 514.1)', () => {
    const g = scenario()
      .define(niv)
      .seat(0)
      .battlefield(NIV)
      .hand('Forest', { count: 9 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.noEvent({ kind: 'discarded' });
    g.expect.handSize(0, 9);
  });

  test('with Living Conundrum and an empty library the draws of the trigger are skipped: nobody loses and nothing is drawn', () => {
    const conundrum = real('Living Conundrum');
    const g = scenario()
      .define(niv)
      .define(conundrum)
      .seat(0)
      .life(20)
      .hand(BOLT)
      .battlefield(NIV, conundrum.name)
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.handSize(0, 0);
    expect(g.events.filter((e) => e.kind === 'drawSkipped')).toHaveLength(3);
    g.expect.hasLost(0, false);
  });
});
