/**
 * The web side of D-187 (the Korvold slice 7a) as pure models, no DOM: the words of a sacrifice of one or more Treasures and of "up to that many target
 * creatures", of "Whenever you attack", of the count of attacks of a static +1/+0, of the condition "it's your main phase" and the added combat phase with
 * its untap, of the top cards of another library exiled face down and the permission to look at and play them; the log line that names no card; the marks
 * of a card exiled face down that its viewer may look at. The cards are the engine's SYNTHETIC fixtures (`synthetic-korvold-singles.ts`).
 */
import type {
  Ability,
  CardDefinition,
  ChoosePermanentDecision,
  Effect,
  GameState,
  ObjectView,
  StackAbility,
} from '@commander-arena/engine';
import { syntheticCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { exileTopText, extraCombatText, mayPlayText } from '../src/game/dragons-text';
import { exileMarks, isLookedAtFaceDown, laterFacts } from '../src/game/later-text';
import { lordWordings } from '../src/game/static-text';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { choosePermanentPrompt, isOneOrMore } from '../src/ui/decisions/permanents';
import { lookupIndexFor } from './decisions-helpers';

const faceOf = (card: CardDefinition, at = 0) => {
  const face = card.faces[at];
  if (face === undefined) throw new Error(`${card.name} has no face ${at}`);
  return face;
};

const triggers = (card: CardDefinition) =>
  faceOf(card).abilities.filter(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  );

const RAIDER = syntheticCard('SYNTHETIC Treasure Raider');
const MINOTAUR = syntheticCard('SYNTHETIC Furious Minotaur');
const DRAGON = syntheticCard('SYNTHETIC Feast Dragon // Taste of Riches');

test('"Whenever you attack" is said without a count, and the sacrifice and its targets in the words of the card', () => {
  const attack = triggers(RAIDER)[1];
  if (attack === undefined) throw new Error('no attack trigger');
  const source = { subtypes: faceOf(RAIDER).subtypes, oracleText: faceOf(RAIDER).oracleText };
  expect(triggerCondition(attack as unknown as StackAbility, RAIDER.name, source as never)).toBe(
    'Whenever you attack',
  );
  expect(
    triggerGist(attack as unknown as StackAbility, { types: faceOf(RAIDER).types } as never),
  ).toBe(
    'You may sacrifice one or more Treasure permanents you control. When you do, up to that many target creatures gain double strike until end of turn',
  );
});

test('the sacrifice question says "one or more" and what, from the ability on the stack', () => {
  const attack = triggers(RAIDER)[1];
  if (attack === undefined) throw new Error('no attack trigger');
  const view = (id: string, patch: Partial<ObjectView>): ObjectView =>
    ({ id, name: RAIDER.name, zone: 'battlefield', types: ['creature'], ...patch }) as ObjectView;
  const host = view('o1', { oracleText: faceOf(RAIDER).oracleText });
  const onStack = view('o2', {
    zone: 'stack',
    types: [],
    abilitySource: host.id,
    ability: attack as unknown as StackAbility,
  });
  const index = lookupIndexFor([host, onStack]);
  const decision: ChoosePermanentDecision = {
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: onStack.id,
    purpose: 'sacrifice',
    min: 1,
    max: 2,
    legal: ['o10', 'o11'],
  };
  expect(isOneOrMore(decision, index)).toBe(true);
  expect(choosePermanentPrompt(decision, index)).toBe(
    `Sacrifice one or more Treasure permanents you control for ${RAIDER.name}.`,
  );
  // "any number" is another question (a minimum of 0), and a fixed number keeps its own words
  expect(isOneOrMore({ ...decision, min: 0 }, index)).toBe(false);
});

test('"Each creature you control gets +1/+0 for each time it has attacked this turn" says "they" of the group', () => {
  const words = lordWordings(faceOf(MINOTAUR).abilities, { noun: 'creature', subtypes: [] });
  expect(words).toEqual([
    'Creatures you control get +1/+0 for each time they have attacked this turn.',
  ]);
});

test('the landfall: the condition after the effect, the added phase and the untap at its beginning', () => {
  const landfall = triggers(MINOTAUR)[0];
  if (landfall === undefined) throw new Error('no landfall trigger');
  expect(
    triggerGist(landfall as unknown as StackAbility, { types: faceOf(MINOTAUR).types } as never),
  ).toBe(
    "After this phase, there is an additional combat phase. At the beginning of that combat, untap each creature you control if it's your main phase",
  );
  expect(extraCombatText(null)).toBe('After this phase, there is an additional combat phase');
});

test('the Adventure: the library of another player, face down, and the permission to look at and play', () => {
  const spell = faceOf(DRAGON, 1).spell;
  const effect = spell?.effect;
  if (effect?.kind !== 'sequence') throw new Error('no sequence');
  const [exile, play] = effect.effects as [
    Extract<Effect, { kind: 'exileTop' }>,
    Extract<Effect, { kind: 'mayPlay' }>,
  ];
  const say = (n: unknown) => String(n);
  expect(exileTopText(exile, say, "target opponent's library")).toBe(
    "Exile the top two cards of target opponent's library face down",
  );
  expect(exileTopText({ ...exile, count: 1 }, say, "target opponent's library")).toBe(
    "Exile the top card of target opponent's library face down",
  );
  expect(exileTopText({ kind: 'exileTop', count: 1 }, say)).toBe(
    'Exile the top card of your library',
  );
  expect(mayPlayText(play, true)).toBe(
    'You may look at and play those cards for as long as they remain exiled',
  );
  expect(mayPlayText({ ...play, lookAt: undefined as never }, false)).toBe(
    'You may play that card for as long as it remains exiled',
  );
  expect(mayPlayText({ kind: 'mayPlay', objects: play.objects, lasts: 'endOfTurn' }, false)).toBe(
    'You may play that card this turn',
  );
});

test('the log line of a card exiled face down names no card and links none', () => {
  const state = (): GameState =>
    ({
      objects: { o2: { id: 'o2', owner: 1, exiledFaceDown: true, zone: 'exile' } },
      lki: {},
      pending: null,
    }) as unknown as GameState;
  const event = {
    kind: 'zoneChanged',
    from: 'o1',
    to: 'o2',
    fromZone: 'library',
    toZone: 'exile',
  } as never;
  const mine = describeEvent(event, state(), state(), 0);
  expect(mine?.text).toBe("A card is exiled face down from the top of opponent's library.");
  expect(mine?.rule).toBe('CR 406.3');
  expect(mine?.objects ?? []).toEqual([]);
  expect(describeEvent(event, state(), state(), 1)?.text).toBe(
    'A card is exiled face down from the top of your library.',
  );
});

test('a card exiled face down that its viewer may look at: marked, explained, and not a Hideaway card', () => {
  const card = (patch: Partial<ObjectView>): ObjectView =>
    ({
      id: 'o1',
      name: 'Grizzly Bears',
      zone: 'exile',
      owner: 1,
      faceDown: true,
      exiledFaceDown: true,
      ...patch,
    }) as ObjectView;
  const looked = card({});
  const placeholder = card({ name: 'Face-down card' });
  expect(isLookedAtFaceDown(looked)).toBe(true);
  expect(isLookedAtFaceDown(placeholder)).toBe(false);
  expect(exileMarks(looked)).toEqual(['face down, you may look']);
  expect(exileMarks(placeholder)).toEqual(['face down']);
  expect(laterFacts(looked, 0).join(' ')).toContain("(it is the opponent's card)");
  expect(laterFacts(looked, 1).join(' ')).not.toContain("opponent's card");
  // a card Hideaway exiled has no such mark
  expect(exileMarks({ ...card({}), exiledFaceDown: undefined } as unknown as ObjectView)).toEqual([
    'Hideaway',
  ]);
});
