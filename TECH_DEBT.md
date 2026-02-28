# 技术债务记录 (Technical Debt)

## 本轮迭代 (2026-02-28)

### 1. growth_momentum 评分算法优化
**位置**: `tools/autotune/score.js`

**问题**: 
- 当前使用 `final_prod / initial_prod` 比值计算增长动力
- 公式: `log10(max(1, meanFinalProd)) / log10(max(1, initialProd * 1000))`
- 分母固定乘以 1000 是魔法数字，缺乏理论依据

**技术债务**: 
- 需要更科学的增长度量方法
- 考虑 prestige 周期的分段增长计算
- 考虑时间加权（早期增长 vs 晚期增长）

**优先级**: 中

---

### 2. return_quality 与 growth_momentum 权衡
**位置**: `tools/autotune/score.js`

**问题**:
- 当前 top1 参数 return_quality 仅 4.1%（过低）
- growth_momentum 83.5% 但 return_quality 损失严重
- 权重配置可能不合理

**技术债务**:
- 需要调整权重或引入帕累托前沿选择
- 考虑多目标优化而非单目标
- 定义可接受的权衡边界

**优先级**: 高

---

### 3. 搜索空间边界依赖
**位置**: `balance/search_space.json`

**问题**:
- top1 参数触及多个边界（reward_scale=1.8 max, reward_exp=1.35 max）
- 可能遗漏边界外的更优解

**技术债务**:
- 需要动态扩展搜索空间机制
- 或基于梯度信息调整搜索范围

**优先级**: 低

---

### 4. 模拟器现实性
**位置**: `tools/autotune/simulate.js`

**问题**:
- 离线收益模拟可能过于简化
- 未考虑玩家实际行为模式（如睡眠周期）
- prestige 触发条件可能过于理想化

**技术债务**:
- 引入更真实的玩家行为模型
- 考虑不同玩家类型的模拟（活跃/ casual）

**优先级**: 中

---

### 5. 测试覆盖不足
**位置**: `tests/`

**问题**:
- 缺少对 score.js 的单元测试
- 缺少对模拟结果的回归测试
- 缺少对参数收敛性的验证

**技术债务**:
- 添加 score.js 单元测试
- 添加基准测试结果快照
- 添加参数变化敏感度分析

**优先级**: 高

---

## 偿还计划

### 短期（下次迭代）
1. 调整评分权重，平衡 growth 与 return
2. 添加 score.js 基础测试

### 中期（未来3轮）
3. 优化 growth_momentum 计算算法
4. 扩展测试覆盖

### 长期（硬ening阶段）
5. 改进模拟器现实性
6. 实现动态搜索空间

---

## 债务指标
- **当前 North Star**: 59.1%
- **技术债务风险**: 中等（算法有优化空间但功能正常）
- **建议 Mode**: 继续 Optimization，但优先偿还高优先级债务
