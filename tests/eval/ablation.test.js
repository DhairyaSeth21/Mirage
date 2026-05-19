import { describe, it, expect } from '@jest/globals';
import { runAblation } from '../../scripts/eval/ablation.js';
import { config } from '../../src/config.js';

describe('runAblation', () => {
  it('runs 7 configurations (control + one per signal)', async () => {
    const callLog = [];

    // Inject a fast mock experiment runner that records what weights it received
    const mockRunExperiment = async ({ weights }) => {
      callLog.push(weights ? { ...weights } : null);
      return {
        extraction_accuracy: 0.5,
        time_to_map_ms: 1000,
        request_cost: 100,
        decoy_interaction_rate: 0.1,
        false_positive_rate: 0.0,
        total_attacker_requests: 100,
        total_normal_requests: 0,
        max_pressure_score: 0.8,
        avg_pressure_score: 0.6,
        level_distribution: { 0: 10, 1: 20, 2: 40, 3: 30 },
      };
    };

    const results = await runAblation({ runExperimentFn: mockRunExperiment });

    // 7 keys: control + 6 signal removals
    const keys = Object.keys(results);
    expect(keys).toHaveLength(7);
    expect(keys).toContain('control');
    expect(keys).toContain('without_coverage');
    expect(keys).toContain('without_enumeration');
    expect(keys).toContain('without_errorAdaptation');
    expect(keys).toContain('without_traversal');
    expect(keys).toContain('without_timing');
    expect(keys).toContain('without_methodUniformity');
    expect(callLog).toHaveLength(7);
  });

  it('each configuration produces valid metrics shape', async () => {
    const mockRunExperiment = async () => ({
      extraction_accuracy: 0.3,
      time_to_map_ms: 5000,
      request_cost: 200,
      decoy_interaction_rate: 0.2,
      false_positive_rate: 0.0,
      total_attacker_requests: 200,
      total_normal_requests: 50,
      max_pressure_score: 0.9,
      avg_pressure_score: 0.7,
      level_distribution: {},
    });

    const results = await runAblation({ runExperimentFn: mockRunExperiment });

    for (const [key, metrics] of Object.entries(results)) {
      expect(metrics).toMatchObject({
        extraction_accuracy: expect.any(Number),
        request_cost: expect.any(Number),
      }), `${key} should have valid metrics`;
    }
  });

  it('re-normalised weights for each ablation case sum to 1.0', async () => {
    const weightSums = [];

    const mockRunExperiment = async ({ weights }) => {
      if (weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        weightSums.push(sum);
      }
      return {
        extraction_accuracy: 0.5, time_to_map_ms: 1000, request_cost: 100,
        decoy_interaction_rate: 0.1, false_positive_rate: 0.0,
        total_attacker_requests: 100, total_normal_requests: 0,
        max_pressure_score: 0.8, avg_pressure_score: 0.6, level_distribution: {},
      };
    };

    await runAblation({ runExperimentFn: mockRunExperiment });

    // Each ablation case (6 of them) should have weights summing to 1.0
    // The control case gets null weights (uses config defaults)
    expect(weightSums).toHaveLength(6);
    for (const sum of weightSums) {
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('original config weights are unchanged after ablation', async () => {
    const originalWeights = { ...config.WEIGHTS };

    await runAblation({
      runExperimentFn: async () => ({
        extraction_accuracy: 0.5, time_to_map_ms: 1000, request_cost: 100,
        decoy_interaction_rate: 0.1, false_positive_rate: 0.0,
        total_attacker_requests: 100, total_normal_requests: 0,
        max_pressure_score: 0.8, avg_pressure_score: 0.6, level_distribution: {},
      }),
    });

    expect(config.WEIGHTS).toEqual(originalWeights);
  });
});
