// Elven Council deck (Tales of Middle-earth Commander), group "tokens and shuffles", second half: the REAL cards of the golden corpus played in games of three seats. Pins: CR 508.1k
// (attacking creatures, whoever controls them), CR 615 (prevention of combat damage by non-Elves for the turn), CR 102.2 and 608.2d (choose an opponent, each choice its own),
// CR 111.2 (the player who creates a token owns it), CR 101.4 (turn order), CR 603.2c (one or more Elves entering), "triggers only once each turn", CR 614.1c (enters with
// counters), CR 108.3 and 402.1 (every hand), CR 701.23 and 701.24 (search, shuffle), CR 702.125 (undaunted), CR 115.1 (a target player), CR 404.1 (graveyard).
import { readFileSync } from 'node:fs';
import type { CardDefinition, GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  return imported.definition;
}

const AMBUSH = real('Galadhrim Ambush');
const OFFERING = real('Sylvan Offering');
const WARMASTER = real('Elvish Warmaster');
const SEEKERS = real('Realm Seekers');
const SEEDS = real('Seeds of Renewal');
const LEARN = real('Learn from the Past');
const FIELD = real('Field of Ruin');

// SYNTHETIC vanilla creatures.
const SCOUT = parsed('SYNTHETIC Elf Scout', 'Creature — Elf Scout', '', {
  manaCost: '{G}',
  power: '1',
  toughness: '1',
});
const SCOUT2 = parsed('SYNTHETIC Elf Scout Two', 'Creature — Elf Scout', '', {
  manaCost: '{G}',
  power: '1',
  toughness: '1',
});
const GOBLIN = parsed('SYNTHETIC Goblin', 'Creature — Goblin', '', {
  manaCost: '{R}',
  power: '2',
  toughness: '2',
});
const BEARS = 'Grizzly Bears';

const tokensOf = (g: { readonly state: GameState }, seat: number, name?: string) =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return (
      o !== undefined &&
      o.token != null &&
      o.owner === seat &&
      o.controller === seat &&
      (name === undefined || o.token.characteristics.name === name)
    );
  }).length;

describe('Galadhrim Ambush: a token for each attacking creature, and no combat damage from non-Elves', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(AMBUSH)
      .define(SCOUT)
      .define(GOBLIN)
      .seat(0)
      .battlefield(BEARS, SCOUT.name, GOBLIN.name)
      .seat(1)
      .hand(AMBUSH.name)
      .battlefield('Forest', { count: 4 })
      .seat(2)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('seat 1 casts it while seat 0 attacks seat 2 with two creatures: two Elf Warriors for seat 1, and only the Elf deals damage', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS, SCOUT.name], { player: 2 });
    g.act(0).pass();
    g.act(1).cast(AMBUSH.name, { pay: true });
    g.passAll();
    // X is the number of attacking creatures, whoever controls them: the Goblin stayed home.
    expect(tokensOf(g, 1, 'Elf Warrior')).toBe(2);
    expect(tokensOf(g, 0)).toBe(0);
    expect(tokensOf(g, 2)).toBe(0);
    g.advanceTo('endOfCombat');
    // Grizzly Bears is not an Elf and its combat damage is prevented; the Elf Scout deals 1.
    g.expect.life(2, 39);
  });

  test('the prevention is for the whole turn: cast before combat (X is 0), a Goblin that attacks later deals nothing and an Elf does', () => {
    const g = scenario({ seats: 3 })
      .define(AMBUSH)
      .define(SCOUT)
      .define(GOBLIN)
      .seat(0)
      .hand(AMBUSH.name)
      .battlefield('Forest', { count: 4 })
      .battlefield(GOBLIN.name, SCOUT.name)
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(AMBUSH.name, { pay: true });
    g.passAll();
    expect(tokensOf(g, 0)).toBe(0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([GOBLIN.name, SCOUT.name], { player: 1 });
    g.advanceTo('endOfCombat');
    g.expect.life(1, 39);
  });
});

describe('Sylvan Offering: you and a chosen opponent each create the tokens, a choice for each sentence', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(OFFERING)
      .seat(0)
      .hand(OFFERING.name)
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .seat(2)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('X = 2: two opponents are offered each time, and the two choices may differ', () => {
    const g = board();
    g.act(0).cast(OFFERING.name, { x: 2, pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({
      kind: 'chooseOption',
      purpose: 'playerChoice',
      seat: 0,
      options: ['seat:1', 'seat:2'],
    });
    g.act(0).chooseOption('seat:1');
    // First sentence done: a 2/2 Treefolk each for seat 0 and seat 1; the second choice is asked.
    expect(g.state.pending).toMatchObject({ kind: 'chooseOption', purpose: 'playerChoice' });
    g.act(0).chooseOption('seat:2');
    expect(tokensOf(g, 0, 'Treefolk')).toBe(1);
    expect(tokensOf(g, 1, 'Treefolk')).toBe(1);
    expect(tokensOf(g, 2, 'Treefolk')).toBe(0);
    expect(tokensOf(g, 0, 'Elf Warrior')).toBe(2);
    expect(tokensOf(g, 1, 'Elf Warrior')).toBe(0);
    expect(tokensOf(g, 2, 'Elf Warrior')).toBe(2);
    const [treefolk] = g.find({ name: 'Treefolk', zone: 'battlefield', seat: 1 });
    if (treefolk === undefined) throw new Error('no Treefolk');
    g.expect.pt(treefolk.id, 2, 2);
    g.expect.invariants();
  });
});

describe('Elvish Warmaster: one or more other Elves entering, once each turn; Elves you control get +2/+2 and deathtouch', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(WARMASTER)
      .define(SCOUT)
      .define(SCOUT2)
      .define(GOBLIN)
      .seat(0)
      .hand(SCOUT.name, SCOUT2.name, GOBLIN.name)
      .battlefield(WARMASTER.name)
      .battlefield('Forest', { count: 9 })
      .battlefield('Mountain')
      .seat(1)
      .battlefield(SCOUT2.name)
      .seat(2)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the first Elf that enters makes one Elf Warrior; the token, a second Elf and a Goblin make no more this turn', () => {
    const g = board();
    g.act(0).cast(SCOUT.name, { pay: true });
    g.passAll();
    expect(tokensOf(g, 0, 'Elf Warrior')).toBe(1);
    g.act(0).cast(SCOUT2.name, { pay: true });
    g.passAll();
    g.act(0).cast(GOBLIN.name, { pay: true });
    g.passAll();
    expect(tokensOf(g, 0, 'Elf Warrior')).toBe(1);
  });

  test('a creature that is not an Elf does not trigger it, and an Elf another player controls does not either', () => {
    const g = board();
    g.act(0).cast(GOBLIN.name, { pay: true });
    g.passAll();
    expect(tokensOf(g, 0, 'Elf Warrior')).toBe(0);
  });

  test('the ability is pumped for the Elves you control only: +2/+2 and deathtouch until end of turn', () => {
    const g = board();
    g.act(0).cast(SCOUT.name, { pay: true });
    g.passAll();
    g.act(0).cast(GOBLIN.name, { pay: true });
    g.passAll();
    g.act(0).activate(WARMASTER.name, { pay: true });
    g.passAll();
    g.expect.pt(WARMASTER.name, 4, 4);
    g.expect.pt(SCOUT.name, 3, 3);
    g.expect.derived(SCOUT.name, { keywords: ['deathtouch'] });
    g.expect.pt(GOBLIN.name, 2, 2);
    g.expect.pt({ name: SCOUT2.name, seat: 1 }, 1, 1);
  });
});

describe('Realm Seekers: enters with a counter for each card in all hands; remove one to fetch a land', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(SEEKERS)
      .seat(0)
      .hand(SEEKERS.name, BEARS)
      .battlefield('Forest', { count: 9 })
      .library('Forest')
      .seat(1)
      .hand(BEARS, BEARS)
      .seat(2)
      .hand(BEARS, BEARS, BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('1 + 2 + 3 cards in hand once it has left the caster hand: six +1/+1 counters', () => {
    const g = board();
    g.act(0).cast(SEEKERS.name, { pay: true });
    g.passAll();
    g.expect.counters(SEEKERS.name, { '+1/+1': 6 });
  });

  test('{2}{G}, remove a counter: search for a land card, reveal it, put it into your hand', () => {
    const g = board();
    g.act(0).cast(SEEKERS.name, { pay: true });
    g.passAll();
    g.act(0).activate(SEEKERS.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.passAll();
    g.expect.counters(SEEKERS.name, { '+1/+1': 5 });
    g.expect.handSize(0, 2);
  });
});

describe('Seeds of Renewal: undaunted, return up to two target cards, exile it', () => {
  const board = (seats: 2 | 3 | 4, lands: number) =>
    scenario({ seats })
      .define(SEEDS)
      .seat(0)
      .hand(SEEDS.name)
      .graveyard(BEARS, GOBLIN.name)
      .battlefield('Forest', { count: lands })
      .at('precombatMain', { active: 0, turn: 1 })
      .define(GOBLIN)
      .build();

  test('with two opponents {6}{G} costs {4}{G}: five lands cast it, the cards come back and it is exiled, not put into the graveyard', () => {
    const g = board(3, 5);
    g.act(0).cast(SEEDS.name, { targets: [BEARS, GOBLIN.name], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(GOBLIN.name, 'hand', { seat: 0 });
    g.expect.zone(SEEDS.name, 'exile', { seat: 0 });
  });

  test('with three opponents it costs {3}{G}; with one it still costs {5}{G}', () => {
    const four = board(4, 4);
    four.act(0).cast(SEEDS.name, { targets: [BEARS], pay: true });
    four.passAll();
    four.expect.zone(SEEDS.name, 'exile', { seat: 0 });
    const two = board(2, 5);
    expect(
      two
        .legalActions(0)
        .some(
          (a) => a.kind === 'castSpell' && two.state.objects[a.object] === two.object(SEEDS.name),
        ),
    ).toBe(false);
  });
});

describe('Learn from the Past: a target player shuffles their graveyard into their library, you draw', () => {
  test('seat 2 is the target: its graveyard goes into its library, seat 1 is untouched, and the caster draws a card', () => {
    const g = scenario({ seats: 3 })
      .define(LEARN)
      .seat(0)
      .hand(LEARN.name)
      .battlefield('Island', { count: 4 })
      .library('Forest', 'Forest')
      .seat(1)
      .graveyard(BEARS)
      .seat(2)
      .graveyard(BEARS, BEARS)
      .library('Forest')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(LEARN.name, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 2 })).toHaveLength(0);
    expect(g.find({ name: BEARS, zone: 'library', seat: 2 })).toHaveLength(2);
    expect(g.find({ name: BEARS, zone: 'graveyard', seat: 1 })).toHaveLength(1);
    g.expect.librarySize(2, 3);
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });
});

describe('Field of Ruin: destroy a nonbasic land an opponent controls, then every player searches for a basic land', () => {
  test('three seats: the nonbasic land goes, and each player puts a basic land onto the battlefield, the player without one finds none', () => {
    const g = scenario({ seats: 3 })
      .define(FIELD)
      .seat(0)
      .battlefield(FIELD.name)
      .battlefield('Forest', { count: 2 })
      .library('Plains', 'Island')
      .seat(1)
      .battlefield('Command Tower')
      .library('Mountain', 'Swamp')
      .seat(2)
      .library(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(FIELD.name, {
      ability: 1,
      targets: [{ name: 'Command Tower', seat: 1 }],
      pay: true,
    });
    g.passAll();
    g.act(0).chooseCards('Plains');
    g.act(1).chooseCards('Mountain');
    g.passAll();
    g.expect.zone('Command Tower', 'graveyard', { seat: 1 });
    g.expect.zone(FIELD.name, 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.zone('Mountain', 'battlefield', { seat: 1 });
    expect(g.find({ zone: 'battlefield', seat: 2, name: 'Plains' })).toHaveLength(0);
    g.expect.invariants();
  });
});
