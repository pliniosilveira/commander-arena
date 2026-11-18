/**
 * The words of group 1 of the Lorehold Spirit deck (issue 86) as pure models: the trigger "whenever you discard one or more nonland cards", the gist of the abilities (the search that is
 * repeated, the exile of one of the cards discarded, a permission to cast and a permission to play, a payment of mana and a discard, each creature that deals damage to itself) and the
 * labels of the activated abilities of an artifact that mills and shuffles. Read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import { type Ability, type Effect, syntheticCard, type Trigger } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { mayPlayText } from '../src/game/dragons-text';
import { searchText } from '../src/game/lorehold-g1-text';
import { triggerWording } from '../src/game/trigger-text';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const triggered = (name: string) =>
  abilitiesOf(name).flatMap((a) => (a.kind === 'triggered' ? [a] : []));

const CLAIMER = 'SYNTHETIC Land Claimer';
const GOLEM = 'SYNTHETIC Quarantine Golem';
const CAST_GOLEM = 'SYNTHETIC Cast Golem';
const SEER = 'SYNTHETIC Doubting Seer';
const WATCHER = 'SYNTHETIC Discard Watcher';
const CLOCK = 'SYNTHETIC Memory Clock';
const TIDE = 'SYNTHETIC Reckoning Tide';

const say = (trigger: Trigger) => triggerWording(trigger, { self: 'X' });

describe('the trigger "whenever you discard"', () => {
  test('one card is as it was', () => {
    expect(say({ kind: 'discarded', who: 'you' })).toBe('Whenever you discard a card');
    expect(say({ kind: 'discarded', who: 'you', filter: { notTypes: ['land'] } })).toBe(
      'Whenever you discard a nonland card',
    );
  });

  test('a batch is one or more cards', () => {
    expect(say({ kind: 'discarded', who: 'you', batch: true })).toBe(
      'Whenever you discard one or more cards',
    );
    expect(
      say({ kind: 'discarded', who: 'you', batch: true, filter: { notTypes: ['land'] } }),
    ).toBe('Whenever you discard one or more nonland cards');
    expect(
      say({ kind: 'discarded', who: 'opponent', batch: true, filter: { types: ['creature'] } }),
    ).toBe('Whenever an opponent discards one or more creature cards');
  });

  test('the Watcher and the Seer say it of their cards', () => {
    const [watcher] = triggered(WATCHER);
    const [, batch] = triggered(SEER);
    if (watcher === undefined || batch === undefined) throw new Error('no trigger');
    expect(say(watcher.trigger)).toBe('Whenever you discard one or more cards');
    expect(say(batch.trigger)).toBe('Whenever you discard one or more nonland cards');
  });
});

describe('the gist of the abilities', () => {
  test('Claim Jumper: the search is offered, offered again when there are still more lands, and shuffled if one was made', () => {
    const [ability] = triggered(CLAIMER);
    if (ability === undefined) throw new Error('no trigger');
    const gist = triggerGist(ability, undefined);
    expect(gist).toContain(
      'You may search your library for a Plains card and put it onto the battlefield tapped.',
    );
    expect(gist).toContain(
      'If an opponent controls more lands than you, you may search your library for a Plains card and put it onto the battlefield tapped.',
    );
    expect(gist).toContain('If you search your library this way, shuffle your library');
  });

  test('Containment Construct: exile it, and if you do, play that card this turn', () => {
    const [ability] = triggered(GOLEM);
    if (ability === undefined) throw new Error('no trigger');
    expect(triggerGist(ability, undefined)).toBe(
      'You may exile it. If you do, you may play that card this turn',
    );
  });

  test('Conspiracy Theorist: pay {1} and discard a card to draw; exile one of them, and cast that card this turn', () => {
    const [attack, batch] = triggered(SEER);
    if (attack === undefined || batch === undefined) throw new Error('no trigger');
    expect(triggerGist(attack, undefined)).toBe(
      'You may pay {1} and discard a card. If you do, you draw a card',
    );
    expect(triggerGist(batch, undefined)).toBe(
      'You may exile one of them from your graveyard. If you do, you may cast that card this turn',
    );
  });

  test('"cast" is said for a permission that is to cast only, "play" for the other', () => {
    const [cast] = triggered(CAST_GOLEM);
    if (cast === undefined) throw new Error('no trigger');
    expect(triggerGist(cast, undefined)).toBe(
      'You may exile it. If you do, you may cast that card this turn',
    );
    const play: Extract<Effect, { kind: 'mayPlay' }> = {
      kind: 'mayPlay',
      objects: { kind: 'moved' },
      lasts: 'endOfYourNextTurn',
      castOnly: true,
    };
    expect(mayPlayText(play, true)).toBe(
      'Until the end of your next turn, you may cast those cards',
    );
    expect(mayPlayText({ ...play, castOnly: undefined } as never, false)).toBe(
      'Until the end of your next turn, you may play that card',
    );
  });

  test('Discard Watcher: draw a card', () => {
    const [ability] = triggered(WATCHER);
    if (ability === undefined) throw new Error('no trigger');
    expect(triggerGist(ability, undefined)).toBe('You draw a card');
  });

  test('Wave of Reckoning: each creature deals damage to itself equal to its power', () => {
    const effect = syntheticCard(TIDE).faces[0]?.spell?.effect;
    if (effect === undefined) throw new Error('no spell');
    const ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect,
    } as never;
    expect(triggerGist(ability, undefined)).toBe(
      'Each creature deals damage to itself equal to its power',
    );
  });
});

describe('the search of the library', () => {
  const search = (over: Partial<Extract<Effect, { kind: 'search' }>> = {}) =>
    ({
      kind: 'search',
      player: { kind: 'you' },
      filter: { subtypes: ['Plains'] },
      max: 1,
      destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
      reveal: false,
      shuffle: false,
      ...over,
    }) as Extract<Effect, { kind: 'search' }>;

  test('one card, said with what it looks for and where it goes', () => {
    expect(searchText(search({ optional: true }))).toBe(
      'You may search your library for a Plains card and put it onto the battlefield tapped',
    );
    expect(searchText(search())).toBe(
      'Search your library for a Plains card and put it onto the battlefield tapped',
    );
    expect(
      searchText(
        search({ destinations: [{ zone: 'hand', count: 1 }], reveal: true, shuffle: true }),
      ),
    ).toBe(
      'Search your library for a Plains card, reveal it and put it into your hand, then shuffle',
    );
  });

  test('anything else is only "Search your library", never a guess', () => {
    expect(searchText(search({ max: 2, destinations: [{ zone: 'hand', count: 2 }] }))).toBe(
      'Search your library',
    );
    expect(searchText(search({ player: { kind: 'eachOpponent' } }))).toBe('Search your library');
  });
});

describe('the labels of the activated abilities of the Clock', () => {
  const labels = abilitiesOf(CLOCK).flatMap((ability, abilityIndex) =>
    ability.kind === 'activated' ? [activationLabel(undefined, { abilityIndex, ability })] : [],
  );

  test('{T}: mill two cards', () => {
    expect(labels[0]).toBe('{T}: You mill 2 cards');
  });

  test('{2}, exile it: the targets are shuffled into the library', () => {
    expect(labels[1]).toBe(
      '{2}, Exile this permanent: Shuffle any number of target cards from your graveyard into your library',
    );
  });
});
