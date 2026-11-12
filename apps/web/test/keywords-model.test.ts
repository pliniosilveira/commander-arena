/**
 * Keyword batch 1 (D-104, D-110) as pure models: the log lines of poison and kicks, the ability words
 * of annihilator and persist, the chips, the changeling's type line, the multikicker question and
 * the split second note. No DOM.
 */
import {
  type ChoosePermanentDecision,
  type ChooseXDecision,
  CREATURE_TYPES,
  type GameEvent,
  type GameState,
  type GameView,
  type ObjectView,
  type StackAbility,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { chipsOf } from '../src/ui/board/keywords';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { choosePermanentPrompt } from '../src/ui/decisions/permanents';
import { priorityDetail, SPLIT_SECOND_HINT, splitSecondSpell } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import {
  initialX,
  kickButtonText,
  kickCostAt,
  multikickerPrompt,
  xPrompt,
} from '../src/ui/decisions/x-picker';
import { hasEveryCreatureType, kickedWords, typeLine } from '../src/ui/format';
import { lossReason } from '../src/ui/screens/game-over-model';
import { lookupIndexFor } from './decisions-helpers';

const object = (patch: Partial<ObjectView>): ObjectView =>
  ({
    id: 'o1',
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name: 'SYNTHETIC Annihilator Titan',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: [],
    colors: [],
    power: 3,
    toughness: 3,
    oracleText: '',
    counters: {},
    keywords: [],
    isCommander: false,
    isToken: false,
    support: 'supported',
    ...patch,
  }) as ObjectView;

const state = () =>
  ({
    objects: { o1: { card: 'c1', token: null, stack: null, controller: 0 } },
    cards: { c1: { definition: 'd1' } },
    definitions: { d1: { name: 'SYNTHETIC Volley Barrage' } },
    pending: null,
  }) as unknown as GameState;

const line = (event: GameEvent, viewer = 0) =>
  describeEvent(event, state(), state(), viewer)?.text ?? null;

describe('poison counters in the log', () => {
  test('"You get 2 poison counters (3 of 10)." and the same for the opponent', () => {
    const gain = (seat: number, from: number, to: number): GameEvent => ({
      kind: 'poisonChanged',
      seat,
      from,
      to,
    });
    expect(line(gain(0, 1, 3))).toBe('You get 2 poison counters (3 of 10).');
    expect(line(gain(1, 0, 1))).toBe('Opponent gets 1 poison counter (1 of 10).');
    expect(line(gain(1, 8, 10))).toBe('Opponent gets 2 poison counters (10 of 10).');
    const described = describeEvent(gain(0, 0, 2), state(), state(), 0);
    expect(described?.level).toBe('major');
    expect(described?.rule).toBe('CR 122.1');
    expect(described?.seat).toBe(0);
  });

  test('a total that went down is worded as a change, not as getting counters', () => {
    expect(line({ kind: 'poisonChanged', seat: 0, from: 3, to: 1 })).toBe(
      'Your poison counters: 3 to 1.',
    );
  });

  test('a loss to poison keeps the "(poison)" the game-over screen reads', () => {
    const text = line({ kind: 'playerLost', seat: 1, reason: 'poison' });
    expect(text).toBe('Opponent loses the game (poison).');
    expect(
      lossReason(
        [
          {
            id: 1,
            turn: 4,
            seat: 1,
            level: 'major',
            text: text ?? '',
            objects: [],
            rule: 'CR 104.3',
          },
        ],
        { kind: 'win', winner: 0 },
        0,
      ),
    ).toBe('The opponent got 10 or more poison counters.');
  });
});

describe('a loss to an effect (D-921)', () => {
  test('keeps the "(effect)" the game-over screen reads', () => {
    const text = line({ kind: 'playerLost', seat: 1, reason: 'effect' });
    expect(text).toBe('Opponent loses the game (effect).');
    const entry = {
      id: 1,
      turn: 4,
      seat: 1,
      level: 'major',
      text: text ?? '',
      objects: [],
      rule: 'CR 104.3',
    } as const;
    expect(lossReason([entry], { kind: 'win', winner: 0 }, 0)).toBe(
      'An effect made the opponent lose.',
    );
  });
});

describe('the cast line says how many times it was kicked', () => {
  const cast = (extra: object): GameEvent =>
    ({
      kind: 'spellCast',
      nth: 1,
      seat: 0,
      object: 'o1',
      fromZone: 'hand',
      commanderTax: 0,
      ...extra,
    }) as GameEvent;

  test('Multikicker: "kicked 3 times"; once is "kicked", as for Kicker', () => {
    expect(line(cast({ kicked: true, kicks: 3 }))).toBe(
      'You cast SYNTHETIC Volley Barrage, kicked 3 times.',
    );
    expect(line(cast({ kicked: true, kicks: 1 }))).toBe(
      'You cast SYNTHETIC Volley Barrage, kicked.',
    );
    expect(line(cast({ kicked: true }))).toBe('You cast SYNTHETIC Volley Barrage, kicked.');
    expect(line(cast({}))).toBe('You cast SYNTHETIC Volley Barrage.');
    expect(line(cast({ kicks: 2 }), 1)).toBe(
      'Opponent casts SYNTHETIC Volley Barrage, kicked 2 times.',
    );
  });

  test('a badge word for the stack and the preview', () => {
    expect(kickedWords({ kicked: true, kicks: 3 })).toBe('kicked 3 times');
    expect(kickedWords({ kicked: true })).toBe('kicked');
    expect(kickedWords({ kicks: 1 })).toBe('kicked');
    expect(kickedWords({})).toBeNull();
  });
});

describe('ability words', () => {
  const annihilator = (count: number, kind: 'defendingPlayer' = 'defendingPlayer'): StackAbility =>
    ({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'sacrifice',
        objects: { kind: 'choose', filter: {}, count },
        player: { kind },
      },
    }) as unknown as StackAbility;

  test('annihilator: "The defending player sacrifices 2 permanents"', () => {
    expect(triggerGist(annihilator(2), object({}))).toBe(
      'The defending player sacrifices 2 permanents',
    );
    expect(triggerGist(annihilator(1), object({}))).toBe(
      'The defending player sacrifices a permanent',
    );
  });

  test('a sacrifice of a kind of permanent, of this, and Persist "it"', () => {
    const sac = (objects: unknown, player?: unknown): StackAbility =>
      ({
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: { kind: 'sacrifice', objects, ...(player === undefined ? {} : { player }) },
      }) as unknown as StackAbility;
    expect(
      triggerGist(
        sac(
          { kind: 'choose', filter: { types: ['creature'] }, count: 2 },
          { kind: 'eachOpponent' },
        ),
        object({}),
      ),
    ).toBe('Each opponent sacrifices 2 creatures of their choice');
    expect(triggerGist(sac({ kind: 'this' }), object({}))).toBe('Sacrifice this creature');
    const persist = {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'thisCard' },
        to: 'battlefield',
      },
    } as unknown as StackAbility;
    // A move of the card itself is worded from the node (D-135).
    expect(triggerGist(persist, object({}))).toBe('Return it to the battlefield');
    const damage = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'dealDamage',
        amount: { kind: 'timesKicked' },
        to: { kind: 'defendingPlayer' },
      },
    } as unknown as StackAbility;
    expect(triggerGist(damage, object({}))).toBe(
      'Deal X damage to the defending player, where X is the number of times it was kicked',
    );
    const tap = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: { kind: 'tap', objects: { kind: 'thisCard' } },
    } as unknown as StackAbility;
    expect(triggerGist(tap, object({}))).toBe('Tap it');
  });

  test('the defending player is asked "As the defending player, sacrifice 2 permanents for ..."', () => {
    const ability = object({
      id: 'o9',
      name: 'SYNTHETIC Annihilator Titan',
      zone: 'stack',
      abilitySource: 'o1',
      ability: annihilator(2),
    });
    const decision: ChoosePermanentDecision = {
      id: 'd1',
      seat: 0,
      kind: 'choosePermanent',
      source: 'o9',
      purpose: 'sacrifice',
      min: 2,
      max: 2,
      legal: ['o3', 'o4', 'o5'],
    };
    const index = lookupIndexFor([ability]);
    expect(choosePermanentPrompt(decision, index)).toBe(
      'As the defending player, sacrifice 2 permanents for SYNTHETIC Annihilator Titan.',
    );
    // Any other sacrifice keeps its wording.
    const plain = object({ id: 'o9', zone: 'stack', abilitySource: 'o1' });
    expect(choosePermanentPrompt(decision, lookupIndexFor([plain]))).toBe(
      'Sacrifice 2 permanents for SYNTHETIC Annihilator Titan.',
    );
  });
});

describe('chips of the new keywords', () => {
  test('every keyword has its own short and full name', () => {
    const chips = chipsOf({
      keywords: [
        'changeling',
        'devoid',
        'exalted',
        'persist',
        'undying',
        'infect',
        'wither',
        'splitSecond',
        'partner',
      ],
    });
    expect(chips.map((c) => [c.short, c.full])).toEqual([
      ['Chg', 'Changeling'],
      ['Dvd', 'Devoid'],
      ['Exl', 'Exalted'],
      ['Per', 'Persist'],
      ['Und', 'Undying'],
      ['Inf', 'Infect'],
      ['Wth', 'Wither'],
      ['Spl', 'Split second'],
      ['Ptn', 'Partner'],
    ]);
  });

  test('Annihilator N, Toxic N, Multikicker and typecycling read their number or cost from the text', () => {
    const chips = chipsOf({
      keywords: ['annihilator', 'toxic', 'multikicker', 'typecycling'],
      oracleText:
        'Annihilator 2\nToxic 3\nMultikicker {1}{G}\nBasic landcycling {1}\nIslandcycling {2}',
    });
    expect(chips.map((c) => [c.short, c.full])).toEqual([
      ['Ann 2', 'Annihilator 2'],
      ['Tox 3', 'Toxic 3'],
      ['MK', 'Multikicker {1}{G}'],
      ['Tcy', 'Basic landcycling {1}'],
      ['Tcy', 'Islandcycling {2}'],
    ]);
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length);
  });

  test('two instances are two chips; a life cost reads as printed', () => {
    const chips = chipsOf({
      keywords: ['annihilator', 'multikicker'],
      oracleText: 'Annihilator 1\nAnnihilator 2\nMultikicker—Pay 2 life',
    });
    expect(chips.map((c) => c.full)).toEqual([
      'Annihilator 1',
      'Annihilator 2',
      'Multikicker—Pay 2 life',
    ]);
  });

  test('a keyword with no number in the text (granted by an effect) is its bare name, never guessed', () => {
    expect(
      chipsOf({ keywords: ['annihilator', 'toxic'], oracleText: 'Flying' }).map((c) => c.full),
    ).toEqual(['Annihilator', 'Toxic']);
    expect(chipsOf({ keywords: ['toxic'] }).map((c) => c.full)).toEqual(['Toxic']);
  });
});

describe('a changeling is never listed type by type', () => {
  const all = [...CREATURE_TYPES];

  test('the type line reads "Every creature type"', () => {
    const changeling = object({ subtypes: all as ObjectView['subtypes'] });
    expect(hasEveryCreatureType(changeling)).toBe(true);
    expect(typeLine(changeling)).toBe('Creature — Every creature type');
    expect(typeLine({ ...changeling, supertypes: ['legendary'] })).toBe(
      'Legendary Creature — Every creature type',
    );
  });

  test('a subtype that is not a creature type stays in front of it', () => {
    const gear = object({
      types: ['artifact', 'creature'],
      subtypes: ['Equipment', ...all] as ObjectView['subtypes'],
    });
    expect(typeLine(gear)).toBe('Artifact Creature — Equipment Every creature type');
  });

  test('one that became a Frog, and an ordinary creature, list what they have', () => {
    expect(typeLine(object({ subtypes: ['Frog'] }))).toBe('Creature — Frog');
    expect(hasEveryCreatureType(object({ subtypes: all.slice(1) as ObjectView['subtypes'] }))).toBe(
      false,
    );
    expect(typeLine(object({ subtypes: ['Dog', 'Soldier'] }))).toBe('Creature — Dog Soldier');
    expect(typeLine(object({ subtypes: [] }))).toBe('Creature');
  });
});

describe('the multikicker question', () => {
  const decision = (patch: Partial<ChooseXDecision> = {}): ChooseXDecision => ({
    id: 'd1',
    seat: 0,
    kind: 'chooseX',
    source: 'o1',
    sourceName: 'SYNTHETIC Volley Barrage',
    sourceOracleText: 'Multikicker {2}.',
    purpose: 'multikicker',
    min: 0,
    max: 3,
    perX: { mana: 0, life: 0 },
    cost: [{ kind: 'mana', symbols: ['2'] }],
    ...patch,
  });

  test('"Pay the multikicker cost {2} how many times? You can afford up to 3."', () => {
    expect(multikickerPrompt(decision())).toBe(
      'Pay the multikicker cost {2} how many times? You can afford up to 3.',
    );
    expect(xPrompt(decision())).toBe(
      'Pay the multikicker cost {2} how many times? You can afford up to 3.',
    );
    expect(xPrompt(decision({ cost: [{ kind: 'payLife', amount: 2 }], max: 4 }))).toBe(
      'Pay the multikicker cost 2 life how many times? You can afford up to 4.',
    );
    // X keeps its own prompt.
    expect(xPrompt(decision({ purpose: 'spell', perX: { mana: 1, life: 0 } }))).toContain(
      'Choose X for SYNTHETIC Volley Barrage.',
    );
  });

  test('the count starts at 0, the buttons name it, and the answer is a chooseX of the count', () => {
    expect(initialX(decision())).toBe(0);
    expect(initialX(decision({ purpose: 'spell' }))).toBe(1);
    expect(initialX(decision({ max: 0 }))).toBe(0);
    expect(kickButtonText(0)).toBe("Don't kick");
    expect(kickButtonText(1)).toBe('Kick once');
    expect(kickButtonText(3)).toBe('Kick 3 times');
    expect(kickCostAt(decision(), 0)).toBe('');
    expect(kickCostAt(decision(), 2)).toBe('{2} × 2');

    const sent: unknown[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const view = {
      viewer: 0,
      stack: [],
      battlefield: [],
      seats: [],
      exile: [],
    } as unknown as GameView;
    const d = decision();
    const model = buildModel(view, d, { ...initialUi(d), x: 2 }, ctl);
    expect(model.bar.prompt).toContain('Pay the multikicker cost {2}');
    const confirm = model.bar.buttons.find((b) => b.variant === 'primary');
    expect(confirm?.label).toBe('Kick 2 times');
    confirm?.run();
    expect(sent).toEqual([{ kind: 'chooseX', value: 2 }]);
    expect(model.bar.cancel?.label).toBe('Cancel');
  });
});

describe('split second', () => {
  const spell = (patch: Partial<ObjectView> = {}) =>
    object({
      id: 'o801',
      zone: 'stack',
      name: 'SYNTHETIC Hush Bolt',
      types: ['instant'],
      keywords: ['splitSecond'],
      ...patch,
    });

  test('a split second spell on the stack explains why nothing can be cast', () => {
    expect(splitSecondSpell({ stack: [spell()] })?.id).toBe('o801');
    expect(priorityDetail({ stack: [spell()] })).toBe(SPLIT_SECOND_HINT);
    expect(SPLIT_SECOND_HINT).toContain(
      'Split second: no spells or abilities can be cast or activated until this resolves',
    );
  });

  test('without it the line is the old one; an ability of a split second card is not the spell', () => {
    expect(priorityDetail({ stack: [] })).toBeNull();
    expect(priorityDetail({ stack: [object({ id: 'o802', zone: 'stack' })] })).toBe(
      'Respond, or pass to resolve it.',
    );
    expect(splitSecondSpell({ stack: [spell({ abilitySource: 'o5' })] })).toBeUndefined();
  });
});
