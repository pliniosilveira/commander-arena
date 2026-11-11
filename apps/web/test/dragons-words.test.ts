/**
 * The web side of D-151 (the Dragons slice), the words: effects, conditions, triggers, statics, replacements, mana and the keyword
 * chips, read from the engine's SYNTHETIC cards (so a wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, type Effect, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { amountPhrase, createDefinitions } from '../src/game/amount-text';
import { manaRestrictionWording, restrictionWords, riderWords } from '../src/game/angels-text';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import { delayedWords } from '../src/game/dragons-text';
import { thingsPhrase } from '../src/game/filter-text';
import { graveyardWordings } from '../src/game/graveyard-notes';
import { lordWordings, replacementWording } from '../src/game/static-text';
import { filterPhrase, triggerWording } from '../src/game/trigger-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel, triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';

const face = (name: string) => {
  const found = syntheticCard(`SYNTHETIC ${name}`).faces[0];
  if (found === undefined) throw new Error(`no face for ${name}`);
  return found;
};
const abilitiesOf = (name: string): readonly Ability[] => face(name).abilities;
const noun = (name: string) =>
  face(name).types.includes('creature') ? 'creature' : (face(name).types[0] ?? 'permanent');
const notes = (name: string) => lordWordings(abilitiesOf(name), { noun: noun(name) });
const triggered = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'triggered')[at];
  if (found?.kind !== 'triggered') throw new Error(`no triggered ability ${at} on ${name}`);
  return found;
};
const gist = (name: string, at = 0) =>
  triggerGist(triggered(name, at) as never, face(name) as never);
/** The words of a spell's effect, as a triggered ability of the same effect would say them (a spell's effect is not in the view). */
const spellGist = (name: string) => {
  const spell = face(name).spell;
  if (spell === undefined || spell === null) throw new Error(`${name} is no spell`);
  const ability = {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: spell.effect,
    ...(spell.targets === undefined ? {} : { targets: spell.targets }),
  };
  return triggerGist(ability as never, undefined);
};
const mana = (name: string, at = 0) => {
  const found = abilitiesOf(name).filter((a) => a.kind === 'mana')[at];
  if (found?.kind !== 'mana') throw new Error(`no mana ability on ${name}`);
  return found;
};
const grave = (name: string) =>
  graveyardWordings(abilitiesOf(name), {
    name: `SYNTHETIC ${name}`,
    types: face(name).types,
    subtypes: face(name).subtypes,
    oracleText: face(name).oracleText,
  });

describe('exiling the top cards and playing them', () => {
  test('one card this turn, two cards until the end of your next turn, an upkeep trigger', () => {
    expect(spellGist('Impulse Rite')).toBe(
      'Exile the top card of your library. You may play that card this turn',
    );
    expect(spellGist('Long Impulse Rite')).toBe(
      'Exile the top two cards of your library. Until the end of your next turn, you may play those cards',
    );
    expect(gist('Luck Altar')).toBe(
      'Exile the top card of your library. You may play that card this turn',
    );
    expect(triggerCondition(triggered('Luck Altar') as never, 'Altar', undefined)).toBe(
      'At the beginning of your upkeep',
    );
  });

  test('X cards, until your next end step, and the damage of the delayed trigger counts the cards still exiled', () => {
    expect(gist('Hawk of Fortune', 1)).toBe(
      'Exile the top X cards of your library. You may play those cards until your next end step. At the beginning of your next end step, deal 2 damage to each opponent for each of those cards that are still exiled, where X is the number of creatures you control with power 4 or greater',
    );
    expect(amountPhrase({ kind: 'exiledStillThere' })).toBe(
      'the number of those cards that are still exiled',
    );
    expect(delayedWords({ step: 'endStep', whose: 'you' })).toBe(
      'At the beginning of your next end step',
    );
    expect(delayedWords({ step: 'upkeep', whose: 'each' })).toBe(
      'At the beginning of the next upkeep',
    );
    expect(delayedWords({ step: 'beginCombat', whose: 'you' })).toBeNull();
  });

  test('the modal trigger has no gist of its own: its modes are said as chosen', () => {
    expect(gist('Dying Dragon', 0)).toBe('');
  });
});

describe('combat', () => {
  test('an additional combat phase, untapping the attackers', () => {
    expect(gist('Charge Wyrm')).toBe(
      'You may pay {2}{R}. If you do, untap each attacking creature. After this phase, there is an additional combat phase',
    );
  });

  test('the first attack of the turn, the player with the most life, Dethrone', () => {
    expect(
      triggerCondition(triggered('Usurper Wyrm') as never, 'this creature', undefined, true),
    ).toBe('whenever this creature attacks for the first time each turn');
    expect(
      triggerCondition(
        { ...triggered('Usurper Wyrm'), triggerCondition: { kind: 'attackingMostLife' } } as never,
        'this creature',
        undefined,
        true,
      ),
    ).toBe(
      'whenever this creature attacks for the first time each turn the player with the most life or tied for most life',
    );
    expect(gist('Usurper Wyrm')).toBe(
      "Untap each attacking creature. After this phase, there is an additional combat phase if it's attacking the player with the most life or tied for most life",
    );
  });

  test('a creature that enters attacking is said with the move that put it onto the battlefield', () => {
    expect(gist('Pack Kobold')).toBe(
      'You may put a Dragon card from your hand onto the battlefield tapped and attacking if you attacked with creatures with total power 6 or greater this combat',
    );
  });

  test('"each other creature" and "each of up to two other targets"', () => {
    expect(spellGist('Rolling Ignition')).toContain('to each other creature');
    expect(gist('Maw Dragon')).toBe(
      'Deal 4 damage to any target. Deal 3 damage to each of up to two other targets',
    );
  });

  test('the controller words of a trigger and a filter', () => {
    expect(filterPhrase({ types: ['artifact'], controller: 'triggerPlayer' })).toBe(
      'an artifact that opponent controls',
    );
    expect(filterPhrase({ types: ['creature'], controller: 'defendingPlayer' })).toBe(
      'a creature defending player controls',
    );
    expect(thingsPhrase({ types: ['creature'], controller: 'defendingPlayer' }, true)).toBe(
      'creatures defending player controls',
    );
    expect(
      triggerWording(
        {
          kind: 'combatDamageBatch',
          what: { subtypes: ['Dragon'], controller: 'you' },
          to: 'opponent',
        },
        { self: 'this creature' },
      ),
    ).toBe('Whenever one or more Dragons you control deal combat damage to an opponent');
  });
});

describe('looking at and revealing the top card', () => {
  test('reveal the top card of a library and put it onto the battlefield when it is a permanent card', () => {
    expect(spellGist('Warp Bolt')).toBe(
      "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield",
    );
    expect(spellGist('Reveal Probe')).toBe(
      "Target player reveals the top card of their library. If it's a permanent card, they put it onto the battlefield",
    );
  });

  test('Discover, and the same instruction with another limit and what it leaves in exile', () => {
    expect(spellGist('Discovery Rite')).toBe(
      "Discover 4. Create X tapped Treasure tokens, where X is the difference between 4 and the card's mana value",
    );
    expect(gist('Breaching Hoard', 0)).toBe(
      "Exile cards from the top of your library until you exile a nonland card. You may cast it without paying its mana cost if that spell's mana value is 4 or less. If you don't, put that card into your hand",
    );
    expect(amountPhrase({ kind: 'shortfall', limit: 10, of: { kind: 'moved' } })).toBe(
      "the difference between 10 and the card's mana value",
    );
  });

  test('look at the top card and leave it there', () => {
    expect(gist('Herald Trumpet', 0)).toBe(
      "Look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand. If you don't, it stays on top of your library",
    );
  });

  test('Behold, with what is beheld', () => {
    expect(gist('Dragon Scout', 0)).toBe(
      'You may behold a Dragon. If you do, create a Treasure token',
    );
    expect(gist('Dragon Scout', 1)).toBe(
      'Put a +1/+1 counter on this creature. This creature becomes a Dragon in addition to its other types until end of turn. This creature gains flying until end of turn',
    );
  });
});

describe('paying and discarding', () => {
  test('pay any amount of a symbol, with the reflexive damage', () => {
    expect(gist('Ember Tyrant')).toBe(
      'You may pay any amount of {R}. When you do, deal that much damage to any target',
    );
  });

  test('discard any number of cards, then draw that many', () => {
    expect(gist('Reading Rite', 0)).toBe(
      'Deal 2 damage to each creature. Deal 2 damage to each opponent',
    );
    expect(gist('Reading Rite', 1)).toBe(
      'You discard any number of cards. You draw that many cards',
    );
    expect(amountPhrase({ kind: 'thisWay', what: 'discarded' })).toBe(
      'the number of cards discarded this way',
    );
  });

  test('"that much" is said as it is, never as a letter', () => {
    const defs = createDefinitions();
    expect(defs.say({ kind: 'triggerDamage' })).toBe('that much');
    expect(defs.tail()).toBe('');
  });
});

describe('conditions', () => {
  test('the permanents that entered this turn', () => {
    expect(gameConditionWords({ kind: 'enteredThisTurn', count: 2, notTypes: ['land'] })).toBe(
      '2 or more nonland permanents entered the battlefield under your control this turn',
    );
    expect(gameConditionWords({ kind: 'enteredThisTurn', count: 1, types: ['creature'] })).toBe(
      'a creature entered the battlefield under your control this turn',
    );
    expect(gameConditionWords({ kind: 'enteredThisTurn', count: 3, token: true })).toBe(
      '3 or more permanent tokens entered the battlefield under your control this turn',
    );
    expect(
      gameConditionWords({
        kind: 'not',
        term: { kind: 'enteredThisTurn', count: 2, types: ['creature', 'artifact'] },
      }),
    ).toBe(
      'fewer than 2 creatures or artifacts entered the battlefield under your control this turn',
    );
  });

  test('the damage a player was dealt, the chosen option, the most life and the total power of the attackers', () => {
    expect(gameConditionWords({ kind: 'playerDealtDamage', player: 'opponent', atLeast: 7 })).toBe(
      'an opponent was dealt 7 or more damage this turn',
    );
    expect(gameConditionWords({ kind: 'playerDealtDamage', player: 'you', atLeast: 1 })).toBe(
      'you were dealt damage this turn',
    );
    expect(gameConditionWords({ kind: 'chosenOption', option: 'Khans' })).toBe('Khans was chosen');
    expect(gameConditionWords({ kind: 'attackingMostLife' })).toBe(
      "it's attacking the player with the most life or tied for most life",
    );
    expect(gameConditionWords({ kind: 'attackersTotalPower', atLeast: 6 })).toBe(
      'you attacked with creatures with total power 6 or greater this combat',
    );
  });

  test('a Celebration-style static says its condition', () => {
    expect(notes('Festive Chief')).toEqual([
      'This creature is a Dragon creature as long as 2 or more nonland permanents entered the battlefield under your control this turn.',
      'This creature has base power and toughness 4/4 as long as 2 or more nonland permanents entered the battlefield under your control this turn.',
      'This creature has flying as long as 2 or more nonland permanents entered the battlefield under your control this turn.',
    ]);
  });
});

describe('statics and replacements', () => {
  test('casting spells from the top of the library, with the haste of the spell', () => {
    expect(notes('Seer Drake')).toEqual([
      'You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    ]);
    expect(notes('Artifact Oracle')).toEqual([
      'You may cast artifact spells from the top of your library.',
    ]);
    expect(notes('Hasty Artifact Oracle')).toEqual([
      'You may cast artifact spells from the top of your library. If you cast an artifact spell this way, it gains haste until end of turn.',
    ]);
  });

  test('red mana that stays', () => {
    expect(notes('Mana Keeper Drake')).toEqual([
      "You don't lose unspent red mana as steps and phases end.",
    ]);
  });

  test('a permanent that enters as a copy, or with a choice among names', () => {
    expect(notes('Cursed Looking Glass')).toEqual([
      'As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
    ]);
    expect(notes('Siege of Choices')).toEqual([
      'As this enchantment enters, choose Khans or Dragons.',
    ]);
    // A choice of a creature type or a color is worded by its own dialog, not here.
    expect(replacementWording({ kind: 'asEntersChoose', what: 'creatureType' })).toBeNull();
  });

  test('a linked ability says which option it is for', () => {
    expect(triggerCondition(triggered('Siege of Choices', 0) as never, 'Siege', undefined)).toBe(
      'Khans — At the beginning of your upkeep',
    );
    expect(
      triggerCondition(triggered('Siege of Choices', 1) as never, 'Siege', undefined, true),
    ).toBe('Dragons — whenever a creature you control leaves the battlefield');
  });

  test('a creature type with no card type is a creature, and a land type is a land', () => {
    expect(filterPhrase({ subtypes: ['Dragon'], controller: 'you' })).toBe('a Dragon you control');
    expect(thingsPhrase({ subtypes: ['Mountain'], controller: 'you' }, false)).toBe(
      'Mountain you control',
    );
    expect(
      gameConditionWords({ kind: 'controlsAtLeast', filter: { subtypes: ['Mountain'] }, count: 1 }),
    ).toBe('you control a Mountain');
  });
});

describe('a card in a graveyard', () => {
  test('a static ability that works from there', () => {
    expect(grave('Grave Spark')).toEqual([
      'Creatures you control have haste as long as this card is in your graveyard and you control a Mountain.',
    ]);
    expect(grave('Grave Chorus')).toEqual([
      'Creatures you control get +1/+0 as long as this card is in your graveyard and you have 20 or more life.',
    ]);
  });

  test('a triggered ability that works from there, and the card says "this card"', () => {
    expect(grave('Ember Return')).toEqual([
      'Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand.',
    ]);
    expect(grave('Grave Echo')).toEqual(['Whenever a Dragon you control enters, you gain 1 life.']);
  });

  test('on the battlefield those abilities are not worded, they do nothing there', () => {
    expect(notes('Grave Spark')).toEqual([]);
    expect(notes('Grave Chorus')).toEqual([]);
  });

  test('a card that does nothing from a graveyard says nothing', () => {
    expect(grave('Plain Drake')).toEqual([]);
  });
});

describe('mana', () => {
  test('mana of a count, said with the effect', () => {
    expect(spellGist('Tap Geyser')).toBe('Add {R} for each tapped land your opponents control');
    expect(spellGist('Creature Geyser')).toBe('Add {G}{G} for each creature you control');
  });

  test('two mana in any combination of colors, spent on Dragons and their abilities', () => {
    expect(manaRestrictionWording(mana('Dragon Orb'))).toBe(
      '{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons',
    );
  });

  test('a type and a subtype, and a rider on the mana', () => {
    expect(manaRestrictionWording(mana('Dragon Haven', 1))).toBe(
      '{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell',
    );
    expect(manaRestrictionWording(mana('Hasty Orb'))).toBe(
      '{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn',
    );
    expect(manaRestrictionWording(mana('Dragon Haven', 0))).toBeNull();
  });

  test('the scry rider of Path of Ancestry and its mana of the commander identity (group 4 of the Vraska deck)', () => {
    expect(
      manaRestrictionWording({
        cost: [{ kind: 'tap' }],
        production: { kind: 'commanderIdentity' },
        spentRider: {
          spells: { types: ['creature'], sharesTypeWithCommander: true },
          grants: { scry: 1 },
        },
      }),
    ).toBe(
      "{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1",
    );
    expect(
      riderWords({ kind: 'scry', types: ['creature'], sharesTypeWithCommander: true, count: 1 }),
    ).toBe(
      'When spent to cast a creature spell that shares a creature type with your commander, scry 1',
    );
  });

  test('restricted mana in the pool says what it can pay for and what it does', () => {
    expect(
      restrictionWords({ kind: 'spellMatch', subtypes: ['Dragon'], alsoAbilities: true }),
    ).toBe('Spend only to cast Dragon spells or activate abilities of Dragons');
    expect(
      restrictionWords({ kind: 'spellMatch', subtypes: ['Dragon'], types: ['creature'] }),
    ).toBe('Spend only to cast a Dragon creature spell');
    expect(riderWords({ kind: 'haste', subtypes: ['Dragon'], types: ['creature'] })).toBe(
      'If spent on a Dragon creature spell, it gains haste until end of turn',
    );
  });

  test('a tap-for-mana activation with an ability that is not mana is not mistaken for one', () => {
    const activated = abilitiesOf('Firebreather Drake').find((a) => a.kind === 'activated');
    if (activated?.kind !== 'activated') throw new Error('no ability');
    expect(
      activationLabel(face('Firebreather Drake') as never, { abilityIndex: 1, ability: activated }),
    ).toBe('{R}: This creature gets +1/+0 until end of turn');
  });
});

describe('keywords', () => {
  const chip = (keyword: string) => chipsOf({ keywords: [keyword], restrictions: [] } as never)[0];

  test('Read ahead, Dethrone and Myriad have a chip and a reminder', () => {
    expect(chip('readAhead')).toMatchObject({ short: 'RA' });
    expect(chip('readAhead')?.full).toContain('choose a chapter');
    expect(chip('dethrone')).toMatchObject({ short: 'Dth' });
    expect(chip('dethrone')?.full).toContain('the most life or tied for most life');
    expect(chip('myriad')).toMatchObject({ short: 'Myr' });
    expect(chip('myriad')?.full).toContain('for each opponent other than the defending player');
  });
});

describe('an effect the words do not know', () => {
  test('is dropped whole, never half said', () => {
    // A filter with a field the words cannot say: the whole instruction is left out, the gist is empty.
    const odd: Effect = {
      kind: 'behold',
      filter: { owner: { kind: 'you' } },
    };
    const ability = { kind: 'triggered', trigger: { kind: 'upkeep', whose: 'you' }, effect: odd };
    expect(triggerGist(ability as never, undefined)).toBe('');
  });
});

describe('the log', () => {
  test('a permanent that entered as a copy says what it copied', () => {
    const lki = (name: string) => ({ characteristics: { name } });
    const state = {
      objects: {},
      cards: {},
      seats: [],
      lki: { o1: lki('Cursed Looking Glass'), o2: lki('Grizzly Bears') },
    } as never;
    expect(
      describeEvent(
        { kind: 'enteredAsCopy', object: 'o1', copied: 'o2' } as never,
        state,
        state,
        0,
      ),
    ).toMatchObject({
      text: 'Cursed Looking Glass entered as a copy of Grizzly Bears.',
      rule: 'CR 707.9',
    });
  });

  test('a card exiled from the top of a library is named, as it is face up', () => {
    const card = { owner: 0, token: { characteristics: { name: 'Lightning Bolt' } } };
    const state = {
      objects: { o3: card, o4: { ...card, owner: 1 } },
      cards: {},
      seats: [],
      lki: {},
    } as never;
    const moved = (to: string) =>
      ({ kind: 'zoneChanged', from: 'o2', to, fromZone: 'library', toZone: 'exile' }) as never;
    expect(describeEvent(moved('o3'), state, state, 0)).toMatchObject({
      level: 'major',
      text: 'Lightning Bolt is exiled from the top of your library.',
    });
    expect(describeEvent(moved('o4'), state, state, 0)).toMatchObject({
      text: "Lightning Bolt is exiled from the top of opponent's library.",
    });
  });
});
