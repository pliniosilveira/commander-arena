/**
 * The web side of D-139 (the Artifacts slice) as pure models: the words of the new costs, effects, ability fields,
 * triggers, conditions, statics, filter parts and Living weapon, read from the engine's SYNTHETIC cards (so a wording
 * that drifts from the AST fails here); the new decisions (a return cost, "tap any number", "discard unless", "look at
 * the top cards", "put a card onto the battlefield", "reselect an attack"); and the log lines. No DOM.
 */
import {
  type Ability,
  type Action,
  type ChooseCardsDecision,
  type ChooseOptionDecision,
  type ChoosePermanentDecision,
  type GameState,
  type GameView,
  type ObjectView,
  type PendingDecision,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { triggerWords } from '../src/game/artifacts-text';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { lookedCards } from '../src/game/looked-cards';
import { lordWordings } from '../src/game/static-text';
import { keywordName } from '../src/ui/board/keywords';
import { activationLabel, triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { attackTargetPrompt, attackTargetRows } from '../src/ui/decisions/attack-target';
import {
  cardsPrompt,
  confirmLabel,
  discardTitle,
  foundBadge,
  foundDetail,
  foundHint,
  foundReady,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import {
  choosePermanentPrompt,
  chosenBadge,
  permanentsDetail,
} from '../src/ui/decisions/permanents';
import { initialUi } from '../src/ui/decisions/ui-state';
import { typeLine } from '../src/ui/format';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};
const abilitiesOf = (name: string): readonly Ability[] => face(name).abilities;
const triggered = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'triggered')[at];
  if (found?.kind !== 'triggered') throw new Error(`no triggered ability ${at} on ${name}`);
  return found;
};
const activated = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'activated')[at];
  if (found?.kind !== 'activated') throw new Error(`no activated ability ${at} on ${name}`);
  return found;
};
/** A spell's effect as the gist reads it (an activated ability with no cost). */
const spellGist = (name: string): string => {
  const spell = face(name).spell;
  if (spell === null) throw new Error(`${name} is not a spell`);
  return triggerGist(
    { kind: 'activated', cost: [], effect: spell.effect, targets: spell.targets ?? [] } as never,
    undefined,
  );
};

const view = (n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    subtypes: [],
    colors: [],
    oracleText: '',
    keywords: [],
    isToken: false,
    power: null,
    toughness: null,
    zone: 'battlefield',
    ...patch,
  }) as ObjectView;

/** The card itself as a view, for the ability labels ("this artifact"). */
const cardView = (n: number, name: string): ObjectView =>
  view(n, name, { types: face(name).types, subtypes: face(name).subtypes });

const label = (name: string, at = 0) =>
  activationLabel(cardView(1, name), { abilityIndex: at, ability: activated(name, at) });

function harness(pending: PendingDecision, objects: readonly ObjectView[] = []) {
  const state = {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'declareAttackers',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: [],
    combat: null,
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  } as unknown as GameView;
  const acts: Action[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(state, pending, initialUi(pending), ctl), acts };
}

describe('the costs and the ability fields', () => {
  test('counters put on the permanent and a permanent returned to its owner’s hand', () => {
    expect(label('SYNTHETIC Reading Tome', 1)).toBe(
      '{2}, {T}, Put a page counter on this artifact: You draw a card',
    );
    expect(label('SYNTHETIC Ember Urn')).toBe(
      '{2}, Put 2 ember counters on this artifact: You draw a card',
    );
    expect(label('SYNTHETIC Ferry Mage')).toBe(
      "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield",
    );
    expect(label('SYNTHETIC Tide Shrine')).toBe(
      "{1}, Return two lands you control to their owner's hand: You may put a creature card from your graveyard onto the battlefield",
    );
    expect(label('SYNTHETIC Fleeting Lens')).toBe(
      "{T}, Return this artifact to its owner's hand: You draw a card",
    );
  });

  test('a cost reduced for each of something, and once each turn', () => {
    expect(label('SYNTHETIC Reading Lamp')).toBe(
      '{5}{U}, {T}: You draw a card. This ability costs {1} less to activate for each other artifact you control.',
    );
    expect(label('SYNTHETIC Zombie Furnace')).toBe(
      '{6}: You gain 3 life. This ability costs {2} less to activate for each other Zombie you control.',
    );
    expect(label('SYNTHETIC Grave Lamp')).toBe(
      '{4}, {T}: You draw a card. This ability costs {1} less to activate for each creature card in your graveyard.',
    );
    expect(label('SYNTHETIC Daily Well')).toBe(
      '{1}: You draw a card. Activate only once each turn.',
    );
    expect(label('SYNTHETIC Brand Hellkite')).toBe(
      '{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only once each turn.',
    );
  });
});

describe('the effects', () => {
  test('look at the top cards and take some', () => {
    expect(spellGist('SYNTHETIC Artifact Sketch')).toBe(
      'Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order',
    );
    expect(spellGist('SYNTHETIC Beast Sketch')).toBe(
      'Look at the top four cards of your library. You may reveal up to two creature cards from among them and put them into your hand. Put the rest into your graveyard',
    );
  });

  test('discard unless a card of a kind is discarded', () => {
    expect(spellGist('SYNTHETIC Study Rite')).toBe(
      'You draw 3 cards. You discard 2 cards unless you discard an artifact card',
    );
    expect(spellGist('SYNTHETIC Beast Rite')).toBe(
      'You draw 2 cards. You discard 2 cards unless you discard a creature card',
    );
  });

  test('tap a chosen number, "tapped this way" and the player or planeswalker it is attacking', () => {
    const sphere = cardView(1, 'SYNTHETIC Swarm Sphere');
    expect(triggerGist(triggered('SYNTHETIC Swarm Sphere', 1), sphere)).toBe(
      "You may tap any number of untapped Myr you control. If you do, this creature gets +X/+0 until end of turn, where X is the number of permanents tapped this way. Deal X damage to the player or planeswalker it's attacking, where X is the number of permanents tapped this way",
    );
    expect(
      triggerGist(triggered('SYNTHETIC Weary Drover'), cardView(1, 'SYNTHETIC Weary Drover')),
    ).toBe('Tap two untapped creatures you control. If you do, you draw a card');
    expect(label('SYNTHETIC Chilling Rune')).toBe(
      '{1}: Tap target creature. You gain X life, where X is the number of permanents tapped this way',
    );
  });

  test('a mass effect over a union of kinds, graveyards, a count of colors', () => {
    expect(label('SYNTHETIC Wipe Disk')).toBe(
      '{1}, {T}: Destroy all artifacts, creatures and enchantments',
    );
    expect(label('SYNTHETIC Quiet Lantern')).toBe(
      "{T}, Sacrifice this: Exile each opponent's graveyard",
    );
    expect(label('SYNTHETIC Hollow Lantern')).toBe(
      "{T}, Sacrifice this: Exile each player's graveyard",
    );
    expect(spellGist('SYNTHETIC Prism Purge')).toBe(
      'Each player sacrifices all permanents they control with two or more colors',
    );
    expect(spellGist('SYNTHETIC Mono Purge')).toBe(
      'Each player sacrifices all permanents they control with exactly one color',
    );
  });

  test('an "each" whose filter the words cannot say is left out, never said without the field', () => {
    const effect = {
      kind: 'destroy',
      objects: {
        kind: 'each',
        filter: { types: ['creature'], tapped: true, owner: { kind: 'you' } },
      },
    } as const;
    expect(triggerGist({ kind: 'activated', cost: [], effect } as never, undefined)).toBe('');
  });

  test('exiled with this creature, and the enchanted permanent', () => {
    expect(
      triggerGist(triggered('SYNTHETIC Shape Twin'), cardView(1, 'SYNTHETIC Shape Twin')),
    ).toBe("Exile target nontoken creature. It's exiled with this creature");
    expect(
      triggerGist(triggered('SYNTHETIC Chill Chains'), cardView(1, 'SYNTHETIC Chill Chains')),
    ).toBe('Tap enchanted permanent. You become the monarch');
  });

  test('put a card from the hand onto the battlefield, and add an exact mana', () => {
    expect(label('SYNTHETIC Swap Lodge')).toBe(
      "{2}, Return a creature you control to its owner's hand: You may put a creature card from your hand onto the battlefield tapped",
    );
    expect(
      triggerGist(triggered('SYNTHETIC Echo Monument'), cardView(1, 'SYNTHETIC Echo Monument')),
    ).toBe('Add {C}');
  });

  test('reselect an attack, on the stack with its "during" step', () => {
    const post = cardView(1, 'SYNTHETIC Crooked Signpost');
    const ability = triggered('SYNTHETIC Crooked Signpost');
    expect(triggerGist(ability, post)).toBe(
      'Reselect which player or permanent target attacking creature is attacking',
    );
    expect(triggerCondition(ability, 'SYNTHETIC Crooked Signpost', post)).toBe(
      'Whenever SYNTHETIC Crooked Signpost enters during the declare attackers step',
    );
    expect(triggerCondition(ability, 'X', post, true)).toBe(
      'whenever X enters during the declare attackers step',
    );
  });
});

describe('the triggers and the conditions', () => {
  const noun = (name: string) => cardView(1, name);
  test('a state trigger is worded from its condition', () => {
    expect(
      triggerCondition(triggered('SYNTHETIC Reading Tome'), 'Tome', noun('SYNTHETIC Reading Tome')),
    ).toBe('When there are four or more page counters on this artifact');
    expect(
      triggerCondition(
        triggered('SYNTHETIC Pride Statue'),
        'Statue',
        noun('SYNTHETIC Pride Statue'),
      ),
    ).toBe('When you have 30 or more life');
    expect(
      triggerWords(triggered('SYNTHETIC Lore Idol').trigger, { self: 'Idol' }, 'artifact'),
    ).toBe('When there are three or more lore counters on this artifact');
  });

  test('tapped for mana and a batch of combat damage', () => {
    const say = (name: string) => triggerCondition(triggered(name), name, noun(name)) ?? 'unworded';
    expect(say('SYNTHETIC Echo Monument')).toBe('Whenever you tap a permanent for {C}');
    expect(say('SYNTHETIC Green Cairn')).toBe('Whenever you tap a Forest for {G}');
    expect(say('SYNTHETIC Spark Totem')).toBe('Whenever you tap a creature for mana');
    expect(say('SYNTHETIC Spy Ring')).toBe(
      'Whenever one or more artifact creatures you control deal combat damage to a player',
    );
    expect(say('SYNTHETIC Mob Banner')).toBe(
      'Whenever two or more creatures you control deal combat damage to a player',
    );
  });

  test('the greatest mana value or tied, and a combat step', () => {
    const keeper = triggered('SYNTHETIC Artifact Keeper');
    expect(triggerGist(keeper, noun('SYNTHETIC Artifact Keeper'))).toBe(
      'You draw a card if you control the artifact with the greatest mana value or tied for the greatest mana value',
    );
    expect(
      gameConditionWords({
        kind: 'controlsGreatest',
        filter: { types: ['creature'], subtypes: ['Goblin'] },
        stat: 'power',
      }),
    ).toBe('you control the Goblin with the greatest power or tied for the greatest power');
    expect(gameConditionWords({ kind: 'duringStep', step: 'declareAttackers' })).toBe(
      "it's the declare attackers step",
    );
  });
});

describe('the statics, Living weapon and Kindred', () => {
  const words = (name: string) =>
    lordWordings(abilitiesOf(name), {
      noun: face(name).types.includes('creature') ? 'creature' : (face(name).types[0] ?? ''),
      subtypes: face(name).subtypes,
    });

  test('base power and toughness, a type in addition, and can’t be blocked by', () => {
    expect(words('SYNTHETIC Juggernaut Lord')).toEqual([
      "Juggernauts you control can't be blocked by Walls.",
      'Other creatures you control have base power and toughness 5/3.',
      'Other creatures you control are Juggernauts in addition to their other creature types.',
    ]);
    expect(words('SYNTHETIC Ground Standard')[0]).toBe(
      "Bears you control can't be blocked by creatures with flying.",
    );
    expect(words('SYNTHETIC Bully Brute')).toEqual([
      "This creature can't be blocked by creatures with power 2 or less.",
    ]);
  });

  test('flash for some spells, and the card exiled with this creature', () => {
    expect(words('SYNTHETIC Swift Artisan')).toEqual([
      'You may cast artifact spells as though they had flash.',
    ]);
    expect(words('SYNTHETIC Swift Cheapskate')).toEqual([
      'You may cast spells with mana value 2 or less as though they had flash.',
    ]);
    expect(words('SYNTHETIC Shape Twin')).toEqual([
      "As long as a card exiled with this creature is a creature card, this creature has the power, toughness and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
    ]);
  });

  test('an Aura’s and an Equipment’s permanent, with the monarch condition', () => {
    expect(words('SYNTHETIC Chill Chains')).toEqual([
      "Enchanted creature doesn't untap during its controller's untap step as long as its controller is not the monarch.",
    ]);
    expect(words('SYNTHETIC Scout Gear')).toEqual(['Equipped creature gets +1/+1.']);
  });

  test('Living weapon: its reminder text, the chip, and a count over a union of types', () => {
    const reminder =
      'Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this Equipment to it.)';
    expect(words('SYNTHETIC Husk Blade')).toEqual([reminder]);
    expect(words('SYNTHETIC Count Blade')).toEqual([
      reminder,
      'Equipped creature gets +1/+1 for each artifact or enchantment you control.',
    ]);
    expect(keywordName('livingWeapon')).toBe(reminder);
  });

  test('Kindred stands in the type line like any card type', () => {
    expect(typeLine(face('SYNTHETIC Prism Purge'))).toBe('Kindred Sorcery — Eldrazi');
    expect(typeLine(face('SYNTHETIC Grey Idol'))).toBe('Kindred Artifact — Eldrazi');
  });
});

describe('the return cost and the "tap any number" choice', () => {
  const mage = view(1, 'SYNTHETIC Ferry Mage', { types: ['artifact', 'creature'] });
  const activation = view(2, 'SYNTHETIC Ferry Mage', {
    zone: 'stack',
    types: [],
    abilitySource: mage.id,
    ability: activated('SYNTHETIC Ferry Mage') as StackAbility,
  });
  const scribe = view(3, 'SYNTHETIC Idle Scribe');
  const attackTrigger = view(4, 'SYNTHETIC Idle Scribe', {
    zone: 'stack',
    types: [],
    abilitySource: scribe.id,
    ability: triggered('SYNTHETIC Idle Scribe') as StackAbility,
  });
  const index = lookupIndexFor([mage, activation, scribe, attackTrigger]);
  const decision = (patch: Partial<ChoosePermanentDecision>): ChoosePermanentDecision => ({
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: activation.id,
    purpose: 'bounce',
    forCost: true,
    min: 1,
    max: 1,
    legal: ['o10', 'o11'],
    ...patch,
  });

  test('the return cost says what to return and for what, with Cancel', () => {
    const d = decision({});
    expect(choosePermanentPrompt(d, index)).toBe(
      "Return an artifact you control to its owner's hand to pay for SYNTHETIC Ferry Mage's ability.",
    );
    expect(chosenBadge(d, index)).toBe('Return');
    const { model } = harness(d, [mage, activation]);
    expect(model.bar.cancel?.label).toBe('Cancel');
  });

  test('"tap any number": the words of the effect, Confirm with none, the Tap badge', () => {
    const d = decision({
      source: attackTrigger.id,
      purpose: 'effect',
      forCost: false,
      min: 0,
      max: 2,
    });
    expect(choosePermanentPrompt(d, index)).toBe(
      'Tap any number of untapped creatures you control for SYNTHETIC Idle Scribe.',
    );
    expect(chosenBadge(d, index)).toBe('Tap');
    expect(permanentsDetail([], d)).toBe(
      'Click permanents to choose them, or Confirm to choose none.',
    );
    const { model, acts } = harness(d, [scribe, attackTrigger]);
    expect(model.bar.buttons[0]?.disabled).toBeFalsy();
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: [] }]);
  });

  test('an effect that is not a tap keeps its own words', () => {
    const d = decision({ purpose: 'effect', forCost: false });
    expect(chosenBadge(d, index)).toBe('Chosen');
  });

  test('the log says what was returned', () => {
    const state = {
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 0 },
        o2: { card: 'c2', token: null, stack: null, controller: 0 },
      },
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
      definitions: { d1: { name: 'Ferry Mage' }, d2: { name: 'Copper Myr' } },
      pending: null,
    } as unknown as GameState;
    const line = (automatic: boolean) =>
      describeEvent(
        {
          kind: 'permanentsChosen',
          seat: 0,
          source: 'o1',
          objects: ['o2'],
          purpose: 'bounce',
          automatic,
        } as never,
        state,
        state,
        0,
      )?.text;
    expect(line(false)).toBe('You return Copper Myr to pay for Ferry Mage.');
    expect(line(true)).toBe('You must return Copper Myr to pay for Ferry Mage: no other choice.');
  });

  test('the log of "tap any number" says what was tapped, or that nothing was', () => {
    const state = {
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 0 },
        o2: { card: 'c2', token: null, stack: null, controller: 0 },
        o3: {
          card: null,
          token: null,
          controller: 0,
          stack: { kind: 'ability', source: 'o1', ability: triggered('SYNTHETIC Idle Scribe') },
        },
      },
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
      definitions: { d1: { name: 'Idle Scribe' }, d2: { name: 'Copper Myr' } },
      pending: null,
    } as unknown as GameState;
    const line = (objects: string[]) =>
      describeEvent(
        {
          kind: 'permanentsChosen',
          seat: 0,
          source: 'o3',
          objects,
          purpose: 'effect',
          automatic: false,
        } as never,
        state,
        state,
        0,
      )?.text;
    expect(line(['o2'])).toMatch(/^You tap Copper Myr for /);
    expect(line([])).toMatch(/^You choose to tap nothing for /);
  });
});

describe('the card choices: discard unless, look and take, put onto the battlefield', () => {
  const rite = view(1, 'SYNTHETIC Study Rite', { zone: 'stack', types: ['instant'] });
  const gear = view(2, 'SYNTHETIC Scout Gear', { types: ['artifact'], subtypes: ['Equipment'] });
  const look = view(3, 'SYNTHETIC Scout Gear', {
    zone: 'stack',
    types: [],
    abilitySource: gear.id,
    ability: triggered('SYNTHETIC Scout Gear') as StackAbility,
  });
  const index = lookupIndexFor([rite, gear, look]);
  const discard: ChooseCardsDecision = {
    id: 'd1',
    seat: 0,
    kind: 'chooseCards',
    source: rite.id,
    purpose: 'discard',
    zone: 'hand',
    legal: ['o10', 'o11', 'o12'],
    orSingle: ['o12'],
    min: 1,
    max: 2,
    reveal: true,
    prompt: 'Discard 2 cards, or discard one card that matches instead',
  };

  test('exactly two cards, or one card that will do alone', () => {
    expect(foundReady([], discard)).toBe(false);
    expect(foundReady(['o10'], discard)).toBe(false);
    expect(foundReady(['o12'], discard)).toBe(true);
    expect(foundReady(['o10', 'o11'], discard)).toBe(true);
    expect(foundHint(['o10'], discard)).toBe('Choose 2 cards, or one card marked “enough alone”');
    expect(foundDetail(discard, ['o10'])).toBe(
      '1 of 2 chosen. One card marked “enough alone” is enough by itself.',
    );
    // A spell's effect is not in the view: its cards are marked instead of the kind being guessed.
    expect(cardsPrompt(discard, index)).toBe(
      'Discard 2 cards, or one card marked “enough alone” instead, for SYNTHETIC Study Rite.',
    );
    const { model } = harness(discard, [rite]);
    expect(model.bar.buttons[0]?.disabled).toBe(true);
  });

  const lookTake: ChooseCardsDecision = {
    id: 'd2',
    seat: 0,
    kind: 'chooseCards',
    source: look.id,
    purpose: 'lookTake',
    zone: 'library',
    legal: ['o20'],
    looked: ['o20', 'o21', 'o22'],
    min: 0,
    max: 1,
    reveal: true,
    prompt: 'Look at the top 3 cards of your library. You may reveal a card that matches',
  };

  test('look and take: the words of the ability, the title, the buttons and the badge', () => {
    expect(cardsPrompt(lookTake, index)).toBe(
      "Look at the top three cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order (SYNTHETIC Scout Gear's ability).",
    );
    expect(discardTitle(lookTake, index)).toBe('Top 3 cards of your library');
    expect(confirmLabel(lookTake, [])).toBe('Take none');
    expect(confirmLabel(lookTake, ['o20'])).toBe('Put into hand');
    expect(foundBadge(lookTake, ['o20'], 'o20')).toBe('Take');
    expect(foundReady([], lookTake)).toBe(true);
  });

  test('put a card onto the battlefield', () => {
    const { looked: _looked, ...rest } = lookTake;
    const move: ChooseCardsDecision = {
      ...rest,
      id: 'd3',
      purpose: 'move',
      zone: 'hand',
      prompt: 'Choose up to 1 card from your hand to put onto the battlefield',
    };
    expect(cardsPrompt(move, index)).toBe(
      "Choose up to 1 card from your hand to put onto the battlefield (SYNTHETIC Scout Gear's ability).",
    );
    expect(confirmLabel(move, [])).toBe('Put none');
    expect(confirmLabel(move, ['o20'])).toBe('Put onto battlefield');
    expect(foundBadge(move, ['o20'], 'o20')).toBe('Put');
  });

  test('the opponent sees only what they are doing', () => {
    const waiting = (purpose: 'move' | 'lookTake') =>
      waitingText({
        waitingOn: { seat: 1, purpose, sourceName: 'X' },
      } as unknown as GameView);
    expect(waiting('lookTake')).toBe(
      'Opponent is choosing among the top cards of their library (X).',
    );
    expect(waiting('move')).toBe('Opponent is choosing cards to put onto the battlefield (X).');
  });

  test('the cards looked at that cannot be taken reach only their looker', () => {
    const card = (n: number) => [`o${n}`, { card: `c${n}`, face: 0 }];
    const state = {
      pending: { ...lookTake, seat: 0 },
      objects: Object.fromEntries([card(20), card(21), card(22)]),
      cards: {
        c20: { definition: 'd20' },
        c21: { definition: 'd21' },
        c22: { definition: 'd22' },
      },
      definitions: Object.fromEntries(
        [
          ['d20', 'Sol Ring'],
          ['d21', 'Island'],
          ['d22', 'Grizzly Bears'],
        ].map(([id, name]) => [
          id,
          {
            faces: [
              { name, manaCost: null, supertypes: [], types: [], subtypes: [], oracleText: '' },
            ],
          },
        ]),
      ),
    } as unknown as GameState;
    expect(lookedCards(state, 0).map((c) => c.name)).toEqual(['Island', 'Grizzly Bears']);
    // Not the opponent's question, and not another question.
    expect(lookedCards(state, 1)).toEqual([]);
    expect(lookedCards({ ...state, pending: discard } as GameState, 0)).toEqual([]);
  });

  test('the log of the cards looked at names no card, and says whose library', () => {
    const state = {
      objects: {},
      cards: {},
      definitions: {},
      pending: null,
    } as unknown as GameState;
    const line = (seat: number) =>
      describeEvent({ kind: 'topCardsLooked', seat, count: 6 } as never, state, state, 0)?.text;
    expect(line(0)).toBe('You look at the top 6 cards of your library.');
    expect(line(1)).toBe('Opponent looks at the top 6 cards of their library.');
  });
});

describe('reselecting what a creature attacks', () => {
  const bears = view(1, 'Grizzly Bears', { controller: 1, owner: 1 });
  const jace = view(2, 'SYNTHETIC Jace', { types: ['planeswalker'] });
  const index = lookupIndexFor([bears, jace]);
  const d: ChooseOptionDecision = {
    id: 'd1',
    seat: 0,
    kind: 'chooseOption',
    purpose: 'attackTarget',
    options: ['player:0', 'permanent:o2'],
    attacker: bears.id,
    attackTargets: [
      { kind: 'player', seat: 0 },
      { kind: 'permanent', object: jace.id },
    ],
    source: 'o9',
    sourceName: 'SYNTHETIC Crooked Signpost',
    sourceOracleText: '',
  };
  const game = {
    viewer: 0,
    combat: {
      attackers: [
        { object: bears.id, target: { kind: 'player', seat: 0 }, blocked: false, blockedBy: [] },
      ],
    },
  } as unknown as GameView;

  test('the prompt names the attacker; the rows name each target and mark the current one', () => {
    expect(attackTargetPrompt(d, index)).toBe(
      'Choose what Grizzly Bears attacks (SYNTHETIC Crooked Signpost).',
    );
    expect(attackTargetRows(d, game, index)).toEqual([
      { option: 'player:0', label: 'You (player)', current: true },
      { option: 'permanent:o2', label: 'SYNTHETIC Jace (planeswalker)', current: false },
    ]);
  });

  test('the model puts the question in a dialog with the same prompt', () => {
    const { model } = harness(d, [bears, jace]);
    expect(model.bar.inOverlay).toBe(true);
    expect(model.bar.prompt).toBe(
      'Choose what Grizzly Bears attacks (SYNTHETIC Crooked Signpost).',
    );
  });

  test('the log says what the creature attacks now', () => {
    const state = {
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 1 },
        o2: { card: 'c2', token: null, stack: null, controller: 0 },
        o9: { card: 'c9', token: null, stack: null, controller: 0 },
      },
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' }, c9: { definition: 'd9' } },
      definitions: {
        d1: { name: 'Grizzly Bears' },
        d2: { name: 'Jace' },
        d9: { name: 'Crooked Signpost' },
      },
      pending: d,
    } as unknown as GameState;
    const line = (option: string) =>
      describeEvent(
        { kind: 'optionChosen', seat: 0, source: 'o9', purpose: 'attackTarget', option } as never,
        state,
        state,
        0,
      )?.text;
    expect(line('permanent:o2')).toBe(
      'You choose that Grizzly Bears attacks Jace (Crooked Signpost).',
    );
    expect(line('player:0')).toBe('You choose that Grizzly Bears attacks you (Crooked Signpost).');
  });
});

// D-258: "Search your library for up to two basic land cards that share a land type": Confirm is not offered for two lands that share no land type.
describe('a search for lands that share a land type', () => {
  const search: ChooseCardsDecision = {
    id: 'd9',
    seat: 0,
    kind: 'chooseCards',
    source: 'o99',
    purpose: 'search',
    zone: 'library',
    legal: ['o30', 'o31', 'o32'],
    shareLandType: { o30: ['Forest'], o31: ['Plains'], o32: ['Forest'] },
    min: 0,
    max: 2,
    reveal: false,
    prompt: 'Choose up to two basic land cards that share a land type',
  };

  test('none, one card, and two that share a type are ready; two that do not are not', () => {
    expect(foundReady([], search)).toBe(true);
    expect(foundReady(['o31'], search)).toBe(true);
    expect(foundReady(['o30', 'o32'], search)).toBe(true);
    expect(foundReady(['o30', 'o31'], search)).toBe(false);
    expect(foundHint(['o30', 'o31'], search)).toBe('Choose lands that share a land type');
    expect(foundHint(['o30', 'o32'], search)).toBeNull();
  });
});
