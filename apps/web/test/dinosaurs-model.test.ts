/**
 * The web side of D-145 (the Dinosaurs slice) as pure models: the words of the new filters, amounts, abilities, statics and
 * effects read from the engine's SYNTHETIC cards (so a wording that drifts from the AST fails here), the keyword chips, the
 * new decisions (the creature a token fights, a free cast, the look-and-take with a minimum) and the log lines. The division of
 * damage has its own file (`dinosaurs-divide.test.ts`). No DOM.
 */
import {
  type Ability,
  type ChooseCardsDecision,
  type ChooseModesDecision,
  type ChoosePermanentDecision,
  type Effect,
  type GameState,
  type ObjectView,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';
import {
  castFreeText,
  escalateCostOf,
  fightText,
  manaInsteadWording,
  manaInsteadWordings,
  preventByFilterText,
  repeatedCost,
  revealUntilText,
  sharesText,
} from '../src/game/dinosaurs-text';
import { exileMarks, isHiddenFaceDown, isOwnHideaway, laterFacts } from '../src/game/later-text';
import { lordWordings } from '../src/game/static-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel, triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import {
  cardsPrompt,
  castVerb,
  confirmLabel,
  discardTitle,
  foundBadge,
  lookTakeDestination,
  pickerCards,
} from '../src/ui/decisions/cards-picker';
import {
  escalateNote,
  modesDetail,
  modesEscalate,
  modesHint,
} from '../src/ui/decisions/modes-picker';
import { choosePermanentPrompt, chosenBadge, fightTitle } from '../src/ui/decisions/permanents';
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
const mana = (name: string) => {
  const found = abilitiesOf(name).find((a) => a.kind === 'mana');
  if (found?.kind !== 'mana') throw new Error(`no mana ability on ${name}`);
  return found;
};
const spellEffect = (name: string): Effect => {
  const effect = face(name).spell?.effect;
  if (effect === undefined) throw new Error(`${name} has no spell effect`);
  return effect;
};
/** The first effect of a kind inside a spell or ability effect. */
function find<K extends Effect['kind']>(effect: Effect, kind: K): Extract<Effect, { kind: K }> {
  if (effect.kind === kind) return effect as Extract<Effect, { kind: K }>;
  if (effect.kind === 'sequence') {
    for (const part of effect.effects) {
      try {
        return find(part, kind);
      } catch {
        // the next one
      }
    }
  }
  if (effect.kind === 'conditional') return find(effect.effect, kind);
  throw new Error(`no ${kind} in the effect`);
}

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
    targets: [],
    counters: {},
    ...patch,
  }) as ObjectView;
const cardView = (n: number, name: string): ObjectView =>
  view(n, name, { types: face(name).types, subtypes: face(name).subtypes });
const staticNoun = (name: string) => ({
  noun: face(name).types.includes('creature') ? 'creature' : (face(name).types[0] ?? 'permanent'),
  subtypes: face(name).subtypes,
});

const label = (name: string, at = 0) =>
  activationLabel(cardView(1, name), { abilityIndex: at, ability: activated(name, at) });
/** A spell's effect as the gist reads it (an activated ability with no cost and the spell's slots). */
const spellGist = (name: string): string => {
  const spell = face(name).spell;
  if (spell === null || spell === undefined) throw new Error(`${name} is not a spell`);
  return triggerGist(
    { kind: 'activated', cost: [], effect: spell.effect, targets: spell.targets ?? [] } as never,
    undefined,
  );
};

describe('filters and amounts', () => {
  test('a commander and a counter on it', () => {
    expect(label('SYNTHETIC Commander Clinic')).toBe(
      '{T}: Target creature commander gains lifelink until end of turn',
    );
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Growth Lord'), staticNoun('SYNTHETIC Growth Lord')),
    ).toEqual(['Creatures you control with a +1/+1 counter on it have flying.']);
  });

  test('the greatest mana value among your commanders', () => {
    expect(amountPhrase({ kind: 'commanderManaValue' })).toBe(
      'the greatest mana value among your commanders',
    );
    expect(
      lordWordings(
        abilitiesOf('SYNTHETIC Commander Blade'),
        staticNoun('SYNTHETIC Commander Blade'),
      ),
    ).toEqual([
      'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders.',
    ]);
  });

  test('a condition with what the permanents have', () => {
    const colossus = abilitiesOf('SYNTHETIC Shy Colossus')[0];
    if (colossus?.kind !== 'static' || colossus.static.kind !== 'restrictionUnless') {
      throw new Error('no restriction');
    }
    expect(gameConditionWords(colossus.static.unless)).toBe(
      'you control another creature with power 4 or greater',
    );
  });
});

describe('triggers, abilities and statics', () => {
  const raptor = (name: string) => triggered(name);

  test('"while" is part of the event, "if" is checked again', () => {
    const slow = raptor('SYNTHETIC Slow Raptor');
    const source = cardView(1, 'SYNTHETIC Slow Raptor');
    expect(triggerCondition(slow as never, source.name, source)).toBe(
      "Whenever SYNTHETIC Slow Raptor attacks while you don't control another Dinosaur",
    );
    expect(triggerGist(slow as never, source)).toBe('Put a stun counter on this creature');
    // The intervening "if" is said after the effect, not as "while".
    const careful = raptor('SYNTHETIC Careful Raptor');
    expect(triggerCondition(careful as never, source.name, source)).toBe(
      'Whenever SYNTHETIC Slow Raptor attacks',
    );
    expect(triggerGist(careful as never, source)).toBe(
      "Put a stun counter on this creature if you don't control another Dinosaur",
    );
  });

  test('a condition the words cannot say leaves the trigger unworded', () => {
    const slow = raptor('SYNTHETIC Slow Raptor');
    const odd = { ...slow, triggerCondition: { kind: 'kicked' } } as never;
    expect(triggerCondition(odd, 'X', undefined)).toBeNull();
  });

  test("can't attack or block unless", () => {
    const noun = staticNoun('SYNTHETIC Shy Colossus');
    expect(lordWordings(abilitiesOf('SYNTHETIC Shy Colossus'), noun)).toEqual([
      "This creature can't attack or block unless you control another creature with power 4 or greater.",
    ]);
    expect(lordWordings(abilitiesOf('SYNTHETIC Landbound Guard'), noun)).toEqual([
      "This creature can't block unless you control 2 or more lands.",
    ]);
    expect(lordWordings(abilitiesOf('SYNTHETIC Healthy Charger'), noun)).toEqual([
      "This creature can't attack unless you have 30 or more life.",
    ]);
    // "Can't attack" alone, from an Aura.
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Grounding Aura'), staticNoun('SYNTHETIC Grounding Aura')),
    ).toEqual(["Enchanted creature can't attack."]);
  });

  test('an Aura or Equipment that changes what it is attached to is one sentence', () => {
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Elk Aura'), staticNoun('SYNTHETIC Elk Aura')),
    ).toEqual([
      'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    ]);
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Elk Blade'), staticNoun('SYNTHETIC Elk Blade')),
    ).toEqual([
      'Equipped creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    ]);
  });

  test('an additive type is "also", a replaced one is not', () => {
    const wizard = lordWordings(
      abilitiesOf('SYNTHETIC Blue Wizard Aura'),
      staticNoun('SYNTHETIC Blue Wizard Aura'),
    );
    // The color and the type that is added are each said alone: only a replaced type joins the one sentence.
    expect(wizard).toEqual([
      'Enchanted creature is blue.',
      'Enchanted creature is a Wizard in addition to its other creature types.',
    ]);
  });

  test('a mana ability that makes other mana instead', () => {
    expect(manaInsteadWording(mana('SYNTHETIC Doubling Mystic'))).toBe(
      '{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead',
    );
    expect(manaInsteadWording(mana('SYNTHETIC Rich Rock'))).toBe(
      '{T}: Add {G}. If you control 3 or more lands, add {G}{G} instead',
    );
    expect(manaInsteadWording(mana('SYNTHETIC Chameleon Rock'))).toBe(
      '{T}: Add {C}. If you control 3 or more lands, add one mana of any color instead',
    );
    // No "instead": the card's own text says it.
    expect(manaInsteadWording(mana('SYNTHETIC Twin Spring'))).toBeNull();
    // The permanent's note on the page is that sentence, with a period; a card with none has no note.
    expect(manaInsteadWordings(abilitiesOf('SYNTHETIC Rich Rock'))).toEqual([
      '{T}: Add {G}. If you control 3 or more lands, add {G}{G} instead.',
    ]);
    expect(manaInsteadWordings(abilitiesOf('SYNTHETIC Twin Spring'))).toEqual([]);
  });
});

describe('effects', () => {
  test('damage with excess to the controller', () => {
    expect(spellGist('SYNTHETIC Trample Bite')).toBe(
      "Target creature you control deals damage equal to its power to target creature an opponent controls. If target creature you control has trample, excess damage is dealt to that creature's controller instead",
    );
  });

  test('prevention by the kind of source', () => {
    expect(preventByFilterText(find(spellEffect('SYNTHETIC Spider Fog'), 'preventDamage'))).toBe(
      'Prevent all combat damage that would be dealt this turn by non-Spider creatures',
    );
    expect(spellGist('SYNTHETIC Spider Fog')).toContain(
      'Prevent all combat damage that would be dealt this turn by non-Spider creatures',
    );
  });

  test('doubling power and toughness', () => {
    expect(lordWordings([], { noun: 'enchantment' }) /* nothing */).toEqual([]);
    const surge = triggered('SYNTHETIC Surge Field');
    expect(triggerGist(surge as never, cardView(1, 'SYNTHETIC Surge Field'))).toBe(
      'Double the power and toughness of each creature you control until end of turn',
    );
    expect(spellGist('SYNTHETIC Might Doubler')).toBe(
      'Double the power of target creature until end of turn',
    );
    expect(spellGist('SYNTHETIC Hide Doubler')).toBe(
      'Double the toughness of target creature until end of turn',
    );
  });

  test('reveal until', () => {
    const effect = find(triggered('SYNTHETIC Land Digger').effect, 'revealUntil');
    expect(revealUntilText(effect)).toBe(
      'Reveal cards from the top of your library until you reveal a land card. Put it onto the battlefield tapped and the rest on the bottom of your library in a random order',
    );
    expect(revealUntilText({ ...effect, put: 'hand' })).toContain(
      'Put it into your hand and the rest',
    );
    expect(
      triggerGist(
        triggered('SYNTHETIC Land Digger') as never,
        cardView(1, 'SYNTHETIC Land Digger'),
      ),
    ).toContain('Reveal cards from the top of your library until you reveal a land card');
  });

  test('look at the top cards and put one onto the battlefield', () => {
    expect(label('SYNTHETIC Land Scout')).toBe(
      '{T}: Look at the top four cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom of your library in a random order',
    );
    expect(label('SYNTHETIC Tapped Scout')).toContain('and put it onto the battlefield tapped.');
  });

  test('hideaway looks at cards and exiles one face down', () => {
    // The trigger the keyword stands for: a card that must be taken.
    const effect: Effect = {
      kind: 'lookAtTop',
      count: 4,
      take: { filter: {}, max: 1, min: 1, to: 'exileFaceDown' },
      rest: 'bottomRandom',
    };
    expect(
      triggerGist(
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect,
        } as never,
        undefined,
      ),
    ).toBe(
      'Look at the top four cards of your library. Exile one of them face down. Put the rest on the bottom of your library in a random order',
    );
  });

  test('look at the top cards, put two into the hand unrevealed and the rest on the bottom in any order (D-324)', () => {
    const effect: Effect = {
      kind: 'lookAtTop',
      count: 5,
      take: { filter: {}, max: 2, min: 2, hidden: true },
      rest: 'bottomChosen',
    };
    expect(
      triggerGist(
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect,
        } as never,
        undefined,
      ),
    ).toBe(
      'Look at the top five cards of your library. Put two of them into your hand. Put the rest on the bottom of your library in any order',
    );
  });

  test('a free cast', () => {
    const cast = (name: string) => castFreeText(find(spellEffect(name), 'castFree'));
    expect(cast('SYNTHETIC Free Cast Rite')).toBe(
      'You may cast a spell with mana value 5 or less from your hand without paying its mana cost',
    );
    expect(cast('SYNTHETIC Free Play Rite')).toBe(
      'You may play a card with mana value 5 or less from your hand without paying its mana cost',
    );
    expect(label('SYNTHETIC Hidden Cache')).toBe(
      '{2}, {T}: You may play the exiled card without paying its mana cost',
    );
    // Under a condition the instruction is said as a consequence of it.
    expect(label('SYNTHETIC Hidden Vault')).toBe(
      '{G}, {T}: If the total power of creatures you control is 5 or greater, you may play the exiled card without paying its mana cost',
    );
  });

  test('fight', () => {
    const duel = find(spellEffect('SYNTHETIC Duel'), 'fight');
    const object = (what: { kind: string; id?: string }) =>
      what.kind === 'target'
        ? what.id === 't1'
          ? 'target creature you control'
          : "target creature you don't control"
        : 'it';
    expect(fightText(duel, { object: object as never })).toBe(
      "Target creature you control fights target creature you don't control",
    );
    const swarm = find(spellEffect('SYNTHETIC Swarm Predation'), 'fight');
    expect(fightText(swarm, { object: object as never })).toBe(
      'Each of them fights a different one of the creatures an opponent controls',
    );
    expect(spellGist('SYNTHETIC Duel')).toBe(
      'Target creature you control fights target creature an opponent controls',
    );
  });

  test('damage divided as you choose', () => {
    expect(spellGist('SYNTHETIC Divided Rampage')).toBe(
      'Deal X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control',
    );
    expect(spellGist('SYNTHETIC Measured Volley')).toBe(
      'Deal X damage divided as you choose among one or two target creatures, where X is the greatest power among creatures you control',
    );
    expect(spellGist('SYNTHETIC Arc Volley')).toBe(
      'Deal 3 damage divided as you choose among one, two or three targets',
    );
  });

  test('the shares of a divided spell on the stack', () => {
    const name = (t: { kind: string; id?: string }) =>
      t.kind === 'object' ? `Goblin ${t.id}` : 'You';
    expect(
      sharesText(
        [
          { kind: 'object', id: 'o1', specId: 't1', share: 3 },
          { kind: 'object', id: 'o2', specId: 't1', share: 2 },
        ],
        name as never,
      ),
    ).toBe('3 damage to Goblin o1, 2 damage to Goblin o2');
    expect(sharesText([{ kind: 'object', id: 'o1', specId: 't1' }], name as never)).toBeNull();
  });
});

describe('keywords', () => {
  test('escalate and hideaway chips carry the cost or the number and the reminder', () => {
    const escalate = chipsOf({
      keywords: ['escalate'],
      oracleText: 'Escalate {1}{G} (Pay this cost for each mode chosen beyond the first.)',
    } as never);
    expect(escalate.map((c) => c.short)).toEqual(['Esc']);
    expect(escalate[0]?.full).toBe(
      'Escalate {1}{G} (Pay this cost for each mode chosen beyond the first.)',
    );
    const hide = chipsOf({ keywords: ['hideaway'], oracleText: 'Hideaway 4' } as never);
    expect(hide.map((c) => c.short)).toEqual(['Hid 4']);
    expect(hide[0]?.full).toContain(
      'Hideaway 4 (When this permanent enters, look at the top four cards',
    );
    // Granted with no text: the bare name, never a guessed number.
    expect(chipsOf({ keywords: ['hideaway'], oracleText: '' } as never)[0]?.full).toBe('Hideaway');
  });

  test('the escalate cost of a spell and what the picks add', () => {
    expect(escalateCostOf('Escalate {1}{G} (Pay this cost ...) Choose one or more')).toEqual([
      '1',
      'G',
    ]);
    expect(escalateCostOf('Choose one')).toBeNull();
    expect(repeatedCost(['1', 'G'], 2)).toBe('{2}{G}{G}');
    expect(repeatedCost(['G'], 1)).toBe('{G}');
    expect(repeatedCost(['G'], 0)).toBe('');
    const d = { purpose: 'spell', sourceOracleText: 'Escalate {G} Choose one or more' } as const;
    expect(modesEscalate(d)).toEqual(['G']);
    expect(modesEscalate({ ...d, purpose: 'ability' })).toBeNull();
    expect(escalateNote(d, [0])).toBe(' Escalate {G}: pay it for each mode beyond the first.');
    expect(escalateNote(d, [0, 1, 2])).toBe(
      ' Escalate {G}: {G}{G} more for 2 modes beyond the first.',
    );
    expect(modesDetail({ min: 1, max: 3, ...d }, [0, 1])).toBe(
      '2 of 1 to 3 chosen. Escalate {G}: {G} more for one mode beyond the first.',
    );
    // Without escalate the line is as before.
    expect(
      modesDetail(
        { min: 1, max: 3, purpose: 'spell', sourceOracleText: 'Choose one or more' },
        [0],
      ),
    ).toBe('1 of 1 to 3 chosen');
    const decision = {
      ...d,
      modes: [],
      min: 1,
      max: 3,
      sets: [[0], [1]],
    } as unknown as ChooseModesDecision;
    expect(modesHint(decision, [0, 1])).toBe(
      'You cannot pay the escalate cost for that many modes',
    );
  });
});

describe('the creature a token fights', () => {
  const index = lookupIndexFor([
    view(1, 'Beast'),
    view(2, 'Goblin', { controller: 1, owner: 1 }),
    view(3, 'Elf', { controller: 1, owner: 1 }),
    view(9, 'SYNTHETIC Swarm Predation', { zone: 'stack' }),
  ]);
  const decision = {
    kind: 'choosePermanent',
    seat: 0,
    source: 'o9',
    purpose: 'fight',
    subject: 'o1',
    legal: ['o2', 'o3'],
    min: 1,
    max: 1,
  } as unknown as ChoosePermanentDecision;

  test('the prompt names the fighter and the spell', () => {
    expect(choosePermanentPrompt(decision, index)).toBe(
      'Choose the creature Beast fights for SYNTHETIC Swarm Predation.',
    );
    expect(fightTitle(decision, index)).toBe('Beast fights');
    expect(chosenBadge(decision, index)).toBe('Fights it');
  });
});

describe('the free cast and the look-and-take', () => {
  const index = lookupIndexFor([
    view(9, 'SYNTHETIC Free Cast Rite', { zone: 'stack', types: ['sorcery'] }),
  ]);
  const cast = (zone: 'hand' | 'exile', prompt: string, source = 'o9') =>
    ({
      kind: 'chooseCards',
      seat: 0,
      source,
      purpose: 'cast',
      zone,
      legal: ['o1'],
      min: 0,
      max: 1,
      reveal: false,
      prompt,
    }) as unknown as ChooseCardsDecision;
  const free = cast('hand', 'You may cast a card from your hand without paying its mana cost');
  const play = cast('exile', 'You may play the exiled card without paying its mana cost');

  test("cast or play, in the engine's own words", () => {
    expect(castVerb(free)).toBe('cast');
    expect(castVerb(play)).toBe('play');
    expect(confirmLabel(free, [])).toBe("Don't cast");
    expect(confirmLabel(free, ['o1'])).toBe('Cast it');
    expect(confirmLabel(play, [])).toBe("Don't play");
    expect(confirmLabel(play, ['o1'])).toBe('Play it');
    expect(foundBadge(free, ['o1'], 'o1')).toBe('Cast');
    expect(foundBadge(play, ['o1'], 'o1')).toBe('Play');
    expect(foundBadge(play, ['o1'], 'o2')).toBeNull();
  });

  test('the prompt and the title', () => {
    expect(cardsPrompt(free, index)).toBe(
      'You may cast a card from your hand without paying its mana cost (SYNTHETIC Free Cast Rite).',
    );
    expect(discardTitle(free, index)).toBe('Cast for free: SYNTHETIC Free Cast Rite');
    expect(discardTitle(play, index)).toBe('Play for free: SYNTHETIC Free Cast Rite');
  });

  test('the cards of an exile question are the legal cards of the exile', () => {
    const card = view(1, 'Hidden Bear', { zone: 'exile', faceDown: true });
    const other = view(2, 'Other', { zone: 'exile' });
    const v = { exile: [card, other], seats: [], battlefield: [] } as never;
    expect(pickerCards(v, play).map((o) => o.name)).toEqual(['Hidden Bear']);
  });

  test('where the taken card goes, and that Hideaway must take one', () => {
    const look = (source: string) =>
      ({
        kind: 'chooseCards',
        seat: 0,
        source,
        purpose: 'lookTake',
        zone: 'library',
        legal: ['o1'],
        looked: ['o1', 'o2'],
        min: 1,
        max: 1,
        reveal: false,
        prompt: 'Look at the top two cards',
      }) as unknown as ChooseCardsDecision;
    const hideaway = view(8, 'SYNTHETIC Hidden Vault', {
      zone: 'stack',
      abilitySource: 'o5',
      ability: {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'lookAtTop',
          count: 2,
          take: { filter: {}, max: 1, min: 1, to: 'exileFaceDown' },
          rest: 'bottomRandom',
        },
      } as never,
    });
    const scout = view(7, 'SYNTHETIC Land Scout', {
      zone: 'stack',
      abilitySource: 'o6',
      ability: triggered('SYNTHETIC Land Digger') as never,
    });
    const idx = lookupIndexFor([
      hideaway,
      scout,
      view(5, 'SYNTHETIC Hidden Vault'),
      view(6, 'SYNTHETIC Land Scout'),
    ]);
    expect(lookTakeDestination(look('o8'), idx)).toBe('exileFaceDown');
    expect(confirmLabel(look('o8'), ['o1'], 'exileFaceDown')).toBe('Exile face down');
    expect(foundBadge(look('o8'), ['o1'], 'o1', 'exileFaceDown')).toBe('Exile');
    expect(cardsPrompt(look('o8'), idx)).toBe(
      "Look at the top two cards of your library. Exile one of them face down. Put the rest on the bottom of your library in a random order (SYNTHETIC Hidden Vault's ability).",
    );
    // Onto the battlefield: "none" is allowed, so the label says what Confirm does.
    expect(confirmLabel(look('o7'), [], 'battlefield')).toBe('Put none');
    expect(confirmLabel(look('o7'), ['o1'], 'battlefield')).toBe('Put onto battlefield');
    // The default is the hand.
    expect(lookTakeDestination(look('o404'), idx)).toBe('hand');
    expect(confirmLabel(look('o404'), ['o1'])).toBe('Put into hand');
  });
});

describe('the face-down card of a Hideaway permanent', () => {
  const hidden = view(1, 'Face-down card', { zone: 'exile', faceDown: true, owner: 1, types: [] });
  const mine = view(2, 'Secret Giant', { zone: 'exile', faceDown: true, owner: 0 });
  const foretold = view(3, 'Foretold Giant', { zone: 'exile', faceDown: true, foretold: true });

  test('the other player sees a card back, never the name', () => {
    expect(isHiddenFaceDown(hidden)).toBe(true);
    expect(isOwnHideaway(hidden)).toBe(false);
    expect(exileMarks(hidden)).toEqual(['face down']);
    const facts = laterFacts(hidden, 0).join(' ');
    expect(facts).toContain("the opponent's");
    expect(facts).not.toContain('foretold');
  });

  test('the controller of the permanent sees the whole card, marked', () => {
    expect(isHiddenFaceDown(mine)).toBe(false);
    expect(isOwnHideaway(mine)).toBe(true);
    expect(exileMarks(mine)).toEqual(['Hideaway']);
    expect(laterFacts(mine, 0).join(' ')).toContain('Exiled face down by Hideaway');
    // A foretold card of the viewer is not a Hideaway card.
    expect(isOwnHideaway(foretold)).toBe(false);
    expect(exileMarks(foretold)).toEqual(['Foretold']);
  });
});

describe('the log', () => {
  const state = {
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0 },
      o2: { card: 'c2', token: null, stack: null, controller: 1 },
      o3: { card: 'c3', token: null, stack: null, controller: 0 },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' }, c3: { definition: 'd3' } },
    definitions: { d1: { name: 'Beast' }, d2: { name: 'Goblin' }, d3: { name: 'Swarm Predation' } },
    pending: null,
  } as unknown as GameState;
  const line = (event: object) => describeEvent(event as never, state, state, 0)?.text;

  test('a stun counter takes the place of untapping', () => {
    expect(line({ kind: 'counterRemoved', object: 'o2', counter: 'stun', count: 1 })).toBe(
      'Goblin would untap: a stun counter is removed instead, and it stays tapped.',
    );
    // Any other counter keeps the plain line.
    expect(line({ kind: 'counterRemoved', object: 'o2', counter: '+1/+1', count: 2 })).toBe(
      '2 +1/+1 counters removed from Goblin.',
    );
  });

  test('two creatures fight and the choice of whom is said', () => {
    expect(line({ kind: 'fought', objects: ['o1', 'o2'] })).toBe('Beast and Goblin fight.');
    const chosen = (automatic: boolean) =>
      line({
        kind: 'permanentsChosen',
        seat: 0,
        source: 'o3',
        objects: ['o2'],
        purpose: 'fight',
        subject: 'o1',
        automatic,
      });
    expect(chosen(false)).toBe('You choose Goblin for Beast to fight (Swarm Predation).');
    expect(chosen(true)).toBe('Beast must fight Goblin for Swarm Predation: no other choice.');
  });
});
