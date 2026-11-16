/**
 * The words of group 1 of the Galadriel deck (issue 43) as pure models: the trigger "whenever you scry or surveil", the gist of the abilities that scry and make the Ring tempt, the
 * conditions "if this is the second time this ability has resolved this turn" and "if you chose a creature other than this creature as your Ring-bearer", the reveal of the top card
 * with a draw, and the labels of the loyalty abilities of a planeswalker whose loyalty is X (a look at the top card, lands that become creatures). Read from the engine's SYNTHETIC
 * cards, so a wording that drifts from the AST fails here. No DOM.
 */
import { type Ability, type Effect, syntheticCard, type Trigger } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { revealTopText } from '../src/game/dragons-text';
import { triggerWording } from '../src/game/trigger-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const triggered = (name: string) =>
  abilitiesOf(name).flatMap((a) => (a.kind === 'triggered' ? [a] : []));

const WARDEN = 'SYNTHETIC Rivendell Warden';
const LADY = 'SYNTHETIC Lorien Lady';
const SEER = 'SYNTHETIC Archon Seer';
const WALKER = 'SYNTHETIC Seer of Elements';
const RUN = 'SYNTHETIC Run Down';

const say = (trigger: Trigger) => triggerWording(trigger, { self: 'X' });

describe('the triggers', () => {
  test('scrying and surveilling, said for each player', () => {
    const [scry, surveil] = triggered(SEER);
    if (scry === undefined || surveil === undefined) throw new Error('no trigger');
    expect(say(scry.trigger)).toBe('Whenever you scry');
    expect(say(surveil.trigger)).toBe('Whenever you surveil');
    expect(say({ kind: 'surveils', who: 'opponent' })).toBe('Whenever an opponent surveils');
    expect(say({ kind: 'surveils', who: 'any' })).toBe('Whenever a player surveils');
  });

  test('the Ring tempting you is as it was', () => {
    expect(say({ kind: 'ringTempted' })).toBe('Whenever the Ring tempts you');
  });
});

describe('the gist of the abilities', () => {
  test('Elrond: scry 1, then the Ring if it is the second time this ability has resolved this turn', () => {
    for (const ability of triggered(WARDEN)) {
      expect(triggerGist(ability, undefined)).toBe(
        'Scry 1. If this is the second time this ability has resolved this turn, the Ring tempts you',
      );
    }
  });

  test('Galadriel: scry 3 when you chose another creature as your Ring-bearer', () => {
    const [ring] = triggered(LADY);
    if (ring === undefined) throw new Error('no trigger');
    expect(triggerGist(ring, undefined)).toBe(
      'Scry 3 if you chose a creature other than this creature as your Ring-bearer',
    );
  });

  test('Galadriel: the reveal on a scry, a land goes onto the battlefield tapped', () => {
    const scry = triggered(LADY)[1];
    if (scry === undefined) throw new Error('no trigger');
    expect(triggerGist(scry, undefined)).toBe(
      "Reveal the top card of your library. If it's a land card, put it onto the battlefield tapped",
    );
  });

  test('Matoya: draw a card', () => {
    for (const ability of triggered(SEER)) {
      expect(triggerGist(ability, undefined)).toBe('You draw a card');
    }
  });
});

describe('the reveal of the top card', () => {
  test('Track Down: "If it\'s a creature or land card, draw a card"', () => {
    const effect = syntheticCard(RUN).faces[0]?.spell?.effect;
    if (effect?.kind !== 'sequence') throw new Error('no sequence');
    const reveal = effect.effects[1];
    if (reveal?.kind !== 'revealTop') throw new Error('no reveal');
    expect(revealTopText(reveal, 'you')).toBe(
      "Reveal the top card of your library. If it's a creature or land card, draw a card",
    );
  });

  test('a reveal that does something the words do not know is not worded (never a guess)', () => {
    const odd: Effect = {
      kind: 'revealTop',
      player: { kind: 'you' },
      ifMatches: { types: ['land'] },
      onMatch: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    };
    expect(revealTopText(odd as Extract<Effect, { kind: 'revealTop' }>, 'you')).toBeNull();
  });
});

describe('the labels of the loyalty abilities of a planeswalker with X loyalty', () => {
  const labels = abilitiesOf(WALKER).flatMap((ability, abilityIndex) =>
    ability.kind === 'activated' ? [activationLabel(undefined, { abilityIndex, ability })] : [],
  );

  test('+2: scry 2', () => {
    expect(labels[0]).toBe('+2: Scry 2');
  });

  test('0: look at the top card; a land or a creature card up to the loyalty goes onto the battlefield, else it stays on top', () => {
    expect(labels[1]).toBe(
      "0: Look at the top card of your library. If it's a land or creature card with mana value less than or equal to the number of loyalty counters on this permanent, you may put it onto the battlefield. If you don't, it stays on top of your library",
    );
  });

  test('-6: several lands, so the verbs and the noun are plural', () => {
    expect(labels[2]).toBe(
      '−6: Untap up to two target lands you control. Up to two target lands you control become Elemental creatures in addition to their other types until end of turn. Up to two target lands you control have base power and toughness 5/5 until end of turn. Up to two target lands you control gain flying until end of turn. Up to two target lands you control gain haste until end of turn',
    );
  });
});
