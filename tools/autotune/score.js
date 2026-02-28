// Score simulation runs for autotuning
const { ScoringConfig } = require('./config');

function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
}

function safeLog(x) {
    return Math.log(Math.max(1e-12, x));
}

function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function slopeLogGrowth(times, values) {
    if (times.length < 3) return 0;
    const xs = times;
    const ys = values.map(safeLog);
    const mx = mean(xs);
    const my = mean(ys);
    let denom = 0;
    for (const x of xs) {
        denom += (x - mx) ** 2;
    }
    if (denom <= 1e-12) return 0;
    let num = 0;
    for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
    }
    return num / denom;
}

function movingAverage(xs, window) {
    if (window <= 1) return xs.slice();
    const out = [];
    let s = 0;
    const q = [];
    for (const x of xs) {
        q.push(x);
        s += x;
        if (q.length > window) {
            s -= q.shift();
        }
        out.push(s / q.length);
    }
    return out;
}

function scoreRuns(runs) {
    const okRuns = runs.filter(r => r.ok);
    const failRuns = runs.filter(r => !r.ok);

    const failRate = failRuns.length / Math.max(1, runs.length);
    if (failRate > ScoringConfig.constraints.maxFailRate) {
        return {
            accepted: false,
            constraint_failed: "sim_fail_rate",
            fail_rate: failRate,
            V_total: 0,
        };
    }

    const growthSlopes = [];
    const longestStalls = [];
    const activeSecs = [];
    const offlineSecs = [];
    const claimStops = [];
    const claimActions = [];
    const totalUpgrades = [];
    const meaningfulUpgrades = [];
    const curveHealths = [];

    for (const r of okRuns) {
        const times = r.times;
        const prods = r.prods;

        const slope = slopeLogGrowth(times, prods);
        growthSlopes.push(slope);

        longestStalls.push(r.longest_stall_seconds || 0);
        activeSecs.push(r.active_seconds || 0);
        offlineSecs.push(r.offline_seconds || 0);
        claimStops.push(r.claim_then_stops || 0);
        claimActions.push(r.claim_then_actions || 0);
        totalUpgrades.push(r.total_upgrades || 0);
        meaningfulUpgrades.push(r.meaningful_upgrades || 0);

        // curve health: use moving average of log prod
        const logProds = prods.map(safeLog);
        const smoothed = movingAverage(logProds, 5);
        let bad = 0;
        for (let i = 1; i < smoothed.length; i++) {
            if (smoothed[i] < smoothed[i - 1] * 0.99) bad++;
        }
        const health = clamp(1.0 - bad / Math.max(1, smoothed.length), 0, 1);
        curveHealths.push(health);
    }

    const medianStall = longestStalls.sort((a, b) => a - b)[Math.floor(longestStalls.length / 2)] || 0;

    // Constraints
    const constraintFailed = null;

    // Use config for all parameters
    const cfg = ScoringConfig;

    // V_idle components
    // Use max/initial production ratio for growth momentum (captures peak growth)
    const maxProds = runs.filter(r => r.ok).map(r => Math.max(...r.prods, 1));
    const initialProd = runs.filter(r => r.ok)[0]?.prods[0] || 1;
    const meanMaxProd = mean(maxProds);
    const growthRatio = Math.log10(Math.max(1, meanMaxProd)) / Math.log10(Math.max(1, initialProd * cfg.growthMomentum.denominatorMultiplier));
    const growthMomentum = clamp(growthRatio, cfg.growthMomentum.min, cfg.growthMomentum.max);

    const meanClaimActions = mean(claimActions);
    const returnQuality = clamp(meanClaimActions * cfg.returnQuality.claimActionMultiplier, cfg.returnQuality.min, cfg.returnQuality.max);

    const meanMu = mean(meaningfulUpgrades);
    const upgradeSatisfaction = clamp(meanMu / cfg.upgradeSatisfaction.meaningfulUpgradeDivisor, cfg.upgradeSatisfaction.min, cfg.upgradeSatisfaction.max);

    const meanCurveHealth = mean(curveHealths);
    const progressClarity = clamp(meanCurveHealth, cfg.progressClarity.min, cfg.progressClarity.max);

    const meanActive = mean(activeSecs);
    const meanOffline = mean(offlineSecs);
    const activityRatio = meanActive / Math.max(1, meanActive + meanOffline);
    const stabilityScore = clamp(activityRatio * meanCurveHealth, cfg.stabilityScore.min, cfg.stabilityScore.max);

    // Constrained optimization: require minimum return quality
    if (returnQuality < cfg.constraints.minReturnQuality) {
        return {
            accepted: false,
            constraint_failed: "low_return_quality",
            fail_rate: failRate,
            V_total: 0,
        };
    }

    // Time-discounted V_total using configured weights
    const w = cfg.vTotal.weights;
    const V_total = (growthMomentum * w.growthMomentum + returnQuality * w.returnQuality + upgradeSatisfaction * w.upgradeSatisfaction + progressClarity * w.progressClarity + stabilityScore * w.stabilityScore) * cfg.vTotal.decay;

    return {
        accepted: true,
        constraint_failed: constraintFailed,
        fail_rate: failRate,
        V_total: V_total,
        components: {
            growth_momentum: growthMomentum,
            return_quality: returnQuality,
            upgrade_satisfaction: upgradeSatisfaction,
            progress_clarity: progressClarity,
            stability_score: stabilityScore,
        },
        bottleneck: {
            longest_stall_median_seconds: medianStall,
        },
    };
}

module.exports = { scoreRuns };
