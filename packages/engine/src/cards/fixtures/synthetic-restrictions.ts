/**
 * SYNTHETIC RESTRICTION, REQUIREMENT AND EVASION CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-094: "can't block", "can't be blocked", "attacks
 * each combat if able", "doesn't untap during your untap step", "can't be countered", and the
 * evasion keywords landwalk, fear, intimidate and shadow (CR 509.1b, 508.1d, 502.3, 101.2, 702.13,
 * 702.14, 702.28, 702.36). Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, Restriction, StaticSubject, TargetSpec } from '../../ast/types';
import type { Color } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const THIS: StaticSubject = { kind: 'this' };
const ATTACHED: StaticSubject = { kind: 'attached' };
const END = 'untilEndOfTurn' as const;
const CREATURE_TARGET: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};

const restriction = (subject: StaticSubject, r: Restriction): Ability => ({
  kind: 'static',
  static: { kind: 'restriction', subject, restriction: r },
});

function creature(
  name: string,
  oracleText: string,
  color: Color,
  abilities: readonly Ability[],
  options: {
    readonly types?: readonly ('artifact' | 'creature')[];
    readonly p?: number;
    readonly t?: number;
  } = {},
): CardDefinition {
  return singleFace({
    name,
    manaCost: ['1', color],
    types: options.types ?? ['creature'],
    subtypes: ['Soldier'],
    colors: [color],
    colorIdentity: [color],
    power: options.p ?? 2,
    toughness: options.t ?? 2,
    oracleText,
    abilities,
  });
}

function restrictSpell(name: string, oracleText: string, color: Color, r: Restriction) {
  const effect: Effect = { kind: 'restrict', objects: T1, restriction: r, duration: END };
  return singleFace({
    name,
    manaCost: [color],
    types: ['instant'],
    colors: [color],
    colorIdentity: [color],
    oracleText,
    spell: { targets: [CREATURE_TARGET], effect },
  });
}

export const SYNTHETIC_RESTRICTION_LIST: readonly CardDefinition[] = [
  // ---- Static restrictions on a creature itself.
  creature('SYNTHETIC Cant Block Bear', 'This creature can’t block.', 'R', [
    restriction(THIS, 'cantBlock'),
  ]),
  creature('SYNTHETIC Unblockable Bear', 'This creature can’t be blocked.', 'U', [
    restriction(THIS, 'cantBeBlocked'),
  ]),
  creature(
    'SYNTHETIC Berserker',
    'This creature attacks each combat if able.',
    'R',
    [restriction(THIS, 'attacksEachCombat')],
    { p: 3, t: 3 },
  ),
  creature(
    'SYNTHETIC Sleepy Giant',
    'This creature doesn’t untap during your untap step.',
    'G',
    [restriction(THIS, 'doesntUntap')],
    { p: 4, t: 4 },
  ),
  // A creature that both attacks each combat and can't block: two restrictions on one object.
  creature(
    'SYNTHETIC Raging Brute',
    'This creature attacks each combat if able. It can’t block.',
    'R',
    [restriction(THIS, 'attacksEachCombat'), restriction(THIS, 'cantBlock')],
  ),
  // ---- Static restrictions from another permanent.
  singleFace({
    name: 'SYNTHETIC Muzzling Banner',
    manaCost: ['2', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Creatures your opponents control can’t block.',
    abilities: [
      restriction(
        { kind: 'filter', filter: { types: ['creature'], controller: 'opponent' } },
        'cantBlock',
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Veil Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature can’t be blocked. Equip {1}',
    abilities: [
      restriction(ATTACHED, 'cantBeBlocked'),
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Slumber Aura',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'Enchant creature. Enchanted creature doesn’t untap during its controller’s untap step.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      restriction(ATTACHED, 'doesntUntap'),
    ],
  }),
  // ---- "{4}, {T}: Target creature can't be blocked this turn." (a land).
  singleFace({
    name: 'SYNTHETIC Rogue Gate',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add {C}. {4}, {T}: Target creature can’t be blocked this turn.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C'] },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['4'] }, { kind: 'tap' }],
        targets: [CREATURE_TARGET],
        effect: { kind: 'restrict', objects: T1, restriction: 'cantBeBlocked', duration: END },
      },
    ],
  }),
  // ---- Restrictions as effects.
  restrictSpell(
    'SYNTHETIC Ghost Step',
    'Target creature can’t be blocked this turn.',
    'U',
    'cantBeBlocked',
  ),
  restrictSpell('SYNTHETIC Muzzle', 'Target creature can’t block this turn.', 'R', 'cantBlock'),
  restrictSpell(
    'SYNTHETIC Goad Rage',
    'Target creature attacks this turn if able.',
    'R',
    'attacksEachCombat',
  ),
  singleFace({
    name: 'SYNTHETIC Mind Wipe',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target creature loses all abilities until end of turn.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'loseAllAbilities', objects: T1, duration: END },
    },
  }),
  // ---- Can't be countered.
  singleFace({
    name: 'SYNTHETIC Stubborn Insight',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'This spell can’t be countered. You gain 3 life.',
    abilities: [restriction(THIS, 'cantBeCountered')],
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 } },
  }),
  singleFace({
    name: 'SYNTHETIC Stubborn Bolt',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'This spell can’t be countered. It deals 1 damage to target creature.',
    abilities: [restriction(THIS, 'cantBeCountered')],
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'dealDamage', to: T1, amount: 1 },
    },
  }),
  creature('SYNTHETIC Stubborn Beast', 'This creature can’t be countered.', 'G', [
    restriction(THIS, 'cantBeCountered'),
  ]),
  // ---- Evasion keywords.
  creature('SYNTHETIC Islandwalker', 'Islandwalk', 'G', [
    { kind: 'keyword', keyword: { kind: 'landwalk', landType: 'Island' } },
  ]),
  creature('SYNTHETIC Desertwalker', 'Desertwalk', 'R', [
    { kind: 'keyword', keyword: { kind: 'landwalk', landType: 'Desert' } },
  ]),
  creature('SYNTHETIC Nonbasic Walker', 'Nonbasic landwalk', 'G', [
    { kind: 'keyword', keyword: { kind: 'landwalk', landType: 'nonbasic' } },
  ]),
  creature('SYNTHETIC Fear Bear', 'Fear', 'B', [kw('fear')]),
  creature('SYNTHETIC Intimidate Bear', 'Intimidate', 'R', [kw('intimidate')]),
  creature('SYNTHETIC Shadow Bear', 'Shadow', 'U', [kw('shadow')]),
  // Evasion abilities are cumulative (CR 509.1b): flying and fear together.
  creature('SYNTHETIC Dread Wraith', 'Flying, fear', 'B', [kw('flying'), kw('fear')]),
  creature('SYNTHETIC Black Flier', 'Flying', 'B', [kw('flying')]),
  creature('SYNTHETIC Shadow Wall', 'Shadow', 'U', [kw('shadow')], { p: 1, t: 4 }),
  // Blockers of the colors and types the evasion rules look at.
  creature('SYNTHETIC Black Blocker', '', 'B', []),
  creature('SYNTHETIC Red Blocker', '', 'R', []),
  singleFace({
    name: 'SYNTHETIC Artifact Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // Lands the landwalk rules look at: a nonbasic land with a basic land type, and a Desert.
  singleFace({
    name: 'SYNTHETIC Dual Island',
    manaCost: null,
    types: ['land'],
    subtypes: ['Island', 'Swamp'],
    colors: [],
    colorIdentity: ['U', 'B'],
    oracleText: '({T}: Add {U} or {B}.)',
    abilities: [],
  }),
  singleFace({
    name: 'SYNTHETIC Dry Desert',
    manaCost: null,
    types: ['land'],
    subtypes: ['Desert'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add {C}.',
    abilities: [],
  }),
];
