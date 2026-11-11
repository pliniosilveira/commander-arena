// "Dies" is "is put into a graveyard from the battlefield" and says nothing of creatures (CR 700.4): an Aura, an artifact or a land that goes to a
// graveyard dies. D-175 (the Korvold slice): before it the engine emitted the `died` event for creatures only, so "When this Aura is put into a graveyard
// from the battlefield" never triggered. A trigger for "a creature that dies" still reads the types the permanent had on the battlefield (CR 603.10a,
// 113.7a), and a token that is not a creature dies too (CR 700.4, 111.7).
// Cards are defined here (they are not fixtures of the engine) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const BEARS = 'Grizzly Bears';

const RELIC = 'SYNTHETIC Brittle Relic'; // artifact {1}: when this artifact dies, you gain 2 life
const relic = singleFace({
  name: RELIC,
  manaCost: ['1'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'When this artifact dies, you gain 2 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
    },
  ],
});

const WATCHER = 'SYNTHETIC Death Watcher'; // enchantment {1}{B}: whenever a creature dies, you gain 1 life
const watcher = singleFace({
  name: WATCHER,
  manaCost: ['1', 'B'],
  types: ['enchantment'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Whenever a creature dies, you gain 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'] } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

const ANYTHING: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dies', what: { controller: 'you' } },
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
};
const LEDGER = 'SYNTHETIC Grave Ledger'; // enchantment: whenever a permanent you control dies, you gain 1 life
const ledger = singleFace({
  name: LEDGER,
  manaCost: ['1', 'B'],
  types: ['enchantment'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Whenever a permanent you control dies, you gain 1 life.',
  abilities: [ANYTHING],
});

const AURA = 'SYNTHETIC Homing Aura'; // Aura {G}: when this Aura is put into a graveyard from the battlefield, return it to its owner's hand
const aura = singleFace({
  name: AURA,
  manaCost: ['G'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText:
    "Enchant creature\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.",
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: { kind: 'moveToZone', objects: { kind: 'thisCard' }, to: 'hand' },
    },
  ],
});

const DISENCHANT = 'SYNTHETIC Break Spell'; // instant {1}: destroy target artifact or enchantment
const breakSpell = singleFace({
  name: DISENCHANT,
  manaCost: ['1'],
  types: ['instant'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Destroy target artifact or enchantment.',
  spell: {
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'battlefield',
            anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
          },
        },
      },
    ],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

describe('the cards are valid', () => {
  test.each([relic, watcher, ledger, aura, breakSpell])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('a permanent that is not a creature dies (CR 700.4)', () => {
  test('an artifact destroyed: its own "when this artifact dies" triggers', () => {
    const g = twoSeatGame((b) =>
      b.define(relic).define(breakSpell).hand(DISENCHANT).battlefield(RELIC, 'Plains'),
    );
    g.act(0).cast(DISENCHANT, { targets: [RELIC], pay: true });
    g.passAll();
    g.expect.zone(RELIC, 'graveyard', { seat: 0 });
    g.expect.life(0, 22);
    g.expect.eventLog([{ kind: 'died' }]);
  });

  test('"whenever a creature dies" does not trigger for it: the types are read as the permanent was', () => {
    const g = twoSeatGame((b) =>
      b
        .define(relic)
        .define(watcher)
        .define(breakSpell)
        .hand(DISENCHANT)
        .battlefield(RELIC, WATCHER, 'Plains'),
    );
    g.act(0).cast(DISENCHANT, { targets: [RELIC], pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(0, 22);
  });

  test('"whenever a permanent you control dies" triggers for an artifact and for a creature', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .define(relic)
          .define(ledger)
          .define(breakSpell)
          .hand(DISENCHANT)
          .battlefield(RELIC, LEDGER, BEARS, 'Plains'),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).cast(DISENCHANT, { targets: [RELIC], pay: true });
    g.passAll();
    // The relic's own trigger (+2) and the ledger's (+1): both see the relic as it was on the battlefield (CR 603.10a), and their
    // controller orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.life(0, 23);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 24);
  });

  test('a creature still dies as before', () => {
    const g = twoSeatGame(
      (b) => b.define(watcher).battlefield(WATCHER, BEARS),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(0, 21);
  });

  test("an Aura put into the graveyard because its creature died returns to its owner's hand (CR 704.5m, 603.10a, 400.7)", () => {
    const g = twoSeatGame(
      (b) => b.define(aura).battlefield(BEARS).hand(AURA).battlefield('Forest'),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(AURA, BEARS);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(AURA, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('an Aura destroyed by a spell returns the same way', () => {
    const g = twoSeatGame(
      (b) => b.define(aura).battlefield(BEARS).hand(AURA).battlefield('Forest'),
      (b) => b.define(breakSpell).hand(DISENCHANT).battlefield('Plains', 'Plains'),
    );
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [AURA], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(AURA, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});
