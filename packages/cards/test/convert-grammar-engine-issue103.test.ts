// Issue #103 (Dragons): the REAL cards of the golden corpus read through the grammar only (no override), defined in an engine scenario and played through
// applyAction. No Scryfall ruling could be read from the sandbox: nothing below rests on one.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const DRAGON = 'SYNTHETIC Maw Dragon';

const on = (...defs: CardDefinition[]) => {
  const b = scenario().seat(0);
  for (const d of defs) b.define(d);
  return b
    .library(...FILLER)
    .seat(1)
    .library(...FILLER);
};

const TEMPLE = real('Temple of the Dragon Queen');

describe('Temple of the Dragon Queen (reveal a Dragon card or control a Dragon, else enters tapped; choose a color; {T}: one mana of that color)', () => {
  const game = (hand: string[], battlefield: string[] = []) =>
    on(TEMPLE)
      .seat(0)
      .hand(TEMPLE.name, ...hand)
      .battlefield(...battlefield)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('revealing a Dragon card: untapped, the card is revealed, then the color is chosen (CR 701.20a, 614.12a)', () => {
    const g = game([DRAGON]);
    g.act(0).playLand(TEMPLE.name);
    g.act(0).accept();
    g.act(0).chooseOption('R');
    g.expect.tapped(TEMPLE.name, false);
    g.expect.zone(DRAGON, 'hand', { seat: 0 });
    g.act(0).tapForMana(TEMPLE.name);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['R']);
  });

  test('declining the reveal: it enters tapped and still chooses a color', () => {
    const g = game([DRAGON]);
    g.act(0).playLand(TEMPLE.name);
    g.act(0).decline();
    g.act(0).chooseOption('U');
    g.expect.tapped(TEMPLE.name, true);
  });

  test('controlling a Dragon: untapped with no reveal question, only the color', () => {
    const g = game([], [DRAGON]);
    g.act(0).playLand(TEMPLE.name);
    g.act(0).chooseOption('G');
    g.expect.tapped(TEMPLE.name, false);
  });

  test('no Dragon in hand or on the battlefield: nothing to reveal, it enters tapped', () => {
    const g = game(['Island']);
    g.act(0).playLand(TEMPLE.name);
    g.act(0).chooseOption('W');
    g.expect.tapped(TEMPLE.name, true);
  });
});

const OPPORTUNIST = real('Opportunistic Dragon');
const SCRIBE = 'SYNTHETIC Idle Scribe';

describe("Opportunistic Dragon (gain control of a Human or artifact for as long as it remains on the battlefield; it loses all abilities and can't attack or block)", () => {
  const game = (opponent: string[] = [SCRIBE]) =>
    scenario()
      .define(OPPORTUNIST)
      .seat(0)
      .library(...FILLER)
      .hand(OPPORTUNIST.name, 'Murder')
      .battlefield('Mountain', { count: 4 })
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .library(...FILLER)
      .battlefield(...opponent)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const enter = (g: ReturnType<typeof game>) => {
    g.act(0).cast(OPPORTUNIST.name, { pay: true });
    g.passAll();
    g.passAll();
  };

  test('the Human changes controller, loses its abilities and can not attack (CR 613.1b, 613.1f, 508.1a)', () => {
    const g = game();
    enter(g);
    g.expect.zone(SCRIBE, 'battlefield', { seat: 0 });
    g.expect.derived(SCRIBE, { keywords: [] });
    g.expect.invariants();
  });

  test('an artifact is taken and loses its mana ability: it can not be tapped for mana (CR 613.1f)', () => {
    const g = game(['Sol Ring']);
    g.act(0).cast(OPPORTUNIST.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
    expect(() => g.act(0).tapForMana('Sol Ring')).toThrow();
    g.expect.invariants();
  });

  test("the Human can not attack on its new controller's next turn, with no summoning sickness left (CR 613.11)", () => {
    const g = game();
    enter(g);
    g.advanceTo('declareAttackers', { turn: 3 });
    g.expect.zone(SCRIBE, 'battlefield', { seat: 0 });
    g.expect.canAttack(SCRIBE, false);
    g.expect.canAttack(OPPORTUNIST.name, true);
  });

  test('only a Human or an artifact an opponent controls is a legal target', () => {
    const g = game(['Grizzly Bears']);
    g.act(0).cast(OPPORTUNIST.name, { pay: true });
    g.passAll();
    // No legal target: the ability is removed from the stack and nothing is taken (CR 603.3d).
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
  });

  test('when the Dragon leaves the battlefield the permanent goes back to its controller (CR 611.2b)', () => {
    const g = game();
    enter(g);
    g.act(0).cast('Murder', { targets: [OPPORTUNIST.name], pay: true });
    g.passAll();
    g.expect.zone(OPPORTUNIST.name, 'graveyard', { seat: 0 });
    g.expect.zone(SCRIBE, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

const SCOURGE = real('Broodcaller Scourge');

describe('Broodcaller Scourge (one or more Dragons you control deal combat damage to a player: put a permanent card with mana value at most that damage from your hand onto the battlefield)', () => {
  // Scourge has power 5. Sol Ring costs 1 and Serra Angel 5 (both within the limit), the SYNTHETIC Maw Dragon 7 (above it), and a Lightning Bolt is no permanent.
  const game = (extra: string[] = []) =>
    scenario()
      .define(SCOURGE)
      .seat(0)
      .library(...FILLER)
      .hand('Sol Ring', 'Serra Angel', DRAGON, 'Lightning Bolt')
      .battlefield(SCOURGE.name, { label: 'scourge' })
      .battlefield(...extra)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('only the permanent cards with mana value at most the damage are offered (CR 202.3, 603.2c)', () => {
    const g = game();
    g.playCombat({ attack: ['scourge'], until: 'combatDamage' });
    g.expect.life(1, 35);
    g.passAll();
    g.expect.pending('confirmOptional');
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards('Serra Angel');
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Sol Ring', 'hand', { seat: 0 });
    g.expect.zone(DRAGON, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('"that damage" is all that the Dragons dealt to the player: two Dragons deal 10 and the 7 is offered', () => {
    const g = game([SCOURGE.name]);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['scourge', `${SCOURGE.name}[1]`]);
    g.passAll();
    g.passAll();
    g.passAll();
    g.expect.life(1, 30);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toHaveLength(3);
  });

  test('an Aura card put onto the battlefield chooses what it enchants (CR 303.4f)', () => {
    const g = scenario()
      .define(SCOURGE)
      .seat(0)
      .library(...FILLER)
      .hand('SYNTHETIC Warding Aura')
      .battlefield(SCOURGE.name, { label: 'scourge' })
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.playCombat({ attack: ['scourge'], until: 'combatDamage' });
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents('Grizzly Bears');
    g.expect.attached('SYNTHETIC Warding Aura', 'Grizzly Bears');
    g.expect.invariants();
  });

  test('declining puts nothing onto the battlefield', () => {
    const g = game();
    g.playCombat({ attack: ['scourge'], until: 'combatDamage' });
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Sol Ring', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});
