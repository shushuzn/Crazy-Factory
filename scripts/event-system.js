// Event System (P3-T2)
// 扩展宏观事件系统，添加任务、奖励和惩罚机制

const createEventSystem = ({
  st,
  dirty,
  pushLog,
  eventBus,
  buildings,
  skills,
  sfxSuccess,
  sfxFail
}) => {
  // Event types
  const EVENT_TYPES = {
    MACRO: 'macro',      // 宏观事件 (已有)
    QUEST: 'quest',      // 任务事件
    BONUS: 'bonus',      // 奖励事件
    CRISIS: 'crisis',    // 危机事件
    MILESTONE: 'milestone' // 里程碑事件
  };

  // Quest definitions
  const QUESTS = [
    {
      id: 'quest_first_prestige',
      name: '首次 Prestige',
      description: '完成第一次 Prestige',
      condition: () => st.prestigeCount >= 1,
      reward: () => { st.gears += 100; st.lifetimeGears += 100; },
      rewardText: '+100 gears',
      completed: false
    },
    {
      id: 'quest_upgrade_10',
      name: '升级大师',
      description: '拥有10个升级',
      condition: () => (st.upgrades || []).filter(u => u.purchased).length >= 10,
      reward: () => { st.gears += 500; st.lifetimeGears += 500; },
      rewardText: '+500 gears',
      completed: false
    },
    {
      id: 'quest_building_100',
      name: '产业巨头',
      description: '累计购买100个建筑',
      condition: () => (st.buildings || []).reduce((sum, b) => sum + (b.owned || 0), 0) >= 100,
      reward: () => { st.gears += 1000; st.lifetimeGears += 1000; },
      rewardText: '+1000 gears',
      completed: false
    },
    {
      id: 'quest_manual_1k',
      name: '勤劳致富',
      description: '手动点击获得 1k gears',
      condition: () => (st.manualGearsTotal || 0) >= 1000,
      reward: () => { st.manualPower *= 1.5; },
      rewardText: '手动力量 +50%',
      completed: false
    },
    {
      id: 'quest_outlook_5',
      name: '前瞻大师',
      description: '连续5次利率前瞻命中',
      condition: () => (st.rateOutlookHits || 0) >= 5 && (st.rateOutlookMisses || 0) === 0,
      reward: () => { st.policyHedge = Math.min(0.6, (st.policyHedge || 0) + 0.1); },
      rewardText: '利率对冲 +10%',
      completed: false
    }
  ];

  // Bonus events (random good events)
  const BONUS_EVENTS = [
    {
      id: 'bonus_windfall',
      name: '意外之财',
      description: '发现一批闲置齿轮',
      effect: () => {
        const bonus = Math.max(10, Math.floor(st.gps * 60)); // 1 minute of GPS
        st.gears += bonus;
        st.lifetimeGears += bonus;
        return `+${bonus} gears`;
      },
      weight: 0.1
    },
    {
      id: 'bonus_efficiency',
      name: '效率提升',
      description: '所有建筑产出临时提升',
      effect: () => {
        st.eventBonusMult = 2.0;
        setTimeout(() => { st.eventBonusMult = 1.0; }, 30000); // 30 seconds
        return '产出 ×2 (30秒)';
      },
      weight: 0.05
    },
    {
      id: 'bonus_discount',
      name: '折扣狂欢',
      description: '建筑购买价格临时降低',
      effect: () => {
        st.eventDiscountMult = 0.7;
        setTimeout(() => { st.eventDiscountMult = 1.0; }, 60000); // 60 seconds
        return '价格 -30% (60秒)';
      },
      weight: 0.08
    }
  ];

  // Crisis events (random bad events)
  const CRISIS_EVENTS = [
    {
      id: 'crisis_maintenance',
      name: '设备维护',
      description: '部分建筑需要停机维护',
      effect: () => {
        const loss = Math.floor(st.gps * 30); // 30 seconds of GPS
        st.gears = Math.max(0, st.gears - loss);
        return `-${loss} gears (维护费用)`;
      },
      weight: 0.05
    },
    {
      id: 'crisis_theft',
      name: '齿轮失窃',
      description: '一小批齿轮被盗',
      effect: () => {
        const loss = Math.floor(st.gears * 0.05); // 5% of current gears
        st.gears = Math.max(0, st.gears - loss);
        return `-${loss} gears (被盗)`;
      },
      weight: 0.03
    }
  ];

  // Initialize event state
  const initEventState = () => {
    if (!st.activeEvents) st.activeEvents = [];
    if (!st.completedQuests) st.completedQuests = [];
    if (!st.eventBonusMult) st.eventBonusMult = 1.0;
    if (!st.eventDiscountMult) st.eventDiscountMult = 1.0;
    if (!st.questCheckTimer) st.questCheckTimer = 0;
  };

  // Check and complete quests
  const checkQuests = () => {
    let newCompleted = false;
    QUESTS.forEach(quest => {
      if (!quest.completed && quest.condition()) {
        quest.completed = true;
        quest.reward();
        st.completedQuests.push(quest.id);
        pushLog(`🎯 任务完成: ${quest.name} - ${quest.rewardText}`);
        sfxSuccess();
        newCompleted = true;
      }
    });
    if (newCompleted) {
      dirty.quests = true;
      dirty.gears = true;
    }
  };

  // Roll random bonus/crisis event
  const rollRandomEvent = () => {
    const roll = Math.random();
    if (roll < 0.001) { // 0.1% chance per tick
      const isBonus = Math.random() < 0.7; // 70% chance for good event
      const events = isBonus ? BONUS_EVENTS : CRISIS_EVENTS;
      const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);
      let randomWeight = Math.random() * totalWeight;

      for (const event of events) {
        randomWeight -= event.weight;
        if (randomWeight <= 0) {
          const result = event.effect();
          const icon = isBonus ? '🎁' : '⚠️';
          pushLog(`${icon} ${event.name}: ${result}`);
          if (isBonus) sfxSuccess(); else sfxFail();
          dirty.gears = true;
          eventBus.emit(isBonus ? 'event:bonus' : 'event:crisis', { eventId: event.id });
          break;
        }
      }
    }
  };

  // Milestone events (one-time achievements)
  const checkMilestones = () => {
    const milestones = [
      { id: 'm_1k', condition: () => st.lifetimeGears >= 1000, msg: '🏆 累计获得 1k gears!' },
      { id: 'm_10k', condition: () => st.lifetimeGears >= 10000, msg: '🏆 累计获得 10k gears!' },
      { id: 'm_100k', condition: () => st.lifetimeGears >= 100000, msg: '🏆 累计获得 100k gears!' },
      { id: 'm_1m', condition: () => st.lifetimeGears >= 1000000, msg: '🏆 累计获得 1M gears!' },
    ];

    milestones.forEach(m => {
      if (!st.completedMilestones) st.completedMilestones = [];
      if (!st.completedMilestones.includes(m.id) && m.condition()) {
        st.completedMilestones.push(m.id);
        pushLog(m.msg);
        sfxSuccess();
      }
    });
  };

  // Main tick function
  const tick = (dt) => {
    initEventState();

    // Check quests every second
    st.questCheckTimer += dt;
    if (st.questCheckTimer >= 1) {
      checkQuests();
      st.questCheckTimer = 0;
    }

    // Roll random events
    rollRandomEvent();

    // Check milestones
    checkMilestones();
  };

  // Get active quest list
  const getActiveQuests = () => {
    return QUESTS.filter(q => !q.completed);
  };

  // Get completed quest count
  const getCompletedQuestCount = () => {
    return (st.completedQuests || []).length;
  };

  initEventState();

  return {
    tick,
    getActiveQuests,
    getCompletedQuestCount,
    checkQuests,
    EVENT_TYPES
  };
};

module.exports = { createEventSystem };
