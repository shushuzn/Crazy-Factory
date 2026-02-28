// Simulate idle game runs for autotuning
const fs = require('fs');
const path = require('path');
const { SimulationConfig } = require('./config');

function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
}

function safeLog(x) {
    return Math.log(Math.max(1e-12, x));
}

function generateUpgradeTable(params, cfg) {
    const price_scale = parseFloat(params.price_scale);
    const price_exp = parseFloat(params.price_exp);
    const reward_scale = parseFloat(params.reward_scale);
    const reward_exp = parseFloat(params.reward_exp);
    const softcap_start = parseFloat(params.softcap_start);
    const softcap_strength = parseFloat(params.softcap_strength);

    const upgrades = [];
    for (let i = 0; i < cfg.upgrade_count; i++) {
        const t = i / Math.max(1, cfg.upgrade_count - 1);
        const softcap = 1.0 + softcap_strength * Math.max(0.0, t - softcap_start) / Math.max(1e-9, (1.0 - softcap_start));
        const cost = price_scale * Math.pow(10, price_exp * (t * 2.0)) * (1.0 + 4.0 * t) * softcap;
        const raw = reward_scale * Math.pow(1.0 + t, reward_exp * 3.0);
        const mult = clamp(1.0 + raw * 0.25, 1.01, 3.0);
        upgrades.push({ cost, mult });
    }
    for (let i = 1; i < upgrades.length; i++) {
        upgrades[i].cost = Math.max(upgrades[i].cost, upgrades[i - 1].cost * 1.03);
    }
    return upgrades;
}

class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }
    next() {
        const rng = SimulationConfig.rng;
        this.seed = (this.seed * rng.multiplier + rng.increment) % rng.modulus;
        return this.seed / rng.modulus;
    }
    random() {
        return this.next();
    }
}

function simulateOne(params, seed, cfg) {
    const rng = new SeededRandom(seed);

    const offline_rate = parseFloat(params.offline_rate);
    const offline_cap_hours = parseFloat(params.offline_cap_hours);
    const prestige_enabled = Boolean(params.prestige_enabled);
    const prestige_unlock_hours = parseFloat(params.prestige_unlock_hours);
    const prestige_gain_scale = parseFloat(params.prestige_gain_scale);

    const upgrades = generateUpgradeTable(params, cfg);

    let t = 0.0;
    let cash = 0.0;
    let prod = cfg.base_income_per_sec;
    let prestige_mult = 1.0;
    let purchased = 0;

    const times = [];
    const prods = [];
    const cashes = [];
    let meaningful_upgrades = 0;
    let total_upgrades = 0;
    let longest_stall_seconds = 0;
    let current_stall = 0;
    let last_prod = prod;

    let active_seconds = 0;
    let offline_seconds = 0;
    let claim_then_stops = 0;
    let claim_then_actions = 0;

    const horizon_seconds = cfg.horizon_hours * 3600;
    const dt = cfg.dt_seconds;

    while (t < horizon_seconds) {
        const inOffline = rng.random() < SimulationConfig.offline.probability;
        let step_dt = dt;

        if (inOffline) {
            const offline_duration = Math.min(
                offline_cap_hours * 3600,
                rng.random() * 2 * 3600 + 600
            );
            const offline_gain = prod * offline_duration * offline_rate * prestige_mult;
            cash += offline_gain;
            t += offline_duration;
            offline_seconds += offline_duration;
            step_dt = offline_duration;
        } else {
            const gain = prod * dt * prestige_mult;
            cash += gain;
            active_seconds += dt;
            t += dt;
        }

        let bought = false;
        while (purchased < upgrades.length && cash >= upgrades[purchased].cost) {
            cash -= upgrades[purchased].cost;
            const prev_prod = prod;
            prod *= upgrades[purchased].mult;
            total_upgrades++;

            const gain_ratio = (prod - prev_prod) / Math.max(1e-9, prev_prod);
            if (gain_ratio >= cfg.meaningful_gain_ratio) {
                meaningful_upgrades++;
            }
            purchased++;
            bought = true;
        }

        if (bought) {
            if (current_stall > longest_stall_seconds) {
                longest_stall_seconds = current_stall;
            }
            current_stall = 0;
        } else if (!inOffline) {
            current_stall += dt;
        }

        if (prestige_enabled && t >= prestige_unlock_hours * 3600) {
            const potential_prestige = Math.max(0, Math.log10(Math.max(1, prod)) - 2) * prestige_gain_scale;
            if (potential_prestige > prestige_mult * 0.1) {
                prestige_mult = 1.0 + potential_prestige;
                cash = 0;
                prod = cfg.base_income_per_sec;
                purchased = 0;
                claim_then_actions++;
            }
        }

        if (Math.floor(t / 60) > Math.floor((t - step_dt) / 60)) {
            times.push(t);
            prods.push(prod * prestige_mult);
            cashes.push(cash);
        }

        if (prod > last_prod * 1.001) {
            last_prod = prod;
        }
    }

    if (current_stall > longest_stall_seconds) {
        longest_stall_seconds = current_stall;
    }

    return {
        ok: true,
        times,
        prods,
        cashes,
        longest_stall_seconds,
        active_seconds,
        offline_seconds,
        claim_then_stops,
        claim_then_actions,
        total_upgrades,
        meaningful_upgrades,
        final_prestige_mult: prestige_mult,
        final_prod: prod * prestige_mult,
    };
}

function simulateBatch(params, runs, seed0) {
    const cfg = {
        horizon_hours: SimulationConfig.horizon.hours,
        dt_seconds: SimulationConfig.timeStep.seconds,
        base_income_per_sec: SimulationConfig.economy.baseIncomePerSec,
        upgrade_count: SimulationConfig.economy.upgradeCount,
        meaningful_gain_ratio: SimulationConfig.economy.meaningfulGainRatio,
        stall_window_minutes: SimulationConfig.stallDetection.windowMinutes,
    };

    const results = [];
    for (let i = 0; i < runs; i++) {
        try {
            const r = simulateOne(params, seed0 + i, cfg);
            results.push(r);
        } catch (e) {
            results.push({ ok: false, error: e.message });
        }
    }
    return results;
}

module.exports = { simulateBatch, simulateOne };
