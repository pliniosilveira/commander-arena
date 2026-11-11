// The Hofri Ghostforge deck, group 2 (stage P68, D-230): returns from the graveyard. The REAL cards of the owner's golden corpus, read through the grammar only and played
// through applyAction: a limit of mana value that is an amount (X is a power, the damage dealt), "historic", Backup, finality counters, "that card" of a dies trigger,
// the permanents a spell returns that become Spirits, a destroy that counts what it destroyed, and a copy of the spell cast from a graveyard. Stand-ins are SYNTHETIC
// (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import type { Action, CardDefinition, GameState } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
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
const onBattlefield = (state: GameState, seat: 0 | 1): string[] =>
  getView(state, seat).battlefield.map((o) => o.name);

function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 20; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'orderTriggers') {
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

const creature = (name: string, cost: string, power: string, toughness: string, text = '') =>
  parsed(`SYNTHETIC ${name}`, 'Creature — Bear', text, { manaCost: cost, power, toughness });
const ONE = creature('One', '{1}', '1', '1');
const THREE = creature('Three', '{2}{1}', '2', '2');
const FOUR = creature('Four', '{3}{1}', '4', '4');

describe('Teshar, Ancestor’s Apostle (whenever you cast a historic spell, return a creature card of mana value 3 or less)', () => {
  const TESHAR = real("Teshar, Ancestor's Apostle");
  const LEGEND = parsed('SYNTHETIC Legend', 'Legendary Creature — Elf', '', SMALL());
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{1}' });
  const PLAIN = parsed('SYNTHETIC Plain', 'Instant', 'You gain 1 life.', { manaCost: '{1}' });
  function SMALL() {
    return { manaCost: '{1}', power: '1', toughness: '1' } as const;
  }
  const game = (hand: string) =>
    scenario()
      .define(TESHAR)
      .define(LEGEND)
      .define(RELIC)
      .define(PLAIN)
      .define(THREE)
      .define(FOUR)
      .seat(0)
      .hand(hand)
      .graveyard(THREE.name, FOUR.name)
      .battlefield(TESHAR.name)
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a cast trigger of an artifact, a legendary permanent or a Saga (CR 700.6)', () => {
    expect(TESHAR.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: {
        kind: 'castSpell',
        by: 'you',
        filter: {
          anyOf: [{ types: ['artifact'] }, { supertypes: ['legendary'] }, { subtypes: ['Saga'] }],
        },
      },
    });
  });

  test.each([LEGEND.name, RELIC.name])(
    'casting %s returns the creature of mana value 3, never the one of 4',
    (name) => {
      const g = game(name);
      g.act(0).cast(name, { pay: true });
      // The only legal target (mana value 3: the 4 is not one) is chosen by the engine.
      settle(g);
      expect(onBattlefield(g.state, 0)).toContain(THREE.name);
      g.expect.zone(FOUR.name, 'graveyard');
      g.expect.invariants();
    },
  );

  test('a spell that is not historic triggers nothing', () => {
    const g = game(PLAIN.name);
    g.act(0).cast(PLAIN.name, { pay: true });
    settle(g);
    expect(onBattlefield(g.state, 0)).not.toContain(THREE.name);
  });
});

describe('Venerable Warsinger (return a creature card with mana value X or less, X the damage dealt)', () => {
  const WARSINGER = real('Venerable Warsinger');
  test('hits for 3: the creature of mana value 3 is a target, the one of 4 is not', () => {
    const g = scenario()
      .define(WARSINGER)
      .define(THREE)
      .define(FOUR)
      .seat(0)
      .battlefield(WARSINGER.name)
      .graveyard(THREE.name, FOUR.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(WARSINGER.name);
    for (let i = 0; i < 12 && g.state.pending?.kind !== 'confirmOptional'; i += 1) g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // The only legal target (mana value 3 or less, X being the 3 damage dealt) is chosen by the engine.
    settle(g);
    expect(onBattlefield(g.state, 0)).toContain(THREE.name);
    g.expect.zone(FOUR.name, 'graveyard');
    g.expect.invariants();
  });
});

describe('Guardian Scalelord (Backup 1; attacks: return a nonland permanent card with mana value X or less, X its power)', () => {
  const LORD = real('Guardian Scalelord');
  test('Backup on another creature: the counter and, until end of turn, flying and the attack trigger', () => {
    const g = scenario()
      .define(LORD)
      .define(ONE)
      .seat(0)
      .hand(LORD.name)
      .battlefield(ONE.name)
      .battlefield('Plains', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(LORD.name, { pay: true });
    settle(g);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(ONE.name);
    settle(g);
    g.expect.counters(ONE.name, { '+1/+1': 1 });
    g.expect.derived(ONE.name, { keywords: ['flying'] });
    g.expect.pt(ONE.name, 2, 2);
    g.expect.derived(LORD.name, { keywords: ['backup', 'flying'] });
    g.expect.invariants();
  });

  test('Backup on itself: only the counter (it already has the abilities)', () => {
    const g = scenario()
      .define(LORD)
      .seat(0)
      .hand(LORD.name)
      .battlefield('Plains', { count: 5 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(LORD.name, { pay: true });
    settle(g);
    g.expect.counters(LORD.name, { '+1/+1': 1 });
    g.expect.pt(LORD.name, 4, 5);
  });

  test('the attack trigger returns a card of mana value up to its power (4 with the counter)', () => {
    const g = scenario()
      .define(LORD)
      .define(FOUR)
      .define(creature('Five', '{4}{1}', '1', '1'))
      .seat(0)
      .battlefield(LORD.name, { counters: { '+1/+1': 1 } })
      .graveyard(FOUR.name, 'SYNTHETIC Five')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(LORD.name);
    // The card of mana value 5 is no target (the power is 4): the card of mana value 4 is the only one.
    settle(g);
    expect(onBattlefield(g.state, 0)).toContain(FOUR.name);
    g.expect.zone('SYNTHETIC Five', 'graveyard');
  });
});

describe('Sevinne’s Reclamation (cast from a graveyard: copy it and choose a new target)', () => {
  const SEVINNE = real("Sevinne's Reclamation");
  test('from the hand it returns one card and offers no copy; with flashback it offers a copy that returns another', () => {
    const g = scenario()
      .define(SEVINNE)
      .define(ONE)
      .define(THREE)
      .seat(0)
      .hand(SEVINNE.name)
      .graveyard(ONE.name, THREE.name)
      .battlefield('Plains', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SEVINNE.name, { pay: true, targets: [ONE.name] });
    settle(g);
    expect(onBattlefield(g.state, 0)).toContain(ONE.name);
    expect(g.state.pending?.kind).toBe('priority');
    // Flashback from the graveyard ({4}{W}): the copy is offered.
    g.act(0).cast(SEVINNE.name, { alternative: 'flashback' }).targets([THREE.name]).pay();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    settle(g);
    g.expect.invariants();
  });
});

describe('Excava, the Risen Past (attacks: return a card of mana value 3 or less with a finality counter; it is a 1/1 Spirit with flying)', () => {
  const EXCAVA = real('Excava, the Risen Past');
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{2}' });
  const SHOCK = parsed('SYNTHETIC Zap', 'Instant', '~ deals 5 damage to any target.', {
    manaCost: '{R}',
  });
  test('the returned artifact is a creature 1/1 Spirit with flying, and it is exiled when it would die', () => {
    const g = scenario()
      .define(EXCAVA)
      .define(RELIC)
      .define(SHOCK)
      .seat(0)
      .battlefield(EXCAVA.name)
      .graveyard(RELIC.name)
      .battlefield('Mountain')
      .hand(SHOCK.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(EXCAVA.name);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(RELIC.name);
    settle(g);
    g.expect.counters(RELIC.name, { finality: 1 });
    g.expect.derived(RELIC.name, {
      types: ['artifact', 'creature'],
      subtypes: ['Spirit'],
      keywords: ['flying'],
    });
    g.expect.pt(RELIC.name, 1, 1);
    // Killed, it is exiled instead (CR 122.1h).
    g.act(0).cast(SHOCK.name, { pay: true, targets: [RELIC.name] });
    settle(g);
    g.expect.zone(RELIC.name, 'exile');
    g.expect.invariants();
  });
});

describe('Valkyrie’s Call (a nontoken, non-Angel creature you control dies: it comes back as an Angel with flying and a +1/+1 counter)', () => {
  const CALL = real("Valkyrie's Call");
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  const ANGEL = parsed('SYNTHETIC Seraph', 'Creature — Angel', '', {
    manaCost: '{1}',
    power: '2',
    toughness: '2',
  });
  const game = () =>
    scenario()
      .define(CALL)
      .define(ONE)
      .define(ANGEL)
      .define(DOOM)
      .seat(0)
      .hand(DOOM.name)
      .battlefield(CALL.name)
      .battlefield(ONE.name)
      .battlefield(ANGEL.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the Bear returns with a counter, flying and the Angel type; the Angel does not return', () => {
    const g = game();
    g.act(0).cast(DOOM.name, { pay: true, targets: [ONE.name] });
    settle(g);
    g.expect.zone(ONE.name, 'battlefield');
    g.expect.counters(ONE.name, { '+1/+1': 1 });
    g.expect.derived(ONE.name, { subtypes: ['Bear', 'Angel'], keywords: ['flying'] });
    const h = game();
    h.act(0).cast(DOOM.name, { pay: true, targets: [ANGEL.name] });
    settle(h);
    h.expect.zone(ANGEL.name, 'graveyard');
    h.expect.invariants();
  });
});

describe('Storm of Souls and Ceaseless Conflict', () => {
  const STORM = real('Storm of Souls');
  const CONFLICT = real('Ceaseless Conflict');
  test('Storm of Souls returns every creature card as a 1/1 Spirit with flying and exiles itself', () => {
    const g = scenario()
      .define(STORM)
      .define(FOUR)
      .define(ONE)
      .seat(0)
      .hand(STORM.name)
      .graveyard(FOUR.name, ONE.name)
      .battlefield('Plains', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(STORM.name, { pay: true });
    settle(g);
    for (const name of [FOUR.name, ONE.name]) {
      g.expect.derived(name, { subtypes: ['Bear', 'Spirit'], keywords: ['flying'] });
      g.expect.pt(name, 1, 1);
    }
    g.expect.zone(STORM.name, 'exile');
    g.expect.invariants();
  });

  test('Ceaseless Conflict makes a 3/2 Spirit for each of my nontoken creatures it destroyed, not for tokens or the opponent’s', () => {
    const TOKENS = parsed(
      'SYNTHETIC Twins',
      'Sorcery',
      'Create a 1/1 white Spirit creature token.',
      {
        manaCost: '{1}',
      },
    );
    const g = scenario()
      .define(CONFLICT)
      .define(ONE)
      .define(THREE)
      .define(FOUR)
      .define(TOKENS)
      .seat(0)
      .hand(CONFLICT.name, TOKENS.name)
      .battlefield(ONE.name)
      .battlefield(THREE.name)
      .battlefield('Plains', { count: 8 })
      .library(...FILLER)
      .seat(1)
      .battlefield(FOUR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TOKENS.name, { pay: true });
    settle(g);
    g.act(0).cast(CONFLICT.name, { pay: true });
    settle(g);
    const mine = onBattlefield(g.state, 0).filter((n) => n === 'Spirit');
    expect(mine).toHaveLength(2);
    g.expect.zone(ONE.name, 'graveyard');
    g.expect.zone(FOUR.name, 'graveyard');
    g.expect.invariants();
  });
});

describe('Hofri Ghostforge (another nontoken creature you control dies: exile it, make a Spirit copy that returns the card when it leaves)', () => {
  const HOFRI = real('Hofri Ghostforge');
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  const DOOM2 = parsed('SYNTHETIC Doom Two', 'Instant', 'Destroy target creature.', {
    manaCost: '{1}',
  });
  const game = () =>
    scenario()
      .define(HOFRI)
      .define(THREE)
      .define(DOOM)
      .define(DOOM2)
      .seat(0)
      .hand(DOOM.name, DOOM2.name)
      .battlefield(HOFRI.name)
      .battlefield(THREE.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the card is exiled and a token copy, a Spirit with trample and haste, takes its place', () => {
    const g = game();
    g.act(0).cast(DOOM.name, { pay: true, targets: [THREE.name] });
    settle(g);
    expect(g.find({ name: THREE.name, zone: 'exile' })).toHaveLength(1);
    const token = { name: THREE.name, zone: 'battlefield' } as const;
    expect(g.find(token)).toHaveLength(1);
    g.expect.derived(token, { subtypes: ['Bear', 'Spirit'] });
    // Hofri gives Spirits +1/+1: the copy of a 2/2 is a 3/3.
    g.expect.pt(token, 3, 3);
    g.expect.invariants();
  });

  test('when the token leaves the battlefield, the exiled card goes to its owner’s graveyard', () => {
    const g = game();
    g.act(0).cast(DOOM.name, { pay: true, targets: [THREE.name] });
    settle(g);
    const token = { name: THREE.name, zone: 'battlefield' } as const;
    expect(g.find(token)).toHaveLength(1);
    // A Doom on the token: it dies as a token (not a card), another nontoken death is no trigger of Hofri's ("nontoken").
    g.act(0).cast(DOOM2.name, { pay: true, targets: [token] });
    settle(g);
    expect(g.find({ name: THREE.name, zone: 'exile' })).toHaveLength(0);
    expect(g.find({ name: THREE.name, zone: 'graveyard' })).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('Fiend Hunter (exile another target creature; when it leaves the battlefield, return the exiled card)', () => {
  const HUNTER = real('Fiend Hunter');
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  test('the creature comes back under its owner’s control when Fiend Hunter dies', () => {
    const g = scenario()
      .define(HUNTER)
      .define(FOUR)
      .define(DOOM)
      .seat(0)
      .hand(HUNTER.name, DOOM.name)
      .battlefield('Plains', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .battlefield(FOUR.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(HUNTER.name, { pay: true });
    settle(g);
    if (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    settle(g);
    g.expect.zone(FOUR.name, 'exile');
    g.act(0).cast(DOOM.name, { pay: true, targets: [HUNTER.name] });
    settle(g);
    g.expect.zone(HUNTER.name, 'graveyard');
    expect(onBattlefield(g.state, 1)).toContain(FOUR.name);
    g.expect.invariants();
  });
});

describe('Ao, the Dawn Sky (dies: look at seven and put permanents with total mana value 4 or less onto the battlefield, or two counters on each creature or Vehicle)', () => {
  const AO = real('Ao, the Dawn Sky');
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{2}' });
  const LAND = parsed('SYNTHETIC Wild', 'Land', '', {});
  const library = [THREE.name, FOUR.name, ONE.name, RELIC.name, LAND.name, ...FILLER];
  const game = () =>
    scenario()
      .define(AO)
      .define(ONE)
      .define(THREE)
      .define(FOUR)
      .define(RELIC)
      .define(LAND)
      .define(DOOM)
      .seat(0)
      .hand(DOOM.name)
      .battlefield(AO.name)
      .battlefield(ONE.name)
      .battlefield('Plains', { count: 2 })
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a choice of two modes, the first a look with a total', () => {
    const dies = AO.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(JSON.stringify(dies)).toContain('"totalManaValue":4');
  });

  test('mode one: the cards chosen may not add up to more than 4 and a land is not a choice', () => {
    const g = game();
    g.act(0).cast(DOOM.name, { pay: true, targets: [AO.name] });
    settle(g);
    g.act(0).chooseModes(0);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.totalManaValue?.limit).toBe(4);
    const nameOfId = (id: string): string | undefined => {
      const card = (g.state.objects as unknown as Record<string, { card: string | null }>)[id]
        ?.card;
      const instance =
        card === null || card === undefined
          ? undefined
          : (g.state.cards as unknown as Record<string, { definition: number }>)[card];
      return instance === undefined ? undefined : g.state.definitions[instance.definition]?.name;
    };
    const names = d.legal.map(nameOfId);
    expect(names).not.toContain(LAND.name);
    expect(names).toContain(THREE.name);
    expect(g.legalActions(0).some((a) => a.kind === 'chooseCards' && a.objects.length === 3)).toBe(
      false,
    );
    g.act(0).chooseCards(THREE.name, ONE.name);
    settle(g);
    expect(onBattlefield(g.state, 0)).toEqual(expect.arrayContaining([THREE.name, ONE.name]));
    g.expect.zone(FOUR.name, 'library');
    g.expect.invariants();
  });

  test('mode two: two +1/+1 counters on each creature you control', () => {
    const g = game();
    g.act(0).cast(DOOM.name, { pay: true, targets: [AO.name] });
    settle(g);
    g.act(0).chooseModes(1);
    settle(g);
    g.expect.counters({ name: ONE.name, zone: 'battlefield' }, { '+1/+1': 2 });
    g.expect.invariants();
  });
});

describe('Backup with an ability that cannot be given (CR 702.165a)', () => {
  test('a static ability printed below the keyword leaves the card unsupported, never half done', () => {
    const imported = importCard(
      fromGoldenCard({
        oracleId: 'synthetic-backup-static',
        name: 'SYNTHETIC Backup Static',
        layout: 'normal',
        colorIdentity: [],
        edhrecRank: null,
        faces: [
          {
            name: 'SYNTHETIC Backup Static',
            manaCost: '{1}',
            typeLine: 'Creature — Bear',
            oracleText: 'Backup 1\nOther creatures you control get +1/+1.',
            power: '1',
            toughness: '1',
            loyalty: null,
            defense: null,
            colors: [],
          },
        ],
        source: 'synthetic',
        acceptance: false,
      } as unknown as GoldenCard),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
  });
});
