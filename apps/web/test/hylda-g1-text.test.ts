/**
 * The words of group 1 of the Hylda deck (D-510 to D-514) as pure models: the triggers of tapping (by you, one or more, not as an attacker) and of scrying, the gist of the
 * reflexive abilities (a modal one, a targeted one, "up to that many targets"), and the question of the card type of "gains protection from the card type of your choice" (a
 * `chooseOption` decision of purpose 'protectionCardType', which goes through the dialog of the named options) with its log line. Read from the engine's SYNTHETIC cards, so a wording
 * that drifts from the AST fails here. No DOM.
 */
import {
  type Ability,
  type ChooseOptionDecision,
  type GameState,
  syntheticCard,
  type Trigger,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { optionText, purposeNoun } from '../src/game/chosen';
import { describeEvent } from '../src/game/describe';
import { triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import {
  isProtectionCardTypeChoice,
  namedOptionPrompt,
  namedOptionRows,
} from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const triggered = (name: string) =>
  abilitiesOf(name).flatMap((a) => (a.kind === 'triggered' ? [a] : []));

const say = (name: string, trigger: Trigger) => triggerWording(trigger, { self: name });

describe('the triggers', () => {
  test('tapping an untapped creature of an opponent', () => {
    const [tap] = triggered('SYNTHETIC Frost Warlock');
    if (tap === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Frost Warlock', tap.trigger)).toBe(
      'Whenever you tap an untapped creature an opponent controls',
    );
  });

  test('one or more untapped creatures: a plural noun', () => {
    const [, batch] = triggered('SYNTHETIC Numbing Merfolk');
    if (batch === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Numbing Merfolk', batch.trigger)).toBe(
      'Whenever you tap one or more untapped creatures an opponent controls',
    );
  });

  test('becomes tapped, not as an attacker', () => {
    const [circle] = triggered('SYNTHETIC Watchful Circle');
    if (circle === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Watchful Circle', circle.trigger)).toBe(
      "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker",
    );
  });

  test('a tap trigger on the permanent itself is as it was', () => {
    expect(say('X', { kind: 'becomesTapped', what: { kind: 'this' } })).toBe(
      'Whenever X becomes tapped',
    );
  });

  test('a batch of a noun the words do not pluralise is not worded (never a guess)', () => {
    expect(
      triggerWording(
        { kind: 'becomesTapped', what: { subtypes: ['Elf'] }, by: 'you', batch: true },
        { self: 'X' },
      ),
    ).toBeNull();
  });

  test('scrying, said for each player', () => {
    const scry = triggered('SYNTHETIC Tide Pilot')[1];
    if (scry === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Tide Pilot', scry.trigger)).toBe('Whenever you scry');
    expect(say('X', { kind: 'scries', who: 'opponent' })).toBe('Whenever an opponent scries');
    expect(say('X', { kind: 'scries', who: 'any' })).toBe('Whenever a player scries');
  });
});

describe('the gist of a reflexive ability', () => {
  test('pay {1}, when you do choose one: the modes as the card words them', () => {
    const [tap] = triggered('SYNTHETIC Frost Warlock');
    if (tap === undefined) throw new Error('no trigger');
    expect(triggerGist(tap, undefined)).toBe(
      'You may pay {1}. When you do, choose one — Create a 4/4 white and blue Elemental creature token; Put a +1/+1 counter on each creature you control; Scry 2, then draw a card',
    );
  });

  test('pay {1}{U}, when you do tap a target: the reflexive ability names its own target', () => {
    const attack = triggered('SYNTHETIC Chill Sentry')[0];
    if (attack === undefined) throw new Error('no trigger');
    expect(triggerGist(attack, undefined)).toBe(
      'You may pay {1}{U}. When you do, tap target creature an opponent controls',
    );
  });

  test('up to as many targets as the cards scried', () => {
    const scry = triggered('SYNTHETIC Tide Pilot')[1];
    if (scry === undefined) throw new Error('no trigger');
    expect(triggerGist(scry, undefined)).toBe('Tap up to that many target nonland permanents');
  });
});

const ASK = {
  id: 'd1',
  kind: 'chooseOption',
  seat: 0,
  purpose: 'protectionCardType',
  options: [
    'artifact',
    'battle',
    'creature',
    'enchantment',
    'instant',
    'kindred',
    'land',
    'planeswalker',
    'sorcery',
  ],
  protects: ['o9'],
  source: 'o7',
  sourceName: 'Pippin, Guard of the Citadel',
  sourceOracleText:
    '{T}: Another target creature you control gains protection from the card type of your choice until end of turn.',
} as unknown as ChooseOptionDecision;

describe('the card type of the protection', () => {
  test('the prompt names the source and says what the card type is for; it is no "enters" question', () => {
    expect(isProtectionCardTypeChoice(ASK)).toBe(true);
    expect(namedOptionPrompt(ASK)).toBe(
      'Choose a card type for Pippin, Guard of the Citadel: protection from it until end of turn.',
    );
    expect(optionPrompt(ASK)).toBe(namedOptionPrompt(ASK));
  });

  test('one button for each of the nine card types, in the engine’s order, capitalised', () => {
    expect(namedOptionRows(ASK).map((r) => r.label)).toEqual([
      'Artifact',
      'Battle',
      'Creature',
      'Enchantment',
      'Instant',
      'Kindred',
      'Land',
      'Planeswalker',
      'Sorcery',
    ]);
  });

  test('the words of the answer and its noun', () => {
    expect(optionText('protectionCardType', 'instant')).toBe('instant');
    expect(purposeNoun('protectionCardType')).toBe('card type');
  });

  test('the log line says the card type, for the opponent too', () => {
    const asked = (seat: number) =>
      ({
        pending: { ...ASK, seat },
        objects: {},
        lki: { o7: { characteristics: { name: 'Pippin, Guard of the Citadel' } } },
      }) as unknown as GameState;
    const event = (seat: number, option: string) =>
      ({
        kind: 'optionChosen',
        seat,
        source: 'o7',
        purpose: 'protectionCardType',
        option,
      }) as const;
    const you = describeEvent(event(0, 'instant'), asked(0), asked(0), 0);
    expect(you?.text).toBe(
      'You choose instant for Pippin, Guard of the Citadel (protection from that card type until end of turn).',
    );
    expect(you?.rule).toBe('CR 702.16a');
    const them = describeEvent(event(1, 'creature'), asked(1), asked(1), 0);
    expect(them?.text).toBe(
      'Opponent chooses creature for Pippin, Guard of the Citadel (protection from that card type until end of turn).',
    );
  });
});
