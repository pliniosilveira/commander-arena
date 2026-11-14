// The Hofri Ghostforge deck, group 1 (stage P68, D-229): the REAL cards of the owner's golden corpus read through the grammar only and played through
// applyAction: cards that leave a graveyard, cards exiled from a library or a graveyard, the second spell of a turn, creatures and tokens that enter
// together, the lands of an opponent, the casts of a commander, the untap step of another player, protection from a color, "isn't a creature", the mana
// of another player, and the rider of Study Hall. Stand-ins are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import { type Action, type CardDefinition, type GameState, getView } from '@commander-arena/engine';
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
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
/** The names of the permanents `seat` sees on the battlefield. */
const names = (state: GameState, seat: 0 | 1, _zone: 'battlefield'): string[] =>
  getView(state, seat).battlefield.map((o) => o.name);

const SMALL = { manaCost: '{1}', power: '1', toughness: '1' } as const;
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const ELF = parsed('SYNTHETIC Elf', 'Creature — Elf', '', SMALL);
const RECALL = parsed(
  'SYNTHETIC Recall',
  'Sorcery',
  'Return target creature card from your graveyard to your hand.',
  { manaCost: '{1}' },
);
const BANISH = parsed('SYNTHETIC Banish', 'Sorcery', "Exile target player's graveyard.", {
  manaCost: '{1}',
});
const TWINS = parsed(
  'SYNTHETIC Twins',
  'Sorcery',
  'Create two 1/1 white Spirit creature tokens with flying.',
  { manaCost: '{1}' },
);
const shock = (n: number) =>
  parsed(`SYNTHETIC Shock ${n}`, 'Instant', '~ deals 2 damage to any target.', { manaCost: '{R}' });
const WOLF = parsed('SYNTHETIC Wolf', 'Creature \u2014 Wolf', '', SMALL);

/** Passes priority until the stack is empty. */
function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 16; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'orderTriggers') {
      // Several triggers at once: the controller takes the order the engine offers first (CR 603.3b).
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

describe('Quintorius, Field Historian and Spirit Mascot (whenever one or more cards leave your graveyard)', () => {
  const QUINT = real('Quintorius, Field Historian');
  const MASCOT = real('Spirit Mascot');

  test('read as a batch trigger of the controller’s graveyard (CR 400.7, 603.2c)', () => {
    expect(
      QUINT.faces[0]?.abilities.some(
        (a) => a.kind === 'triggered' && a.trigger.kind === 'leftGraveyard',
      ),
    ).toBe(true);
    expect(MASCOT.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'leftGraveyard', who: 'you' },
    });
  });

  const game = () =>
    scenario()
      .define(QUINT)
      .define(MASCOT)
      .define(BEAR)
      .define(ELF)
      .define(RECALL)
      .define(BANISH)
      .define(WOLF)
      .seat(0)
      .hand(RECALL.name, BANISH.name)
      .graveyard(BEAR.name, ELF.name)
      .battlefield(QUINT.name)
      .battlefield(MASCOT.name)
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .graveyard(WOLF.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('one card leaving makes one Spirit and one counter', () => {
    const g = game();
    g.act(0).cast(RECALL.name, { pay: true, targets: [BEAR.name] });
    settle(g);
    expect(names(g.state, 0, 'battlefield').filter((n) => n === 'Spirit')).toHaveLength(1);
    g.expect.counters(MASCOT.name, { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('two cards leaving together are one occurrence: one Spirit, one counter; a card of another graveyard is not counted', () => {
    const g = game();
    g.act(0).cast(BANISH.name, { pay: true, targets: [{ player: 0 }] });
    settle(g);
    expect(names(g.state, 0, 'battlefield').filter((n) => n === 'Spirit')).toHaveLength(1);
    g.expect.counters(MASCOT.name, { '+1/+1': 1 });
    const h = game();
    h.act(0).cast(BANISH.name, { pay: true, targets: [{ player: 1 }] });
    settle(h);
    expect(names(h.state, 0, 'battlefield').filter((n) => n === 'Spirit')).toHaveLength(0);
    h.expect.counters(MASCOT.name, {});
  });
});

describe('Laelia, the Blade Reforged (whenever one or more cards are put into exile from your library and/or your graveyard)', () => {
  const LAELIA = real('Laelia, the Blade Reforged');
  test('attacking exiles the top card of the library: one +1/+1 counter, and the card may be played', () => {
    const g = scenario()
      .define(LAELIA)
      .seat(0)
      .battlefield(LAELIA.name)
      .library('Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(LAELIA.name);
    g.passAll();
    g.expect.counters(LAELIA.name, { '+1/+1': 1 });
    g.expect.invariants();
  });
});

describe('Monologue Tax (whenever an opponent casts their second spell each turn, you create a Treasure)', () => {
  const TAX = real('Monologue Tax');
  test('the first spell of the opponent makes nothing, the second a Treasure, the third nothing', () => {
    const g = scenario()
      .define(TAX)
      .define(shock(1))
      .define(shock(2))
      .define(shock(3))
      .seat(0)
      .battlefield(TAX.name)
      .library(...FILLER)
      .seat(1)
      .hand(shock(1).name, shock(2).name, shock(3).name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    const treasures = () => names(g.state, 0, 'battlefield').filter((n) => n === 'Treasure').length;
    for (const [n, expected] of [
      [1, 0],
      [2, 1],
      [3, 1],
    ] as const) {
      g.act(1).cast(shock(n).name, { pay: true, targets: [{ player: 0 }] });
      settle(g);
      expect(treasures()).toBe(expected);
    }
    g.expect.invariants();
  });
});

describe("Tocasia's Welcome (one or more creatures with mana value 3 or less enter: draw, once each turn)", () => {
  const WELCOME = real("Tocasia's Welcome");
  const BIG = parsed('SYNTHETIC Big', 'Creature — Giant', '', {
    manaCost: '{4}',
    power: '4',
    toughness: '4',
  });
  test('two creatures that enter together draw one card; a creature of mana value 4 draws none; a later one the same turn draws none', () => {
    const g = scenario()
      .define(WELCOME)
      .define(TWINS)
      .define(ELF)
      .define(BIG)
      .seat(0)
      .hand(TWINS.name, ELF.name, BIG.name)
      .battlefield(WELCOME.name)
      .battlefield('Plains', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const hand = () => g.state.seats[0]?.hand.length ?? 0;
    // Tokens have mana value 0: the two Spirits are one batch.
    g.act(0).cast(TWINS.name, { pay: true });
    settle(g);
    expect(hand()).toBe(2 + 1 - 0);
    g.act(0).cast(ELF.name, { pay: true });
    settle(g);
    // The Elf entered the same turn: the ability triggers only once each turn (CR 603.2).
    expect(hand()).toBe(2 + 1 - 1);
    g.expect.invariants();
  });
});

describe('Staff of the Storyteller (whenever you create one or more creature tokens, put a story counter on it)', () => {
  const STAFF = real('Staff of the Storyteller');
  test('its own Spirit is a creation of tokens, and the counter pays for {W}, {T}: draw a card', () => {
    const g = scenario()
      .define(STAFF)
      .seat(0)
      .hand(STAFF.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(STAFF.name, { pay: true });
    settle(g);
    g.expect.counters(STAFF.name, { story: 1 });
    g.act(0).activate(STAFF.name, { ability: 2 }).pay();
    g.passAll();
    g.expect.counters(STAFF.name, {});
    g.expect.invariants();
  });
});

describe("Archaeomancer's Map (a land an opponent controls enters while they control more lands than you: put a land from your hand)", () => {
  const MAP = real("Archaeomancer's Map");
  const game = (mine: number) =>
    scenario()
      .define(MAP)
      .seat(0)
      .hand('Swamp')
      .battlefield(MAP.name)
      .battlefield('Plains', { count: mine })
      .library(...FILLER)
      .seat(1)
      .hand('Forest')
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('with fewer lands than the opponent it offers the land of the hand, and it enters', () => {
    const g = game(2);
    g.act(1).playLand('Forest');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    settle(g);
    expect(names(g.state, 0, 'battlefield')).toContain('Swamp');
    g.expect.invariants();
  });

  test('with as many lands as the opponent will have it does nothing (the intervening "if", CR 603.4)', () => {
    const g = game(4);
    g.act(1).playLand('Forest');
    settle(g);
    expect(names(g.state, 0, 'battlefield')).not.toContain('Swamp');
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('Vanguard of the Restless (Spirits you control get +1/+1 for each time you cast your commander from the command zone)', () => {
  const VANGUARD = real('Vanguard of the Restless');
  const CHIEF = parsed('SYNTHETIC Chief', 'Legendary Creature — Spirit', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  test('reads as the number of casts of the commanders (CR 903.8)', () => {
    expect(VANGUARD.faces[0]?.abilities).toContainEqual(
      expect.objectContaining({
        static: expect.objectContaining({ power: { kind: 'commanderCasts' } }),
      }),
    );
  });
  test('each cast from the command zone adds +1/+1 to every Spirit', () => {
    const g = scenario()
      .define(VANGUARD)
      .define(CHIEF)
      .seat(0)
      .commander(CHIEF.name, { casts: 0 })
      .battlefield(VANGUARD.name)
      .battlefield('Plains', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.pt(VANGUARD.name, 2, 2);
    g.act(0).cast(CHIEF.name, { pay: true });
    settle(g);
    g.expect.pt(VANGUARD.name, 3, 3);
    g.expect.pt(CHIEF.name, 2, 2);
    g.expect.invariants();
  });
});

describe("Drumbellower (untap all creatures you control during each other player's untap step)", () => {
  const DRUM = real('Drumbellower');
  test('the creatures of the controller untap in the untap step of the opponent, and not in a step of their own beyond the usual', () => {
    const g = scenario()
      .define(DRUM)
      .define(BEAR)
      .seat(0)
      .battlefield(DRUM.name, { tapped: true })
      .battlefield(BEAR.name, { tapped: true })
      .battlefield('Plains', { tapped: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(DRUM.name, false);
    g.expect.tapped(BEAR.name, false);
    // A land is not a creature.
    g.expect.tapped('Plains', true);
    g.expect.invariants();
  });
});

describe('Thancred Waters (another target legendary permanent you control gains indestructible for as long as you control it)', () => {
  const THANCRED = real('Thancred Waters');
  const LEGEND = parsed('SYNTHETIC Legend', 'Legendary Creature — Elf', '', SMALL);
  const DESTROY = parsed('SYNTHETIC Doom', 'Instant', 'Exile target creature.', {
    manaCost: '{1}',
  });
  test('the permanent is indestructible while Thancred Waters is under your control, and not after it leaves', () => {
    const g = scenario()
      .define(THANCRED)
      .define(LEGEND)
      .define(DESTROY)
      .seat(0)
      .hand(THANCRED.name, DESTROY.name)
      .battlefield(LEGEND.name)
      .battlefield('Plains', { count: 7 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(THANCRED.name, { pay: true });
    settle(g);
    g.expect.derived(LEGEND.name, { keywords: ['indestructible'] });
    // Thancred Waters has left: the effect ends (CR 611.2b).
    g.act(0).cast(DESTROY.name, { pay: true, targets: [THANCRED.name] });
    settle(g);
    g.expect.zone(THANCRED.name, 'exile');
    g.expect.derived(LEGEND.name, { keywords: [] });
    g.expect.invariants();
  });
});

describe('Karmic Guide (protection from black, CR 702.16)', () => {
  const GUIDE = real('Karmic Guide');
  const MURDER = parsed('SYNTHETIC Murder', 'Instant', 'Destroy target creature.', {
    manaCost: '{B}',
    colors: ['B'],
  });
  const FLAME = parsed('SYNTHETIC Flame', 'Instant', 'Destroy target creature.', {
    manaCost: '{R}',
    colors: ['R'],
  });
  const BLIGHT = parsed('SYNTHETIC Blight', 'Sorcery', '~ deals 3 damage to each creature.', {
    manaCost: '{B}',
    colors: ['B'],
  });
  const REACH_B = parsed('SYNTHETIC Black Reacher', 'Creature — Spider', 'Reach', {
    manaCost: '{B}',
    colors: ['B'],
    power: '1',
    toughness: '1',
  });
  const REACH_R = parsed('SYNTHETIC Red Reacher', 'Creature — Spider', 'Reach', {
    manaCost: '{R}',
    colors: ['R'],
    power: '1',
    toughness: '1',
  });

  test('reads as protection from the color black', () => {
    expect(GUIDE.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'protection', from: 'color', colors: ['B'] },
    });
  });

  const game = () =>
    scenario()
      .define(GUIDE)
      .define(MURDER)
      .define(FLAME)
      .define(BLIGHT)
      .define(REACH_B)
      .define(REACH_R)
      .define(ELF)
      .seat(0)
      .battlefield(GUIDE.name)
      .battlefield(ELF.name)
      .library(...FILLER)
      .seat(1)
      .hand(MURDER.name, FLAME.name, BLIGHT.name)
      .battlefield(REACH_B.name)
      .battlefield(REACH_R.name)
      .battlefield('Swamp', { count: 3 })
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('a black spell cannot target it, a red spell can (CR 702.16b)', () => {
    const g = game();
    expect(() => g.act(1).cast(MURDER.name, { pay: true, targets: [GUIDE.name] })).toThrow();
    const h = game();
    h.act(1).cast(FLAME.name, { pay: true, targets: [GUIDE.name] });
    settle(h);
    h.expect.zone(GUIDE.name, 'graveyard');
  });

  test('damage from a black source is prevented (CR 702.16e): an Elf dies, the Angel Spirit lives', () => {
    const g = game();
    g.act(1).cast(BLIGHT.name, { pay: true });
    settle(g);
    g.expect.zone(ELF.name, 'graveyard');
    g.expect.zone(GUIDE.name, 'battlefield');
    g.expect.damage(GUIDE.name, 0);
    g.expect.invariants();
  });

  test('a black creature cannot block it and a red one could not either (flying); with reach only the red one can (CR 702.16f)', () => {
    // The Guide is the attacker on its own turn.
    const h = scenario()
      .define(GUIDE)
      .define(REACH_B)
      .define(REACH_R)
      .seat(0)
      .battlefield(GUIDE.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(REACH_B.name)
      .battlefield(REACH_R.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    h.advanceTo('declareAttackers');
    h.act(0).attack(GUIDE.name);
    h.passAll();
    h.expect.canBlock(REACH_B.name, GUIDE.name, false);
    h.expect.canBlock(REACH_R.name, GUIDE.name, true);
  });
});

describe('The Warring Triad (not a creature while there are fewer than eight cards in your graveyard; target player adds one mana of any color)', () => {
  const TRIAD = real('The Warring Triad');
  const game = (graveyard: number) =>
    scenario()
      .define(TRIAD)
      .seat(0)
      .battlefield(TRIAD.name)
      .graveyard(...Array.from({ length: graveyard }, () => 'Island'))
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it is an artifact God and no creature below eight cards, a 5/5 flying creature at eight (CR 613.1d, 205.1a)', () => {
    const few = game(7);
    few.expect.derived(TRIAD.name, { types: ['artifact'], subtypes: [] });
    const many = game(8);
    many.expect.derived(TRIAD.name, { types: ['artifact', 'creature'], subtypes: ['God'] });
    many.expect.pt(TRIAD.name, 5, 5);
  });

  test('{T}, mill a card: the player chooses a color and the mana goes into their pool', () => {
    const g = game(0);
    g.act(0).activate(TRIAD.name, { targets: [{ player: 0 }] });
    settle(g);
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('green');
    g.expect.pool(0, { G: 1 });
    g.expect.tapped(TRIAD.name, true);
    g.expect.zone('Island', 'graveyard');
    g.expect.invariants();
  });

  test('aimed at the opponent, the opponent is the one who chooses the color and gets the mana', () => {
    const g = game(0);
    g.act(0).activate(TRIAD.name, { targets: [{ player: 1 }] });
    settle(g);
    g.expect.pending('chooseOption', 1);
    g.act(1).chooseOption('red');
    g.expect.pool(1, { R: 1 });
    g.expect.pool(0, {});
  });
});

describe('Study Hall (when you spend this mana to cast your commander, scry X: X is the times it has been cast from the command zone)', () => {
  const HALL = real('Study Hall');
  const CHIEF = parsed('SYNTHETIC Chief', 'Legendary Creature — Spirit', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  test('the second cast of the commander scries two', () => {
    const g = scenario()
      .define(HALL)
      .define(CHIEF)
      .seat(0)
      .commander(CHIEF.name, { casts: 1 })
      .battlefield(HALL.name)
      .battlefield('Plains', { count: 4 })
      .library('Forest', 'Mountain', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    // The commander costs {1} and {2} more for its tax; pay with the Hall's colored mana, then the Plains.
    g.act(0).tapForMana('Plains[0]');
    g.act(0).tapForMana(HALL.name, { ability: 1, color: 'G' });
    g.act(0).cast(CHIEF.name, { pay: true });
    settle(g);
    g.expect.pending('arrangeCards', 0);
    expect((g.state.pending as { cards?: readonly unknown[] }).cards).toHaveLength(2);
  });
});

describe("Gideon's Memorial and Phoenix Down", () => {
  const MEMORIAL = real("Gideon's Memorial");
  const DOWN = real('Phoenix Down');
  test('Memorial: from the hand, {1}{W} and a discard of itself deals 4 damage to an attacking creature', () => {
    const g = scenario()
      .define(MEMORIAL)
      .define(BEAR)
      .seat(0)
      .hand(MEMORIAL.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(BEAR.name);
    g.act(1).pass();
    g.act(0).activate(MEMORIAL.name, { targets: [BEAR.name], pay: true });
    settle(g);
    g.expect.zone(BEAR.name, 'graveyard');
    g.expect.zone(MEMORIAL.name, 'graveyard');
    g.expect.invariants();
  });
  test('Memorial: a creature that is neither attacking nor blocking is not a target', () => {
    const g = scenario()
      .define(MEMORIAL)
      .define(BEAR)
      .seat(0)
      .hand(MEMORIAL.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEAR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    expect(() => g.act(0).activate(MEMORIAL.name, { targets: [BEAR.name], pay: true })).toThrow();
  });
  test('Phoenix Down: exile itself as a cost, then return a creature of mana value 4 or less tapped', () => {
    const g = scenario()
      .define(DOWN)
      .define(BEAR)
      .seat(0)
      .battlefield(DOWN.name)
      .battlefield('Plains', { count: 2 })
      .graveyard(BEAR.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(DOWN.name, { modes: [0], targets: [BEAR.name], pay: true });
    settle(g);
    g.expect.zone(DOWN.name, 'exile');
    g.expect.zone(BEAR.name, 'battlefield');
    g.expect.tapped(BEAR.name, true);
    g.expect.invariants();
  });
});
