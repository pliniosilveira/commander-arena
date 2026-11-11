/**
 * The web side of D-196 (the Ring tempts you, CR 701.54) as pure models, no DOM: the words of the question that asks which creature is the Ring-bearer, the log
 * lines of a temptation and of a Ring-bearer that stopped being one, the words of the Ring's inherent abilities on the stack (from the kind of trigger, relative
 * to the viewer), the words of the effect, the trigger, the condition and the "for as long as you control this" duration, and the tooltip of the Ring chip.
 * The cards are the engine's SYNTHETIC fixtures (`synthetic-ring.ts`; There and Back Again has the real wording).
 */
import type {
  Ability,
  CardDefinition,
  ChoosePermanentDecision,
  GameState,
  ObjectView,
  StackAbility,
  Trigger,
} from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { inherentNameOf, inherentTriggerWording } from '../src/game/monarch-text';
import { ringTitle } from '../src/ui/board/PlayerStrip';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { permanentsDetail } from '../src/ui/decisions/permanents';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';
import { isRingBearer, ringBearerDetail } from '../src/ui/decisions/permanents-ring';

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const SAGA = syntheticCard('SYNTHETIC There and Back Again');
const WATCHER = syntheticCard('SYNTHETIC Ring Watcher');

const objectView = (id: string, name: string, extra: Partial<ObjectView> = {}): ObjectView =>
  ({
    id,
    name,
    types: ['creature'],
    subtypes: [],
    supertypes: [],
    oracleText: '',
    controller: 0,
    owner: 0,
    zone: 'battlefield',
    ...extra,
  }) as unknown as ObjectView;

const QUESTION = {
  id: 'd1',
  kind: 'choosePermanent',
  seat: 0,
  purpose: 'ringBearer',
  source: 'o9',
  min: 1,
  max: 1,
  legal: ['o1', 'o2'],
} as unknown as ChoosePermanentDecision;

test('the question: the Ring tempts you, choose your Ring-bearer, naming the spell or ability that tempts', () => {
  const index = new Map<`o${number}`, ObjectView>([
    ['o9', objectView('o9', 'There and Back Again', { zone: 'stack' })],
  ]);
  expect(isRingBearer(QUESTION)).toBe(true);
  expect(angelsPermanentPrompt(QUESTION, index)).toBe(
    'The Ring tempts you: choose your Ring-bearer, a creature you control, for There and Back Again.',
  );
  expect(angelsBadge(QUESTION, index)).toBe('Ring-bearer');
});

test('the bar says what a click does and names the creature chosen', () => {
  const index = new Map<`o${number}`, ObjectView>([['o1', objectView('o1', 'Grizzly Bears')]]);
  expect(ringBearerDetail([], index)).toMatch(/Click a creature to make it your Ring-bearer/);
  expect(ringBearerDetail(['o1'], index)).toBe(
    'Grizzly Bears will be your Ring-bearer. Click it again to take it back.',
  );
  // any other choice of permanents keeps its own words
  expect(permanentsDetail([], { purpose: 'sacrifice', min: 1 })).not.toMatch(/Ring/);
});

const state = (names: Record<string, string>) =>
  ({
    objects: {},
    lki: Object.fromEntries(
      Object.entries(names).map(([id, name]) => [id, { characteristics: { name } }]),
    ),
    stack: [],
    pending: null,
  }) as unknown as GameState;

test('the log: "The Ring tempts you (the first time). Grizzly Bears becomes your Ring-bearer."', () => {
  const s = state({ o1: 'Grizzly Bears' });
  const tempted = (seat: number, times: number, bearer: `o${number}` | null, first = false) =>
    ({ kind: 'ringTempted', seat, times, bearer, first }) as const;
  const you = describeEvent(tempted(0, 1, 'o1', true), s, s, 0);
  expect(you?.text).toBe(
    'The Ring tempts you (the first time). Grizzly Bears becomes your Ring-bearer.',
  );
  expect(you?.rule).toBe('CR 701.54a');
  expect(describeEvent(tempted(1, 2, 'o1'), s, s, 0)?.text).toBe(
    "The Ring tempts the opponent (time 2). Grizzly Bears becomes opponent's Ring-bearer.",
  );
  expect(describeEvent(tempted(0, 3, null), s, s, 0)?.text).toBe(
    'The Ring tempts you (time 3). You control no creature to be your Ring-bearer.',
  );
});

test('the log: a Ring-bearer that another player took', () => {
  const s = state({ o1: 'Grizzly Bears' });
  expect(
    describeEvent({ kind: 'ringBearerLost', seat: 0, object: 'o1' } as never, s, s, 0)?.text,
  ).toBe('Grizzly Bears is no longer your Ring-bearer.');
});

test('the abilities of the Ring on the stack are "The Ring", worded from the kind of trigger and the viewer', () => {
  expect(inherentNameOf('ringLoot')).toBe('The Ring');
  expect(inherentNameOf('ringBlocked')).toBe('The Ring');
  expect(inherentNameOf('ringDamage')).toBe('The Ring');
  expect(inherentNameOf('monarchDraw')).toBe('The monarch');
  const attacks: Trigger = { kind: 'attacks', what: { kind: 'this' } };
  const blocked: Trigger = { kind: 'becomesBlocked', what: { kind: 'this' } };
  const damage: Trigger = { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' };
  expect(inherentTriggerWording(attacks, true)).toBe(
    'Whenever your Ring-bearer attacks, draw a card, then discard a card.',
  );
  expect(inherentTriggerWording(attacks, false)).toBe(
    "Whenever the opponent's Ring-bearer attacks, they draw a card, then discard a card.",
  );
  expect(inherentTriggerWording(blocked, true)).toBe(
    "Whenever your Ring-bearer becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.",
  );
  expect(inherentTriggerWording(damage, true)).toBe(
    'Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.',
  );
  // the monarch's trigger of the same kind is about any creature and keeps its own words
  expect(
    inherentTriggerWording(
      { kind: 'dealsCombatDamage', what: { types: ['creature'] }, to: 'player' },
      true,
    ),
  ).toBe('Whenever a creature deals combat damage to you, its controller becomes the monarch.');
});

test('There and Back Again, chapter I, and the watcher are said in the words of the cards', () => {
  const chapter = faceOf(SAGA).abilities[0] as Ability & { kind: 'triggered' };
  expect(triggerGist(chapter as unknown as StackAbility, { types: ['enchantment'] } as never)).toBe(
    "Target creature can't block for as long as you control this. The Ring tempts you",
  );
  const watcher = faceOf(WATCHER).abilities[0] as Ability & { kind: 'triggered' };
  expect(
    triggerCondition(watcher as unknown as StackAbility, WATCHER.name, {
      subtypes: [],
      oracleText: '',
    } as never),
  ).toBe('Whenever the Ring tempts you');
});

test('the condition "you control your Ring-bearer", and its negation', () => {
  expect(gameConditionWords({ kind: 'controlsRingBearer' })).toBe('you control your Ring-bearer');
  expect(gameConditionWords({ kind: 'not', term: { kind: 'controlsRingBearer' } })).toBe(
    "you don't control your Ring-bearer",
  );
});

test('the tooltip of the Ring chip says what each level does and which are on', () => {
  const one = ringTitle(1);
  expect(one).toContain('tempted this player 1 time.');
  expect(one).toContain('[on] Their Ring-bearer is legendary');
  expect(one).toContain('[from 2] Whenever their Ring-bearer attacks');
  expect(one).toContain('[from 4] Whenever their Ring-bearer deals combat damage');
  const four = ringTitle(4);
  expect(four).toContain('tempted this player 4 times.');
  expect(four).not.toContain('[from');
});
