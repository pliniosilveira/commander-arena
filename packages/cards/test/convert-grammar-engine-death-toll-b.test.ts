// The Death Toll deck, group B: the REAL cards of the golden corpus read through the grammar only and played through applyAction. Cards put into a graveyard from
// anywhere (CR 603.2, 603.2c), once for each card or as a batch, "for the first time each turn". Stand-ins are SYNTHETIC (named so), with invented power and toughness.
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
const names = (state: GameState, seat: 0 | 1): string[] =>
  getView(state, seat).battlefield.map((o) => o.name);

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
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

const MILL_TWO = parsed('SYNTHETIC Mill Two', 'Sorcery', 'Mill two cards.', { manaCost: '{1}' });
const MILL_ONE = parsed('SYNTHETIC Mill One', 'Sorcery', 'Mill a card.', { manaCost: '{1}' });
const MILL_ONE_B = parsed('SYNTHETIC Mill One B', 'Sorcery', 'Mill a card.', { manaCost: '{1}' });
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const SWEEP = parsed('SYNTHETIC Sweep', 'Sorcery', 'Destroy all creatures.', { manaCost: '{1}' });

describe('Skola Grovedancer (whenever a land card is put into your graveyard from anywhere)', () => {
  const SKOLA = real('Skola Grovedancer');

  test('read as a trigger of the cards of the controller’s graveyard, from anywhere, for a land card (CR 603.2)', () => {
    expect(SKOLA.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'putIntoGraveyard', who: 'you', from: 'anywhere' },
    });
  });

  const game = (top: readonly string[]) =>
    scenario()
      .define(SKOLA)
      .define(MILL_TWO)
      .define(MILL_ONE)
      .define(BEAR)
      .define(SWEEP)
      .seat(0)
      .hand(MILL_TWO.name, MILL_ONE.name, SWEEP.name)
      .battlefield(SKOLA.name)
      .battlefield('Plains', { count: 4 })
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('two lands milled together: one trigger for each card, two life (one trigger for each land card)', () => {
    const g = game(['Forest', 'Mountain']);
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(g.state.seats[0]?.life).toBe(before + 2);
    g.expect.invariants();
  });

  test('a nonland card milled does not trigger it, a land card does', () => {
    const g = game([BEAR.name, 'Forest']);
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(g.state.seats[0]?.life).toBe(before + 1);
  });

  test('a land creature that dies is put into the graveyard from the battlefield: it triggers (from anywhere)', () => {
    const LAND_CREATURE = parsed('SYNTHETIC Living Land', 'Land Creature \u2014 Forest', '', {
      power: '1',
      toughness: '1',
    });
    const KILL = parsed('SYNTHETIC Kill', 'Sorcery', 'Destroy target creature.', {
      manaCost: '{1}',
    });
    const g = scenario()
      .define(SKOLA)
      .define(LAND_CREATURE)
      .define(KILL)
      .seat(0)
      .hand(KILL.name)
      .battlefield(SKOLA.name)
      .battlefield(LAND_CREATURE.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(KILL.name, { pay: true, targets: [LAND_CREATURE.name] });
    settle(g);
    expect(g.state.seats[0]?.life).toBe(before + 1);
  });

  test('a land card put into an opponent’s graveyard is not "your graveyard"', () => {
    const g = scenario()
      .define(SKOLA)
      .define(MILL_ONE)
      .seat(0)
      .hand(MILL_ONE.name)
      .battlefield(SKOLA.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(SKOLA.name)
      .library('Forest', ...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const mine = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(MILL_ONE.name, { pay: true });
    settle(g);
    // Seat 0 milled an Island of their own: a land card, so seat 0's Skola gained 1, and seat 1's did nothing for it.
    expect(g.state.seats[0]?.life).toBe(mine + 1);
    expect(g.state.seats[1]?.life).toBe(40);
  });

  test('Skola must be on the battlefield after the land card is put there: a land that dies together with it does not trigger (ruling 2020-01-24)', () => {
    const LANDCREATURE = parsed('SYNTHETIC Living Land', 'Land Creature — Forest', '', {
      power: '1',
      toughness: '1',
    });
    const g = scenario()
      .define(SKOLA)
      .define(SWEEP)
      .define(LANDCREATURE)
      .seat(0)
      .hand(SWEEP.name)
      .battlefield(SKOLA.name)
      .battlefield(LANDCREATURE.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(SWEEP.name, { pay: true });
    settle(g);
    expect(names(g.state, 0)).not.toContain(SKOLA.name);
    expect(g.state.seats[0]?.life).toBe(before);
  });
});

describe('Crawling Sensation (whenever one or more land cards are put into your graveyard from anywhere for the first time each turn)', () => {
  const CRAWL = real('Crawling Sensation');

  test('read as a batch trigger, first time each turn (CR 603.2c)', () => {
    expect(CRAWL.faces[0]?.abilities.filter((a) => a.kind === 'triggered')).toHaveLength(2);
    expect(
      CRAWL.faces[0]?.abilities.find(
        (a) => a.kind === 'triggered' && a.trigger.kind === 'putIntoGraveyard',
      ),
    ).toMatchObject({
      trigger: {
        kind: 'putIntoGraveyard',
        who: 'you',
        from: 'anywhere',
        batch: true,
        firstTimeEachTurn: true,
        filter: { types: ['land'] },
      },
    });
  });

  const game = (top: readonly string[]) =>
    scenario()
      .define(CRAWL)
      .define(MILL_TWO)
      .define(MILL_ONE)
      .define(MILL_ONE_B)
      .define(BEAR)
      .seat(0)
      .hand(MILL_TWO.name, MILL_ONE.name, MILL_ONE_B.name)
      .battlefield(CRAWL.name)
      .battlefield('Plains', { count: 6 })
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const insects = (g: { state: GameState }) => names(g.state, 0).filter((n) => n === 'Insect');

  test('two lands milled together are one batch: one Insect', () => {
    const g = game(['Forest', 'Mountain']);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(insects(g)).toHaveLength(1);
    g.expect.invariants();
  });

  test('a second land card the same turn does not trigger it again', () => {
    const g = game(['Forest', 'Mountain', 'Swamp']);
    g.act(0).cast(MILL_ONE.name, { pay: true });
    settle(g);
    g.act(0).cast(MILL_ONE_B.name, { pay: true });
    settle(g);
    expect(insects(g)).toHaveLength(1);
  });

  test('a card that is not a land does not use up the first time: the first land card does trigger it', () => {
    const g = game([BEAR.name, 'Forest']);
    g.act(0).cast(MILL_ONE.name, { pay: true });
    settle(g);
    expect(insects(g)).toHaveLength(0);
    g.act(0).cast(MILL_ONE_B.name, { pay: true });
    settle(g);
    expect(insects(g)).toHaveLength(1);
  });
});

/** The names of the cards in a zone of `seat`, top (or first) first. */
function zoneNames(
  state: GameState,
  seat: 0 | 1,
  zone: 'graveyard' | 'library' | 'hand',
): string[] {
  return (state.seats[seat]?.[zone] ?? []).map((id) => {
    const obj = state.objects[id];
    const card = obj?.card == null ? undefined : state.cards[obj.card];
    return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
  });
}

describe('Old Stickfingers (reveal cards from the top of your library until you reveal X creature cards)', () => {
  const STICK = real('Old Stickfingers');

  test('read as a revealUntil of X creature cards that puts them into the graveyard (CR 701.20)', () => {
    expect(STICK.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', self: true },
      effect: {
        kind: 'revealUntil',
        filter: { types: ['creature'] },
        count: { kind: 'x' },
        put: 'graveyard',
      },
    });
  });

  const game = (top: readonly string[], rest: readonly string[] = FILLER) =>
    scenario()
      .define(STICK)
      .define(BEAR)
      .seat(0)
      .hand(STICK.name)
      .battlefield('Swamp')
      .battlefield('Forest')
      .battlefield('Plains', { count: 6 })
      .library(...top, ...rest)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('X = 2: revealed up to the second creature card; the creature cards go to the graveyard, the others to the bottom of the library', () => {
    const g = game(['Plains', BEAR.name, 'Mountain', 'Serra Angel', 'Forest'], ['Swamp']);
    g.act(0).cast(STICK.name, { x: 2, pay: true });
    settle(g);
    expect(zoneNames(g.state, 0, 'graveyard').sort()).toEqual([BEAR.name, 'Serra Angel']);
    const library = zoneNames(g.state, 0, 'library');
    // The cards that were not revealed stay on top, in order; the two revealed lands are at the bottom (in a random order).
    expect(library.slice(0, 2)).toEqual(['Forest', 'Swamp']);
    expect([...library.slice(2)].sort()).toEqual(['Mountain', 'Plains']);
    // Old Stickfingers' power and toughness are the number of creature cards in the graveyard.
    g.expect.pt(STICK.name, 2, 2);
    g.expect.invariants();
  });

  test('X = 0 reveals nothing', () => {
    const g = game([BEAR.name, 'Plains'], ['Swamp']);
    g.act(0).cast(STICK.name, { x: 0, pay: true });
    settle(g);
    // Nothing was revealed or moved; Old Stickfingers itself is a 0/0 (no creature card in the graveyard) and is put into the graveyard by a state-based action.
    expect(zoneNames(g.state, 0, 'graveyard')).toEqual([STICK.name]);
    expect(zoneNames(g.state, 0, 'library')).toEqual([BEAR.name, 'Plains', 'Swamp']);
  });

  test('fewer than X creature cards: the library is revealed to its end and every creature card goes to the graveyard', () => {
    const g = game(['Plains', BEAR.name, 'Island'], []);
    g.act(0).cast(STICK.name, { x: 3, pay: true });
    settle(g);
    expect(zoneNames(g.state, 0, 'graveyard')).toEqual([BEAR.name]);
    expect([...zoneNames(g.state, 0, 'library')].sort()).toEqual(['Island', 'Plains']);
    g.expect.pt(STICK.name, 1, 1);
  });
});

describe('Deadbridge Chant (choose a card at random in your graveyard; a creature card onto the battlefield, otherwise into your hand)', () => {
  const CHANT = real('Deadbridge Chant');

  test('read as a random choice of one card of the graveyard, then a conditional move of the card chosen (CR 608.2c)', () => {
    const ability = CHANT.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered' && a.trigger.kind !== 'entersBattlefield',
    );
    expect(ability).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'chooseRandomFromGraveyard', count: 1 },
          { kind: 'conditional', effect: { kind: 'moveToZone', to: 'battlefield' } },
        ],
      },
    });
  });

  const game = (yard: readonly string[]) =>
    scenario()
      .define(CHANT)
      .define(BEAR)
      .seat(0)
      .battlefield(CHANT.name)
      .graveyard(...yard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('end', { active: 1, turn: 2 })
      .build();
  const upkeep = (yard: readonly string[]) => {
    const g = game(yard);
    g.advanceTo('upkeep');
    settle(g);
    return g;
  };

  test('a creature card is the only card: it is put onto the battlefield', () => {
    const g = upkeep([BEAR.name]);
    expect(names(g.state, 0)).toContain(BEAR.name);
    expect(zoneNames(g.state, 0, 'graveyard')).toEqual([]);
    g.expect.invariants();
  });

  test('a land card is the only card: it is put into your hand (the draw step has not happened yet)', () => {
    const g = upkeep(['Forest']);
    expect(zoneNames(g.state, 0, 'hand')).toEqual(['Forest']);
    expect(zoneNames(g.state, 0, 'graveyard')).toEqual([]);
  });

  test('an empty graveyard: nothing happens', () => {
    const g = upkeep([]);
    expect(zoneNames(g.state, 0, 'hand')).toEqual([]);
    expect(names(g.state, 0)).toEqual([CHANT.name]);
  });

  test('one card of three is chosen: exactly one leaves the graveyard, to the zone its type says', () => {
    const g = upkeep([BEAR.name, 'Forest', 'Mountain']);
    expect(zoneNames(g.state, 0, 'graveyard')).toHaveLength(2);
    const onBattlefield = names(g.state, 0).includes(BEAR.name);
    expect(zoneNames(g.state, 0, 'hand')).toHaveLength(onBattlefield ? 0 : 1);
  });

  test('the choice is made by the seeded generator: the same game gives the same card, and different seeds give both outcomes', () => {
    const outcome = (seed: number) => {
      const g = scenario()
        .define(CHANT)
        .define(BEAR)
        .seed(seed)
        .seat(0)
        .battlefield(CHANT.name)
        .graveyard(BEAR.name, 'Forest')
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('end', { active: 1, turn: 2 })
        .build();
      g.advanceTo('upkeep');
      settle(g);
      return names(g.state, 0).includes(BEAR.name);
    };
    const results = Array.from({ length: 24 }, (_, i) => outcome(i + 1));
    expect(results).toEqual(Array.from({ length: 24 }, (_, i) => outcome(i + 1)));
    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});

describe('Moldgraf Monstrosity (when it dies, exile it, then return two creature cards at random from your graveyard to the battlefield)', () => {
  const MOLD = real('Moldgraf Monstrosity');
  const ELF = parsed('SYNTHETIC Elf', 'Creature — Elf', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  const WOLF = parsed('SYNTHETIC Wolf', 'Creature — Wolf', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  const KILL = parsed('SYNTHETIC Kill', 'Sorcery', 'Destroy target creature.', { manaCost: '{1}' });

  test('read as an exile of the card it became, a random choice of two creature cards of the graveyard, and their return (CR 400.7, 603.10a)', () => {
    const ability = MOLD.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exile', objects: { kind: 'thisCard' } },
          { kind: 'chooseRandomFromGraveyard', count: 2, filter: { types: ['creature'] } },
          { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield' },
        ],
      },
    });
  });

  const game = (yard: readonly string[]) =>
    scenario()
      .define(MOLD)
      .define(BEAR)
      .define(ELF)
      .define(WOLF)
      .define(KILL)
      .seat(0)
      .hand(KILL.name)
      .battlefield(MOLD.name)
      .battlefield('Plains', { count: 2 })
      .graveyard(...yard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const kill = (yard: readonly string[]) => {
    const g = game(yard);
    g.act(0).cast(KILL.name, { pay: true, targets: [MOLD.name] });
    settle(g);
    return g;
  };

  test('two of three creature cards come back; Moldgraf Monstrosity is exiled, and the land card stays', () => {
    const g = kill([BEAR.name, ELF.name, WOLF.name, 'Forest']);
    const back = names(g.state, 0).filter((n) => [BEAR.name, ELF.name, WOLF.name].includes(n));
    expect(back).toHaveLength(2);
    expect(zoneNames(g.state, 0, 'graveyard')).toHaveLength(3); // Kill, the card left over and the Forest
    expect(zoneNames(g.state, 0, 'graveyard')).toContain('Forest');
    g.expect.zone(MOLD.name, 'exile');
    g.expect.invariants();
  });

  test('it is exiled before the choice: it is never one of the cards returned', () => {
    const g = kill([BEAR.name]);
    expect(names(g.state, 0)).toContain(BEAR.name);
    expect(names(g.state, 0)).not.toContain(MOLD.name);
    g.expect.zone(MOLD.name, 'exile');
  });

  test('no creature card: nothing comes back and it is still exiled', () => {
    const none = kill(['Forest']);
    expect(names(none.state, 0)).toEqual(['Plains', 'Plains']);
    none.expect.zone(MOLD.name, 'exile');
  });
});

describe('Demonic Covenant (Demons you control attack a player; the end step token and mill)', () => {
  const COVENANT = real('Demonic Covenant');
  const demon = (name: string) =>
    parsed(name, 'Creature — Demon', '', { manaCost: '{1}', power: '2', toughness: '2' });
  const IMP = demon('SYNTHETIC Imp');
  const FIEND = demon('SYNTHETIC Fiend');
  const LEGEND = parsed('SYNTHETIC Legend Bear', 'Legendary Creature — Bear', '', {
    manaCost: '{1}{G}',
    power: '2',
    toughness: '2',
  });
  const WALKER = 'SYNTHETIC Vanilla Planeswalker';

  test('read as a batch trigger per player attacked and an end step ability of token, mill and a test of the cards milled', () => {
    const abilities = COVENANT.faces[0]?.abilities.filter((a) => a.kind === 'triggered');
    expect(abilities?.[0]).toMatchObject({
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, eachAttackedPlayer: true },
    });
    expect(abilities?.[1]).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken' },
          { kind: 'mill', count: 2 },
          { kind: 'conditional', condition: { kind: 'movedShareAllCardTypes' } },
        ],
      },
    });
  });

  const attackGame = (attackers: readonly string[], target?: string) => {
    const g = scenario()
      .define(COVENANT)
      .define(IMP)
      .define(FIEND)
      .define(BEAR)
      .seat(0)
      .battlefield(COVENANT.name, IMP.name, FIEND.name, BEAR.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(WALKER)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers(
      attackers.map((a) => (target === undefined ? { attacker: a } : { attacker: a, target })),
    );
    settle(g);
    return g;
  };

  test('two Demons attack the player: one trigger, one card drawn and 1 life lost', () => {
    const g = attackGame([IMP.name, FIEND.name]);
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
    g.expect.invariants();
  });

  test('a creature that is not a Demon attacks: nothing', () => {
    const g = attackGame([BEAR.name]);
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
  });

  test('a Demon attacking a planeswalker is not attacking a player: nothing', () => {
    const g = attackGame([IMP.name], WALKER);
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
  });

  const endStep = (top: readonly string[]) => {
    const g = scenario()
      .define(COVENANT)
      .define(BEAR)
      .define(LEGEND)
      .seat(0)
      .battlefield(COVENANT.name)
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('end');
    settle(g);
    return g;
  };

  test('two lands milled share all their card types: the Demon token is made and Covenant is sacrificed', () => {
    const g = endStep(['Forest', 'Island']);
    expect(names(g.state, 0)).toEqual(['Demon']);
    expect(zoneNames(g.state, 0, 'graveyard').sort()).toEqual([COVENANT.name, 'Forest', 'Island']);
    g.expect.invariants();
  });

  test('a land and a creature share no card type: Covenant stays', () => {
    const g = endStep(['Forest', BEAR.name]);
    expect(names(g.state, 0).sort()).toEqual(['Demon', COVENANT.name]);
  });

  test('supertypes and subtypes are not taken into account: a creature and a legendary creature share all their card types', () => {
    const g = endStep([BEAR.name, LEGEND.name]);
    expect(names(g.state, 0)).toEqual(['Demon']);
  });

  test('only one card milled (a library of one): nothing to share, Covenant stays', () => {
    const g = scenario()
      .define(COVENANT)
      .seat(0)
      .battlefield(COVENANT.name)
      .library('Forest')
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('end');
    settle(g);
    expect(names(g.state, 0).sort()).toEqual(['Demon', COVENANT.name]);
  });
});
