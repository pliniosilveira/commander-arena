/**
 * Keywords that are shorthand for an ability of another kind, expanded when `derive` computes an
 * object's abilities: Cycling (CR 702.29a), Equip (CR 702.6a), Prowess (CR 702.108a), Ward
 * (CR 702.21a), Crew (CR 702.122a), and (D-110) typecycling (CR 702.29e), Exalted (CR 702.83a),
 * Annihilator (CR 702.86a), Persist (CR 702.79a) and Undying (CR 702.93a); and (D-120) Battle cry
 * (CR 702.91a), Mentor (CR 702.134a), Evolve (CR 702.100a), Bushido (CR 702.45a), Extort (CR 702.101a),
 * Cascade (CR 702.85a) and Affinity (CR 702.41a); and (D-124) Unearth (CR 702.84a); and (D-129) Storm (CR 702.40a) and Replicate (CR 702.56a); and (D-185) Encore (CR 702.141a); and (D-384) Eternalize (CR 702.129a).
 *
 * The expansions are abilities added after the printed ones, in the order of their keywords, so the
 * printed abilities' indexes do not move (triggers and activations refer to indexes). The keyword
 * itself stays (CR 702.29b), so the object still has it. Each instance of a keyword expands on its
 * own: two instances of prowess are two triggered abilities (CR 702.108b), and so are two of ward.
 */
import type { Ability, Cost, Keyword, ObjectFilter, TokenDefinition } from '../ast/types';
import { SOULBOND_ENTERS_ABILITY, SOULBOND_OTHER_ENTERS_ABILITY } from './soulbond-abilities';

/** The kinds of the keyword abilities in a list (a keyword with parameters counts by its kind). */
export function keywordKindsOf(abilities: readonly Ability[]): Keyword['kind'][] {
  const out: Keyword['kind'][] = [];
  for (const a of abilities) {
    if (a.kind === 'keyword' && !out.includes(a.keyword.kind)) out.push(a.keyword.kind);
  }
  return out;
}

/** Whether the abilities list holds the keyword (read from printed abilities, before any expansion). */
export function hasPrintedKeyword(abilities: readonly Ability[], kind: Keyword['kind']): boolean {
  return abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === kind);
}

/** CR 702.6a: "Equip [cost]" is "[Cost]: Attach this permanent to target creature you control." */
function equipAbility(cost: readonly Cost[], restriction?: ObjectFilter): Ability {
  return {
    kind: 'activated',
    cost,
    targets: [
      {
        id: 't1',
        // CR 702.6c (D-220): "Equip Wizard {1}" attaches only to a creature that is also a Wizard.
        what: {
          kind: 'object',
          filter: { ...restriction, types: ['creature'], controller: 'you' },
        },
      },
    ],
    effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'target', id: 't1' } },
    // CR 702.6a: "Activate only as a sorcery." (CR 602.5d)
    timing: 'sorcery',
  };
}

/**
 * CR 702.108a: "Prowess" means "Whenever you cast a noncreature spell, this creature gets +1/+1
 * until end of turn." Each noncreature spell cast is a separate trigger (CR 603.2c) and the trigger
 * resolves before the spell it came from, which is under it on the stack (CR 405.5).
 */
const PROWESS_ABILITY: Ability = {
  kind: 'triggered',
  trigger: {
    kind: 'castSpell',
    filter: { stackKind: 'spell', notTypes: ['creature'] },
    by: 'you',
  },
  effect: {
    kind: 'modifyPt',
    objects: { kind: 'this' },
    power: 1,
    toughness: 1,
    duration: 'untilEndOfTurn',
  },
};

/**
 * CR 702.21a: "Ward [cost]" means "Whenever this permanent becomes the target of a spell or ability
 * an opponent controls, counter that spell or ability unless that player pays [cost]." The ability
 * triggers as the targets are chosen, so it goes on the stack above the spell or ability and
 * resolves first (CR 603.3, 405.5); its effect names the spell or ability as `triggerSubject`.
 */
function wardAbility(cost: readonly Cost[]): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'becomesTarget', what: { kind: 'this' }, by: 'opponent' },
    effect: { kind: 'counterUnlessPays', objects: { kind: 'triggerSubject' }, cost },
  };
}

/**
 * CR 702.122a: "Crew N" means "Tap any number of other untapped creatures you control with total
 * power N or greater: This permanent becomes an artifact creature until end of turn." The permanent
 * becomes an artifact creature in addition to its other types (CR 205.1b), so a Vehicle keeps its
 * subtype; it has its printed power and toughness as soon as it is a creature (CR 301.7b).
 */
function crewAbility(power: number): Ability {
  return {
    kind: 'activated',
    cost: [{ kind: 'tapCreatures', totalPower: power }],
    effect: {
      kind: 'setTypes',
      objects: { kind: 'this' },
      types: ['artifact', 'creature'],
      additive: true,
      duration: 'untilEndOfTurn',
    },
  };
}

/**
 * CR 702.83a: "Exalted" means "Whenever a creature you control attacks alone, that creature gets +1/+1 until
 * end of turn." The creature is the one that attacked (the trigger's subject), not the permanent with the
 * keyword, which may be any permanent. Every instance triggers separately.
 */
export const EXALTED_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { controller: 'you', types: ['creature'] }, alone: true },
  effect: {
    kind: 'modifyPt',
    objects: { kind: 'triggerSubject' },
    power: 1,
    toughness: 1,
    duration: 'untilEndOfTurn',
  },
};

/**
 * CR 702.105a (D-151): "Dethrone" means "Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on
 * it." Which player is attacked is part of the event, so the condition is read as the creature attacks and not again as the ability resolves.
 */
const DETHRONE_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { kind: 'this' } },
  triggerCondition: { kind: 'attackingMostLife' },
  effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
};

/**
 * CR 702.86a: "Annihilator N" means "Whenever this creature attacks, defending player sacrifices N
 * permanents." The defending player (CR 508.5) chooses which, among the permanents they control.
 */
function annihilatorAbility(count: number): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'attacks', what: { kind: 'this' } },
    effect: {
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: {}, count },
      player: { kind: 'defendingPlayer' },
    },
  };
}

/**
 * CR 702.79a, 702.93a: Persist and Undying: "When this permanent is put into a graveyard from the
 * battlefield, if it had no [counter] counters on it, return it to the battlefield under its owner's
 * control with a [counter] counter on it." The "if" reads the permanent as it last existed (CR 603.10a);
 * "it" is the card it became in the graveyard, which is not there any more if it moved again (CR 400.7).
 */
function returnWithCounter(counter: string): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { kind: 'this' } },
    interveningIf: { kind: 'not', term: { kind: 'sourceHasCounter', counter } },
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'thisCard' },
      to: 'battlefield',
      controller: 'owner',
      withCounters: { counter, count: 1 },
    },
  };
}

/**
 * CR 702.29e: "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library for a [type]
 * card, reveal it, and put it into your hand. Then shuffle your library." Like Cycling it functions only from
 * the hand (CR 702.29f). Finding nothing is allowed (CR 701.23b), and the library is shuffled anyway.
 */
function typecyclingAbility(filter: ObjectFilter, cost: readonly Cost[]): Ability {
  return {
    kind: 'activated',
    cost: [...cost, { kind: 'discardThis', cycling: true }],
    effect: {
      kind: 'search',
      player: { kind: 'you' },
      filter,
      max: 1,
      destinations: [{ zone: 'hand', count: 1 }],
      reveal: true,
      shuffle: true,
    },
    functionsIn: 'hand',
  };
}

/**
 * CR 702.91a: "Battle cry" means "Whenever this creature attacks, each other attacking creature gets +1/+0
 * until end of turn." The set of creatures is read as the ability resolves (CR 608.2c) and is then fixed
 * (CR 611.2c): a creature that is put onto the battlefield attacking later is not affected.
 */
const BATTLE_CRY_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { kind: 'this' } },
  effect: {
    kind: 'modifyPt',
    objects: { kind: 'each', filter: { attacking: true, other: true } },
    power: 1,
    toughness: 0,
    duration: 'untilEndOfTurn',
  },
};

/**
 * CR 702.134a: "Mentor" means "Whenever this creature attacks, put a +1/+1 counter on target attacking
 * creature with power less than this creature's power." The target is chosen as the ability goes on the
 * stack (CR 603.3d), and checked again as it resolves (CR 608.2b): the mentor's power is read then too.
 */
const MENTOR_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'attacks', what: { kind: 'this' } },
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { types: ['creature'], attacking: true, powerLessThanSource: true },
      },
    },
  ],
  effect: {
    kind: 'addCounters',
    objects: { kind: 'target', id: 't1' },
    counter: '+1/+1',
    count: 1,
  },
};

/**
 * CR 702.100a: "Evolve" means "Whenever a creature you control enters, if that creature's power is greater
 * than this creature's power and/or that creature's toughness is greater than this creature's toughness,
 * put a +1/+1 counter on this creature." The "if" is an intervening "if" (CR 603.4): it is true as the
 * creature enters and again as the ability resolves, reading both creatures as they are then (or as they
 * last were, CR 113.7a). The creature itself does not evolve from its own entering ("another").
 */
const EVOLVE_ABILITY: Ability = {
  kind: 'triggered',
  trigger: {
    kind: 'entersBattlefield',
    what: { types: ['creature'], controller: 'you', other: true },
  },
  interveningIf: { kind: 'subjectGreaterPt' },
  effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
};

/**
 * CR 702.45a: "Bushido N" means "Whenever this creature blocks or becomes blocked, it gets +N/+N until end of
 * turn." Two triggers, as for any "A or B" trigger (`ast/types.ts`): one when it blocks, one when it becomes
 * blocked. The two events cannot both happen to one creature in one declaration, because a blocking
 * creature is not an attacker.
 */
function bushidoAbilities(count: number): Ability[] {
  const effect = {
    kind: 'modifyPt',
    objects: { kind: 'this' },
    power: count,
    toughness: count,
    duration: 'untilEndOfTurn',
  } as const;
  return [
    { kind: 'triggered', trigger: { kind: 'blocks', what: { kind: 'this' } }, effect },
    { kind: 'triggered', trigger: { kind: 'becomesBlocked', what: { kind: 'this' } }, effect },
  ];
}

/**
 * CR 702.101a: "Extort" means "Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1
 * life and you gain life equal to the total life lost this way." The spell that was cast goes on the stack
 * first, so the trigger resolves before it (CR 405.5).
 */
export const EXTORT_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
  effect: {
    kind: 'mayPay',
    cost: [{ kind: 'mana', symbols: ['W/B'] }],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
        { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'lifeLostThisWay' } },
      ],
    },
  },
};

/**
 * CR 702.85a: "Cascade" is a triggered ability that functions only while the spell is on the stack: "When you
 * cast this spell, ...". The trigger is found when the spell is cast (`castSpell` with `self`), and goes on
 * the stack above the spell (CR 603.3b).
 */
const CASCADE_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
  effect: { kind: 'cascade' },
};

/**
 * CR 702.40a: "Storm" means "When you cast this spell, copy it for each other spell that was cast before it this turn.
 * If the spell has any targets, you may choose new targets for any of the copies." Like Cascade, a triggered ability of
 * the spell that functions on the stack, found as the spell is cast (CR 603.3b); each instance triggers separately
 * (CR 702.40b). The effect reads how many spells were cast before it as it was cast (D-129).
 */
const STORM_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
  effect: { kind: 'storm' },
};

/**
 * CR 702.56a: "Replicate [cost]" means, besides the additional cost, "When you cast this spell, if a replicate cost
 * was paid for it, copy it for each time its replicate cost was paid. If the spell has any targets, you may choose new
 * targets for any of the copies." The intervening "if" is the `replicated` condition (CR 603.4): with no payment the
 * ability does not trigger. The cost itself is asked as the spell is cast (`rules/cast.ts`, D-129).
 */
const REPLICATE_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you', self: true },
  interveningIf: { kind: 'replicated' },
  effect: { kind: 'replicate' },
};

/**
 * CR 702.41a: "Affinity for [text]" means "This spell costs {1} less to cast for each [text] you control":
 * a static ability that functions on the stack (CR 113.6d), a cost reduction of the spell itself (D-095,
 * D-101). What is counted is the caster's (`controller: 'you'`), on the battlefield, as the cost is
 * determined (CR 601.2f).
 */
function affinityAbility(filter: ObjectFilter): Ability {
  return {
    kind: 'static',
    static: {
      kind: 'costReduction',
      spells: { kind: 'this' },
      amount: { kind: 'countOf', filter: { ...filter, controller: 'you' } },
    },
  };
}

/**
 * CR 702.84a: "Unearth [cost]" means "[Cost]: Return this card from your graveyard to the battlefield. It gains
 * haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of
 * putting it anywhere else. Activate only as a sorcery." It functions only from the graveyard; the `unearth`
 * effect returns the card and creates what follows (`rules/effects.ts`, `rules/derive-alt.ts`, D-124).
 */
function unearthAbility(cost: readonly Cost[]): Ability {
  return {
    kind: 'activated',
    cost,
    effect: { kind: 'unearth' },
    timing: 'sorcery',
    functionsIn: 'graveyard',
  };
}

/**
 * CR 702.141a: "Encore [cost]" means "[Cost], Exile this card from your graveyard: For each opponent, create a token that's a copy of this card that
 * attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery."
 * It functions only from the graveyard; the card is exiled as a cost and the `encore` effect reads it from its last-known information
 * (`rules/effects.ts`, `rules/encore.ts`, D-185).
 */
function encoreAbility(cost: readonly Cost[]): Ability {
  return {
    kind: 'activated',
    cost: [...cost, { kind: 'exileThis' }],
    effect: { kind: 'encore' },
    timing: 'sorcery',
    functionsIn: 'graveyard',
  };
}

/**
 * CR 702.129a: "Eternalize [cost]" means "[Cost], Exile this card from your graveyard: Create a token that's a copy of this card, except it's black, it's 4/4, it has no mana
 * cost, and it's a Zombie in addition to its other types. Activate only as a sorcery." It functions only from the graveyard; the card is exiled as a cost and the copy is made
 * from its last-known information (CR 608.2h, `tokenDefinitionOf`). The exceptions are part of the copiable values (CR 707.9b), and a characteristic-defining power or toughness
 * of the card is not copied (CR 707.9d). D-384.
 */
function eternalizeAbility(cost: readonly Cost[]): Ability {
  return {
    kind: 'activated',
    cost: [...cost, { kind: 'exileThis' }],
    effect: {
      kind: 'createToken',
      token: {
        kind: 'copyOf',
        object: { kind: 'this' },
        setColors: ['B'],
        setPt: { power: 4, toughness: 4 },
        noManaCost: true,
        addSubtypes: ['Zombie'],
      },
      count: 1,
    },
    timing: 'sorcery',
    functionsIn: 'graveyard',
  };
}

/**
 * CR 702.30a: "Echo [cost]" means "At the beginning of your upkeep, if this permanent came under your control since
 * the beginning of your last upkeep, sacrifice it unless you pay [cost]." The condition is checked as the ability
 * triggers and again as it resolves (CR 603.4); the payment is the question of "unless you pay" (CR 118.12a,
 * `rules/pay-unless.ts`), asked as the ability resolves, and not paying (or being unable to, CR 118.3) sacrifices
 * the permanent. Each instance triggers on its own (the printed instances are separate abilities).
 */
function echoAbility(cost: readonly Cost[]): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    interveningIf: { kind: 'cameUnderControlSinceLastUpkeep' },
    effect: {
      kind: 'unlessPays',
      player: { kind: 'you' },
      cost,
      effect: { kind: 'sacrifice', objects: { kind: 'this' } },
      upkeep: 'echo',
    },
  };
}

/**
 * CR 702.24a: "Cumulative upkeep [cost]" means "At the beginning of your upkeep, if this permanent is on the
 * battlefield, put an age counter on this permanent. Then you may pay [cost] for each age counter on it. If you
 * don't, sacrifice it." The effect (`rules/effects.ts`) checks that the permanent is still there as it resolves; two
 * instances each count all the age counters there are when they resolve (CR 702.24b).
 */
function cumulativeUpkeepAbility(cost: readonly Cost[]): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: { kind: 'cumulativeUpkeep', cost },
  };
}

/**
 * CR 702.174a, 702.174b, 702.174e: "Gift a card" of a permanent means "When this permanent enters, if its gift cost was paid,
 * the chosen player draws a card." (An instant or sorcery has no permanent to carry it: the same effect happens as the spell
 * resolves, before its other effects, `rules/stack.ts`, CR 702.174j.) The condition is checked as it triggers and as it resolves
 * (CR 603.4); the permanent remembers the chosen player (`GameObject.giftTo`).
 */
const GIFT_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  interveningIf: { kind: 'giftPromised' },
  effect: { kind: 'draw', player: { kind: 'giftRecipient' }, count: 1 },
};

/** CR 702.92a: the token of Living weapon, "a 0/0 black Phyrexian Germ creature token". */
const GERM_TOKEN: TokenDefinition = {
  name: 'Phyrexian Germ',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Phyrexian', 'Germ'],
  colors: ['B'],
  power: 0,
  toughness: 0,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/**
 * CR 702.92a (Living weapon, D-139): "When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this
 * Equipment to it." One resolution: the token and the attachment are made before state-based actions are checked (CR 704.3), so the
 * 0/0 Germ already has the +N/+N of the Equipment when they are, and lives if that makes it at least 1 toughness (CR 704.5f).
 */
const LIVING_WEAPON_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'createToken', token: { kind: 'custom', definition: GERM_TOKEN }, count: 1 },
      { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
    ],
  },
};

/**
 * CR 702.75a (Hideaway, D-145): "When this permanent enters, look at the top N cards of your library. Exile one of them face down and put the
 * rest on the bottom of your library in a random order." The card exiled is remembered by the permanent (`linkedExile`) and its controller may look
 * at it (`GameObject.hideaway`): the `lookAtTop` that takes one card into exile face down, a card that must be taken when any is in the library.
 */
function hideawayAbility(count: number): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect: {
      kind: 'lookAtTop',
      count,
      take: { filter: {}, max: 1, min: 1, to: 'exileFaceDown' },
      rest: 'bottomRandom',
    },
  };
}

const HERO_TOKEN: TokenDefinition = {
  name: 'Hero',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Hero'],
  colors: [],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/**
 * CR 702.182a (Job select, D-206): "When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this Equipment to it." One
 * resolution, as Living weapon's: the token and the attachment are made before state-based actions are checked (CR 704.3).
 */
const JOB_SELECT_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'createToken', token: { kind: 'custom', definition: HERO_TOKEN }, count: 1 },
      { kind: 'attach', object: { kind: 'this' }, to: { kind: 'moved' } },
    ],
  },
};

export function expansionOf(ability: Ability): Ability[] {
  if (ability.kind !== 'keyword') return [];
  switch (ability.keyword.kind) {
    case 'cycling':
      return [
        {
          kind: 'activated',
          cost: [...ability.keyword.cost, { kind: 'discardThis', cycling: true }],
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          functionsIn: 'hand',
        },
      ];
    case 'equip':
      return [equipAbility(ability.keyword.cost, ability.keyword.restriction)];
    case 'prowess':
      return [PROWESS_ABILITY];
    case 'ward':
      return [wardAbility(ability.keyword.cost)];
    case 'crew':
      return [crewAbility(ability.keyword.power)];
    case 'exalted':
      return [EXALTED_ABILITY];
    case 'soulbond':
      // CR 702.95a (D-286): "Soulbond is a keyword that represents two triggered abilities."
      return [SOULBOND_ENTERS_ABILITY, SOULBOND_OTHER_ENTERS_ABILITY];
    case 'annihilator':
      return [annihilatorAbility(ability.keyword.count)];
    case 'persist':
      return [returnWithCounter('-1/-1')];
    case 'undying':
      return [returnWithCounter('+1/+1')];
    case 'typecycling':
      return [typecyclingAbility(ability.keyword.filter, ability.keyword.cost)];
    case 'battleCry':
      return [BATTLE_CRY_ABILITY];
    case 'mentor':
      return [MENTOR_ABILITY];
    case 'evolve':
      return [EVOLVE_ABILITY];
    case 'bushido':
      return bushidoAbilities(ability.keyword.count);
    case 'extort':
      return [EXTORT_ABILITY];
    case 'cascade':
      return [CASCADE_ABILITY];
    case 'storm':
      return [STORM_ABILITY];
    case 'replicate':
      return [REPLICATE_ABILITY];
    case 'unearth':
      return [unearthAbility(ability.keyword.cost)];
    case 'encore':
      return [encoreAbility(ability.keyword.cost)];
    case 'eternalize':
      return [eternalizeAbility(ability.keyword.cost)];
    case 'affinity':
      return [affinityAbility(ability.keyword.filter)];
    case 'echo':
      return [echoAbility(ability.keyword.cost)];
    case 'cumulativeUpkeep':
      return [cumulativeUpkeepAbility(ability.keyword.cost)];
    case 'gift':
      return [GIFT_ABILITY];
    case 'livingWeapon':
      return [LIVING_WEAPON_ABILITY];
    case 'jobSelect':
      return [JOB_SELECT_ABILITY];
    case 'hideaway':
      return [hideawayAbility(ability.keyword.count)];
    case 'dethrone':
      return [DETHRONE_ABILITY];
    default:
      return [];
  }
}

const expansions = new WeakMap<readonly Ability[], readonly Ability[]>();

/**
 * The printed abilities followed by the abilities their keywords stand for. The list is the printed abilities of a card face or of a
 * token, which are never changed, so the expansion is made once for each list, by its identity.
 */
/**
 * CR 702.165a, 702.165c, 702.165d (D-230): "When this creature enters, put N +1/+1 counters on target creature. If that's another creature, it also gains the non-backup abilities
 * of this creature printed below this one until end of turn." The abilities granted are the keyword, triggered, activated and mana abilities printed after the keyword (a static
 * ability is not granted by an effect here), read as the ability is put on the stack, so they are written into the ability itself.
 */
function backupAbility(count: number, below: readonly Ability[]): Ability {
  const granted = below.filter(
    (a) =>
      (a.kind === 'keyword' && a.keyword.kind !== 'backup') ||
      a.kind === 'triggered' ||
      a.kind === 'activated' ||
      a.kind === 'mana',
  );
  return {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    targets: [
      {
        id: 'backup',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'addCounters',
          objects: { kind: 'target', id: 'backup' },
          counter: '+1/+1',
          count,
        },
        ...(granted.length === 0
          ? []
          : [
              {
                kind: 'conditional' as const,
                condition: {
                  kind: 'objectMatches' as const,
                  of: { kind: 'target' as const, id: 'backup' },
                  filter: { other: true as const },
                },
                effect: {
                  kind: 'grantAbility' as const,
                  objects: { kind: 'target' as const, id: 'backup' },
                  abilities: granted,
                  duration: 'untilEndOfTurn' as const,
                },
              },
            ]),
      ],
    },
  };
}

export function expandKeywords(abilities: readonly Ability[]): readonly Ability[] {
  let known = expansions.get(abilities);
  if (known === undefined) {
    const expanded = abilities.flatMap((a, i) =>
      // CR 702.165a (D-230): Backup grants the non-backup abilities printed below it, so its expansion reads the abilities after it.
      a.kind === 'keyword' && a.keyword.kind === 'backup'
        ? [backupAbility(a.keyword.count, abilities.slice(i + 1))]
        : expansionOf(a),
    );
    known = expanded.length === 0 ? abilities : [...abilities, ...expanded];
    expansions.set(abilities, known);
  }
  return known;
}
