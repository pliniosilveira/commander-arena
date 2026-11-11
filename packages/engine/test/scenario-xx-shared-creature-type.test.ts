// "Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card that shares a creature type with it. Put
// that card into your hand and the rest on the bottom of your library in a random order." (D-257, the Bruna deck): the filter `sharesCreatureTypeWith`, read in a
// `revealUntil` of the effect of a "dies" trigger. Pins: CR 205.3m (creature types), CR 603.10a (a dies trigger looks back to the permanent that left), CR 113.7a
// (last-known information: the creature types it had), CR 702.73a (a changeling has every creature type), CR 701.20 (reveal), CR 401.5 (the rest on the bottom in a
// random order), CR 608.2d (a "may" is answered as the ability resolves). Cards are SYNTHETIC (src/cards/fixtures/synthetic-bruna-search.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition, Effect, ObjectFilter } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BLADE = 'SYNTHETIC Echo Blade';
const GOBLIN_KNIGHT = 'SYNTHETIC Goblin Knight';
const GOBLIN_SCOUT = 'SYNTHETIC Goblin Scout';
const HUMAN_KNIGHT = 'SYNTHETIC Human Knight';
const WIZARD = 'SYNTHETIC Lone Wizard';
const CHAMELEON = 'SYNTHETIC Chameleon Drifter'; // a changeling
const MURDER = 'Murder';
const UNSUMMON = 'Unsummon';
const BEARS = 'Grizzly Bears'; // Bear

describe('the card is valid', () => {
  test(BLADE, () => {
    expect(validateCard(syntheticCard(BLADE))).toEqual([]);
  });
});

const game = (dying: string, library: readonly string[], spell: string = MURDER) =>
  scenario()
    .seat(0)
    .battlefield(dying)
    .battlefield(BLADE, { attachedTo: dying })
    .library(...library)
    .seat(1)
    .hand(spell)
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Island')
    .library('Island', 'Island')
    .at('precombatMain', { active: 1, turn: 2 })
    .build();

/** The opponent destroys the equipped creature; the trigger of the Blade goes on the stack and resolves. */
const kill = (g: ScenarioGame, spell: string = MURDER): void => {
  g.act(1).cast(spell, { targets: [{ name: GOBLIN_KNIGHT, zone: 'battlefield' }], pay: true });
  g.passAll();
};

describe('the equipped creature dies', () => {
  test('the first creature card that shares a creature type is found; the cards before it go to the bottom', () => {
    const g = game(GOBLIN_KNIGHT, [WIZARD, BEARS, HUMAN_KNIGHT, GOBLIN_SCOUT, 'Plains']);
    kill(g);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // Human Knight shares Knight with the Goblin Knight; the Wizard and the Bears are revealed first and share nothing.
    g.expect.zone(HUMAN_KNIGHT, 'hand', { seat: 0 });
    g.expect.zone(GOBLIN_SCOUT, 'library', { seat: 0 });
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual([
      WIZARD,
      BEARS,
      HUMAN_KNIGHT,
    ]);
    // Two went to the bottom (a random order): the library is the three cards that were not revealed, then those two.
    const library = (g.state.seats[0]?.library ?? []).map((id) => g.state.objects[id]?.card);
    expect(library).toHaveLength(4);
    g.expect.librarySize(0, 4);
    g.expect.invariants();
  });

  test('a creature type of its own is enough: the Goblin Scout is found when it comes first', () => {
    const g = game(GOBLIN_KNIGHT, [GOBLIN_SCOUT, HUMAN_KNIGHT]);
    kill(g);
    g.act(0).accept();
    g.expect.zone(GOBLIN_SCOUT, 'hand', { seat: 0 });
    g.expect.zone(HUMAN_KNIGHT, 'library', { seat: 0 });
  });

  test('a card that is not a creature card is passed over even when it shares a subtype (CR 205.3m)', () => {
    // The Blade is an Equipment (an artifact type); the dying creature has no Equipment type, but a creature card is what is asked for.
    const g = game(GOBLIN_KNIGHT, [BLADE, WIZARD]);
    kill(g);
    g.act(0).accept();
    g.expect.zone(WIZARD, 'library', { seat: 0 });
    g.expect.zone(BLADE, 'library', { seat: 0 });
  });

  test('no card shares a type: the whole library is revealed and goes to the bottom, nothing is put into the hand', () => {
    const g = game(GOBLIN_KNIGHT, [WIZARD, BEARS, 'Plains']);
    kill(g);
    g.act(0).accept();
    g.expect.zone(WIZARD, 'library', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.librarySize(0, 3);
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual([WIZARD, BEARS, 'Plains']);
  });

  test('"you may": declining reveals nothing', () => {
    const g = game(GOBLIN_KNIGHT, [HUMAN_KNIGHT]);
    kill(g);
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.zone(HUMAN_KNIGHT, 'library', { seat: 0 });
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsRevealed')).toBe(false);
  });

  test('a changeling has every creature type: the first creature card shares one (CR 702.73a)', () => {
    const g = game(CHAMELEON, [WIZARD, HUMAN_KNIGHT]);
    g.act(1).cast(MURDER, { targets: [{ name: CHAMELEON, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(WIZARD, 'hand', { seat: 0 });
  });

  test('last-known information: an Angel by an Aura on the battlefield, found by the Angel type it had when it died (CR 113.7a)', () => {
    // "Enchanted creature ... is an Angel in addition to its other types" (SYNTHETIC Angelic Mantle): the Wizard card in the graveyard is no Angel.
    const g = scenario()
      .seat(0)
      .battlefield(WIZARD)
      .battlefield(BLADE, { attachedTo: WIZARD })
      .battlefield('SYNTHETIC Angelic Mantle', { attachedTo: WIZARD })
      .library(BEARS, 'Serra Angel', GOBLIN_KNIGHT)
      .seat(1)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library('Island', 'Island')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(MURDER, { targets: [{ name: WIZARD, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.expect.zone(WIZARD, 'graveyard', { seat: 0 });
    // The Mantle's own trigger and the Blade's go on the stack together: the order they are put there in does not matter here.
    if (g.state.pending?.kind === 'orderTriggers') {
      const first = g.legalActions(0).find((a) => a.kind === 'orderTriggers');
      if (first === undefined) throw new Error('no order to choose');
      g.choose(0, first);
    }
    for (let i = 0; i < 6 && g.state.pending?.kind !== 'confirmOptional'; i += 1) g.passAll();
    g.act(0).accept();
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });

  test('a creature that leaves without dying does not trigger it', () => {
    const g = game(GOBLIN_KNIGHT, [HUMAN_KNIGHT], UNSUMMON);
    g.act(1).cast(UNSUMMON, {
      targets: [{ name: GOBLIN_KNIGHT, zone: 'battlefield' }],
      pay: true,
    });
    g.passAll();
    g.expect.pending('priority', 1);
    g.expect.zone(HUMAN_KNIGHT, 'library', { seat: 0 });
  });
});

// Where the filter may be written: the filter of a revealUntil in the effect of a "dies" trigger, and nowhere else.
describe('validation', () => {
  const messages = (card: CardDefinition): string =>
    validateCard(card)
      .map((i) => i.message)
      .join('\n');
  const FILTER: ObjectFilter = { types: ['creature'], sharesCreatureTypeWith: 'triggerSubject' };
  const reveal = (filter: ObjectFilter = FILTER): Effect => ({
    kind: 'revealUntil',
    filter,
    put: 'hand',
  });
  const withAbility = (ability: Ability): CardDefinition =>
    singleFace({
      name: 'SYNTHETIC Test Card',
      manaCost: ['2'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: 'text',
      abilities: [ability],
    });

  test('a dies trigger: valid, also as a member of a choice of filters', () => {
    const dies: Ability = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: reveal(),
    };
    expect(messages(withAbility(dies))).toBe('');
    expect(
      messages(
        withAbility({
          ...dies,
          effect: reveal({ anyOf: [FILTER, { types: ['land'] }] }),
        }),
      ),
    ).toBe('');
  });

  test('another trigger, a spell, a target slot and a static ability are refused', () => {
    const upkeep: Ability = {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect: reveal(),
    };
    expect(messages(withAbility(upkeep))).toMatch(
      /sharesCreatureTypeWith is read in the filter of a revealUntil/,
    );
    const spell = singleFace({
      name: 'SYNTHETIC Test Spell',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'text',
      spell: { effect: reveal() },
    });
    expect(messages(spell)).toMatch(/sharesCreatureTypeWith is read/);
    const targeted = singleFace({
      name: 'SYNTHETIC Test Spell',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'text',
      spell: {
        targets: [
          { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', ...FILTER } } },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
      },
    });
    expect(messages(targeted)).toMatch(/sharesCreatureTypeWith is read/);
    const dies: Ability = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: {
        kind: 'destroy',
        objects: { kind: 'each', filter: { zone: 'battlefield', ...FILTER } },
      },
    };
    expect(messages(withAbility(dies))).toMatch(/sharesCreatureTypeWith is read/);
  });

  test('only "triggerSubject" is a value', () => {
    const dies: Ability = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: reveal({
        types: ['creature'],
        sharesCreatureTypeWith: 'commander',
      } as unknown as ObjectFilter),
    };
    expect(messages(withAbility(dies))).toMatch(/sharesCreatureTypeWith is 'triggerSubject'/);
  });
});
