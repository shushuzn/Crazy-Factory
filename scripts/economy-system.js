    // ════════════════════════════════════════════════
    // ⑨ 经济/解锁工具函数（生产层，独立于 DOM）
    // 为什么拆分：后续做数值平衡时可只改本文件，不污染渲染与输入逻辑。
    // ════════════════════════════════════════════════
    const bld      = (id) => buildings.find(b=>b.id===id);
    const skillLv  = (id) => skills.find(s=>s.id===id)?.level||0;
    const discount = ()   => Math.max(0.6, 1 - skillLv("bulk_discount")*0.04);
    const price    = (b,off=0) => Math.floor(b.basePrice * Math.pow(PRICE_GROWTH, b.owned+off) * discount());

    // 建筑产出：基础 dps × 专属倍率
    const bldGPS   = (b) => b.dps * b.owned * (bldBoost[b.id]||1);
    const baseGPS  = ()  => buildings.reduce((s,b)=>s+bldGPS(b),0);
    const resMult  = ()  => 1 + st.researchPoints * 0.1;
    const skillGPS = ()  => 1 + skillLv("line_optimizer")*0.25;
    const mktMult  = ()  => {
      const base = st.marketIsBull ? MARKET_BULL_BONUS : MARKET_BEAR_PENALTY;
      return st.marketIsBull ? base*(1+skillLv("market_sense")*0.1) : base;
    };
    const getTotalGPS  = () => baseGPS() * st.gpsMultiplier * resMult() * skillGPS() * mktMult();
    const getManualGain= () => st.manualPower * st.manualMult * (1+skillLv("manual_mastery")*0.3);

    // 批量购买计算
    const affordableCount = (b,budget,mode) => {
      if (mode==="1") return budget>=price(b)?1:0;
      if (mode==="10"||mode==="100") {
        const tgt=Number(mode); let tot=0;
        for (let i=0;i<tgt;i++){tot+=price(b,i);if(tot>budget)return i;}
        return tgt;
      }
      let n=0,tot=0;
      while(n<10000){tot+=price(b,n);if(tot>budget)return n;n++;}
      return n;
    };
    const purchaseCost = (b,n) => { let c=0; for(let i=0;i<n;i++) c+=price(b,i); return c; };

    // 数值格式化（UI 与日志共用，统一输出风格）
    const fmt = (n) => {
      if (!Number.isFinite(n)) return "¥0";
      const abs=Math.abs(n), sg=n<0?"-":"";
      if(abs>=1e12) return `${sg}¥${(abs/1e12).toFixed(2)}T`;
      if(abs>=1e9)  return `${sg}¥${(abs/1e9).toFixed(2)}B`;
      if(abs>=1e6)  return `${sg}¥${(abs/1e6).toFixed(2)}M`;
      if(abs>=1e3)  return `${sg}¥${(abs/1e3).toFixed(2)}K`;
      return `${sg}¥${abs.toLocaleString("zh-CN",{maximumFractionDigits:1})}`;
    };

    // 解锁条件检查
    const upgradeLockedReason = (u) => {
      if(st.researchPoints<u.unlockRP) return `需要 ${u.unlockRP} RP`;
      if(u.requires){ const r=upgrades.find(x=>x.id===u.requires); if(r&&!r.purchased) return `前置：${r.name}`; }
      if(u.type==="bldBoost"){
        const b=bld(u.value.id);
        if(b&&st.lifetimeGears<b.unlock) return `解锁「${b.name}」后可用`;
      }
      return "";
    };
    const isBldUnlocked = (b) => st.lifetimeGears >= b.unlock;
