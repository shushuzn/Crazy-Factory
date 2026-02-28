/**
 * 邀请好友系统 (Invite System) - P5-T4
 * 
 * 功能：病毒式传播机制，获取新用户
 * 机制：
 * 1. 每个用户有唯一邀请码
 * 2. 通过 URL 参数传递邀请关系 (?invite=CODE)
 * 3. 被邀请人达到一定游戏进度时，双方获得奖励
 * 4. 本地存储邀请关系（隐私优先，不上传服务器）
 */

const createInviteSystem = ({
  st,
  I18N,
  eventBus,
  pushLog,
  saveGame,
  onInviteSuccess = null,
}) => {
  const INVITE_KEY = 'inviteData';
  const USER_CODE_KEY = 'userInviteCode';

  // 获取当前语言
  const getLang = () => (typeof I18N !== 'undefined' ? I18N.getCurrentLang() : 'zh');

  // 生成唯一邀请码
  const generateInviteCode = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${timestamp}${random}`.toUpperCase();
  };

  // 获取或创建用户邀请码
  const getUserCode = () => {
    let code = localStorage.getItem(USER_CODE_KEY);
    if (!code) {
      code = generateInviteCode();
      localStorage.setItem(USER_CODE_KEY, code);
    }
    return code;
  };

  // 获取邀请数据
  const getInviteData = () => {
    const saved = localStorage.getItem(INVITE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      version: 1,
      userCode: getUserCode(),
      invitedBy: null, // { code, date }
      invitedFriends: [], // [{ code, date, progress, rewarded }]
      totalRewards: { gears: 0, rp: 0 },
    };
  };

  // 保存邀请数据
  const saveInviteData = (data) => {
    localStorage.setItem(INVITE_KEY, JSON.stringify(data));
  };

  // 检查 URL 参数中的邀请码
  const checkUrlInvite = () => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');

    if (inviteCode && inviteCode !== getUserCode()) {
      const data = getInviteData();

      // 如果还没有被邀请记录
      if (!data.invitedBy) {
        data.invitedBy = {
          code: inviteCode,
          date: new Date().toISOString(),
        };
        saveInviteData(data);

        const lang = getLang();
        const msg = lang === 'en'
          ? `🎉 Welcome! You've been invited by friend ${inviteCode.substring(0, 8)}...`
          : `🎉 欢迎！你已被好友 ${inviteCode.substring(0, 8)}... 邀请`;
        pushLog(msg);

        // 新用户奖励
        const welcomeBonus = 1000;
        st.gears += welcomeBonus;
        st.lifetimeGears += welcomeBonus;
        pushLog(lang === 'en' ? `🎁 Welcome bonus: ${welcomeBonus} gears` : `🎁 新手邀请奖励: ${welcomeBonus} 资本`);
        saveGame();

        return true;
      }
    }
    return false;
  };

  // 生成邀请链接
  const generateInviteLink = () => {
    const code = getUserCode();
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?invite=${code}`;
  };

  // 复制邀请链接到剪贴板
  const copyInviteLink = async () => {
    const link = generateInviteLink();
    try {
      await navigator.clipboard.writeText(link);
      const lang = getLang();
      pushLog(lang === 'en' ? '📋 Invite link copied!' : '📋 邀请链接已复制！');
      return true;
    } catch {
      // 降级方案：显示提示
      const lang = getLang();
      prompt(lang === 'en' ? 'Copy this invite link:' : '复制以下邀请链接：', link);
      return false;
    }
  };

  // 检查被邀请人的进度并发放奖励
  const checkInvitedProgress = () => {
    const data = getInviteData();
    const lang = getLang();

    // 检查每个被邀请的朋友
    data.invitedFriends.forEach(friend => {
      if (friend.rewarded) return;

      // 检查是否达到奖励条件
      // 条件：历史资本 >= 10,000
      const hasProgress = checkFriendProgress(friend.code);

      if (hasProgress) {
        // 发放邀请人奖励
        const rewardGears = 2000;
        const rewardRP = 2;

        st.gears += rewardGears;
        st.lifetimeGears += rewardGears;
        st.researchPoints += rewardRP;

        friend.rewarded = true;
        friend.rewardDate = new Date().toISOString();
        data.totalRewards.gears += rewardGears;
        data.totalRewards.rp += rewardRP;

        saveInviteData(data);
        saveGame();

        const msg = lang === 'en'
          ? `🎉 Friend progress reward! +${rewardGears} gears, +${rewardRP} RP`
          : `🎉 好友进度奖励！+${rewardGears} 资本, +${rewardRP} RP`;
        pushLog(msg);

        if (onInviteSuccess) {
          onInviteSuccess({ friend, rewardGears, rewardRP });
        }
      }
    });
  };

  // 检查朋友进度（模拟 - 实际应该由朋友的数据决定）
  // 这里简化处理：如果被邀请人在同一设备上玩过，可以从其存档推断
  const checkFriendProgress = (friendCode) => {
    // 简化：检查是否该邀请码对应的用户有存档数据
    // 实际场景中，这需要后端支持或跨设备同步
    // 这里仅作演示，返回 false
    return false;
  };

  // 记录被邀请人（当本设备有新用户通过邀请码进入时）
  const recordInvitedFriend = (friendCode) => {
    const data = getInviteData();

    // 检查是否已存在
    const exists = data.invitedFriends.find(f => f.code === friendCode);
    if (!exists) {
      data.invitedFriends.push({
        code: friendCode,
        date: new Date().toISOString(),
        progress: 0,
        rewarded: false,
      });
      saveInviteData(data);
    }
  };

  // 渲染邀请面板
  const renderInvitePanel = () => {
    const data = getInviteData();
    const lang = getLang();
    const link = generateInviteLink();

    const titles = {
      zh: {
        title: '🎁 邀请好友',
        subtitle: '分享获得奖励',
        yourCode: '你的邀请码',
        invitedCount: '已邀请好友',
        totalRewards: '累计获得奖励',
        copyBtn: '复制邀请链接',
        inviteInfo: '好友通过你的链接进入游戏，双方都能获得奖励！',
        newUserBonus: '新用户奖励: 1000 资本',
        progressBonus: '好友达到 1万 资本时，你获得: 2000 资本 + 2 RP',
      },
      en: {
        title: '🎁 Invite Friends',
        subtitle: 'Share & Earn Rewards',
        yourCode: 'Your Invite Code',
        invitedCount: 'Friends Invited',
        totalRewards: 'Total Rewards',
        copyBtn: 'Copy Invite Link',
        inviteInfo: 'Friends join via your link, both get rewards!',
        newUserBonus: 'New user bonus: 1000 gears',
        progressBonus: 'When friend reaches 10K: 2000 gears + 2 RP for you',
      },
    }[lang];

    const invitedCount = data.invitedFriends.length;
    const totalGears = data.totalRewards.gears;
    const totalRP = data.totalRewards.rp;

    return `
      <div class="invite-panel" style="background: linear-gradient(135deg, rgba(245,158,11,0.9) 0%, rgba(217,119,6,0.9) 100%); border-radius: 12px; padding: 16px; color: white; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 600;">${titles.title}</h3>
          <span style="font-size: 11px; opacity: 0.8;">${titles.subtitle}</span>
        </div>

        <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">${titles.yourCode}</div>
          <div style="font-size: 18px; font-weight: bold; letter-spacing: 2px; font-family: monospace;">${data.userCode.substring(0, 12)}...</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 20px; font-weight: bold;">${invitedCount}</div>
            <div style="font-size: 10px; opacity: 0.8;">${titles.invitedCount}</div>
          </div>
          <div style="background: rgba(255,255,255,0.1); border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 20px; font-weight: bold;">${totalGears > 0 || totalRP > 0 ? '✓' : '-'}</div>
            <div style="font-size: 10px; opacity: 0.8;">${titles.totalRewards}</div>
          </div>
        </div>

        <button id="copyInviteLinkBtn" style="width: 100%; padding: 10px; background: white; color: #d97706; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">
          📋 ${titles.copyBtn}
        </button>

        <div style="font-size: 11px; opacity: 0.9; line-height: 1.5;">
          <div style="margin-bottom: 4px;">• ${titles.newUserBonus}</div>
          <div>• ${titles.progressBonus}</div>
        </div>

        ${data.invitedBy ? `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; opacity: 0.8;">
            ${lang === 'en' ? 'You were invited by:' : '你被好友邀请：'} ${data.invitedBy.code.substring(0, 12)}...
          </div>
        ` : ''}
      </div>
    `;
  };

  // 绑定按钮事件
  const bindInviteButtons = (container) => {
    const btn = container.querySelector('#copyInviteLinkBtn');
    if (btn) {
      btn.addEventListener('click', copyInviteLink);
    }
  };

  // 初始化
  const init = () => {
    // 检查 URL 邀请参数
    const isNewInvite = checkUrlInvite();

    // 定期检查和发放奖励（每60秒）
    if (!isNewInvite) {
      setInterval(() => {
        checkInvitedProgress();
      }, 60000);

      // 立即检查一次
      checkInvitedProgress();
    }
  };

  // 获取邀请统计
  const getInviteStats = () => {
    const data = getInviteData();
    return {
      userCode: data.userCode,
      invitedCount: data.invitedFriends.length,
      invitedBy: data.invitedBy,
      totalRewards: data.totalRewards,
    };
  };

  // 重置数据
  const resetData = () => {
    localStorage.removeItem(INVITE_KEY);
    localStorage.removeItem(USER_CODE_KEY);
  };

  return {
    init,
    getUserCode,
    generateInviteLink,
    copyInviteLink,
    renderInvitePanel,
    bindInviteButtons,
    getInviteStats,
    checkUrlInvite,
    resetData,
  };
};

// 模块导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createInviteSystem };
}
