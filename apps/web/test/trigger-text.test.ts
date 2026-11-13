/** The wording of every trigger kind (D-108, D-111): examples, coverage of the engine's registry, no raw data. */
import {
  type CardDefinition,
  FIXTURE_CARDS,
  SUPPORTED_FEATURES,
  SYNTHETIC_CARDS,
  type Trigger,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { filterPhrase, triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const ctx = { self: 'Pyre Hound' };
const say = (t: Trigger, c: { self: string; subtypes?: readonly string[] } = ctx) =>
  triggerWording(t, c);
const CREATURE_YOU = { types: ['creature'], controller: 'you' } as const;

describe('step triggers', () => {
  test.each([
    [
      { kind: 'step', step: 'beginCombat', whose: 'you' },
      'At the beginning of combat on your turn',
    ],
    [{ kind: 'step', step: 'beginCombat', whose: 'each' }, 'At the beginning of each combat'],
    [
      { kind: 'step', step: 'beginCombat', whose: 'opponent' },
      "At the beginning of combat on each opponent's turn",
    ],
    [
      { kind: 'step', step: 'upkeep', whose: 'opponent' },
      "At the beginning of each opponent's upkeep",
    ],
    [{ kind: 'upkeep', whose: 'you' }, 'At the beginning of your upkeep'],
    [{ kind: 'upkeep', whose: 'each' }, 'At the beginning of each upkeep'],
    [{ kind: 'endStep', whose: 'you' }, 'At the beginning of your end step'],
    [{ kind: 'step', step: 'draw', whose: 'you' }, 'At the beginning of your draw step'],
    [
      { kind: 'step', step: 'main1', whose: 'you' },
      'At the beginning of your precombat main phase',
    ],
    [
      { kind: 'step', step: 'main2', whose: 'you' },
      'At the beginning of your postcombat main phase',
    ],
    [
      { kind: 'step', step: 'combatEnd', whose: 'you' },
      'At the beginning of the end of combat on your turn',
    ],
    [{ kind: 'step', step: 'combatEnd', whose: 'each' }, 'At the beginning of each end of combat'],
  ] as [Trigger, string][])('%j', (trigger, words) => {
    expect(say(trigger)).toBe(words);
  });
});

describe('the other new kinds', () => {
  test.each([
    [{ kind: 'drawn', who: 'you' }, 'Whenever you draw a card'],
    [{ kind: 'drawn', who: 'opponent' }, 'Whenever an opponent draws a card'],
    [{ kind: 'drawn', who: 'any' }, 'Whenever a player draws a card'],
    [{ kind: 'drawn', who: 'you', nth: 2 }, 'Whenever you draw your second card each turn'],
    [
      { kind: 'drawn', who: 'opponent', nth: 2 },
      'Whenever an opponent draws their second card each turn',
    ],
    [
      { kind: 'dealsCombatDamage', what: CREATURE_YOU, to: 'player' },
      'Whenever a creature you control deals combat damage to a player',
    ],
    [
      { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'opponent' },
      'Whenever Pyre Hound deals combat damage to an opponent',
    ],
    [
      { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'creature' },
      'Whenever Pyre Hound deals combat damage to a creature',
    ],
    [
      { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'any' },
      'Whenever Pyre Hound deals combat damage',
    ],
    // D-1101: a player, or a planeswalker.
    [
      { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'playerOrPlaneswalker' },
      'Whenever Pyre Hound deals combat damage to a player or planeswalker',
    ],
    [
      { kind: 'dealsCombatDamage', what: CREATURE_YOU, to: 'playerOrPlaneswalker' },
      'Whenever a creature you control deals combat damage to a player or planeswalker',
    ],
    // D-1102: cycling is discarding (CR 702.29a); "another" leaves out the card with the ability.
    [{ kind: 'discarded', who: 'you' }, 'Whenever you discard a card'],
    [{ kind: 'discarded', who: 'you', another: true }, 'Whenever you discard another card'],
    [
      { kind: 'leavesBattlefield', what: { kind: 'this' } },
      'Whenever Pyre Hound leaves the battlefield',
    ],
    [
      { kind: 'leavesBattlefield', what: { kind: 'this' }, to: 'exile' },
      'Whenever Pyre Hound leaves the battlefield and is put into exile',
    ],
    [
      { kind: 'leavesBattlefield', what: CREATURE_YOU, to: 'hand' },
      "Whenever a creature you control leaves the battlefield and is put into its owner's hand",
    ],
    [
      {
        kind: 'entersBattlefield',
        what: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
      },
      'Whenever a creature with power 4 or greater enters',
    ],
    [
      { kind: 'dies', what: { types: ['creature'], other: true, controller: 'you' } },
      'Whenever another creature you control dies',
    ],
    [
      {
        kind: 'castSpell',
        filter: { stackKind: 'spell', manaValue: { cmp: 'atMost', value: 2 } },
        by: 'any',
      },
      'Whenever a player casts a spell with mana value 2 or less',
    ],
    [
      { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
      'Whenever an opponent casts a spell',
    ],
  ] as [Trigger, string][])('%j', (trigger, words) => {
    expect(say(trigger)).toBe(words);
  });

  test.each([
    [{ kind: 'blocks', what: { kind: 'this' } }, 'Whenever Pyre Hound blocks'],
    [{ kind: 'becomesBlocked', what: { kind: 'this' } }, 'Whenever Pyre Hound becomes blocked'],
    [{ kind: 'blocks', what: CREATURE_YOU }, 'Whenever a creature you control blocks'],
    [
      { kind: 'becomesBlocked', what: { types: ['creature'], controller: 'you', other: true } },
      'Whenever another creature you control becomes blocked',
    ],
    [
      { kind: 'attacks', what: { types: ['creature'], attacking: true } },
      'Whenever an attacking creature attacks',
    ],
  ] as [Trigger, string][])('keyword batch 2 (D-120): %j', (trigger, words) => {
    expect(say(trigger)).toBe(words);
  });

  test('filters of Mentor and Battle cry are said, not dropped', () => {
    const filter = { types: ['creature'], attacking: true, powerLessThanSource: true } as const;
    expect(filterPhrase(filter)).toBe(
      "an attacking creature with power less than this creature's power",
    );
  });

  test('the attached subject reads "equipped creature" for Equipment and "enchanted permanent" for an Aura', () => {
    const dies: Trigger = { kind: 'dies', what: { kind: 'attached' } };
    expect(say(dies, { self: 'Blade', subtypes: ['Equipment'] })).toBe(
      'Whenever equipped creature dies',
    );
    expect(say(dies, { self: 'Aura', subtypes: ['Aura'] })).toBe(
      'Whenever enchanted permanent dies',
    );
    // The source is not in view (it left): the words say only what is certain.
    expect(say(dies)).toBe('Whenever the permanent this is attached to dies');
  });

  test('a shape the words do not cover gives null, never a guess', () => {
    expect(say({ kind: 'futureKind' } as unknown as Trigger)).toBeNull();
    const owned = { kind: 'dies', what: { owner: { kind: 'you' } } } as unknown as Trigger;
    expect(say(owned)).toBeNull();
  });
});

/** One trigger of every kind the engine supports; the record type makes a new kind a type error. */
const SAMPLES: Record<Trigger['kind'], Trigger> = {
  entersBattlefield: { kind: 'entersBattlefield', what: { kind: 'this' } },
  dies: { kind: 'dies', what: { kind: 'this' } },
  attacks: { kind: 'attacks', what: { kind: 'this' } },
  blocks: { kind: 'blocks', what: { kind: 'this' } },
  becomesBlocked: { kind: 'becomesBlocked', what: { kind: 'this' } },
  castSpell: { kind: 'castSpell', filter: {}, by: 'you' },
  landfall: { kind: 'landfall' },
  cycled: { kind: 'cycled' },
  leftGraveyard: { kind: 'leftGraveyard', who: 'you' },
  exiledFromLibraryOrGraveyard: { kind: 'exiledFromLibraryOrGraveyard', who: 'you' },
  ringTempted: { kind: 'ringTempted' },
  upkeep: { kind: 'upkeep', whose: 'you' },
  endStep: { kind: 'endStep', whose: 'each' },
  step: { kind: 'step', step: 'beginCombat', whose: 'you' },
  drawn: { kind: 'drawn', who: 'you' },
  dealsCombatDamage: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
  noncombatDamageDealt: { kind: 'noncombatDamageDealt', by: 'you', to: 'opponent' },
  dealtDamage: { kind: 'dealtDamage', what: { kind: 'this' } },
  leavesBattlefield: { kind: 'leavesBattlefield', what: { kind: 'this' } },
  permanentSacrificed: { kind: 'permanentSacrificed', by: 'you' },
  becomesTapped: { kind: 'becomesTapped', what: { kind: 'this' } },
  becomesUntapped: { kind: 'becomesUntapped', what: { kind: 'this' } },
  discarded: { kind: 'discarded', who: 'you' },
  diesBatch: { kind: 'diesBatch', what: { types: ['creature'], controller: 'you', other: true } },
  entersBatch: { kind: 'entersBatch', what: { token: true, controller: 'you' } },
  becomesTarget: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'opponent' },
  chapter: { kind: 'chapter', from: 1, to: 2 },
  combatDamageBatch: {
    kind: 'combatDamageBatch',
    what: { types: ['creature'], controller: 'you' },
    to: 'player',
  },
  lifeGained: { kind: 'lifeGained', who: 'you', firstEachTurn: true },
  countersAdded: { kind: 'countersAdded', what: { kind: 'this' }, counter: '+1/+1', by: 'you' },
  attackBatch: { kind: 'attackBatch', who: 'you', atLeast: 2 },
  tappedForMana: {
    kind: 'tappedForMana',
    what: { types: ['creature'], controller: 'you' },
    by: 'you',
  },
  tapsForMana: { kind: 'tapsForMana', who: 'opponent', what: { types: ['artifact'] } },
  state: {
    kind: 'state',
    condition: {
      kind: 'amountIs',
      amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'page' },
      compare: { cmp: 'atLeast', value: 4 },
    },
  },
};

const RAW = /undefined|null|\[object|"kind"|NaN/;

describe('coverage', () => {
  test('every trigger kind of the engine feature registry has wording', () => {
    for (const kind of SUPPORTED_FEATURES.triggerKinds) {
      const sample = SAMPLES[kind];
      expect(sample, `a sample for ${kind}`).toBeDefined();
      const words = triggerWording(sample, ctx);
      expect(words, kind).not.toBeNull();
      expect(words ?? '', kind).not.toMatch(RAW);
      expect(words, kind).toMatch(/^[A-Z]/);
    }
  });

  test('every triggered ability of every fixture card has wording and a gist with no raw data', () => {
    const cards: CardDefinition[] = [
      ...Object.values(FIXTURE_CARDS),
      ...Object.values(SYNTHETIC_CARDS),
    ];
    let checked = 0;
    for (const card of cards) {
      for (const face of card.faces) {
        for (const ability of face.abilities) {
          if (ability.kind !== 'triggered') continue;
          const words = triggerWording(ability.trigger, { self: card.name });
          expect(words, `${card.name}: ${JSON.stringify(ability.trigger)}`).not.toBeNull();
          expect(words ?? '', card.name).not.toMatch(RAW);
          const gist = triggerGist(ability, undefined);
          expect(gist, card.name).not.toMatch(RAW);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
