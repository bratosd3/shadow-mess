/* ═══════════════════════════════════════════════════════════
   Shadow Message — Discord Style — App Logic & Customization
   ═══════════════════════════════════════════════════════════ */
'use strict';

// ── State ────────────────────────────────────────────────
const AppState = {
  activeServer: 'home',
  activeChannel: 'general',
  mobileView: 'chat',   // servers | channels | chat | members | profile
  membersVisible: true,
  customizeOpen: false,
  settings: {
    theme: 'dark',
    accent: '#6c5ce7',
    font: 'inter',
    fontSize: 14,
    animUI: true,
    animMessages: true,
    animTransitions: true,
    animBlur: true,
    animSpeed: 1,        // 0=off, 1=normal, 2=fast, 3=slow
    compactMode: false,
    largeEmoji: true,
    groupMessages: true,
    showAvatars: true,
    wallpaper: 'none',
  },
};

const isMobile = () => window.innerWidth <= 768;

// ── DOM Helpers ──────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const $id = (id) => document.getElementById(id);

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initServerList();
  initChannelList();
  initChat();
  initMembers();
  initCustomize();
  initMobileNav();
  initMobileGestures();

  // Apply saved settings on load
  applyAllSettings();
});

// ═══════════════════════════════════════════════════════════
// SERVER LIST
// ═══════════════════════════════════════════════════════════
function initServerList() {
  $$('.server-item[data-server]').forEach(item => {
    item.addEventListener('click', () => {
      $$('.server-item').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      $id('home-server').classList.remove('active');
      AppState.activeServer = item.dataset.server;

      // Update UI
      const name = item.getAttribute('title') || item.dataset.server;
      if ($id('server-name')) $id('server-name').textContent = name;

      showToast(`Сервер: ${name}`);

      // Mobile: show channels
      if (isMobile()) showMobilePanel('channels');
    });
  });

  $id('home-server').addEventListener('click', () => {
    $$('.server-item').forEach(s => s.classList.remove('active'));
    $id('home-server').classList.add('active');
    AppState.activeServer = 'home';
    if ($id('server-name')) $id('server-name').textContent = 'Shadow Message';

    if (isMobile()) showMobilePanel('channels');
  });

  // Add / Explore
  $id('add-server-btn')?.addEventListener('click', () => showToast('Создание сервера (демо)'));
  $id('explore-btn')?.addEventListener('click', () => showToast('Обзор серверов (демо)'));
}

// ═══════════════════════════════════════════════════════════
// CHANNEL LIST
// ═══════════════════════════════════════════════════════════
function initChannelList() {
  // Channel selection
  $$('.channel-item').forEach(item => {
    item.addEventListener('click', () => {
      $$('.channel-item').forEach(c => c.classList.remove('active'));
      item.classList.add('active');
      AppState.activeChannel = item.dataset.channel;

      const name = item.querySelector('.channel-name')?.textContent || '';
      const headerName = $('.chat-header-name');
      if (headerName) headerName.textContent = name;

      const input = $id('msg-input');
      if (input) input.placeholder = `Написать в #${name}`;

      // Mobile: show chat
      if (isMobile()) showMobilePanel('chat');
    });
  });

  // Category collapse
  $$('.category-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.category-add-btn')) return;
      const collapsed = header.dataset.collapsed === 'true';
      header.dataset.collapsed = (!collapsed).toString();
      const channels = header.nextElementSibling;
      if (channels) channels.style.display = collapsed ? '' : 'none';
    });
  });

  // Search
  $id('channel-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    $$('.channel-item').forEach(item => {
      const name = item.querySelector('.channel-name')?.textContent?.toLowerCase() || '';
      item.style.display = name.includes(query) ? '' : 'none';
    });
  });
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════
function initChat() {
  // Auto-resize textarea
  const input = $id('msg-input');
  if (input) {
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDemoMessage(input.value.trim());
        input.value = '';
        input.style.height = 'auto';
      }
    });
  }

  // Scroll to bottom
  const container = $id('messages-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }

  // Mobile menu button
  $id('mobile-menu-btn')?.addEventListener('click', () => {
    showMobilePanel('channels');
  });

  // Toggle members
  $id('toggle-members-btn')?.addEventListener('click', () => {
    if (isMobile()) {
      showMobilePanel('members');
    } else {
      const panel = $id('members-panel');
      if (panel) {
        panel.classList.toggle('hidden');
        AppState.membersVisible = !panel.classList.contains('hidden');
        // Adjust grid
        const app = $('.app-container');
        if (app) {
          app.style.gridTemplateColumns = AppState.membersVisible
            ? `var(--server-w) var(--channel-w) 1fr var(--members-w)`
            : `var(--server-w) var(--channel-w) 1fr`;
        }
      }
    }
  });
}

function sendDemoMessage(text) {
  if (!text) return;
  const container = $id('messages-container');
  const typing = container?.querySelector('.typing-area');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = 'message-group';
  msg.innerHTML = `
    <div class="message-avatar" style="background: linear-gradient(135deg, #6c5ce7, #a29bfe);">SM</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author" style="color: #a29bfe;">Shadow User</span>
        <span class="message-time">${new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</span>
      </div>
      <div class="message-text">${escapeHtml(text)}</div>
    </div>
  `;

  if (typing) container.insertBefore(msg, typing);
  else container.appendChild(msg);

  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════════════════════
function initMembers() {
  $$('.member-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.querySelector('.member-name')?.textContent || 'Пользователь';
      showToast(`Профиль: ${name}`);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// CUSTOMIZATION PANEL
// ═══════════════════════════════════════════════════════════
function initCustomize() {
  const panel = $id('customize-panel');
  const overlay = $id('customize-overlay');

  // Open
  $id('customize-btn')?.addEventListener('click', () => toggleCustomize());
  $id('user-settings-btn')?.addEventListener('click', () => toggleCustomize());

  // Close
  $id('customize-close')?.addEventListener('click', () => toggleCustomize(false));
  overlay?.addEventListener('click', () => toggleCustomize(false));

  // ── Themes ──
  $$('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      $$('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      AppState.settings.theme = card.dataset.theme;
      applyTheme();
      saveSettings();
    });
  });

  // ── Accent colors ──
  $$('.accent-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      $$('.accent-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      AppState.settings.accent = dot.dataset.accent;
      applyAccent();
      saveSettings();
    });
  });

  $id('custom-accent-color')?.addEventListener('input', (e) => {
    $$('.accent-dot').forEach(d => d.classList.remove('active'));
    AppState.settings.accent = e.target.value;
    applyAccent();
    saveSettings();
  });

  // ── Fonts ──
  $$('.font-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.font-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      AppState.settings.font = opt.dataset.font;
      applyFont();
      saveSettings();
    });
  });

  $id('font-size-slider')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    AppState.settings.fontSize = val;
    $id('font-size-val').textContent = val + 'px';
    applyFontSize();
    saveSettings();
  });

  // ── Animations ──
  $id('anim-ui')?.addEventListener('change', (e) => {
    AppState.settings.animUI = e.target.checked;
    applyAnimations();
    saveSettings();
  });
  $id('anim-messages')?.addEventListener('change', (e) => {
    AppState.settings.animMessages = e.target.checked;
    saveSettings();
  });
  $id('anim-transitions')?.addEventListener('change', (e) => {
    AppState.settings.animTransitions = e.target.checked;
    applyAnimations();
    saveSettings();
  });
  $id('anim-blur')?.addEventListener('change', (e) => {
    AppState.settings.animBlur = e.target.checked;
    applyBlur();
    saveSettings();
  });
  $id('anim-speed')?.addEventListener('input', (e) => {
    const speeds = ['Выкл', 'Normal', 'Fast', 'Slow'];
    const val = parseInt(e.target.value);
    AppState.settings.animSpeed = val;
    $id('anim-speed-val').textContent = speeds[val];
    applyAnimationSpeed();
    saveSettings();
  });

  // ── Display toggles ──
  $id('compact-mode')?.addEventListener('change', (e) => {
    AppState.settings.compactMode = e.target.checked;
    applyCompact();
    saveSettings();
  });
  $id('large-emoji')?.addEventListener('change', (e) => {
    AppState.settings.largeEmoji = e.target.checked;
    saveSettings();
  });
  $id('group-messages')?.addEventListener('change', (e) => {
    AppState.settings.groupMessages = e.target.checked;
    saveSettings();
  });
  $id('show-avatars')?.addEventListener('change', (e) => {
    AppState.settings.showAvatars = e.target.checked;
    applyAvatarVisibility();
    saveSettings();
  });

  // ── Wallpapers ──
  $$('.wallpaper-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.wallpaper-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      AppState.settings.wallpaper = opt.dataset.wp;
      applyWallpaper();
      saveSettings();
    });
  });

  // ── Reset ──
  $id('reset-customization')?.addEventListener('click', () => {
    if (confirm('Сбросить все настройки кастомизации?')) {
      AppState.settings = {
        theme: 'dark', accent: '#6c5ce7', font: 'inter', fontSize: 14,
        animUI: true, animMessages: true, animTransitions: true, animBlur: true, animSpeed: 1,
        compactMode: false, largeEmoji: true, groupMessages: true, showAvatars: true, wallpaper: 'none',
      };
      applyAllSettings();
      syncCustomizeUI();
      saveSettings();
      showToast('Настройки сброшены', 'success');
    }
  });
}

function toggleCustomize(forceState) {
  const panel = $id('customize-panel');
  const overlay = $id('customize-overlay');
  const open = forceState !== undefined ? forceState : !AppState.customizeOpen;
  AppState.customizeOpen = open;

  if (open) {
    overlay?.classList.remove('hidden');
    panel?.classList.add('open');
    syncCustomizeUI();
  } else {
    overlay?.classList.add('hidden');
    panel?.classList.remove('open');
  }
}

// Sync UI controls with current settings
function syncCustomizeUI() {
  const s = AppState.settings;

  // Theme
  $$('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === s.theme));
  // Accent
  $$('.accent-dot').forEach(d => d.classList.toggle('active', d.dataset.accent === s.accent));
  const colorInput = $id('custom-accent-color');
  if (colorInput) colorInput.value = s.accent;
  // Font
  $$('.font-option').forEach(o => o.classList.toggle('active', o.dataset.font === s.font));
  const fontSlider = $id('font-size-slider');
  if (fontSlider) fontSlider.value = s.fontSize;
  const fontLabel = $id('font-size-val');
  if (fontLabel) fontLabel.textContent = s.fontSize + 'px';
  // Animations
  const setCheck = (id, val) => { const el = $id(id); if (el) el.checked = val; };
  setCheck('anim-ui', s.animUI);
  setCheck('anim-messages', s.animMessages);
  setCheck('anim-transitions', s.animTransitions);
  setCheck('anim-blur', s.animBlur);
  const speedSlider = $id('anim-speed');
  if (speedSlider) speedSlider.value = s.animSpeed;
  const speedLabel = $id('anim-speed-val');
  if (speedLabel) speedLabel.textContent = ['Выкл', 'Normal', 'Fast', 'Slow'][s.animSpeed];
  // Display
  setCheck('compact-mode', s.compactMode);
  setCheck('large-emoji', s.largeEmoji);
  setCheck('group-messages', s.groupMessages);
  setCheck('show-avatars', s.showAvatars);
  // Wallpaper
  $$('.wallpaper-opt').forEach(o => o.classList.toggle('active', o.dataset.wp === s.wallpaper));
}

// ═══════════════════════════════════════════════════════════
// APPLY SETTINGS
// ═══════════════════════════════════════════════════════════
function applyAllSettings() {
  applyTheme();
  applyAccent();
  applyFont();
  applyFontSize();
  applyAnimations();
  applyBlur();
  applyAnimationSpeed();
  applyCompact();
  applyAvatarVisibility();
  applyWallpaper();
}

function applyTheme() {
  document.body.setAttribute('data-theme', AppState.settings.theme);
}

function applyAccent() {
  const color = AppState.settings.accent;
  document.documentElement.style.setProperty('--accent', color);
  // Compute lighter/hover variants
  document.documentElement.style.setProperty('--accent-light', color + '18');
  document.documentElement.style.setProperty('--accent-glow', color + '33');
  document.documentElement.style.setProperty('--gradient', `linear-gradient(135deg, ${color}, ${lightenColor(color, 30)})`);

  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = color;
}

function applyFont() {
  document.body.setAttribute('data-font', AppState.settings.font);
}

function applyFontSize() {
  document.documentElement.style.setProperty('--font-size', AppState.settings.fontSize + 'px');
}

function applyAnimations() {
  if (!AppState.settings.animUI) {
    document.body.classList.add('no-animations');
  } else {
    document.body.classList.remove('no-animations');
  }
}

function applyBlur() {
  if (AppState.settings.animBlur) {
    document.documentElement.style.setProperty('--blur', 'blur(20px)');
  } else {
    document.documentElement.style.setProperty('--blur', 'none');
  }
}

function applyAnimationSpeed() {
  const speeds = { 0: '0s', 1: '.2s', 2: '.1s', 3: '.5s' };
  const speed = speeds[AppState.settings.animSpeed] || '.2s';
  document.documentElement.style.setProperty('--transition', `${speed} ease`);
  document.documentElement.style.setProperty('--transition-fast', `${parseFloat(speed) * 0.6}s ease`);
  document.documentElement.style.setProperty('--spring', `${parseFloat(speed) * 1.5}s cubic-bezier(.34,1.56,.64,1)`);
}

function applyCompact() {
  document.body.classList.toggle('compact-mode', AppState.settings.compactMode);
}

function applyAvatarVisibility() {
  $$('.message-avatar').forEach(a => {
    a.style.display = AppState.settings.showAvatars ? '' : 'none';
  });
}

function applyWallpaper() {
  const container = $id('messages-container');
  if (!container) return;
  container.className = 'messages-container';
  if (AppState.settings.wallpaper !== 'none') {
    container.classList.add('wp-bg-' + AppState.settings.wallpaper);
  }

  // Add CSS for wallpaper backgrounds dynamically
  let style = $id('wp-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'wp-style';
    document.head.appendChild(style);
  }
  style.textContent = `
    .wp-bg-dots {
      background-image: radial-gradient(circle, var(--border-strong) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .wp-bg-grid {
      background-image: linear-gradient(var(--border) 1px, transparent 1px),
                         linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .wp-bg-gradient {
      background: linear-gradient(180deg, var(--bg-chat), var(--bg-servers)) !important;
    }
  `;
}

// ═══════════════════════════════════════════════════════════
// MOBILE NAVIGATION
// ═══════════════════════════════════════════════════════════
function initMobileNav() {
  $$('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      showMobilePanel(view);
    });
  });
}

function showMobilePanel(view) {
  if (!isMobile()) return;

  AppState.mobileView = view;

  // Update nav active
  $$('.mobile-nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  // Close all panels
  $id('server-list')?.classList.remove('mobile-open');
  $id('channel-panel')?.classList.remove('mobile-open');
  $id('members-panel')?.classList.remove('mobile-open');

  switch (view) {
    case 'servers':
      $id('server-list')?.classList.add('mobile-open');
      break;
    case 'channels':
      $id('channel-panel')?.classList.add('mobile-open');
      break;
    case 'chat':
      // Default view — all panels closed, chat visible
      break;
    case 'members':
      $id('members-panel')?.classList.add('mobile-open');
      break;
    case 'profile':
      toggleCustomize(true);
      break;
  }
}

// ═══════════════════════════════════════════════════════════
// MOBILE GESTURES (Swipe)
// ═══════════════════════════════════════════════════════════
function initMobileGestures() {
  let startX = 0, startY = 0, tracking = false;

  document.addEventListener('touchstart', (e) => {
    if (!isMobile()) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!tracking || !isMobile()) return;
    tracking = false;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;

    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx > 0) {
      // Swipe right — open channels or servers
      if (AppState.mobileView === 'chat') showMobilePanel('channels');
      else if (AppState.mobileView === 'channels') showMobilePanel('servers');
    } else {
      // Swipe left — close panels
      if (AppState.mobileView === 'servers') showMobilePanel('channels');
      else if (AppState.mobileView === 'channels') showMobilePanel('chat');
      else if (AppState.mobileView === 'chat') showMobilePanel('members');
    }
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════
function saveSettings() {
  try {
    localStorage.setItem('shadow_discord_settings', JSON.stringify(AppState.settings));
  } catch (e) { /* storage full or unavailable */ }
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('shadow_discord_settings');
    if (saved) {
      Object.assign(AppState.settings, JSON.parse(saved));
    }
  } catch (e) { /* parse error */ }
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function showToast(text, type = '') {
  const container = $id('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── Window resize handler ────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!isMobile()) {
      // Desktop: reset mobile panels
      $id('server-list')?.classList.remove('mobile-open');
      $id('channel-panel')?.classList.remove('mobile-open');
      $id('members-panel')?.classList.remove('mobile-open');
    }
  }, 200);
});
