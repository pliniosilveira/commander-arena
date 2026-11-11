/**
 * The web side of D-133 as pure models: the tap-cost choice, the blocker limit, the graveyard cast, the words of
 * conditions, lords, restrictions and the replacement of a death (read from the engine's SYNTHETIC cards, so a
 * wording that drifts from the AST fails here), the trigger words for filtered subjects and the log line.
 */
import {
  type Ability,
  type ChoosePermanentDecision,
  type DeclareBlockersDecision,
  type GameState,
  type ObjectView,
  type PriorityDecision,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { tappedWhat } from '../src/game/cost-text';
import { describeEvent } from '../src/game/describe';
import { lordWordings, replacementWording } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';
import { menuItems } from '../src/ui/decisions/abilities';
import { triggerGist } from '../src/ui/decisions/ability-label';
import {
  atBlockLimit,
  type BlockState,
  blockableAttackers,
  clickAttacker,
  clickBlocker,
  NO_BLOCKS,
} from '../src/ui/decisions/block';
import { blockRefusals } from '../src/ui/decisions/block-reasons';
import { castLabel, graveyardBadge, graveyardLabels } from '../src/ui/decisions/flashback';
import {
  choosePermanentPrompt,
  chosenBadge,
  permanentsHint,
  permanentsReady,
} from '../src/ui/decisions/permanents';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};
const abilitiesOf = (name: string): readonly Ability[] => face(name).abilities;
const wordsOf = (name: string, noun = 'creature') => lordWordings(abilitiesOf(name), { noun });

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

describe('the tap cost choice', () => {
  const ability = abilitiesOf('SYNTHETIC Grave Whisperer').find((a) => a.kind === 'activated');
  const host = view(1, 'SYNTHETIC Grave Whisperer', { subtypes: ['Zombie'] });
  const onStack = view(2, 'SYNTHETIC Grave Whisperer', {
    zone: 'stack',
    types: [],
    abilitySource: host.id,
    ...(ability === undefined ? {} : { ability }),
  });
  const index = lookupIndexFor([host, onStack]);
  const decision = (patch: Partial<ChoosePermanentDecision> = {}): ChoosePermanentDecision => ({
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: onStack.id,
    purpose: 'tap',
    forCost: true,
    min: 3,
    max: 3,
    legal: ['o10', 'o11', 'o12', 'o13'],
    ...patch,
  });

  test('the prompt says how many, which and why, from the cost on the stack', () => {
    expect(choosePermanentPrompt(decision(), index)).toBe(
      'Choose 3 untapped Zombies you control to tap as a cost.',
    );
    expect(chosenBadge(decision())).toBe('Tap');
  });

  test('every kind of group reads right, including irregular plurals and one permanent', () => {
    const t = (subtype: string, count: number, other = false) =>
      tappedWhat(
        { types: ['creature'], subtypes: [subtype], ...(other ? { other: true } : {}) },
        count,
        true,
      );
    expect(t('Elf', 2)).toBe('2 untapped Elves you control');
    expect(t('Wolf', 3)).toBe('3 untapped Wolves you control');
    expect(t('Merfolk', 2)).toBe('2 untapped Merfolk you control');
    expect(t('Elf', 1)).toBe('an untapped Elf you control');
    expect(t('Zombie', 1, true)).toBe('another untapped Zombie you control');
    expect(tappedWhat({ types: ['artifact'] }, 2)).toBe('two untapped artifacts you control');
    expect(tappedWhat({ types: ['creature'], other: true }, 1)).toBe(
      'another untapped creature you control',
    );
  });

  test('an ability the view does not show gives the plain prompt, never a guess', () => {
    const bare = lookupIndexFor([
      host,
      view(2, 'SYNTHETIC Grave Whisperer', { zone: 'stack', types: [], abilitySource: host.id }),
    ]);
    expect(choosePermanentPrompt(decision(), bare)).toBe(
      'Choose 3 permanents to tap as a cost for SYNTHETIC Grave Whisperer.',
    );
  });

  test('Confirm needs exactly the count', () => {
    const d = decision();
    expect(permanentsReady(['o10', 'o11'], d)).toBe(false);
    expect(permanentsReady(['o10', 'o11', 'o12'], d)).toBe(true);
    expect(permanentsHint(['o10'], d)).toBe('Choose 2 more permanents');
  });
});

describe('a limit on blockers', () => {
  const candidates: DeclareBlockersDecision['candidates'] = [
    { blocker: 'o1', canBlock: ['o10', 'o11'] },
    { blocker: 'o2', canBlock: ['o10', 'o11'] },
  ];
  const attackers: DeclareBlockersDecision['attackers'] = [
    { attacker: 'o10', target: { kind: 'player', seat: 0 }, minBlockers: 1, maxBlockers: 1 },
    { attacker: 'o11', target: { kind: 'player', seat: 0 }, minBlockers: 1 },
  ];

  test('a second blocker is refused on the limited attacker and not on the other', () => {
    let s = clickBlocker(NO_BLOCKS, candidates, 'o1');
    s = clickAttacker(s, candidates, 'o10', attackers);
    expect(s.blocks).toEqual([{ blocker: 'o1', attacker: 'o10' }]);
    s = clickBlocker(s, candidates, 'o2');
    expect(blockableAttackers(s, candidates, attackers)).toEqual(['o11']);
    expect(clickAttacker(s, candidates, 'o10', attackers)).toBe(s);
    s = clickAttacker(s, candidates, 'o11', attackers);
    expect(s.blocks).toHaveLength(2);
  });

  test('moving the blocker that holds the place is allowed, and no limit means no refusal', () => {
    const s: BlockState = { blocks: [{ blocker: 'o1', attacker: 'o10' }], blocker: 'o1' };
    expect(atBlockLimit(s.blocks, attackers, 'o10', 'o1')).toBe(false);
    expect(atBlockLimit(s.blocks, attackers, 'o10', 'o2')).toBe(true);
    expect(atBlockLimit(s.blocks, attackers, 'o11', 'o2')).toBe(false);
    expect(atBlockLimit(s.blocks, [], 'o10', 'o2')).toBe(false);
  });

  test('the reason is in the refusal words', () => {
    const attacker = view(10, 'Big Ogre', { power: 4 });
    const blocker = view(2, 'Grizzly Bears');
    expect(blockRefusals(attacker, blocker, [], 1)).toEqual([
      "can't be blocked by more than one creature",
    ]);
    expect(blockRefusals(attacker, blocker, [], 2)).toEqual([
      "can't be blocked by more than 2 creatures",
    ]);
    expect(blockRefusals(attacker, blocker, [])).toEqual([]);
  });
});

describe('casting from the graveyard', () => {
  const shade = view(1, 'SYNTHETIC Stubborn Shade', { zone: 'graveyard', types: ['sorcery'] });
  const flash = view(2, 'Fiery Past', {
    zone: 'graveyard',
    types: ['sorcery'],
    oracleText: 'Flashback {2}{R}',
  });
  const decision = (options: PriorityDecision['options']): PriorityDecision =>
    ({ id: 'd', seat: 0, kind: 'priority', options }) as unknown as PriorityDecision;
  const plain = { kind: 'castSpell', object: 'o1' } as const;

  test('a plain cast of a graveyard card is "Cast from graveyard", never flashback', () => {
    expect(graveyardLabels(decision([plain]), shade)).toEqual(['Cast from graveyard']);
    expect(castLabel(plain, shade, shade.name)).toBe(`Cast ${shade.name} from graveyard`);
    expect(graveyardBadge(decision([plain]), lookupIndexFor([shade]), 'o1')).toBe(
      'Cast from graveyard',
    );
    const items = menuItems(decision([plain]), 'o1', lookupIndexFor([shade]));
    expect(items.map((i) => i.label)).toEqual([`Cast ${shade.name} from graveyard`]);
  });

  test('flashback keeps its own label and a hand card its own', () => {
    const fb = { kind: 'castSpell', object: 'o2', alternative: 'flashback' } as const;
    expect(graveyardLabels(decision([fb]), flash)).toEqual(['Flashback {2}{R}']);
    const inHand = view(3, 'Bolt', { zone: 'hand' });
    expect(castLabel({ kind: 'castSpell', object: 'o3' }, inHand, 'Bolt')).toBe('Cast Bolt');
  });
});

describe('conditions in words', () => {
  const when = (name: string): string | null => {
    const a = abilitiesOf(name).find((x) => x.kind === 'static' && x.condition !== undefined);
    return a?.kind === 'static' && a.condition !== undefined
      ? gameConditionWords(a.condition)
      : null;
  };
  test('life, commander, control and "it\'s untapped"', () => {
    expect(when('SYNTHETIC Hale Brute')).toBe('you have 30 or more life');
    expect(when('SYNTHETIC Prime Valkyrie')).toBe(
      'you have at least 7 life more than your starting life total',
    );
    expect(when('SYNTHETIC Field Marshal')).toBe('you control your commander');
    expect(when('SYNTHETIC Artifact Adept')).toBe('you control 3 or more artifacts');
    expect(when('SYNTHETIC Zombie Pact')).toBe('you control another Zombie');
    expect(when('SYNTHETIC Shade Druid')).toBe("it's untapped");
    expect(gameConditionWords({ kind: 'controlCommander' })).toBe('you control a commander');
    expect(
      gameConditionWords({ kind: 'not', term: { kind: 'controlCommander', yours: true } }),
    ).toBe("you don't control your commander");
    expect(gameConditionWords({ kind: 'lifeTotal', compare: { cmp: 'atMost', value: 5 } })).toBe(
      'you have 5 or less life',
    );
    expect(
      gameConditionWords({
        kind: 'not',
        term: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
      }),
    ).toBe('you have less than 30 life');
  });
});

describe('lords, grants, restrictions and the replacement of a death in words', () => {
  test('a lord is worded from its filter', () => {
    expect(wordsOf('SYNTHETIC Undead Lord')).toEqual(['Other Zombies get +1/+1.']);
    expect(wordsOf('SYNTHETIC Muster Sergeant')).toEqual([
      'Other nontoken creatures you control get +1/+1.',
    ]);
    expect(wordsOf('SYNTHETIC Colorless Banner')).toEqual([
      'Colorless creatures you control get +1/+1.',
    ]);
    expect(wordsOf('SYNTHETIC Bone Baron')).toEqual([
      'Skeletons you control and other Zombies you control get +1/+1.',
      'Skeletons you control and other Zombies you control have deathtouch.',
    ]);
  });

  test('any creature type reads right, irregular plurals too', () => {
    const lord = (subtype: string): Ability => ({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], subtypes: [subtype], controller: 'you' },
          other: true,
        },
        power: 1,
        toughness: 1,
      },
    });
    const say = (subtype: string) => lordWordings([lord(subtype)], { noun: 'creature' })[0];
    expect(say('Elf')).toBe('Other Elves you control get +1/+1.');
    expect(say('Wolf')).toBe('Other Wolves you control get +1/+1.');
    expect(say('Merfolk')).toBe('Other Merfolk you control get +1/+1.');
    expect(say('Goblin')).toBe('Other Goblins you control get +1/+1.');
  });

  test('a condition, a restriction and a graveyard permission read as sentences', () => {
    expect(wordsOf('SYNTHETIC Field Marshal')).toEqual([
      'This creature gets +2/+2 as long as you control your commander.',
      'Creatures you control have vigilance as long as you control your commander.',
    ]);
    expect(wordsOf('SYNTHETIC Banner of the Lone Duel', 'enchantment')).toEqual([
      "Creatures you control with power 4 or greater can't be blocked by more than one creature.",
    ]);
    expect(wordsOf('SYNTHETIC Restless Corpse')).toEqual([
      "This creature can't block.",
      'You may cast this card from your graveyard as long as you control a Zombie.',
    ]);
    expect(wordsOf('SYNTHETIC Stubborn Shade', 'sorcery')).toEqual([
      'You may cast this card from your graveyard.',
    ]);
  });

  test('the death replacement says what it exiles and what it makes', () => {
    expect(wordsOf('SYNTHETIC Soul Collector')).toEqual([
      'If a nontoken creature an opponent controls would die, exile it instead and create a 2/2 black Zombie creature token.',
    ]);
    expect(wordsOf('SYNTHETIC Quiet Shroud', 'enchantment')).toEqual([
      'If a creature would die, exile it instead.',
    ]);
    expect(replacementWording({ kind: 'entersTapped' })).toBeNull();
  });
});

describe('triggers on a filtered subject and the player or damage they are about', () => {
  const words = (name: string, i = 0) => {
    const triggered = abilitiesOf(name).filter((a) => a.kind === 'triggered');
    const a = triggered[i];
    if (a?.kind !== 'triggered') throw new Error('no trigger');
    return {
      when: triggerWording(a.trigger, { self: name }),
      what: triggerGist(a, undefined),
    };
  };
  test('the subject is a filter and the effect names "that player" or "that much"', () => {
    expect(words('SYNTHETIC Reaver Cousin')).toEqual({
      when: 'Whenever SYNTHETIC Reaver Cousin deals combat damage to a player',
      what: 'That player discards a card. Create a tapped 2/2 black Zombie creature token',
    });
    expect(words('SYNTHETIC Soulful Seraph')).toEqual({
      when: 'Whenever SYNTHETIC Soulful Seraph is dealt damage',
      what: 'You gain that much life',
    });
    expect(words('SYNTHETIC Gale Tempest')).toEqual({
      when: 'Whenever a creature you control with flying enters',
      what: 'It gains haste until end of turn',
    });
    expect(words('SYNTHETIC Goreclaw Cousin').when).toBe(
      'Whenever another nontoken creature you control enters',
    );
    expect(words('SYNTHETIC Zombie Tithe').when).toBe(
      'Whenever a nontoken Zombie deals combat damage to a player',
    );
    expect(words('SYNTHETIC Decree Stone')).toEqual({
      when: 'Whenever a creature attacks you or a planeswalker you control',
      what: 'Its controller loses 1 life',
    });
  });

  test('the effect of a grant to a group is worded with the group', () => {
    expect(words('SYNTHETIC Big Rallier', 0).what).toBe(
      'Each creature you control with power 3 or greater gets +1/+1 until end of turn. Each creature you control with power 3 or greater gains trample until end of turn',
    );
  });
});

describe('the log line of a tap cost', () => {
  const state = {
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0 },
      o2: { card: 'c2', token: null, stack: null, controller: 0 },
      o3: { card: 'c3', token: null, stack: null, controller: 0 },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' }, c3: { definition: 'd3' } },
    definitions: {
      d1: { name: 'Brass Trinket' },
      d2: { name: 'Clockwork Ledger' },
      d3: { name: 'Gear' },
    },
    pending: null,
  } as unknown as GameState;
  const line = (automatic: boolean, seat: number) =>
    describeEvent(
      {
        kind: 'permanentsChosen',
        seat,
        source: 'o2',
        objects: ['o1', 'o3'],
        purpose: 'tap',
        automatic,
      } as never,
      state,
      state,
      0,
    );
  test('says who tapped what to pay for what, with the rule', () => {
    const l = line(false, 0);
    expect(l?.text).toBe('You tap Brass Trinket and Gear to pay for Clockwork Ledger.');
    expect(l?.rule).toBe('CR 602.2b');
    expect(line(true, 0)?.text).toBe(
      'You must tap Brass Trinket and Gear to pay for Clockwork Ledger: no other choice.',
    );
    expect(line(false, 1)?.text).toBe(
      'Opponent taps Brass Trinket and Gear to pay for Clockwork Ledger.',
    );
  });
});
