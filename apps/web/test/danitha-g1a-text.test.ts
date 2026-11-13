/**
 * The words of group 1A of the Danitha deck (D-1200, D-1201, CR 701.20a): "Reveal the top five cards of your library. You may put a creature or enchantment card from among
 * them into your hand. Put the rest into your graveyard." The effect is read from the engine's SYNTHETIC cards (so a wording that drifts from the AST fails here), the question
 * of the cards revealed (a title, a prompt, the buttons, who sees the cards) and the log line of the reveal. No DOM.
 */
import {
  type Ability,
  type ChooseCardsDecision,
  type Effect,
  type GameEvent,
  type ObjectView,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { lookAtTopText } from '../src/game/artifacts-text';
import { describeEvent } from '../src/game/describe';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';
import {
  cardsPrompt,
  confirmLabel,
  discardTitle,
  foundBadge,
  lookTakeRevealed,
} from '../src/ui/decisions/cards-picker';
import { lookupIndexFor } from './decisions-helpers';

const face = (name: string) => {
  const found = syntheticCard(name).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};

const effectOf = (name: string): Effect => {
  const f = face(name);
  const ability = f.abilities.find((a) => a.kind === 'triggered' || a.kind === 'activated');
  const effect = f.spell?.effect ?? (ability as Extract<Ability, { effect: Effect }>).effect;
  if (effect === undefined) throw new Error(`no effect on ${name}`);
  return effect;
};
const lookOf = (name: string) => {
  const effect = effectOf(name);
  const first = effect.kind === 'sequence' ? effect.effects[0] : effect;
  if (first?.kind !== 'lookAtTop') throw new Error(`${name} has no lookAtTop`);
  return first;
};
const say = (n: unknown) => String(n);

describe('the effect, worded as the cards print it', () => {
  test.each([
    [
      'SYNTHETIC Reveal Five Sorcery',
      'Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard',
    ],
    [
      'SYNTHETIC Reveal Four Scout',
      'Reveal the top four cards of your library. You may put a land card from among them into your hand. Put the rest into your graveyard',
    ],
    [
      'SYNTHETIC Reveal Four Vessel',
      'Reveal the top four cards of your library. You may put an artifact, creature, enchantment, land, or planeswalker card from among them into your hand. Put the rest into your graveyard',
    ],
    [
      'SYNTHETIC Reveal Three Spells',
      'Reveal the top three cards of your library. You may put an instant or sorcery card from among them into your hand. Put the rest into your graveyard',
    ],
  ])('%s', (name, words) => {
    expect(lookAtTopText(lookOf(name), say)).toBe(words);
  });

  test('a permanent card (the six permanent types) is said as the one phrase it is', () => {
    const text = lookAtTopText(lookOf('SYNTHETIC Reveal Four Permanent Spawn'), say);
    expect(text).toMatch(
      /^Reveal the top four cards of your library\. You may put a permanent card from among them into your hand\. Put the rest into your graveyard$/,
    );
    expect(text).toContain('a permanent card');
  });

  test('the same kind only looked at keeps the words of a look: "Look at" and "reveal"', () => {
    expect(lookAtTopText(lookOf('SYNTHETIC Look Five Sorcery'), say)).toBe(
      'Look at the top five cards of your library. You may reveal a creature or enchantment card from among them and put it into your hand. Put the rest into your graveyard',
    );
  });

  test('the gist of the enters trigger and the label of the activation say the reveal', () => {
    const scout = face('SYNTHETIC Reveal Four Scout').abilities[0];
    if (scout?.kind !== 'triggered') throw new Error('no trigger');
    expect(triggerGist(scout as never, undefined)).toContain('Reveal the top four cards');
    const vessel = face('SYNTHETIC Reveal Four Vessel').abilities[0];
    if (vessel?.kind !== 'activated') throw new Error('no activated ability');
    const label = activationLabel(
      {
        id: 'o1',
        name: 'SYNTHETIC Reveal Four Vessel',
        types: ['enchantment'],
        subtypes: [],
      } as unknown as ObjectView,
      { abilityIndex: 0, ability: vessel },
    );
    expect(label).toContain('Reveal the top four cards');
  });
});

describe('the question of the cards revealed', () => {
  const sorcery = {
    id: 'o1',
    name: 'SYNTHETIC Reveal Five Sorcery',
    zone: 'stack',
    types: ['sorcery'],
    subtypes: [],
    controller: 0,
    owner: 0,
  } as unknown as ObjectView;
  const index = lookupIndexFor([sorcery]);
  const reveal: ChooseCardsDecision = {
    id: 'd1',
    seat: 0,
    kind: 'chooseCards',
    source: sorcery.id,
    purpose: 'lookTake',
    zone: 'library',
    legal: ['o20'],
    looked: ['o20', 'o21', 'o22', 'o23', 'o24'],
    min: 0,
    max: 1,
    reveal: true,
    prompt:
      'Reveal the top 5 cards of your library. You may put a card that matches from among them into your hand; the rest go into your graveyard',
  };

  test('the engine tells a reveal from a look by its words', () => {
    expect(lookTakeRevealed(reveal)).toBe(true);
    expect(
      lookTakeRevealed({
        purpose: 'lookTake',
        prompt: 'Look at the top 5 cards of your library. You may reveal a card that matches',
      }),
    ).toBe(false);
    expect(lookTakeRevealed({ purpose: 'discard', prompt: 'Reveal the top 5 cards' })).toBe(false);
  });

  test('a spell: the engine words are kept, the title counts the cards, the buttons are those of a look and take', () => {
    expect(cardsPrompt(reveal, index)).toBe(
      'Reveal the top 5 cards of your library. You may put a card that matches from among them into your hand; the rest go into your graveyard (SYNTHETIC Reveal Five Sorcery).',
    );
    expect(discardTitle(reveal, index)).toBe('Top 5 cards of your library');
    expect(confirmLabel(reveal, [])).toBe('Take none');
    expect(confirmLabel(reveal, ['o20'])).toBe('Put into hand');
    expect(foundBadge(reveal, ['o20'], 'o20')).toBe('Take');
  });

  test('an ability on the stack: the words of the effect, from the AST', () => {
    const scout = face('SYNTHETIC Reveal Four Scout').abilities[0];
    if (scout?.kind !== 'triggered') throw new Error('no trigger');
    const source = {
      id: 'o2',
      name: 'SYNTHETIC Reveal Four Scout',
      zone: 'stack',
      types: [],
      subtypes: [],
      controller: 0,
      owner: 0,
      abilitySource: 'o3',
      ability: scout as unknown as StackAbility,
    } as unknown as ObjectView;
    const prompt = cardsPrompt(
      {
        ...reveal,
        source: source.id,
        looked: ['o20', 'o21', 'o22', 'o23'],
        prompt:
          'Reveal the top 4 cards of your library. You may put a card that matches from among them into your hand',
      },
      lookupIndexFor([source]),
    );
    expect(prompt).toBe(
      "Reveal the top four cards of your library. You may put a land card from among them into your hand. Put the rest into your graveyard (SYNTHETIC Reveal Four Scout's ability).",
    );
  });
});

describe('the log', () => {
  test('every card revealed is named, for the other player too', () => {
    const event: GameEvent = {
      kind: 'cardsRevealed',
      seat: 0,
      cards: [],
      names: ['Island', 'Grizzly Bears', 'Serra Angel'],
      from: 'library',
    };
    const text = (viewer: 0 | 1) =>
      describeEvent(event, undefined as never, undefined as never, viewer)?.text;
    expect(text(0)).toBe('You reveal Island, Grizzly Bears and Serra Angel.');
    expect(text(1)).toBe('Opponent reveals Island, Grizzly Bears and Serra Angel.');
  });
});
