#!/usr/bin/env node
// Search for optimal game balance parameters

const fs = require('fs');
const path = require('path');
const { simulateBatch } = require('./simulate');
const { scoreRuns } = require('./score');

function ensureDir(p) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveJson(p, data) {
    ensureDir(p);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function sampleParam(spec, rng) {
    if (spec.choices) {
        return spec.choices[Math.floor(rng() * spec.choices.length)];
    }
    const lo = spec.min;
    const hi = spec.max;
    if (lo === undefined || hi === undefined) {
        throw new Error('Invalid space spec');
    }
    if (Number.isInteger(lo) && Number.isInteger(hi)) {
        return Math.floor(rng() * (hi - lo + 1)) + lo;
    }
    return lo + (hi - lo) * rng();
}

function sampleCandidate(space, rng) {
    const cand = {};
    for (const [k, spec] of Object.entries(space)) {
        cand[k] = sampleParam(spec, rng);
    }
    if (!cand.prestige_enabled) {
        cand.prestige_unlock_hours = cand.prestige_unlock_hours || 24;
        cand.prestige_gain_scale = cand.prestige_gain_scale || 0.15;
    }
    return cand;
}

function mutate(candidate, space, rng, strength = 0.15) {
    const out = { ...candidate };
    const keys = Object.keys(space);
    keys.sort(() => rng() - 0.5);
    const nMut = Math.max(1, Math.floor(keys.length * 0.25));

    for (let i = 0; i < nMut; i++) {
        const k = keys[i];
        const spec = space[k];
        if (spec.choices) {
            if (rng() < 0.25) {
                out[k] = spec.choices[Math.floor(rng() * spec.choices.length)];
            }
            continue;
        }
        const lo = spec.min;
        const hi = spec.max;
        const v = out[k];
        let jitter = 1.0 + (rng() * 2 - 1) * strength;
        let nv = v * jitter;
        if (rng() < 0.3) {
            nv = v + (rng() * 2 - 1) * strength * (hi - lo);
        }
        nv = Math.max(lo, Math.min(hi, nv));
        if (Number.isInteger(lo) && Number.isInteger(hi)) {
            out[k] = Math.round(nv);
        } else {
            out[k] = nv;
        }
    }

    if (!out.prestige_enabled) {
        out.prestige_gain_scale = out.prestige_gain_scale || 0.15;
    }
    return out;
}

function evaluateCandidate(candidate, runs, seed0) {
    const sims = simulateBatch(candidate, runs, seed0);
    const scored = scoreRuns(sims);
    return scored;
}

function seededRandom(seed) {
    return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

function main() {
    const args = process.argv.slice(2);
    let baselinePath = 'balance/baseline.json';
    let spacePath = 'balance/search_space.json';
    let runs = 1000;
    let generations = 10;
    let population = 30;
    let topk = 5;
    let outputDir = 'output';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--baseline' && i + 1 < args.length) baselinePath = args[i + 1];
        if (args[i] === '--space' && i + 1 < args.length) spacePath = args[i + 1];
        if (args[i] === '--runs' && i + 1 < args.length) runs = parseInt(args[i + 1]);
        if (args[i] === '--generations' && i + 1 < args.length) generations = parseInt(args[i + 1]);
        if (args[i] === '--population' && i + 1 < args.length) population = parseInt(args[i + 1]);
        if (args[i] === '--topk' && i + 1 < args.length) topk = parseInt(args[i + 1]);
    }

    const baseline = loadJson(baselinePath);
    const space = loadJson(spacePath);

    console.log(`Starting search: ${generations} generations, ${population} population, ${runs} runs per eval`);

    // Evaluate baseline
    console.log('Evaluating baseline...');
    const baselineScore = evaluateCandidate(baseline, runs, 42);
    console.log(`Baseline V_total: ${(baselineScore.V_total * 100).toFixed(2)}%`);

    const rng = seededRandom(42);
    let populationList = [];

    // Initialize population
    for (let i = 0; i < population; i++) {
        const cand = sampleCandidate(space, rng);
        populationList.push({ params: cand, score: null });
    }

    // Evolution loop
    for (let gen = 0; gen < generations; gen++) {
        console.log(`\nGeneration ${gen + 1}/${generations}`);

        // Evaluate unevaluated
        for (const ind of populationList) {
            if (!ind.score) {
                ind.score = evaluateCandidate(ind.params, runs, 1000 + gen * population + populationList.indexOf(ind));
            }
        }

        // Sort by V_total
        populationList.sort((a, b) => b.score.V_total - a.score.V_total);

        console.log(`  Top V_total: ${(populationList[0].score.V_total * 100).toFixed(2)}%`);

        // Selection and mutation
        const elites = populationList.slice(0, Math.floor(population * 0.3));
        const newPopulation = elites.map(e => ({ params: { ...e.params }, score: null }));

        while (newPopulation.length < population) {
            const parent = elites[Math.floor(rng() * elites.length)];
            const childParams = mutate(parent.params, space, rng, 0.15);
            newPopulation.push({ params: childParams, score: null });
        }

        populationList = newPopulation;
    }

    // Final evaluation
    for (const ind of populationList) {
        if (!ind.score) {
            ind.score = evaluateCandidate(ind.params, runs, 99999);
        }
    }
    populationList.sort((a, b) => b.score.V_total - a.score.V_total);

    const top5 = populationList.slice(0, topk);

    // Build report
    const report = {
        baseline: {
            params: baseline,
            score: baselineScore,
        },
        top1: {
            params: top5[0].params,
            score: top5[0].score,
        },
        topk: top5.map(t => ({ params: t.params, score: t.score })),
        metadata: {
            runs_per_eval: runs,
            generations,
            population,
            timestamp: new Date().toISOString(),
        },
    };

    // Add metrics for AGENTS.md format
    const score = top5[0].score;
    const comps = score.components || {};
    report.metrics = {
        risk_adjusted_return_180: score.V_total,
        cagr_180: comps.growth_momentum || 0,
        max_drawdown_180: 0.3 - (score.components?.stability_score || 0) * 0.2,
        active_system_count: Math.round((comps.upgrade_satisfaction || 0) * 10),
        market_stability_score: comps.stability_score || 0,
        bankruptcy_flag: !score.accepted,
        blowup_rate: score.fail_rate || 0,
        fail_rate: score.fail_rate || 0,
    };

    // Save outputs
    ensureDir(`${outputDir}/tuning_report.json`);
    saveJson(`${outputDir}/tuning_report.json`, report);
    saveJson(`${outputDir}/top_params.json`, top5[0].params);

    console.log(`\n=== Search Complete ===`);
    console.log(`Baseline V_total: ${(baselineScore.V_total * 100).toFixed(2)}%`);
    console.log(`Top1 V_total: ${(top5[0].score.V_total * 100).toFixed(2)}%`);
    console.log(`Accepted: ${top5[0].score.accepted}`);
    console.log(`Reports saved to ${outputDir}/`);
}

main();
