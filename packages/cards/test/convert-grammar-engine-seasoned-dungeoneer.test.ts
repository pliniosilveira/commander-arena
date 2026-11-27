// Seasoned Dungeoneer, with its REAL Oracle text (from the card data of the deck support issue; the card is not in the golden corpus of this branch, so the golden-shaped record is built here):
// the text goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, with three seats where an opponent could matter.
// Pins: CR 726.1 (take the initiative), 726.2 (the venture when taken, no source), 726.3 (one holder), 701.49a and 309.4a (entering Undercity), 309.4c (Secret Entrance: search for a basic
// land), 508.1k and 506.2 (attacking creatures), 603.2 ("whenever you attack"), 115.1 (the target is an attacking Cleric, Rogue, Warrior, or Wizard), 702.16a and 702.16b (protection
// from creatures: can't be blocked by creatures), 611.2a (until end of turn), 701.44a (explore).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const DUNGEONEER = 'Seasoned Dungeoneer';

/** The record of the corpus format for the real card (Scryfall Oracle text, fetched by the `Scryfall lookup` workflow for the deck support issue). */
const RECORD = {
  oracleId: null,
  name: DUNGEONEER,
  layout: 'normal',
  colorIdentity: ['W'],
  edhrecRank: null,
  faces: [
    {
      name: DUNGEONEER,
      manaCost: '{3}{W}',
      typeLine: 'Creature — Human Warrior',
      oracleText:
        "When this creature enters, you take the initiative.\nWhenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from creatures until end of turn. It explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on the creature, then put the card back or put it into your graveyard.)",
      power: '3',
      toughness: '4',
      loyalty: null,
      defense: null,
      colors: ['W'],
    },
  ],
  source: 'Scryfall Oracle text of the deck support issue',
} as const;

function real(): CardDefinition {
  const imported = importCard(fromGoldenCard(RECORD as never), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed).toEqual([]);
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

const CARD = real();
const CLERIC = 'SYNTHETIC Dungeon Cleric'; // a 2/2 Human Cleric
const RATS = 'Typhoid Rats';
const BEARS = 'Grizzly Bears';
const PLAINS = Array.from({ length: 12 }, () => 'Plains');

/** Every question of the resolving abilities is answered with the first choice, until the stack is empty. */
function settle(g: ScenarioGame): void {
  for (let i = 0; i < 40; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'chooseOption') g.act(d.seat).chooseOption(d.options[0] ?? '');
    else if (d?.kind === 'confirmOptional') g.act(d.seat).decline();
    else if (d?.kind === 'chooseCards') {
      g.act(d.seat).choose({ kind: 'chooseCards', objects: d.legal.slice(0, Math.max(d.min, 1)) });
    } else if (d?.kind === 'arrangeCards') {
      g.act(d.seat).choose({ kind: 'arrangeCards', top: d.cards, other: [] });
    } else if (d?.kind === 'targets') {
      const first = d.specs[0]?.legal[0];
      if (first === undefined) throw new Error('no legal target');
      g.act(d.seat).choose({
        kind: 'chooseTargets',
        targets: [
          first.kind === 'player'
            ? { kind: 'player', seat: first.seat, specId: d.specs[0]?.specId ?? 't1' }
            : { kind: 'object', id: first.id, specId: d.specs[0]?.specId ?? 't1' },
        ],
      });
    } else if (g.state.stack.length === 0 && d?.kind === 'priority') return;
    else g.pass();
  }
  throw new Error('the stack did not settle');
}

test('Seasoned Dungeoneer is a valid card whose two abilities are the engine nodes', () => {
  expect(validateCard(CARD)).toEqual([]);
  const [etb, attack] = CARD.faces[0]?.abilities ?? [];
  expect(etb).toEqual({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect: { kind: 'takeInitiative', player: { kind: 'you' } },
  });
  expect(attack?.kind === 'triggered' && attack.trigger).toEqual({
    kind: 'attackBatch',
    who: 'you',
    atLeast: 1,
  });
});

describe('When this creature enters, you take the initiative', () => {
  for (const seats of [2, 3, 4] as const) {
    test(`${seats} seats: the controller has the initiative and ventures into Undercity: a basic land is found`, () => {
      let b = scenario({ seats })
        .define(CARD)
        .seat(0)
        .hand(DUNGEONEER)
        .battlefield('Plains', { count: 4 })
        .library(...PLAINS);
      for (let s = 1; s < seats; s += 1) b = b.seat(s).library(...PLAINS);
      const g = b.at('precombatMain').build();
      g.act(0).cast(DUNGEONEER, { pay: true });
      settle(g);
      g.expect.initiative(0);
      g.expect.dungeon(0, 'secretEntrance');
      g.expect.handSize(0, 1);
      for (let s = 1; s < seats; s += 1) g.expect.dungeon(s, null);
    });
  }

  test('with the initiative taken from another player: that player ceases to have it, and the new holder ventures', () => {
    const g = scenario({ seats: 3 })
      .define(CARD)
      .seat(0)
      .hand(DUNGEONEER)
      .battlefield('Plains', { count: 4 })
      .library(...PLAINS)
      .seat(1)
      .library(...PLAINS)
      .seat(2)
      .library(...PLAINS)
      .at('precombatMain', { initiative: 2 })
      .build();
    g.act(0).cast(DUNGEONEER, { pay: true });
    settle(g);
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(2, null);
  });
});

describe('Whenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from creatures until end of turn. It explores.', () => {
  /** Seat 0 attacks with Seasoned Dungeoneer, a Cleric and Grizzly Bears; seat 1 has Typhoid Rats to block with. */
  function attackers(top: string): ScenarioGame {
    return scenario()
      .define(CARD)
      .define(clericCard())
      .seat(0)
      .battlefield(DUNGEONEER, { label: 'dungeoneer' })
      .battlefield(CLERIC, { label: 'cleric' })
      .battlefield(BEARS, { label: 'bears' })
      .library(top, ...PLAINS)
      .seat(1)
      .battlefield(RATS, { label: 'rats' })
      .library(...PLAINS)
      .at('precombatMain')
      .build();
  }

  test('only an attacking creature of one of the four types is a legal target: the Bears are not', () => {
    const g = attackers('Plains');
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'dungeoneer', target: { player: 1 } },
      { attacker: 'cleric', target: { player: 1 } },
      { attacker: 'bears', target: { player: 1 } },
    ]);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected the target question, got ${d?.kind}`);
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')) ?? [];
    expect(legal).toHaveLength(2);
    expect(legal).toContain(g.id('dungeoneer'));
    expect(legal).toContain(g.id('cleric'));
    expect(legal).not.toContain(g.id('bears'));
  });

  test('the chosen creature can’t be blocked by creatures, and it explores: a land from the top goes to the hand', () => {
    const g = attackers('Plains');
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: 'cleric', target: { player: 1 } },
      { attacker: 'bears', target: { player: 1 } },
    ]);
    // One attacking creature of the types: the choice is forced, the trigger goes on the stack with its target.
    g.expect.stack([`${DUNGEONEER} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.counters('cleric', {});
    for (let i = 0; i < 6 && g.state.pending?.kind !== 'declareBlockers'; i += 1) g.pass();
    g.expect.pending('declareBlockers', 1);
    g.expect.canBlock('rats', 'cleric', false);
    g.expect.canBlock('rats', 'bears', true);
  });

  test('a nonland card on top: the explorer gets a +1/+1 counter and the card may go to the graveyard', () => {
    const g = attackers(BEARS);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'cleric', target: { player: 1 } }]);
    g.passAll();
    settle(g);
    g.expect.counters('cleric', { '+1/+1': 1 });
    g.expect.pt('cleric', 3, 3);
  });

  test('three seats: the trigger is about creatures that attack, whoever they attack', () => {
    const g = scenario({ seats: 3 })
      .define(CARD)
      .define(clericCard())
      .seat(0)
      .battlefield(CLERIC, { label: 'cleric' })
      .battlefield(DUNGEONEER)
      .library(...PLAINS)
      .seat(1)
      .library(...PLAINS)
      .seat(2)
      .library(...PLAINS)
      .at('precombatMain', { initiative: 2 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'cleric', target: { player: 2 } }]);
    settle(g);
    g.advanceTo('combatDamage');
    settle(g);
    // The Cleric dealt combat damage to the holder: seat 0 takes the initiative (CR 726.2) and ventures.
    g.expect.initiative(0);
    g.expect.dungeon(0, 'secretEntrance');
    g.expect.dungeon(1, null);
  });
});

/** A 2/2 Human Cleric with no abilities. */
function clericCard(): CardDefinition {
  const imported = importCard(
    fromGoldenCard({
      oracleId: null,
      name: CLERIC,
      layout: 'normal',
      colorIdentity: ['W'],
      edhrecRank: null,
      faces: [
        {
          name: CLERIC,
          manaCost: '{1}{W}',
          typeLine: 'Creature — Human Cleric',
          oracleText: '',
          power: '2',
          toughness: '2',
          loyalty: null,
          defense: null,
          colors: ['W'],
        },
      ],
      source: 'SYNTHETIC',
    } as never),
    undefined,
    NO_OVERRIDES,
  );
  return imported.definition;
}
