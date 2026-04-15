// Autotune Configuration
// Extracts magic numbers from score.js and simulate.js for easier tuning

const ScoringConfig = {
  // Growth momentum calculation
  growthMomentum: {
    // Denominator for growth ratio calculation
    // Higher values make it harder to achieve high growth scores
    denominatorMultiplier: 100,
    // Clamp range
    min: 0,
    max: 1
  },

  // Return quality calculation
  returnQuality: {
    // Multiplier for claim actions to quality score
    claimActionMultiplier: 0.15,
    // Minimum required return quality (constraint)
    minRequired: 0.15,
    // Clamp range
    min: 0,
    max: 1
  },

  // Upgrade satisfaction calculation
  upgradeSatisfaction: {
    // Divisor for meaningful upgrades to satisfaction score
    meaningfulUpgradeDivisor: 15,
    // Clamp range
    min: 0,
    max: 1
  },

  // Progress clarity calculation
  progressClarity: {
    // Moving average window for curve health
    movingAverageWindow: 5,
    // Threshold for "bad" curve points
    badPointThreshold: 0.99,
    // Clamp range
    min: 0,
    max: 1
  },

  // Stability score calculation
  stabilityScore: {
    // Clamp range
    min: 0,
    max: 1
  },

  // V_total calculation
  vTotal: {
    // Time decay factor
    decay: 0.98,
    // Component weights (must sum to 1.0)
    weights: {
      growthMomentum: 0.30,
      returnQuality: 0.30,
      upgradeSatisfaction: 0.20,
      progressClarity: 0.10,
      stabilityScore: 0.10
    }
  },

  // Constraint thresholds
  constraints: {
    // Maximum allowed simulation fail rate
    maxFailRate: 0.02,
    // Minimum required return quality
    minReturnQuality: 0.15
  }
};

const SimulationConfig = {
  // Simulation horizon
  horizon: {
    hours: 24.0,
    get seconds() { return this.hours * 3600; }
  },

  // Time step for simulation
  timeStep: {
    seconds: 5
  },

  // Base economy parameters
  economy: {
    baseIncomePerSec: 1.0,
    upgradeCount: 40,
    meaningfulGainRatio: 0.08
  },

  // Stall detection
  stallDetection: {
    windowMinutes: 30
  },

  // Offline behavior
  offline: {
    // Probability of entering offline mode per step
    probability: 0.08,
    // Duration range (will be randomized)
    minDurationSeconds: 600,  // 10 minutes
    maxDurationMultiplier: 2  // Multiplier for random duration
  },

  // Upgrade table generation
  upgrades: {
    price: {
      baseMultiplier: 1.0,
      exponentMultiplier: 2.0,
      linearMultiplier: 4.0
    },
    reward: {
      exponentMultiplier: 3.0,
      multBase: 1.0,
      multRawScale: 0.25,
      minMult: 1.01,
      maxMult: 3.0
    }
  },

  // Random number generator (LCG parameters)
  rng: {
    multiplier: 9301,
    increment: 49297,
    modulus: 233280
  }
};

const SearchConfig = {
  // Default search parameters
  defaults: {
    runsPerEval: 2000,
    generations: 15,
    population: 40,
    topK: 5
  },

  // Convergence criteria
  convergence: {
    // Stop if no improvement for N generations
    stallGenerations: 5,
    // Minimum improvement threshold
    improvementThreshold: 0.001
  }
};

// Validation
const validateConfig = () => {
  const weights = ScoringConfig.vTotal.weights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    throw new Error(`Weights must sum to 1.0, got ${totalWeight}`);
  }
  return true;
};

module.exports = {
  ScoringConfig,
  SimulationConfig,
  SearchConfig,
  validateConfig
};
