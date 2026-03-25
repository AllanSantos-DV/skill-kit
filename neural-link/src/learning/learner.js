/**
 * Online learner for contextual scoring.
 * 
 * Implements Online Linear Regression per handler — the simplified core
 * of LinUCB (Li et al., 2010) without the exploration component.
 * 
 * Each handler has a weight vector W[VECTOR_SIZE]. The learned score for
 * a (handler, context) pair is: score = dot(W, features).
 * 
 * Weights are updated via online gradient descent:
 *   W[i] += learningRate * (reward - predicted) * feature[i]
 * 
 * Safety: floors/ceilings per handler prevent the learner from
 * overriding critical security decisions.
 * 
 * Persistence: delegated to WeightStore for testability.
 */

import { VECTOR_SIZE } from './features.js';
import { DEFAULT_LAMBDA, DEFAULT_LEARNING_RATE, MIN_ACTIVATIONS } from '../infra/constants.js';
import { WeightStore } from './weight-store.js';

/** Default learning config — overridable via neural-link.config.json */
const DEFAULTS = {
  lambda: DEFAULT_LAMBDA,
  learningRate: DEFAULT_LEARNING_RATE,
  minActivations: MIN_ACTIVATIONS,
  floors: {},             // per-handler minimum score (e.g. {pre-commit-guard: 0.8})
  ceilings: {},           // per-handler maximum score
};

/**
 * Learner instance — holds weight vectors for all handlers.
 */
export class Learner {
  constructor(config = {}, store = null) {
    this.config = { ...DEFAULTS, ...config };
    this.weights = {};      // { handlerName: Float64Array(VECTOR_SIZE) }
    this.activations = {};  // { handlerName: number } — count of observations
    this._dirty = false;
    this._loaded = false;
    this._store = store || new WeightStore();
  }

  /**
   * Load weights from disk. Idempotent — only loads once.
   * Delegates to WeightStore.
   */
  load(workspacePath = null) {
    if (this._loaded) return;
    this._loaded = true;

    const data = this._store.load(workspacePath);
    if (data) {
      if (data.weights) {
        for (const [name, arr] of Object.entries(data.weights)) {
          this.weights[name] = new Float64Array(arr);
        }
      }
      if (data.activations) {
        this.activations = { ...data.activations };
      }
    }
  }

  /**
   * Predict learned score for a handler given feature vector.
   * Returns number in [0, 1].
   */
  predict(handlerName, featureVector) {
    const w = this.weights[handlerName];
    if (!w) return 0.5; // no data → neutral

    // Dot product
    let sum = 0;
    for (let i = 0; i < featureVector.length; i++) {
      if (featureVector[i]) {
        sum += w[i];
      }
    }

    // Sigmoid to squash into [0, 1]
    return sigmoid(sum);
  }

  /**
   * Combine declarative score with learned score.
   * Returns final score respecting floors/ceilings.
   * 
   * When no learned weights exist (cold start), returns declarative score
   * unmodified — the learner only influences after collecting data.
   */
  combine(handlerName, declarativeScore, featureVector) {
    // No weights yet → pure declarative (cold start)
    if (!this.weights[handlerName]) {
      return declarativeScore;
    }

    // Not enough observations → pure declarative (warm-up)
    if ((this.activations[handlerName] || 0) < this.config.minActivations) {
      return declarativeScore;
    }

    const lambda = this.config.lambda;
    const learned = this.predict(handlerName, featureVector);
    let score = (1 - lambda) * declarativeScore + lambda * learned;

    // Apply safety bounds
    const floor = this.config.floors[handlerName];
    const ceiling = this.config.ceilings[handlerName];
    if (floor != null && score < floor) score = floor;
    if (ceiling != null && score > ceiling) score = ceiling;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Update weights for a handler based on observed reward.
   * reward: 0.0 (bad decision) to 1.0 (good decision)
   */
  update(handlerName, featureVector, reward) {
    // Track activations
    this.activations[handlerName] = (this.activations[handlerName] || 0) + 1;

    // Don't adjust until minimum observations reached
    if (this.activations[handlerName] < this.config.minActivations) return;

    // Initialize weights if needed
    if (!this.weights[handlerName]) {
      this.weights[handlerName] = new Float64Array(VECTOR_SIZE);
    }

    const w = this.weights[handlerName];
    const predicted = this.predict(handlerName, featureVector);
    const error = reward - predicted;
    const lr = this.config.learningRate;

    // Online gradient descent
    for (let i = 0; i < featureVector.length; i++) {
      if (featureVector[i]) {
        w[i] += lr * error * featureVector[i];
      }
    }

    this._dirty = true;
  }

  /**
   * Persist weights to disk. Fire-and-forget.
   * Delegates to WeightStore.
   * No-op when _skipDiskLoad is set (test mode) to ensure idempotency.
   */
  async save() {
    if (_skipDiskLoad) return; // test mode — never persist
    if (!this._dirty) return;
    this._dirty = false;

    const weights = {};
    for (const [name, w] of Object.entries(this.weights)) {
      weights[name] = Array.from(w);
    }

    await this._store.save(weights, this.activations, VECTOR_SIZE);
  }

  /**
   * Get stats for debugging/logging.
   */
  stats() {
    const s = {};
    for (const [name, count] of Object.entries(this.activations)) {
      s[name] = {
        activations: count,
        hasWeights: !!this.weights[name],
        learningActive: count >= this.config.minActivations,
      };
    }
    return s;
  }
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Singleton learner instance
let _instance = null;
let _initPromise = null;
let _skipDiskLoad = false;

export async function getLearner(config, workspacePath = null) {
  // If already initialized, return immediately
  if (_instance) return _instance;

  // If initialization is in progress, wait for it
  if (_initPromise) return _initPromise;

  // Start initialization
  _initPromise = (async () => {
    const store = _skipDiskLoad ? new NoOpWeightStore() : new WeightStore();
    _instance = new Learner(config, store);
    if (!_skipDiskLoad) {
      _instance.load(workspacePath);
    }
    return _instance;
  })();

  return _initPromise;
}

// For testing — reset singleton. Pass skipDisk=true to prevent
// loading persisted weights (ensures idempotent test runs).
export function _resetLearner(skipDisk = false) {
  _instance = null;
  _initPromise = null;
  _skipDiskLoad = skipDisk;
}

/**
 * E-09: Pre-seed the learner singleton with snapshot data.
 * Avoids weight file reads when snapshot provides them.
 */
export function _primeLearner(config, weights, activations) {
  if (_instance) return; // already initialized
  const store = new WeightStore();
  _instance = new Learner(config, store);
  if (weights) {
    for (const [name, arr] of Object.entries(weights)) {
      _instance.weights[name] = new Float64Array(arr);
    }
  }
  if (activations) {
    _instance.activations = { ...activations };
  }
  _instance._loaded = true;
  _initPromise = Promise.resolve(_instance);
}

/**
 * No-op weight store for test mode.
 */
class NoOpWeightStore {
  load() { return null; }
  async save() {}
  get loadedFrom() { return null; }
}
