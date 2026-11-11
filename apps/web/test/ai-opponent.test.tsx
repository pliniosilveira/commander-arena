/**
 * The opponent (D-164, D-168): what the menu and "Play this deck" send to the Worker, what `?autostart`
 * sends, and the agent the host builds from it.
 */
import { CasualAgent, HeuristicAgent } from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import { createAgent } from '../src/game/agents';
import { autostartAi } from '../src/game/autostart';
import { GameHost } from '../src/game/host';
import type { AiKind, NewGameOptions } from '../src/game/protocol';
import { startOptionsFor } from '../src/precons';
import { startFromForm } from '../src/ui/screens/menu-model';
import { playableSnapshot, preconsOf } from './precons-helpers';

describe('what the page sends in the start message', () => {
  test('the menu start carries the agent of the form', async () => {
    const precons = preconsOf([await playableSnapshot()]);
    for (const ai of ['casual', 'normal'] as const) {
      const seen: NewGameOptions[] = [];
      const form = { humanDeck: 'synthetic-playable', aiDeck: 'synthetic-playable', seed: '5', ai };
      const result = await startFromForm(async (options) => void seen.push(options), form, precons);
      expect(result).toEqual({ started: true });
      expect(seen[0]?.ai).toBe(ai);
    }
  });

  test('a form without an agent sends none (the host plays casual)', async () => {
    const precons = preconsOf([await playableSnapshot()]);
    const seen: NewGameOptions[] = [];
    const form = { humanDeck: 'synthetic-playable', aiDeck: 'synthetic-playable', seed: '5' };
    await startFromForm(async (options) => void seen.push(options), form, precons);
    expect(seen[0]).not.toHaveProperty('ai');
  });

  test('startOptionsFor passes the agent on', async () => {
    const precons = preconsOf([await playableSnapshot()]);
    const request = {
      seed: 1,
      humanDeck: 'synthetic-playable',
      aiDeck: 'synthetic-playable',
      allowHidden: false,
    };
    const normal = await startOptionsFor(precons, { ...request, ai: 'normal' });
    expect(normal.ok && normal.options.ai).toBe('normal');
    const none = await startOptionsFor(precons, request);
    expect(none.ok && 'ai' in none.options).toBe(false);
  });

  test('an autostart plays casual unless the URL names another agent', () => {
    expect(autostartAi(new URLSearchParams('autostart=a,b&seed=7'))).toBe('casual');
    for (const kind of ['casual', 'normal'] as const) {
      expect(autostartAi(new URLSearchParams(`autostart=a,b&ai=${kind}`))).toBe(kind);
    }
    // The removed Easy level (D-168) names no agent any more: a stale link plays the default.
    expect(autostartAi(new URLSearchParams('autostart=a,b&ai=easy'))).toBe('casual');
    expect(autostartAi(new URLSearchParams('ai=hard'))).toBe('casual');
    expect(autostartAi(new URLSearchParams('ai='))).toBe('casual');
  });
});

describe('the agent the host builds', () => {
  test('createAgent builds the agent the kind names', () => {
    expect(createAgent(1, 'casual')).toBeInstanceOf(CasualAgent);
    expect(createAgent(1, 'normal')).toBeInstanceOf(HeuristicAgent);
  });

  test('the host asks for the kind of the start message, casual when there is none', async () => {
    const asked: AiKind[] = [];
    const host = new GameHost({
      clock: () => 0,
      makeAgent: (seed, kind) => {
        asked.push(kind);
        return createAgent(seed, kind);
      },
    });
    const base = { seed: 3, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };
    await host.newGame(base);
    await host.newGame({ ...base, ai: 'normal' });
    await host.newGame({ ...base, ai: 'casual' });
    expect(asked).toEqual(['casual', 'normal', 'casual']);
  });

  test('the host seeds the agent from the game seed', async () => {
    const seeds: number[] = [];
    const host = new GameHost({
      clock: () => 0,
      makeAgent: (seed, kind) => {
        seeds.push(seed);
        return createAgent(seed, kind);
      },
    });
    await host.newGame({
      seed: 5,
      humanDeck: 'white-knights',
      aiDeck: 'swamp-forest',
      ai: 'normal',
    });
    await host.newGame({
      seed: 5,
      humanDeck: 'white-knights',
      aiDeck: 'swamp-forest',
      ai: 'normal',
    });
    expect(seeds[0]).toBe(seeds[1]);
  });
});
