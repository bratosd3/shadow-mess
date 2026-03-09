/* ====================================================================
   Shadow Messenger v4.1 — Main App (Vanilla JS SPA)
   ==================================================================== */
'use strict';

/* ── State ──────────────────────────────────────────────────────────── */
const S = {
  token: localStorage.getItem('token'),
  user: null,
  socket: null,
  chats: [],
  messages: [],
  chatId: null,
  chatObj: null,
  friends: [],
  pendingIn: [],
  pendingOut: [],
  typing: {},
  replyTo: null,
  editMsg: null,
  ghostMode: false,
  isMobile: window.innerWidth <= 768,
  deferredInstall: null,
  pushSubscription: null,
  msgPage: 0,
  loadingMore: false,
  hasMore: true,
  ctxMsg: null,
};
window.State = S;

/* ── Helpers ────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);
const hide = el => el?.classList.add('hidden');
const show = el => el?.classList.remove('hidden');

const THEMES = {
  default:  {bg:'#313338',dark:'#1e1f22',sec:'#2b2d31',brand:'#5865f2'},
  midnight: {bg:'#1c2128',dark:'#0d1117',sec:'#161b22',brand:'#58a6ff'},
  forest:   {bg:'#2a3328',dark:'#1a1e1a',sec:'#22291f',brand:'#4caf50'},
  crimson:  {bg:'#30181e',dark:'#1a1013',sec:'#261418',brand:'#e53935'},
  purple:   {bg:'#261a34',dark:'#16101e',sec:'#1e1529',brand:'#9c27b0'},
  ocean:    {bg:'#142844',dark:'#0a1628',sec:'#0f1f36',brand:'#0288d1'},
  sunset:   {bg:'#33201a',dark:'#1a1210',sec:'#261915',brand:'#ff7043'},
  nord:     {bg:'#434c5e',dark:'#2e3440',sec:'#3b4252',brand:'#88c0d0'},
  monokai:  {bg:'#2f302b',dark:'#1e1f1c',sec:'#272822',brand:'#a6e22e'},
  dracula:  {bg:'#2d2f3d',dark:'#21222c',sec:'#282a36',brand:'#bd93f9'},
  solarized:{bg:'#0a3d4a',dark:'#002b36',sec:'#073642',brand:'#2aa198'},
  onedark:  {bg:'#2c313c',dark:'#21252b',sec:'#282c34',brand:'#61afef'},
  gruvbox:  {bg:'#3c3836',dark:'#1d2021',sec:'#282828',brand:'#fabd2f'},
  tokyo:    {bg:'#1e202e',dark:'#16161e',sec:'#1a1b26',brand:'#7aa2f7'},
  material: {bg:'#2c2c2c',dark:'#1a1a1a',sec:'#212121',brand:'#82aaff'},
  catppuccin:{bg:'#302d41',dark:'#1e1e2e',sec:'#24243e',brand:'#cba6f7'},
  light:    {bg:'#ffffff',dark:'#e3e5e8',sec:'#f2f3f5',brand:'#5865f2'}
};

const AVATARS = ['#5865f2','#57f287','#fee75c','#eb459e','#ed4245','#3ba55c','#faa61a','#e67e22','#9b59b6','#1abc9c'];

function avatarHTML(u, cls = '') {
  if (!u) return `<div class="${cls}" style="background:#555">?</div>`;
  const style = `background:${u.avatarColor || u.displayAvatarColor || AVATARS[0]}`;
  const letter = (u.displayName || u.username || '?')[0].toUpperCase();
  if (u.avatar || u.displayAvatar) {
    return `<div class="${cls}" style="${style}">${letter}<img src="${escHTML(u.avatar || u.displayAvatar)}" alt=""></div>`;
  }
  return `<div class="${cls}" style="${style}">${letter}</div>`;
}

function fmtTime(d) {
  const dt = new Date(d);
  return dt.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d) {
  const dt = new Date(d);
  const now = new Date();
  if (dt.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (dt.toDateString() === y.toDateString()) return 'Вчера';
  return dt.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}

function fmtLastSeen(d) {
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
  if (dt.toDateString() === now.toDateString()) return `сегодня в ${fmtTime(d)}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (dt.toDateString() === y.toDateString()) return `вчера в ${fmtTime(d)}`;
  return dt.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) + ` в ${fmtTime(d)}`;
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escHTML(s) {
  if (!s) return '';
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function linkify(text) {
  return escHTML(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

/* ── Toast ──────────────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}
window.showToast = showToast;

/* ── Broken avatar image fallback ──────────────────────────────────── */
document.addEventListener('error', e => {
  if (e.target.tagName !== 'IMG') return;
  const p = e.target.parentElement;
  if (p && p.matches('.ci-avatar,.msg-av,.avatar-sm,.avatar-lg,.avatar-xl,.m-avatar,.ct-avatar,.sb-user,.s-profile-av,.vk-call-avatar,.incoming-avatar,.call-mini-avatar')) {
    e.target.style.display = 'none';
  }
}, true);

/* ── API ────────────────────────────────────────────────────────────── */
function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
}

async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

/* ── Sounds (Web Audio generated) ──────────────────────────────────── */
const Sounds = {
  _ctx: null,
  _playing: {},
  _getCtx() { if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)(); return this._ctx; },
  _beep(freq, dur, vol = 0.15) {
    const ctx = this._getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + dur);
  },
  message() {
    if (!S.user?.settings?.soundEnabled) return;
    const freq = this._getSoundFreq();
    this._playNotifSound(freq);
  },
  _getSoundFreq() {
    const sid = S.user?.settings?.notifSound || 'default';
    const s = (typeof NOTIF_SOUNDS !== 'undefined') && NOTIF_SOUNDS.find(x => x.id === sid);
    return s ? s.freq : 800;
  },
  _playNotifSound(baseFreq) {
    try {
      const ctx = this._getCtx();
      const now = ctx.currentTime;
      // Pleasant two-tone chime with fade
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();
      osc1.type = 'sine'; osc1.frequency.value = baseFreq;
      osc2.type = 'sine'; osc2.frequency.value = baseFreq * 1.5;
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.1, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc1.start(now); osc1.stop(now + 0.3);
      osc2.start(now + 0.06); osc2.stop(now + 0.35);
    } catch {}
  },
  callEnd() { this._beep(400, 0.15); setTimeout(() => this._beep(300, 0.15), 180); },
  _ringInterval: null,
  _ringTimeouts: [],
  ringStart() {
    this.ringStop();
    const ring = () => {
      this._beep(523, 0.2, 0.2);
      this._ringTimeouts.push(setTimeout(() => this._beep(659, 0.2, 0.2), 250));
      this._ringTimeouts.push(setTimeout(() => this._beep(784, 0.3, 0.2), 500));
    };
    ring();
    this._ringInterval = setInterval(ring, 2000);
  },
  ringStop() {
    if (this._ringInterval) { clearInterval(this._ringInterval); this._ringInterval = null; }
    this._ringTimeouts.forEach(t => clearTimeout(t));
    this._ringTimeouts = [];
  },
  _incomingInterval: null,
  _incomingTimeouts: [],
  incomingStart() {
    this.incomingStop();
    const ring = () => {
      this._beep(784, 0.15, 0.25);
      this._incomingTimeouts.push(setTimeout(() => this._beep(659, 0.15, 0.25), 200));
      this._incomingTimeouts.push(setTimeout(() => this._beep(784, 0.15, 0.25), 400));
    };
    ring();
    this._incomingInterval = setInterval(ring, 1500);
  },
  incomingStop() {
    if (this._incomingInterval) { clearInterval(this._incomingInterval); this._incomingInterval = null; }
    this._incomingTimeouts.forEach(t => clearTimeout(t));
    this._incomingTimeouts = [];
  },
};

/* ══════════════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════════════ */
function initAuth() {
  const loginForm = $('login-form'), regForm = $('register-form');
  $('to-register').onclick = () => { hide(loginForm); show(regForm); hide($('to-register')); show($('to-login')); $('auth-subtitle').textContent = 'Создайте аккаунт'; };
  $('to-login').onclick = () => { show(loginForm); hide(regForm); show($('to-register')); hide($('to-login')); $('auth-subtitle').textContent = 'Войдите, чтобы продолжить'; };

  // Load download links for auth page buttons
  fetch('/api/download-links').then(r => r.json()).then(d => {
    if (d.android) $('dl-android-btn').href = d.android;
    if (d.windows) $('dl-windows-btn').href = d.windows;
  }).catch(() => {});

  loginForm.onsubmit = async e => {
    e.preventDefault();
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('login-username').value.trim(), password: $('login-password').value }) });
      S.token = data.token; S.user = data.user;
      localStorage.setItem('token', data.token);
      boot();
    } catch (err) { showToast(err.message, 'error'); }
  };

  regForm.onsubmit = async e => {
    e.preventDefault();
    try {
      const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: $('reg-username').value.trim(), displayName: $('reg-displayname').value.trim() || $('reg-username').value.trim(), password: $('reg-password').value }) });
      S.token = data.token; S.user = data.user;
      localStorage.setItem('token', data.token);
      boot();
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Demo mode button
  const demoBtn = $('btn-demo');
  if (demoBtn) demoBtn.onclick = async () => {
    try {
      demoBtn.disabled = true;
      demoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание демо...';
      const data = await api('/api/demo', { method: 'POST' });
      S.token = data.token; S.user = data.user;
      localStorage.setItem('token', data.token);
      showToast('Демо-режим активирован!', 'success');
      boot();
    } catch (err) {
      showToast(err.message, 'error');
      demoBtn.disabled = false;
      demoBtn.innerHTML = '<i class="fas fa-play-circle"></i> Демо-режим';
    }
  };
}

function logout() {
  S.token = null; S.user = null;
  localStorage.removeItem('token');
  // Stop Android background notification service
  if (window.ShadowNative?.stopBackgroundService) {
    try { window.ShadowNative.stopBackgroundService(); } catch(e) {}
  }
  S.socket?.disconnect();
  location.reload();
}

/* ══════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════ */
async function boot() {
  // Platform detection for design sync
  const isAndroidApp = !!window.ShadowNative;
  const isElectronApp = !!(window.process?.versions?.electron || navigator.userAgent.includes('Electron'));
  const isMobileWeb = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !isAndroidApp;
  document.body.classList.toggle('platform-android', isAndroidApp);
  document.body.classList.toggle('platform-desktop', isElectronApp);
  document.body.classList.toggle('platform-mobile-web', isMobileWeb);
  document.body.classList.toggle('platform-web', !isAndroidApp && !isElectronApp && !isMobileWeb);

  // Show loading spinner
  const authLoading = $('auth-loading');
  const loginForm = $('login-form');
  const regForm = $('register-form');
  const authSwitch = document.querySelector('.auth-switch');
  if (loginForm) hide(loginForm);
  if (regForm) hide(regForm);
  if (authSwitch) authSwitch.style.display = 'none';
  if (authLoading) show(authLoading);
  if ($('auth-subtitle')) $('auth-subtitle').textContent = 'Подключение к серверу...';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    S.user = await api('/api/me', { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    // Restore auth forms
    if (authLoading) hide(authLoading);
    if (loginForm) show(loginForm);
    if (authSwitch) authSwitch.style.display = '';
    if ($('auth-subtitle')) $('auth-subtitle').textContent = 'Войдите, чтобы продолжить';
    if (err.name === 'AbortError') {
      showToast('Сервер не отвечает — попробуйте позже', 'error');
      return;
    }
    localStorage.removeItem('token');
    S.token = null;
    return;
  }
  if (authLoading) hide(authLoading);
  hide($('auth-screen'));
  show($('app'));
  applyTheme(S.user.settings?.theme || 'default');
  applyDesignPrefs();
  initSocket();
  // Background notification service disabled — causes persistent notification in notification shade
  // Real-time notifications are handled by Socket.io while the app is open
  initUI();
  loadChats();
  loadFriends();
  registerSW();
  setupPWA();
  showSuperEntryAnimation();
  ensureSavedChat();
  if (window._chatRefreshInterval) clearInterval(window._chatRefreshInterval);
  window._chatRefreshInterval = setInterval(() => { if (!document.hidden) loadChats(); }, 30000);
}

/* ══════════════════════════════════════════════════════════════════════
   SOCKET
   ══════════════════════════════════════════════════════════════════════ */
function initSocket() {
  if (S.socket) { S.socket.removeAllListeners(); S.socket.disconnect(); }
  const socket = io({ auth: { token: S.token }, transports: ['websocket', 'polling'], forceNew: true });
  S.socket = socket;

  socket.on('connect', () => console.log('Socket connected'));

  socket.on('new_message', msg => {
    // Skip sender's own messages AND already-added messages
    if (msg.senderId === S.user.id) return;
    if (msg.chatId === S.chatId && S.messages.some(m => m.id === msg.id)) return;

    if (msg.chatId === S.chatId) {
      S.messages.push(msg);
      renderMessages();
      scrollToBottom();
      S.socket?.emit('mark_read', { chatId: msg.chatId });
    }
    Sounds.message();
    updateChatInList(msg.chatId, msg);
    if (msg.chatId !== S.chatId) {
      showInAppNotif(msg);
      // Native desktop notification
      if (window.electronAPI && window.electronAPI.showNotification) {
        const sender = msg.senderName || 'Новое сообщение';
        const body = msg.text || (msg.file ? '📎 Файл' : '');
        window.electronAPI.showNotification(sender, body);
      }
      // Native Android notification (heads-up popup)
      if (window.ShadowNative?.showNotification) {
        const sender = msg.senderName || 'Новое сообщение';
        const body = msg.text || (msg.file ? '📎 Файл' : '');
        window.ShadowNative.showNotification(sender, body, 'message');
      }
    }
  });

  socket.on('message_edited', msg => {
    if (msg.chatId === S.chatId) {
      const i = S.messages.findIndex(m => m.id === msg.id);
      if (i >= 0) { S.messages[i] = msg; renderMessages(); }
    }
  });

  socket.on('message_deleted', ({ messageId, chatId }) => {
    if (chatId === S.chatId) {
      S.messages = S.messages.filter(m => m.id !== messageId);
      renderMessages();
    }
    const chat = S.chats.find(c => c.id === chatId);
    if (chat && chat.lastMessage && (chat.lastMessage.id === messageId || chat.lastMessage._id === messageId)) {
      if (chatId === S.chatId && S.messages.length) {
        chat.lastMessage = S.messages[S.messages.length - 1];
      } else {
        chat.lastMessage = null;
      }
      renderChatList();
    }
  });

  socket.on('message_reaction', ({ messageId, reactions }) => {
    if (!S.chatId) return;
    const m = S.messages.find(m => m.id === messageId);
    if (m) { m.reactions = reactions; renderMessages(); }
  });

  socket.on('messages_read', ({ chatId, userId }) => {
    if (chatId === S.chatId) {
      S.messages.forEach(m => { if (!m.readBy) m.readBy = []; if (!m.readBy.includes(userId)) m.readBy.push(userId); });
    }
  });

  socket.on('user_typing', ({ userId, chatId }) => {
    if (chatId !== S.chatId) return;
    S.typing[userId] = Date.now();
    renderTyping();
    setTimeout(() => { if (Date.now() - S.typing[userId] > 3000) { delete S.typing[userId]; renderTyping(); } }, 3500);
  });

  socket.on('user_stopped_typing', ({ userId }) => {
    delete S.typing[userId]; renderTyping();
  });

  socket.on('user_online', ({ userId }) => {
    const c = S.chats.find(c => c.type === 'private' && c.members.includes(userId));
    if (c) { c.online = true; if (S.chatId === c.id) updateChatHeader(); renderChatList(); }
  });

  socket.on('user_offline', ({ userId, lastSeen }) => {
    const c = S.chats.find(c => c.type === 'private' && c.members.includes(userId));
    if (c) { c.online = false; c._lastSeen = lastSeen; if (S.chatId === c.id) updateChatHeader(); renderChatList(); }
  });

  socket.on('chat_created', chat => {
    if (!S.chats.find(c => c.id === chat.id)) { S.chats.unshift(chat); renderChatList(); }
    socket.emit('join_chat', { chatId: chat.id });
  });

  socket.on('chat_updated', chat => {
    const i = S.chats.findIndex(c => c.id === chat.id);
    if (i >= 0) { S.chats[i] = { ...S.chats[i], ...chat }; renderChatList(); if (S.chatId === chat.id) { S.chatObj = S.chats[i]; updateChatHeader(); updatePinnedBar(); } }
  });

  socket.on('messages_auto_deleted', ({ chatId }) => {
    if (S.chatId === chatId) {
      api(`/api/chats/${chatId}/messages`).then(msgs => { S.messages = msgs; renderMessages(); });
    }
  });

  socket.on('chat_deleted', ({ chatId }) => {
    S.chats = S.chats.filter(c => c.id !== chatId);
    renderChatList();
    if (S.chatId === chatId) closeChat();
  });

  socket.on('session_revoked', () => { showToast('Сессия завершена', 'warning'); logout(); });

  socket.on('friend_request', () => loadFriends());
  socket.on('friend_accepted', () => loadFriends());

  // Real-time premium / superuser sync
  socket.on('role_changed', data => {
    S.user.premium = data.premium;
    S.user.superUser = data.superUser;
    if (data.premiumFeaturesConfig) S.premiumFeaturesConfig = data.premiumFeaturesConfig;
    fillSettings();
    showToast(data.premium ? 'Вам выдан Premium!' : data.superUser ? 'Вам выдан SuperUser!' : 'Ваш статус обновлён', 'info');
  });

  // Calls
  // Wire up connection-lost callback so calls.js can notify app.js
  window.callsModule.setOnConnectionLost?.(() => {
    handleCallEnded();
    showToast('Соединение потеряно', 'warning');
  });
  socket.on('call_incoming', data => handleIncomingCall(data));
  socket.on('call_answered', data => {
    Sounds.ringStop();
    Sounds.incomingStop();
    window.callsModule.onAnswer(data);
  });
  socket.on('call_ice', data => window.callsModule.onIce(data));
  socket.on('call_ended', () => handleCallEnded(true));
  socket.on('call_rejected', () => handleCallEnded(true));
  socket.on('call_busy', () => { Sounds.ringStop(); showToast('Абонент занят', 'warning'); });
  socket.on('call_accepting', () => {
    Sounds.ringStop();
    Sounds.incomingStop();
    if (_ringTimeoutId) { clearTimeout(_ringTimeoutId); _ringTimeoutId = null; }
    _resetCallOverlayControls();
    // Reset timer from when call was accepted
    _callTimerStart = Date.now();
    $('call-audio-timer').textContent = '0:00';
  });
  socket.on('call_renegotiate', data => window.callsModule.onRenegotiate ? window.callsModule.onRenegotiate(data) : null);
  socket.on('call_status', data => window.callsModule.onPeerStatus ? window.callsModule.onPeerStatus(data) : null);

  // Group calls
  socket.on('group_call_joined', data => window.groupCallModule?.onJoined?.(data));
  socket.on('group_call_user_joined', data => window.groupCallModule?.onUserJoined?.(data));
  socket.on('group_call_user_left', data => window.groupCallModule?.onUserLeft?.(data));
  socket.on('group_call_offer', data => window.groupCallModule?.onGroupOffer?.(data));
  socket.on('group_call_answer', data => window.groupCallModule?.onGroupAnswer?.(data));
  socket.on('group_call_ice', data => window.groupCallModule?.onGroupIce?.(data));
  socket.on('group_call_incoming', data => handleIncomingGroupCall(data));
  socket.on('group_call_members', data => {
    window.groupCallModule?.onMembersUpdate?.(data);
    if (data.members && $('call-audio-timer')) {
      $('call-audio-timer').textContent = `${data.members.length} участник(ов)`;
    }
  });
  socket.on('group_call_mic_status', data => window.groupCallModule?.onMicStatus?.(data));
}

/* ══════════════════════════════════════════════════════════════════════
   UI INIT
   ══════════════════════════════════════════════════════════════════════ */
function initUI() {
  // Sidebar
  $('sb-user-pill').innerHTML = (S.user.displayName || '?')[0].toUpperCase() + (S.user.avatar ? `<img src="${escHTML(S.user.avatar)}">` : '');
  $('nav-dms').onclick = () => switchTab('chats');
  $('btn-add-hub').onclick = () => show($('modal-group'));
  $('nav-settings').onclick = () => openSettings();
  $('ghost-toggle').onclick = () => toggleGhost();

  // Panel
  $('btn-new-chat').onclick = () => { switchTab('contacts'); switchContactTab('search'); };
  $('btn-saved').onclick = () => openSavedChat();
  $('search-input').oninput = () => renderChatList();

  // Bottom tabs
  $$('#bottom-tabs .btab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  // Chat input
  const inp = $('msg-input');
  inp.oninput = () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
    toggleSendBtn();
    emitTyping();
  };
  inp.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey && (S.user.settings?.sendByEnter !== false)) { e.preventDefault(); sendMessage(); }
  };
  $('btn-send').onclick = () => sendMessage();
  $('btn-attach').onclick = () => $('file-input').click();
  $('file-input').onchange = () => uploadFiles();
  $('btn-emoji').onclick = e => toggleEmojiPicker(e);

  // Paste images/screenshots from clipboard into chat
  inp.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file && S.chatId) {
          const fd = new FormData();
          fd.append('file', file, 'screenshot.png');
          api(`/api/chats/${S.chatId}/upload`, { method: 'POST', body: fd })
            .then(msg => { if (!S.messages.some(m => m.id === msg.id)) { S.messages.push(msg); renderMessages(); scrollToBottom(); } updateChatInList(S.chatId, msg); })
            .catch(err => showToast(err.message, 'error'));
        }
        return;
      }
    }
  });

  // Input context menu (right-click on textarea)
  inp.addEventListener('contextmenu', e => {
    e.preventDefault();
    const menu = $('input-ctx-menu');
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
    show(menu);
  });
  document.querySelectorAll('#input-ctx-menu .ctx-item').forEach(el => {
    el.onclick = () => {
      hide($('input-ctx-menu'));
      const act = el.dataset.inputAction;
      if (act === 'paste') { navigator.clipboard?.readText().then(t => { document.execCommand('insertText', false, t); }).catch(() => {}); }
      else if (act === 'paste-screenshot') { navigator.clipboard?.read().then(items => { for (const item of items) { const img = item.types.find(t => t.startsWith('image/')); if (img) { item.getType(img).then(blob => { if (S.chatId) { const fd = new FormData(); fd.append('file', new File([blob], 'screenshot.png', { type: img })); api(`/api/chats/${S.chatId}/upload`, { method: 'POST', body: fd }).then(msg => { if (!S.messages.some(m => m.id === msg.id)) { S.messages.push(msg); renderMessages(); scrollToBottom(); } updateChatInList(S.chatId, msg); }).catch(err => showToast(err.message, 'error')); } }); break; } } }).catch(() => showToast('Нет изображения в буфере', 'info')); }
      else if (act === 'cut') { document.execCommand('cut'); }
      else if (act === 'copy') { document.execCommand('copy'); }
      else if (act === 'select-all') { inp.select(); }
    };
  });
  document.addEventListener('click', e => { if (!$('input-ctx-menu').contains(e.target)) hide($('input-ctx-menu')); });

  // Auto-copy on text selection in messages
  $('messages-area').addEventListener('mouseup', () => {
    const sel = window.getSelection();
    const text = sel?.toString();
    if (text && text.length > 0) {
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
      else _fallbackCopy(text);
      showToast('Текст скопирован', 'success');
    }
  });

  // Voice & video note
  $('btn-voice').onclick = () => startRecording('audio');
  $('btn-video-note').onclick = () => startRecording('video');
  $('rec-cancel').onclick = () => stopRecording(false);
  $('rec-stop').onclick = () => stopRecording(true);

  // Chat header
  $('chat-back').onclick = () => closeChat();
  $('btn-audio-call').onclick = () => startCallAction('audio');
  $('btn-video-call').onclick = () => startCallAction('video');
  $('btn-members').onclick = () => toggleMembers();
  $('btn-chat-menu').onclick = e => showChatMenu(e);
  $('members-close').onclick = () => toggleMembers(false);
  $('ch-click').onclick = () => {
    if (!S.chatObj) return;
    if (S.chatObj.type === 'private') showProfile(getPartner());
    else openGroupInfo();
  };

  // Reply / Edit
  $('reply-cancel').onclick = () => cancelReply();
  $('edit-cancel').onclick = () => cancelEdit();

  // Incoming call
  $('btn-accept').onclick = () => acceptIncoming();
  $('btn-reject').onclick = () => rejectIncoming();

  // Active call controls
  $('toggle-mute').onclick = () => {
    const muted = window.groupCallModule?.isInGroupCall()
      ? window.groupCallModule.toggleMute()
      : window.callsModule.toggleMute();
    $('toggle-mute').classList.toggle('vk-ctrl-off', muted);
    $('toggle-mute').querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  };
  $('toggle-video').onclick = async () => {
    const off = await window.callsModule.toggleVideo();
    $('toggle-video').classList.toggle('vk-ctrl-off', off);
    $('toggle-video').querySelector('i').className = off ? 'fas fa-video-slash' : 'fas fa-video';
  };
  $('toggle-screen').onclick = async () => {
    try {
      if ($('toggle-screen').classList.contains('sharing')) {
        await window.callsModule.stopScreenShare();
        $('toggle-screen').classList.remove('sharing');
      } else {
        await window.callsModule.startScreenShare();
        $('toggle-screen').classList.add('sharing');
      }
    } catch (e) { showToast('Не удалось поделиться экраном', 'error'); }
  };
  $('btn-end-call').onclick = () => handleCallEnded();
  $('btn-minimize-call').onclick = () => minimizeCall();

  // Speaker toggle (mobile only via ShadowNative)
  const speakerBtn = $('toggle-speaker');
  if (speakerBtn) {
    if (window.ShadowNative?.setSpeakerphone) {
      speakerBtn.classList.remove('hidden');
      speakerBtn.onclick = () => {
        const isOn = window.ShadowNative.isSpeakerphoneOn?.() || false;
        window.ShadowNative.setSpeakerphone(!isOn);
        speakerBtn.classList.toggle('vk-ctrl-off', isOn);
        speakerBtn.querySelector('i').className = isOn ? 'fas fa-phone' : 'fas fa-volume-high';
        speakerBtn.querySelector('.vk-ctrl-label').textContent = isOn ? 'Телефон' : 'Динамик';
      };
    }
  }
  $('call-mini-expand').onclick = () => expandCall();
  $('call-mini-mute').onclick = () => {
    const muted = window.callsModule.toggleMute();
    $('call-mini-mute').querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    $('toggle-mute').classList.toggle('vk-ctrl-off', muted);
    $('toggle-mute').querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  };
  $('call-mini-end').onclick = () => handleCallEnded();

  // Lightbox
  $('lb-close').onclick = () => closeLightbox();
  $('lightbox').onclick = e => { if (e.target === $('lightbox')) closeLightbox(); };

  // Profile viewer
  $('profile-close').onclick = () => hide($('profile-viewer'));

  // Settings
  $('btn-save-profile').onclick = () => saveProfile();
  $('btn-change-pw').onclick = () => changePassword();
  $('set-avatar-btn').onclick = () => $('avatar-input').click();
  $('avatar-input').onchange = () => uploadAvatar();
  $('btn-revoke').onclick = () => revokeSessions();
  $('set-ghost').onchange = () => toggleGhost();
  $('set-notifications').onchange = () => saveSettingsToggle('notifications', $('set-notifications').checked);
  $('set-sounds').onchange = () => saveSettingsToggle('soundEnabled', $('set-sounds').checked);
  $('set-show-online').onchange = () => saveSettingsToggle('privShowOnline', $('set-show-online').checked);
  $('set-read-receipts').onchange = () => saveSettingsToggle('privReadReceipts', $('set-read-receipts').checked);
  $('set-show-typing').onchange = () => saveSettingsToggle('privShowTyping', $('set-show-typing').checked);

  // DND
  if ($('set-dnd')) $('set-dnd').onchange = () => toggleDnd($('set-dnd').checked);
  // Desktop Super User toggles
  if ($('set-super-moderate')) $('set-super-moderate').onchange = () => saveSettingsToggle('superModerate', $('set-super-moderate').checked);
  if ($('set-super-extended')) $('set-super-extended').onchange = () => saveSettingsToggle('superExtended', $('set-super-extended').checked);
  // Custom status
  if ($('btn-save-status')) $('btn-save-status').onclick = () => saveCustomStatus();
  // Social links
  if ($('btn-save-social')) $('btn-save-social').onclick = () => saveSocialLinks();
  // Schedule send
  if ($('btn-schedule-send')) $('btn-schedule-send').onclick = async () => {
    const text = $('schedule-text').value.trim();
    const dt = $('schedule-datetime').value;
    if (!text || !dt) { showToast('Заполните текст и время', 'warning'); return; }
    try {
      await api(`/api/chats/${S.chatId}/schedule`, { method: 'POST', body: JSON.stringify({ text, scheduledAt: new Date(dt).toISOString() }) });
      hide($('modal-schedule')); showToast('Сообщение запланировано', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Add role
  if ($('btn-add-role')) $('btn-add-role').onclick = async () => {
    const name = $('role-name-input').value.trim();
    const color = $('role-color-input').value || '#888';
    if (!name) { showToast('Введите имя роли', 'warning'); return; }
    const permissions = {};
    $$('#role-permissions-new input[data-perm]').forEach(cb => { permissions[cb.dataset.perm] = cb.checked; });
    const roles = { ...(S.chatObj?.roles || {}), [name]: { color, permissions } };
    try {
      const res = await api(`/api/chats/${S.chatId}/roles`, { method: 'PUT', body: JSON.stringify({ roles }) });
      S.chatObj.roles = res.roles; $('role-name-input').value = ''; showRolesModal();
      showToast('Роль добавлена', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Broadcast
  if ($('btn-broadcast')) $('btn-broadcast').onclick = async () => {
    const text = $('broadcast-text')?.value?.trim();
    if (!text) { showToast('Введите текст', 'warning'); return; }
    try {
      const res = await api('/api/broadcast', { method: 'POST', body: JSON.stringify({ text }) });
      showToast(`Отправлено в ${res.sentTo} чатов`, 'success'); $('broadcast-text').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Announcement
  if ($('btn-announce')) $('btn-announce').onclick = async () => {
    const text = $('announce-text')?.value?.trim();
    if (!text) { showToast('Введите текст', 'warning'); return; }
    try {
      await api('/api/announcement', { method: 'POST', body: JSON.stringify({ text }) });
      showToast('Объявление отправлено', 'success'); $('announce-text').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Notification sounds
  buildNotifSoundsGrid();

  $$('.tg-settings-item[data-sec]').forEach(b => b.onclick = () => switchSettingsSection(b.dataset.sec));

  // Telegram back button
  const tgBack = $('tg-back-btn');
  if (tgBack) tgBack.onclick = () => {
    $('tg-settings-main').classList.remove('slid-out');
    $('tg-settings-detail').classList.remove('open');
  };

  // Profile card clicks to account section
  const tgPCard = $('tg-profile-card');
  if (tgPCard) tgPCard.onclick = () => switchSettingsSection('sec-profile');

  // Modal close buttons
  $$('[data-close]').forEach(b => b.onclick = () => {
    if (b.dataset.close === 'modal-settings' && _themeBackup) restoreThemeBackup();
    hide($(b.dataset.close));
  });

  // Mobile settings items (Telegram-style)
  $$('.tg-mob-row[data-act],.tg-mob-profile[data-act]').forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'edit-profile') openMobSub('mob-sub-profile');
    else if (act === 'appearance') openMobSub('mob-sub-appearance');
    else if (act === 'notifications-page') openMobSub('mob-sub-notifications');
    else if (act === 'privacy-page') openMobSub('mob-sub-privacy');
    else if (act === 'themes') { buildThemeGrid('theme-grid-mob'); show($('modal-themes')); }
    else if (act === 'sessions') openMobSub('mob-sub-sessions');
    else if (act === 'shadow-plus') openMobSub('mob-sub-premium');
    else if (act === 'font-size') openMobSub('mob-sub-fontsize');
    else if (act === 'density') openMobSub('mob-sub-density');
    else if (act === 'msg-style') openMobSub('mob-sub-msgstyle');
    else if (act === 'wallpaper') openMobSub('mob-sub-wallpaper');
    else if (act === 'logout') logout();
  });

  // Mobile settings back buttons
  $$('.tg-sub-back[data-back]').forEach(b => b.onclick = () => closeMobSub(b.dataset.back, b.dataset.parent));

  // Mobile settings toggles
  if ($('mob-set-notifications')) $('mob-set-notifications').onchange = () => saveSettingsToggle('notifications', $('mob-set-notifications').checked);
  if ($('mob-set-sounds')) $('mob-set-sounds').onchange = () => saveSettingsToggle('soundEnabled', $('mob-set-sounds').checked);
  if ($('mob-set-online')) $('mob-set-online').onchange = () => saveSettingsToggle('privShowOnline', $('mob-set-online').checked);
  if ($('mob-set-read')) $('mob-set-read').onchange = () => saveSettingsToggle('privReadReceipts', $('mob-set-read').checked);
  if ($('mob-set-typing')) $('mob-set-typing').onchange = () => saveSettingsToggle('privShowTyping', $('mob-set-typing').checked);
  if ($('mob-set-ghost')) $('mob-set-ghost').onchange = () => toggleGhost();
  if ($('mob-set-ghost-app')) $('mob-set-ghost-app').onchange = () => toggleGhost();
  if ($('mob-set-dnd')) $('mob-set-dnd').onchange = () => saveSettingsToggle('dndMode', $('mob-set-dnd').checked);
  if ($('mob-set-dnd-reply')) $('mob-set-dnd-reply').onchange = () => saveSettingsToggle('dndAutoReply', $('mob-set-dnd-reply').value);
  if ($('mob-set-animations')) $('mob-set-animations').onchange = () => {
    const v = $('mob-set-animations').checked;
    if (!S.user.settings) S.user.settings = {};
    S.user.settings.animations = v;
    applyDesignPrefs();
    saveSettingsToggle('animations', v);
  };
  if ($('mob-set-send-enter')) $('mob-set-send-enter').onchange = () => saveSettingsToggle('sendByEnter', $('mob-set-send-enter').checked);

  // Mobile Super User toggles
  if ($('mob-set-super-moderate')) $('mob-set-super-moderate').onchange = () => saveSettingsToggle('superModerate', $('mob-set-super-moderate').checked);
  if ($('mob-set-super-see-hidden')) $('mob-set-super-see-hidden').onchange = () => saveSettingsToggle('superExtended', $('mob-set-super-see-hidden').checked);
  // Mobile broadcast
  if ($('mob-btn-broadcast')) $('mob-btn-broadcast').onclick = async () => {
    const text = $('mob-broadcast-text')?.value?.trim();
    if (!text) { showToast('Введите текст', 'warning'); return; }
    try {
      const res = await api('/api/broadcast', { method: 'POST', body: JSON.stringify({ text }) });
      showToast(`Отправлено в ${res.sentTo} чатов`, 'success'); $('mob-broadcast-text').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Mobile announcement
  if ($('mob-btn-announce')) $('mob-btn-announce').onclick = async () => {
    const text = $('mob-announce-text')?.value?.trim();
    if (!text) { showToast('Введите текст', 'warning'); return; }
    try {
      await api('/api/announcement', { method: 'POST', body: JSON.stringify({ text }) });
      showToast('Объявление отправлено', 'success'); $('mob-announce-text').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Mobile profile save
  if ($('mob-btn-save-profile')) $('mob-btn-save-profile').onclick = async () => {
    try {
      const body = { displayName: $('mob-set-displayname').value.trim(), bio: $('mob-set-bio').value, username: $('mob-set-username').value.trim() };
      S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify(body) });
      showToast('Профиль сохранён', 'success');
      fillSettings();
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Mobile password change
  if ($('mob-btn-change-pw')) $('mob-btn-change-pw').onclick = async () => {
    const cur = $('mob-set-cur-password').value, nw = $('mob-set-new-password').value;
    if (!cur || !nw) { showToast('Заполните оба поля', 'warning'); return; }
    try {
      await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
      showToast('Пароль изменён', 'success');
      $('mob-set-cur-password').value = ''; $('mob-set-new-password').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  };
  // Mobile avatar change
  if ($('mob-avatar-btn')) $('mob-avatar-btn').onclick = () => $('avatar-input').click();
  // Mobile revoke sessions
  if ($('mob-btn-revoke')) $('mob-btn-revoke').onclick = async () => {
    try { await api('/api/me/sessions/revoke', { method: 'POST' }); showToast('Сессии завершены', 'success'); _loadMobSessions(); } catch (e) { showToast(e.message, 'error'); }
  };

  // Mobile radio options: font size
  $$('input[name="mob-fontsize"]').forEach(r => r.onchange = () => {
    document.body.classList.remove('font-small', 'font-large');
    if (r.value !== 'normal') document.body.classList.add(`font-${r.value}`);
    saveSettingsToggle('fontSize', r.value);
  });
  // Mobile radio options: density
  $$('input[name="mob-density"]').forEach(r => r.onchange = () => {
    document.body.classList.remove('density-compact', 'density-comfortable');
    if (r.value !== 'cozy') document.body.classList.add(`density-${r.value}`);
    saveSettingsToggle('msgDensity', r.value);
  });
  // Mobile radio options: msg style
  $$('input[name="mob-msgstyle"]').forEach(r => r.onchange = () => {
    document.body.classList.remove('style-bubbles');
    if (r.value === 'bubbles') document.body.classList.add('style-bubbles');
    saveSettingsToggle('bubbleStyle', r.value);
  });
  // Mobile radio options: border radius
  $$('input[name="mob-radius"]').forEach(r => r.onchange = () => {
    document.body.classList.remove('radius-none', 'radius-round');
    if (r.value !== 'normal') document.body.classList.add(`radius-${r.value}`);
    saveSettingsToggle('borderRadius', r.value);
  });

  // Contact sub-tabs
  $$('.sub-tab').forEach(b => b.onclick = () => switchContactTab(b.dataset.ct));
  $('btn-contacts-search').onclick = () => searchUsers();
  $('contacts-search').onkeydown = e => { if (e.key === 'Enter') searchUsers(); };

  // New group
  $('group-search').oninput = () => searchGroupUsers();
  $('btn-create-group').onclick = () => createGroup();
  // Group type selector
  document.querySelectorAll('#group-type-opts .s-opt-btn').forEach(b => b.onclick = () => {
    document.querySelectorAll('#group-type-opts .s-opt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('modal-group-title').textContent = b.dataset.val === 'channel' ? 'Новый канал' : 'Новая группа';
    $('group-name').placeholder = b.dataset.val === 'channel' ? 'Название канала' : 'Название группы';
  });
  // Chat search panel
  if ($('csp-close')) $('csp-close').onclick = () => closeChatSearchPanel();
  if ($('csp-search-btn')) $('csp-search-btn').onclick = () => doChatSearch();
  if ($('chat-search-input')) $('chat-search-input').onkeydown = e => { if (e.key === 'Enter') doChatSearch(); };
  if ($('csp-prev')) $('csp-prev').onclick = () => { if (_cspResults.length && _cspIdx > 0) navigateCspTo(_cspIdx - 1); };
  if ($('csp-next')) $('csp-next').onclick = () => { if (_cspResults.length && _cspIdx < _cspResults.length - 1) navigateCspTo(_cspIdx + 1); };
  // Group info panel
  if ($('gip-close')) $('gip-close').onclick = () => closeGroupInfo();
  // Send options (long-press on send button)
  {
    let _sendPressTimer = null;
    const sendBtn = $('btn-send');
    const popup = $('send-options');
    if (sendBtn && popup) {
      const showSendOpts = () => {
        if (!S.chatId) return;
        const rect = sendBtn.getBoundingClientRect();
        popup.style.left = rect.left + 'px';
        popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        popup.classList.remove('hidden');
      };
      sendBtn.addEventListener('mousedown', () => { _sendPressTimer = setTimeout(showSendOpts, 500); });
      sendBtn.addEventListener('mouseup', () => clearTimeout(_sendPressTimer));
      sendBtn.addEventListener('mouseleave', () => clearTimeout(_sendPressTimer));
      sendBtn.addEventListener('touchstart', (e) => { _sendPressTimer = setTimeout(() => { e.preventDefault(); showSendOpts(); }, 500); }, { passive: false });
      sendBtn.addEventListener('touchend', () => clearTimeout(_sendPressTimer));
      if ($('send-opt-schedule')) $('send-opt-schedule').onclick = () => { hide(popup); showScheduleModal(); };
      if ($('send-opt-silent')) $('send-opt-silent').onclick = () => { hide(popup); sendSilentMessage(); };
      document.addEventListener('click', e => { if (!popup.contains(e.target) && !sendBtn.contains(e.target)) popup.classList.add('hidden'); });
    }
  }

  // Theme
  buildThemeGrid('theme-grid');

  // Design options
  initDesignOptions();

  // Fill settings
  fillSettings();

  // Messages scroll (load more)
  $('messages-container').onscroll = () => {
    if ($('messages-container').scrollTop < 100 && !S.loadingMore && S.hasMore && S.chatId) loadMoreMessages();
  };

  // Clicks to close modals
  document.addEventListener('click', e => {
    if (!$('ctx-menu').classList.contains('hidden') && !$('ctx-menu').contains(e.target)) hide($('ctx-menu'));
    if (!$('emoji-picker').classList.contains('hidden') && !$('emoji-picker').contains(e.target) && !$('btn-emoji').contains(e.target)) hide($('emoji-picker'));
  });

  document.addEventListener('contextmenu', e => {
    const msgEl = e.target.closest('.msg');
    if (msgEl && msgEl.dataset.id) { e.preventDefault(); showContextMenu(e, msgEl.dataset.id); }
  });

  // ESC to close settings & modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('modal-settings').classList.contains('hidden')) { if (_themeBackup) restoreThemeBackup(); hide($('modal-settings')); return; }
      $$('.modal-overlay').forEach(m => { if (!m.classList.contains('hidden')) hide(m); });
    }
  });

  // Resize
  window.addEventListener('resize', () => { S.isMobile = window.innerWidth <= 768; });

  // Service Worker messages
  navigator.serviceWorker?.addEventListener('message', msg => {
    if (msg.data?.type === 'call_reject_from_notification') rejectIncoming();
    if (msg.data?.type === 'call_answer_from_notification') acceptIncoming();
  });
}

/* ── Tab switching ──────────────────────────────────────────────────── */
function switchTab(tab) {
  $$('.tab-pane').forEach(p => p.classList.remove('active'));
  $(`tab-${tab}`)?.classList.add('active');
  $$('#bottom-tabs .btab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  // Desktop sidebar
  $('nav-dms').classList.toggle('active', tab === 'chats');

  // Mobile: hide panel header/search when in settings, show otherwise
  const isMob = window.innerWidth <= 768;
  if (isMob) {
    const ph = $('panel-header');
    const ps = $('panel-search');
    if (tab === 'settings') {
      if (ph) ph.style.display = 'none';
      if (ps) ps.style.display = 'none';
      // Reset to main settings view
      $$('.mob-settings-sub').forEach(s => s.classList.add('hidden'));
      const msm = $('mob-settings-main');
      if (msm) msm.classList.remove('hidden');
      _syncMobToggles();
    } else {
      if (ph) ph.style.display = '';
      if (ps) ps.style.display = '';
    }
  }

  if (tab === 'contacts') loadFriends();
  if (tab === 'chats') renderChatList();
  if (tab === 'calls') loadCallHistory();
}

function switchContactTab(ct) {
  $$('.sub-tab').forEach(b => b.classList.toggle('active', b.dataset.ct === ct));
  if (ct === 'search') { show($('contacts-search-wrap')); } else { hide($('contacts-search-wrap')); }
  renderContacts(ct);
}

/* ── Call History ───────────────────────────────────────────────────── */
async function loadCallHistory() {
  const list = $('calls-list');
  const empty = $('calls-empty');
  if (!list) return;
  try {
    const calls = await api('/api/calls');
    if (!calls.length) {
      list.innerHTML = '';
      if (empty) show(empty);
      return;
    }
    if (empty) hide(empty);
    list.innerHTML = calls.map(c => {
      const isMe = c.callerId === S.user.id;
      const name = isMe ? c.receiverName : c.callerName;
      const avatar = isMe ? c.receiverAvatar : c.callerAvatar;
      const peerId = isMe ? c.receiverId : c.callerId;
      const icon = c.type === 'video' ? 'fa-video' : 'fa-phone';
      const statusIcon = c.status === 'answered' ? 'fa-phone' : c.status === 'rejected' ? 'fa-phone-slash' : 'fa-phone-slash';
      const statusColor = c.status === 'answered' ? 'var(--green)' : 'var(--red)';
      const arrow = isMe ? '<i class="fas fa-arrow-up-right" style="color:var(--green);font-size:11px"></i>' : '<i class="fas fa-arrow-down-left" style="color:var(--brand);font-size:11px"></i>';
      const durStr = c.status === 'answered' && c.duration ? fmtDuration(c.duration) : (c.status === 'rejected' ? 'Отклонён' : 'Пропущен');
      const avHtml = avatar ? `<img src="${escHTML(avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (name || '?')[0].toUpperCase();
      return `<div class="call-item" data-peer="${peerId}">
        <div class="avatar-sm" style="flex-shrink:0">${avHtml}</div>
        <div class="call-info"><span class="call-name">${escHTML(name || 'Пользователь')}</span><span class="call-meta">${arrow} ${durStr} · ${fmtTime(c.startedAt)}</span></div>
        <button class="call-action" data-peer="${peerId}" data-type="${c.type}"><i class="fas ${icon}" style="color:${statusColor}"></i></button>
      </div>`;
    }).join('');
    // Click to call back
    list.querySelectorAll('.call-action').forEach(btn => {
      btn.onclick = () => {
        const peer = btn.dataset.peer;
        const type = btn.dataset.type;
        if (peer && window.startCallById) window.startCallById(peer, type);
      };
    });
    // Click name to open profile
    list.querySelectorAll('.call-item').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.call-action')) return;
        showProfileById(el.dataset.peer);
      };
    });
  } catch {
    list.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">Ошибка загрузки</div>';
  }
}

/* ── Toggle send/voice/video buttons ────────────────────────────────── */
function toggleSendBtn() {
  const has = $('msg-input').value.trim().length > 0;
  if (has) { show($('btn-send')); hide($('btn-voice')); hide($('btn-video-note')); }
  else { hide($('btn-send')); show($('btn-voice')); show($('btn-video-note')); }
}

/* ══════════════════════════════════════════════════════════════════════
   CHATS
   ══════════════════════════════════════════════════════════════════════ */
async function loadChats() {
  try {
    S.chats = await api('/api/chats');
    renderChatList();
  } catch (e) { showToast('Ошибка загрузки чатов', 'error'); }
}

function renderChatList() {
  const container = $('chat-list');
  const q = ($('search-input')?.value || '').toLowerCase().trim();
  const filtered = q ? S.chats.filter(c => (c.displayName || c.name || '').toLowerCase().includes(q)) : S.chats;

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>Нет чатов</p></div>';
    return;
  }

  container.innerHTML = filtered.map(c => {
    const last = c.lastMessage;
    const time = last ? fmtTime(last.timestamp) : '';
    const preview = last ? (last.type === 'image' ? '📷 Фото' : last.type === 'voice' ? '🎤 Голосовое' : last.type === 'video' ? '📹 Видео' : last.type === 'file' ? '📎 ' + (last.fileName || 'Файл') : escHTML(last.text || '')) : '';
    const badge = c.unreadCount > 0 ? `<span class="ci-badge">${c.unreadCount}</span>` : '';
    const onlineDot = c.online ? '<div class="ci-online"></div>' : '';
    const name = escHTML(c.displayName || c.name || 'Чат');
    const pinIcon = c.pinned ? '<i class="fas fa-thumbtack ci-pin-icon"></i>' : '';
    const muteIcon = c.muted ? '<i class="fas fa-bell-slash ci-mute-icon"></i>' : '';
    const premiumEmoji = c.partnerPremiumEmoji ? `<span class="ci-premium-emoji">${c.partnerPremiumEmoji}</span>` : '';
    const superIcon = c.partnerSuperUser ? '<span class="ci-super-icon"><i class="fas fa-bolt" style="color:#ffd700;font-size:12px"></i></span>' : '';
    const premiumDot = (!c.partnerSuperUser && c.partnerPremium) ? '<span class="ci-premium-dot">⭐</span>' : '';
    return `<div class="chat-item${c.id === S.chatId ? ' active' : ''}${c.pinned ? ' pinned' : ''}" data-id="${c.id}">
      <div class="ci-avatar" style="background:${c.displayAvatarColor || c.avatarColor || AVATARS[0]}">${name[0]}${c.displayAvatar || c.avatar ? `<img src="${escHTML(c.displayAvatar || c.avatar)}">` : ''}${onlineDot}</div>
      <div class="ci-body"><div class="ci-top"><span class="ci-name">${name}${superIcon}${premiumEmoji}${premiumDot}</span><span class="ci-time">${pinIcon}${muteIcon}${time}</span></div><div class="ci-bottom"><span class="ci-msg">${preview}</span>${badge}</div></div>
    </div>`;
  }).join('');

  container.querySelectorAll('.chat-item').forEach(el => {
    el.onclick = () => openChat(el.dataset.id);
    el.oncontextmenu = e => { e.preventDefault(); showChatListContextMenu(e, el.dataset.id); };
  });
}

function updateChatInList(chatId, msg) {
  const c = S.chats.find(c => c.id === chatId);
  if (!c) { loadChats(); return; }
  c.lastMessage = msg;
  if (chatId !== S.chatId) c.unreadCount = (c.unreadCount || 0) + 1;
  S.chats.sort((a, b) => {
    const ta = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt);
    const tb = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt);
    return tb - ta;
  });
  renderChatList();
  updateBadge();
}

function updateBadge() {
  const total = S.chats.reduce((s, c) => s + (c.unreadCount || 0), 0);
  const badge = $('badge-chats');
  if (total > 0) { badge.textContent = total; show(badge); } else hide(badge);
  // Desktop app badge
  if (window.electronAPI && window.electronAPI.setBadge) {
    window.electronAPI.setBadge(total);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   OPEN / CLOSE CHAT
   ══════════════════════════════════════════════════════════════════════ */
async function openChat(id) {
  S.chatId = id;
  S.chatObj = S.chats.find(c => c.id === id) || null;
  S.messages = [];
  S.hasMore = true;
  S.replyTo = null;
  S.editMsg = null;
  hide($('reply-bar'));
  hide($('edit-bar'));
  hide($('welcome-screen'));
  show($('chat-view'));
  $('app').classList.add('chat-open');
  $('messages-area').innerHTML = '';
  updateChatHeader();
  renderChatList();
  toggleSendBtn();

  try {
    S.messages = await api(`/api/chats/${id}/messages`);
    renderMessages();
    scrollToBottom(true);
    // Show pinned message bar
    updatePinnedBar();
    // Mark read
    S.socket?.emit('mark_read', { chatId: id });
    const c = S.chats.find(c => c.id === id);
    if (c) { c.unreadCount = 0; renderChatList(); updateBadge(); }
  } catch (e) { showToast('Ошибка загрузки сообщений', 'error'); }
}

function closeChat() {
  S.chatId = null;
  S.chatObj = null;
  $('app').classList.remove('chat-open');
  hide($('chat-view'));
  show($('welcome-screen'));
  // Close side panels
  if ($('chat-search-panel')) $('chat-search-panel').classList.add('hidden');
  if ($('group-info-panel')) $('group-info-panel').classList.add('hidden');
  if ($('send-options')) $('send-options').classList.add('hidden');
  renderChatList();
}

async function loadMoreMessages() {
  if (!S.chatId || S.loadingMore || !S.hasMore) return;
  S.loadingMore = true;
  const first = S.messages[0];
  try {
    const older = await api(`/api/chats/${S.chatId}/messages?before=${first?.id || ''}&limit=50`);
    if (older.length < 50) S.hasMore = false;
    if (older.length) {
      const container = $('messages-container');
      const oldH = container.scrollHeight;
      S.messages = [...older, ...S.messages];
      renderMessages();
      container.scrollTop = container.scrollHeight - oldH;
    }
  } catch {} finally { S.loadingMore = false; }
}

function updateChatHeader() {
  const c = S.chatObj;
  if (!c) return;
  const name = c.displayName || c.name || 'Чат';
  $('ch-name').textContent = name;
  const avEl = $('ch-avatar');
  avEl.style.background = c.displayAvatarColor || c.avatarColor || AVATARS[0];
  avEl.innerHTML = name[0].toUpperCase() + ((c.displayAvatar || c.avatar) ? `<img src="${escHTML(c.displayAvatar || c.avatar)}">` : '');

  if (c.type === 'private') {
    if ($('btn-members')) $('btn-members').style.display = 'none';
    if (c.online) {
      $('ch-status').textContent = 'в сети';
      $('ch-status').style.color = 'var(--green,#43b581)';
    } else if (c._lastSeen) {
      $('ch-status').textContent = `был(а) ${fmtLastSeen(c._lastSeen)}`;
      $('ch-status').style.color = '';
    } else {
      $('ch-status').textContent = '';
      $('ch-status').style.color = '';
    }
  } else {
    if ($('btn-members')) $('btn-members').style.display = '';
    $('ch-status').textContent = `${c.members?.length || 0} участников`;
    $('ch-status').style.color = '';
  }
}

function getPartner() {
  const c = S.chatObj;
  if (!c || c.type !== 'private') return null;
  const otherId = c.members.find(id => id !== S.user.id);
  return { id: otherId, displayName: c.displayName, avatar: c.displayAvatar, avatarColor: c.displayAvatarColor };
}

/* ══════════════════════════════════════════════════════════════════════
   MESSAGES
   ══════════════════════════════════════════════════════════════════════ */
function renderMessages() {
  const area = $('messages-area');
  if (!S.messages.length) { area.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>Нет сообщений</p></div>'; return; }

  let html = '';
  let lastDate = '';
  let lastAuthor = '';
  let lastTime = 0;

  S.messages.forEach((m, i) => {
    if (m.type === 'system') { html += `<div class="msg-system">${escHTML(m.text)}</div>`; lastAuthor = ''; return; }
    if (m.scheduledAt) return; // skip scheduled messages from rendering

    const date = fmtDate(m.timestamp);
    if (date !== lastDate) { html += `<div class="msg-date-sep">${date}</div>`; lastDate = date; lastAuthor = ''; }

    const sameAuthor = m.senderId === lastAuthor && (new Date(m.timestamp) - lastTime < 300000);
    lastAuthor = m.senderId;
    lastTime = new Date(m.timestamp);

    const cls = sameAuthor ? 'msg msg-collapsed' : 'msg';
    const color = m.senderAvatarColor || AVATARS[0];
    const av = sameAuthor ? '<div class="msg-av" style="visibility:hidden"></div>' : `<div class="msg-av" style="background:${color}" data-uid="${m.senderId}">${(m.senderName || '?')[0].toUpperCase()}${m.senderAvatar ? `<img src="${escHTML(m.senderAvatar)}">` : ''}</div>`;
    const nameColor = m.senderPremiumNameColor || (m.senderSuperUser ? '#ffd700' : color);
    const superBadge = m.senderSuperUser ? '<span class="msg-super-badge" title="Super User"><i class="fas fa-bolt" style="color:#ffd700;font-size:11px"></i></span>' : '';
    const premiumBadge = m.senderPremiumEmoji ? `<span class="msg-premium-emoji">${m.senderPremiumEmoji}</span>` : (m.senderPremium ? '<span class="msg-premium-badge">⭐</span>' : '');
    const badgeTitle = m.senderPremiumBadge ? `<span class="msg-user-badge">${escHTML(m.senderPremiumBadge)}</span>` : '';
    const author = sameAuthor ? '' : `<div class="msg-top"><span class="msg-author" style="color:${nameColor}" data-uid="${m.senderId}">${escHTML(m.senderName)}${superBadge}${premiumBadge}${badgeTitle}</span><span class="msg-time">${fmtTime(m.timestamp)}</span>${m.editedAt ? '<span class="msg-edited">(ред.)</span>' : ''}</div>`;

    let replyHtml = '';
    if (m.replyTo) {
      const orig = S.messages.find(x => x.id === m.replyTo);
      if (orig) replyHtml = `<div class="msg-reply" data-id="${orig.id}"><b>${escHTML(orig.senderName)}</b>${escHTML((orig.text || '').slice(0, 60))}</div>`;
    }

    let forwardHtml = '';
    if (m.forwardFrom) {
      forwardHtml = `<div class="msg-forward"><i class="fas fa-share"></i> Переслано от <b>${escHTML(m.forwardText || 'пользователя')}</b></div>`;
    }

    const announceClass = m.isGlobalAnnouncement ? ' msg-announcement' : '';

    let content = '';
    if (m.type === 'image') {
      content = `<img src="${escHTML(m.fileUrl)}" alt="image" class="msg-img" onclick="openLightbox('${escHTML(m.fileUrl)}', 'image')">`;
    } else if (m.type === 'voice') {
      content = `<div class="msg-voice" data-url="${escHTML(m.fileUrl)}"><button class="voice-play-btn"><i class="fas fa-play"></i></button><div class="voice-bar"><div class="voice-progress"></div></div><span class="voice-dur">${m.duration ? fmtDuration(m.duration) : '0:00'}</span></div>`;
    } else if (m.type === 'video') {
      content = `<div class="msg-video-circle" data-src="${escHTML(m.fileUrl)}"><video src="${escHTML(m.fileUrl)}" preload="metadata" playsinline webkit-playsinline muted></video><div class="vc-play"><i class="fas fa-play"></i></div>${m.duration ? `<span class="vc-dur">${fmtDuration(m.duration)}</span>` : ''}</div>`;
    } else if (m.type === 'file') {
      content = `<div class="msg-file"><i class="fas fa-file"></i><div><a href="${escHTML(m.fileUrl)}" target="_blank" download>${escHTML(m.fileName || 'Файл')}</a><br><small>${m.fileSize ? (m.fileSize / 1024).toFixed(1) + ' KB' : ''}</small></div></div>`;
    } else {
      content = `<div class="msg-content">${linkify(m.text)}</div>`;
    }

    // Reactions
    let reactHtml = '';
    if (m.reactions && Object.keys(m.reactions).length) {
      reactHtml = '<div class="msg-reactions">';
      for (const [emoji, users] of Object.entries(m.reactions)) {
        const reacted = users.includes(S.user.id) ? ' reacted' : '';
        reactHtml += `<button class="msg-react-btn${reacted}" data-mid="${m.id}" data-emoji="${emoji}">${emoji} ${users.length}</button>`;
      }
      reactHtml += '</div>';
    }

    // Auto-delete label
    let autoDelHtml = '';
    if (S.chatObj?.autoDeleteTimer && S.chatObj.autoDeleteTimer > 0) {
      const t = S.chatObj.autoDeleteTimer;
      const label = t < 3600 ? `${Math.floor(t / 60)}м` : t < 86400 ? `${Math.floor(t / 3600)}ч` : `${Math.floor(t / 86400)}д`;
      autoDelHtml = `<span class="auto-delete-label" title="Авто-удаление: ${label}"><i class="fas fa-clock"></i> ${label}</span>`;
    }

    html += `<div class="${cls}${announceClass}" data-id="${m.id}">${av}<div class="msg-body">${author}${forwardHtml}${replyHtml}${content}${autoDelHtml}${reactHtml}</div></div>`;
  });

  area.innerHTML = html;

  // Voice play buttons
  area.querySelectorAll('.voice-play-btn').forEach(btn => btn.onclick = () => playVoice(btn));

  // Video circles — inline play/pause like Telegram
  area.querySelectorAll('.msg-video-circle').forEach(vc => {
    const video = vc.querySelector('video');
    const playIcon = vc.querySelector('.vc-play');
    let playing = false;
    const togglePlay = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (playing) {
        video.pause();
        video.muted = true;
        playIcon.style.opacity = '';
        vc.classList.remove('vc-playing');
        playing = false;
      } else {
        video.muted = false;
        video.play().catch(() => {});
        playIcon.style.opacity = '0';
        vc.classList.add('vc-playing');
        playing = true;
      }
    };
    vc.onclick = togglePlay;
    vc.ontouchend = (e) => { e.preventDefault(); togglePlay(e); };
    video.onended = () => {
      playing = false;
      playIcon.style.opacity = '';
      vc.classList.remove('vc-playing');
      video.muted = true;
    };
  });

  // Reaction buttons
  area.querySelectorAll('.msg-react-btn').forEach(btn => btn.onclick = () => reactToMessage(btn.dataset.mid, btn.dataset.emoji));

  // Reply clicks
  area.querySelectorAll('.msg-reply').forEach(el => el.onclick = () => {
    const target = area.querySelector(`.msg[data-id="${el.dataset.id}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Profile clicks
  area.querySelectorAll('.msg-av[data-uid], .msg-author[data-uid]').forEach(el => el.onclick = () => showProfileById(el.dataset.uid));
}

function scrollToBottom(instant) {
  const c = $('messages-container');
  if (instant) c.scrollTop = c.scrollHeight;
  else c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
}

/* ── Voice player ──────────────────────────────────────────────────── */
let _voiceAudio = null;
function playVoice(btn) {
  const wrap = btn.closest('.msg-voice');
  const url = wrap.dataset.url;
  const prog = wrap.querySelector('.voice-progress');
  const durEl = wrap.querySelector('.voice-dur');
  const icon = btn.querySelector('i');

  if (_voiceAudio && _voiceAudio._url === url) {
    if (_voiceAudio.paused) { _voiceAudio.play(); icon.className = 'fas fa-pause'; }
    else { _voiceAudio.pause(); icon.className = 'fas fa-play'; }
    return;
  }
  if (_voiceAudio) { _voiceAudio.pause(); document.querySelectorAll('.voice-play-btn i').forEach(i => i.className = 'fas fa-play'); }

  _voiceAudio = new Audio(url);
  _voiceAudio._url = url;
  icon.className = 'fas fa-pause';
  _voiceAudio.play();
  _voiceAudio.ontimeupdate = () => {
    if (_voiceAudio.duration) {
      prog.style.width = (_voiceAudio.currentTime / _voiceAudio.duration * 100) + '%';
      durEl.textContent = fmtDuration(_voiceAudio.currentTime);
    }
  };
  _voiceAudio.onended = () => { icon.className = 'fas fa-play'; prog.style.width = '0'; durEl.textContent = fmtDuration(_voiceAudio.duration || 0); };
}

/* ── Send message ──────────────────────────────────────────────────── */
async function sendSilentMessage() {
  const text = $('msg-input').value.trim();
  if (!text || !S.chatId) { showToast('Введите сообщение', 'warning'); return; }
  $('msg-input').value = '';
  $('msg-input').style.height = 'auto';
  toggleSendBtn();
  try {
    const msg = await api(`/api/chats/${S.chatId}/messages`, { method: 'POST', body: JSON.stringify({ text, silent: true }) });
    if (!S.messages.some(m => m.id === msg.id)) {
      S.messages.push(msg);
      renderMessages();
      scrollToBottom();
    }
    updateChatInList(S.chatId, msg);
    showToast('Отправлено без звука', 'info');
  } catch (e) { showToast(e.message, 'error'); }
}

async function sendMessage() {
  const text = $('msg-input').value.trim();
  if (!text || !S.chatId) return;

  const body = { text };
  if (S.replyTo) body.replyTo = S.replyTo;

  // If editing
  if (S.editMsg) {
    try {
      await api(`/api/messages/${S.editMsg}`, { method: 'PUT', body: JSON.stringify({ text }) });
      cancelEdit();
    } catch (e) { showToast(e.message, 'error'); }
    return;
  }

  $('msg-input').value = '';
  $('msg-input').style.height = 'auto';
  toggleSendBtn();
  cancelReply();

  try {
    const msg = await api(`/api/chats/${S.chatId}/messages`, { method: 'POST', body: JSON.stringify(body) });
    if (!S.messages.some(m => m.id === msg.id)) {
      S.messages.push(msg);
      renderMessages();
      scrollToBottom();
    }
    updateChatInList(S.chatId, msg);
  } catch (e) { showToast(e.message, 'error'); }
}

/* ── Upload files ──────────────────────────────────────────────────── */
async function uploadFiles() {
  const files = $('file-input').files;
  if (!files.length || !S.chatId) return;

  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const msg = await api(`/api/chats/${S.chatId}/upload`, { method: 'POST', body: fd });
      if (!S.messages.some(m => m.id === msg.id)) {
        S.messages.push(msg);
        renderMessages();
        scrollToBottom();
      }
      updateChatInList(S.chatId, msg);
    } catch (e) { showToast(e.message, 'error'); }
  }
  $('file-input').value = '';
}

/* ── Typing ────────────────────────────────────────────────────────── */
let _typingTimer = null;
let _isTyping = false;
function emitTyping() {
  if (!S.chatId || !S.socket || S.user.settings?.privShowTyping === false) return;
  if (!_isTyping) { S.socket.emit('typing_start', { chatId: S.chatId }); _isTyping = true; }
  clearTimeout(_typingTimer);
  _typingTimer = setTimeout(() => { S.socket.emit('typing_stop', { chatId: S.chatId }); _isTyping = false; }, 2000);
}

function renderTyping() {
  const bar = $('typing-bar');
  const ids = Object.keys(S.typing).filter(id => id !== S.user.id);
  if (!ids.length) { hide(bar); return; }
  $('typing-text').textContent = ids.length === 1 ? 'печатает' : `${ids.length} печатают`;
  show(bar);
}

/* ══════════════════════════════════════════════════════════════════════
   CONTEXT MENU
   ══════════════════════════════════════════════════════════════════════ */
function showContextMenu(e, msgId) {
  const msg = S.messages.find(m => m.id === msgId);
  if (!msg) return;
  S.ctxMsg = msg;
  const mine = msg.senderId === S.user.id;

  let items = [
    { icon: 'fa-reply', label: 'Ответить', action: 'reply' },
    { icon: 'fa-copy', label: 'Копировать', action: 'copy' },
    { icon: 'fa-face-smile', label: 'Реакция', action: 'react' },
  ];
  if (mine && msg.type === 'text') {
    items.push({ icon: 'fa-pen', label: 'Редактировать', action: 'edit' });
  }
  items.push({ icon: 'fa-thumbtack', label: msg.id === S.chatObj?.pinnedMessage ? 'Открепить' : 'Закрепить', action: 'pin' });
  items.push({ icon: 'fa-share', label: 'Переслать', action: 'forward' });
  if (msg.text) items.push({ icon: 'fa-language', label: 'Перевести', action: 'translate' });
  if (msg.text && $('messages-area').querySelector(`.msg[data-id="${msgId}"] .msg-translation`)) items.push({ icon: 'fa-xmark', label: 'Убрать перевод', action: 'remove-translate' });
  items.push({ icon: 'fa-bookmark', label: 'В избранное', action: 'save' });
  if (msg.text) items.push({ icon: 'fa-i-cursor', label: 'Выделить текст', action: 'select-text' });
  if (msg.type === 'image' || msg.type === 'file') items.push({ icon: 'fa-download', label: 'Скачать', action: 'download' });
  if (!mine) items.push({ icon: 'fa-flag', label: 'Пожаловаться', action: 'report', danger: true });
  items.push({ icon: 'fa-trash', label: 'Удалить', action: 'delete', danger: true });

  const menu = $('ctx-menu');
  $('ctx-items').innerHTML = items.map(it =>
    `<div class="ctx-item${it.danger ? ' danger' : ''}" data-action="${it.action}"><i class="fas ${it.icon}"></i>${it.label}</div>`
  ).join('');

  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - items.length * 40) + 'px';
  show(menu);

  menu.querySelectorAll('.ctx-item').forEach(el => el.onclick = (ev) => { ev.stopPropagation(); const act = el.dataset.action; handleCtxAction(act); if (act !== 'react') hide(menu); });
}

function handleCtxAction(action) {
  const msg = S.ctxMsg;
  if (!msg) return;

  if (action === 'reply') {
    S.replyTo = msg.id;
    $('reply-name').textContent = msg.senderName;
    $('reply-text').textContent = (msg.text || '').slice(0, 80) || (msg.type === 'image' ? '📷 Фото' : msg.type === 'voice' ? '🎤 Голосовое' : '📎 Файл');
    show($('reply-bar'));
    $('msg-input').focus();
  } else if (action === 'copy') {
    const _txt = msg.text || '';
    if (navigator.clipboard) { navigator.clipboard.writeText(_txt).then(() => showToast('Скопировано', 'success')).catch(() => { _fallbackCopy(_txt); showToast('Скопировано', 'success'); }); }
    else { _fallbackCopy(_txt); showToast('Скопировано', 'success'); }
  } else if (action === 'edit') {
    if (msg.senderId !== S.user.id || msg.type !== 'text') return;
    S.editMsg = msg.id;
    $('msg-input').value = msg.text;
    show($('edit-bar'));
    $('msg-input').focus();
  } else if (action === 'delete') {
    api(`/api/messages/${msg.id}`, { method: 'DELETE' }).then(() => {
      S.messages = S.messages.filter(m => m.id !== msg.id);
      renderMessages();
      const chat = S.chats.find(c => c.id === S.chatId);
      if (chat && chat.lastMessage && (chat.lastMessage.id === msg.id || chat.lastMessage._id === msg.id)) {
        chat.lastMessage = S.messages.length ? S.messages[S.messages.length - 1] : null;
        renderChatList();
      }
      showToast('Сообщение удалено', 'success');
    }).catch(e => showToast(e.message, 'error'));
  } else if (action === 'react') {
    showQuickReact(msg.id);
  } else if (action === 'pin') {
    if (S.chatId) api(`/api/chats/${S.chatId}/pin`, { method: 'POST', body: JSON.stringify({ messageId: msg.id }) })
      .then(chat => { S.chatObj = chat; showToast('Закреплено', 'success'); updatePinnedBar(); }).catch(e => showToast(e.message, 'error'));
  } else if (action === 'forward') {
    showForwardModal(msg.id);
  } else if (action === 'translate') {
    translateMessage(msg.id);
  } else if (action === 'remove-translate') {
    const el = $('messages-area').querySelector(`.msg[data-id="${msg.id}"] .msg-translation`);
    if (el) { el.remove(); showToast('Перевод удалён', 'success'); }
  } else if (action === 'save') {
    // Save to favourites (self-chat) — debounced to prevent duplicates
    if (window._savingFav) return;
    window._savingFav = true;
    const saveChatId = S.chats.find(c => c.type === 'private' && c.members?.length === 1)?.id;
    if (saveChatId) {
      api(`/api/messages/${msg.id}/forward`, { method: 'POST', body: JSON.stringify({ targetChatId: saveChatId }) })
        .then(() => showToast('Сохранено в Избранное', 'success')).catch(() => showToast('Не удалось сохранить', 'error'))
        .finally(() => { window._savingFav = false; });
    } else { showToast('Сначала откройте Избранное', 'info'); window._savingFav = false; }
  } else if (action === 'select-text') {
    if (msg.text) { if (navigator.clipboard) navigator.clipboard.writeText(msg.text).catch(() => _fallbackCopy(msg.text)); else _fallbackCopy(msg.text); showToast('Текст скопирован', 'success'); }
  } else if (action === 'download') {
    const url = msg.fileUrl || msg.url;
    if (url) { const a = document.createElement('a'); a.href = url; a.download = msg.fileName || 'file'; a.click(); }
  } else if (action === 'report') {
    showToast('Жалоба отправлена', 'success');
  }
}

function showQuickReact(msgId) {
  const basicEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯', '🎉', '🤔', '😍', '👀', '💀', '🙌', '😭', '🤣', '😊', '🥺', '🫡', '⚡'];
  const canPremium = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
  const premiumEmojis = canPremium ? ['💎', '👑', '🦄', '🐉', '☠️', '🔮', '🌈', '🎭'] : [];
  const emojis = [...basicEmojis, ...premiumEmojis];
  const menu = $('ctx-menu');
  $('ctx-items').innerHTML = `<div class="react-grid">${emojis.map(e => `<span class="react-emoji" data-emoji="${e}">${e}</span>`).join('')}</div>`;
  show(menu);
  menu.querySelectorAll('.react-emoji').forEach(el => el.onclick = () => { reactToMessage(msgId, el.dataset.emoji); hide(menu); });
}

async function reactToMessage(msgId, emoji) {
  try { await api(`/api/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }); } catch (e) { showToast('Не удалось поставить реакцию', 'error'); }
}

function cancelReply() { S.replyTo = null; hide($('reply-bar')); }
function cancelEdit() { S.editMsg = null; $('msg-input').value = ''; hide($('edit-bar')); toggleSendBtn(); }

/* ══════════════════════════════════════════════════════════════════════
   CHAT MENU (delete chat etc.)
   ══════════════════════════════════════════════════════════════════════ */
function showChatMenu(e) {
  e.stopPropagation();
  if (!S.chatObj) return;
  const items = [];
  items.push({ icon: 'fa-thumbtack', label: S.chatObj.pinned ? 'Открепить чат' : 'Закрепить чат', action: 'toggle-pin' });
  items.push({ icon: 'fa-bell-slash', label: S.chatObj.muted ? 'Включить звук' : 'Без звука', action: 'toggle-mute' });
  items.push({ icon: 'fa-magnifying-glass', label: 'Поиск по чату', action: 'search-chat' });
  items.push({ icon: 'fa-clock', label: 'Авто-удаление', action: 'autodelete' });
  items.push({ icon: 'fa-calendar', label: 'Запланировать', action: 'schedule' });
  items.push({ icon: 'fa-image', label: 'Медиафайлы', action: 'show-media' });
  items.push({ icon: 'fa-file-export', label: 'Экспорт чата', action: 'export-chat' });
  if (S.chatObj.type === 'group' || S.chatObj.type === 'channel') {
    items.push({ icon: 'fa-circle-info', label: 'Информация', action: 'group-info' });
    items.push({ icon: 'fa-user-group', label: 'Участники', action: 'show-members' });
    items.push({ icon: 'fa-pen', label: 'Ред. группу', action: 'edit-group' });
    items.push({ icon: 'fa-user-plus', label: 'Пригласить', action: 'invite-member' });
    if (S.chatObj.admins?.includes(S.user.id)) items.push({ icon: 'fa-user-tag', label: 'Роли', action: 'manage-roles' });
  }
  if (S.chatObj.type === 'private') {
    items.push({ icon: 'fa-user', label: 'Профиль', action: 'view-profile' });
    items.push({ icon: 'fa-ban', label: 'Заблокировать', action: 'block-user' });
  }
  items.push({ icon: 'fa-broom', label: 'Очистить историю', action: 'clear-history' });
  items.push({ icon: 'fa-trash', label: (S.chatObj.type === 'group' || S.chatObj.type === 'channel') ? 'Покинуть' : 'Удалить чат', action: 'delete-chat', danger: true });

  const menu = $('ctx-menu');
  $('ctx-items').innerHTML = items.map(it =>
    `<div class="ctx-item${it.danger ? ' danger' : ''}" data-action="${it.action}"><i class="fas ${it.icon}"></i>${it.label}</div>`
  ).join('');

  const rect = e.target.closest('button').getBoundingClientRect();
  menu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
  menu.style.top = (rect.bottom + 4) + 'px';
  show(menu);

  menu.querySelectorAll('.ctx-item').forEach(el => el.onclick = () => { handleChatMenuAction(el.dataset.action); hide(menu); });
}

async function handleChatMenuAction(action) {
  if (!S.chatId) return;
  if (action === 'toggle-pin') {
    try {
      const res = await api(`/api/chats/${S.chatId}`, { method: 'PUT', body: JSON.stringify({ pinned: !S.chatObj.pinned }) });
      S.chatObj.pinned = res.pinned;
      loadChats();
      showToast(res.pinned ? 'Чат закреплён' : 'Чат откреплён', 'success');
    } catch {}
  } else if (action === 'toggle-mute') {
    try {
      const res = await api(`/api/chats/${S.chatId}`, { method: 'PUT', body: JSON.stringify({ muted: !S.chatObj.muted }) });
      S.chatObj.muted = res.muted;
      loadChats();
      showToast(res.muted ? 'Звук отключён' : 'Звук включён', 'success');
    } catch {}
  } else if (action === 'search-chat') {
    showChatSearchModal();
  } else if (action === 'group-info') {
    openGroupInfo();
  } else if (action === 'show-members') {
    toggleMembers(true);
  } else if (action === 'edit-group') {
    showEditGroupModal();
  } else if (action === 'view-profile') {
    const partner = getPartner();
    if (partner) showProfile(partner);
  } else if (action === 'block-user') {
    showToast('Пользователь заблокирован', 'success');
  } else if (action === 'show-media') {
    const media = S.messages.filter(m => m.type === 'image' || m.type === 'video');
    if (!media.length) { showToast('Нет медиафайлов', 'info'); return; }
    const first = $('messages-area').querySelector(`.msg[data-id="${media[media.length - 1].id}"]`);
    if (first) { first.scrollIntoView({behavior:'smooth',block:'center'}); first.style.outline='2px solid var(--brand)'; setTimeout(()=>first.style.outline='',2000); }
    showToast(`Медиа: ${media.length} шт.`, 'info');
  } else if (action === 'export-chat') {
    const text = S.messages.map(m => `[${new Date(m.timestamp).toLocaleString('ru')}] ${m.senderName}: ${m.text || m.type}`).join('\n');
    const blob = new Blob([text], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chat-${S.chatId}.txt`; a.click();
    showToast('Чат экспортирован', 'success');
  } else if (action === 'invite-member') {
    showInviteMemberModal();
  } else if (action === 'autodelete') {
    showAutoDeleteModal();
  } else if (action === 'schedule') {
    showScheduleModal();
  } else if (action === 'manage-roles') {
    showRolesModal();
  } else if (action === 'clear-history') {
    if (!confirm('Очистить историю сообщений?')) return;
    try {
      await api(`/api/chats/${S.chatId}/messages`, { method: 'DELETE' });
      S.messages = [];
      renderMessages();
      showToast('История очищена', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  } else if (action === 'delete-chat') {
    if (!confirm(S.chatObj.type === 'group' ? 'Покинуть группу?' : 'Удалить чат?')) return;
    try {
      await api(`/api/chats/${S.chatId}`, { method: 'DELETE' });
      S.chats = S.chats.filter(c => c.id !== S.chatId);
      closeChat();
      renderChatList();
      showToast('Чат удалён', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }
}

/* ── Chat list context menu ─────────────────────────────────────────── */
function showChatListContextMenu(e, chatId) {
  const chat = S.chats.find(c => c.id === chatId);
  if (!chat) return;
  const items = [
    { icon: 'fa-thumbtack', label: chat.pinned ? 'Открепить чат' : 'Закрепить чат', action: 'ctx-pin' },
    { icon: 'fa-bell-slash', label: chat.muted ? 'Включить звук' : 'Без звука', action: 'ctx-mute' },
    { icon: 'fa-check-double', label: 'Прочитать все', action: 'ctx-read' },
    { icon: 'fa-magnifying-glass', label: 'Поиск', action: 'ctx-search' },
    { icon: 'fa-clock', label: 'Авто-удаление', action: 'ctx-autodelete' },
    { icon: 'fa-broom', label: 'Очистить чат', action: 'ctx-clear' },
  ];
  if (chat.type === 'private') items.push({ icon: 'fa-user', label: 'Профиль', action: 'ctx-profile' });
  if (chat.type === 'group') items.push({ icon: 'fa-user-group', label: 'Участники', action: 'ctx-members' });
  items.push({ icon: 'fa-archive', label: 'Архивировать', action: 'ctx-archive' });
  items.push({ icon: 'fa-trash', label: chat.type === 'group' ? 'Покинуть группу' : 'Удалить чат', action: 'ctx-delete', danger: true });

  const menu = $('ctx-menu');
  $('ctx-items').innerHTML = items.map(it =>
    `<div class="ctx-item${it.danger ? ' danger' : ''}" data-action="${it.action}"><i class="fas ${it.icon}"></i>${it.label}</div>`
  ).join('');

  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - items.length * 40) + 'px';
  show(menu);

  menu.querySelectorAll('.ctx-item').forEach(el => el.onclick = async () => {
    hide(menu);
    const act = el.dataset.action;
    if (act === 'ctx-pin') {
      try {
        const res = await api(`/api/chats/${chatId}`, { method: 'PUT', body: JSON.stringify({ pinned: !chat.pinned }) });
        chat.pinned = res.pinned;
        loadChats();
        showToast(res.pinned ? 'Закреплено' : 'Откреплено', 'success');
      } catch {}
    } else if (act === 'ctx-mute') {
      try {
        const res = await api(`/api/chats/${chatId}`, { method: 'PUT', body: JSON.stringify({ muted: !chat.muted }) });
        chat.muted = res.muted;
        loadChats();
        showToast(res.muted ? 'Звук выключен' : 'Звук включён', 'success');
      } catch {}
    } else if (act === 'ctx-read') {
      S.socket?.emit('mark_read', { chatId });
      chat.unreadCount = 0;
      renderChatList();
      updateBadge();
    } else if (act === 'ctx-search') {
      openChat(chatId);
      setTimeout(() => showChatSearchModal(), 300);
    } else if (act === 'ctx-autodelete') {
      openChat(chatId);
      setTimeout(() => showAutoDeleteModal(), 300);
    } else if (act === 'ctx-clear') {
      if (!confirm('Очистить историю?')) return;
      try {
        await api(`/api/chats/${chatId}/messages`, { method: 'DELETE' });
        if (S.chatId === chatId) { S.messages = []; renderMessages(); }
        showToast('Чат очищен', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    } else if (act === 'ctx-profile') {
      const c = S.chats.find(c => c.id === chatId);
      if (c) { const otherId = c.members?.find(id => id !== S.user.id); if (otherId) showProfileById(otherId); }
    } else if (act === 'ctx-members') {
      openChat(chatId);
      setTimeout(() => toggleMembers(true), 300);
    } else if (act === 'ctx-archive') {
      showToast('Чат архивирован', 'success');
    } else if (act === 'ctx-delete') {
      if (!confirm(chat.type === 'group' ? 'Покинуть группу?' : 'Удалить чат?')) return;
      try {
        await api(`/api/chats/${chatId}`, { method: 'DELETE' });
        S.chats = S.chats.filter(c => c.id !== chatId);
        if (S.chatId === chatId) closeChat();
        renderChatList();
        showToast('Удалено', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════
   CONTACTS / FRIENDS
   ══════════════════════════════════════════════════════════════════════ */
async function loadFriends() {
  try {
    const [friends, pending, outgoing] = await Promise.all([
      api('/api/friends'), api('/api/friends/pending'), api('/api/friends/outgoing')
    ]);
    S.friends = friends;
    S.pendingIn = pending;
    S.pendingOut = outgoing;
    const badge = $('badge-contacts');
    if (pending.length) { badge.textContent = pending.length; show(badge); } else hide(badge);
    renderContacts();
  } catch {}
}

function renderContacts(ct) {
  const active = ct || document.querySelector('.sub-tab.active')?.dataset.ct || 'friends';
  const list = $('contacts-list');

  if (active === 'friends') {
    if (!S.friends.length) { list.innerHTML = '<div class="empty-state"><i class="fas fa-user-group"></i><p>Нет друзей</p></div>'; return; }
    list.innerHTML = S.friends.map(u => `<div class="contact-item">
      ${avatarHTML(u, 'ct-avatar')}
      <div class="ct-info"><div class="ct-name">${escHTML(u.displayName)}</div><div class="ct-status">${u.online ? 'в сети' : 'не в сети'}</div></div>
      <div class="ct-actions">
        <button title="Написать" onclick="startChatWith('${u.id}')"><i class="fas fa-comment"></i></button>
        <button title="Позвонить" onclick="startCallTo('${u.id}','audio')"><i class="fas fa-phone"></i></button>
        <button title="Удалить" class="ct-reject" onclick="removeFriend('${u.friendshipId}')"><i class="fas fa-xmark"></i></button>
      </div></div>`).join('');
  } else if (active === 'pending') {
    if (!S.pendingIn.length) { list.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>Нет входящих запросов</p></div>'; return; }
    list.innerHTML = S.pendingIn.map(r => `<div class="contact-item">
      ${avatarHTML(r.user, 'ct-avatar')}
      <div class="ct-info"><div class="ct-name">${escHTML(r.user.displayName)}</div><div class="ct-status">@${escHTML(r.user.username)}</div></div>
      <div class="ct-actions">
        <button title="Принять" onclick="acceptFriend('${r.id}')"><i class="fas fa-check"></i></button>
        <button title="Отклонить" class="ct-reject" onclick="rejectFriend('${r.id}')"><i class="fas fa-xmark"></i></button>
      </div></div>`).join('');
  } else if (active === 'outgoing') {
    if (!S.pendingOut.length) { list.innerHTML = '<div class="empty-state"><i class="fas fa-paper-plane"></i><p>Нет исходящих запросов</p></div>'; return; }
    list.innerHTML = S.pendingOut.map(r => `<div class="contact-item">
      ${avatarHTML(r.user, 'ct-avatar')}
      <div class="ct-info"><div class="ct-name">${escHTML(r.user.displayName)}</div><div class="ct-status">Ожидание...</div></div>
    </div>`).join('');
  } else if (active === 'search') {
    // keep rendered by searchUsers
  }
}

async function searchUsers() {
  const q = $('contacts-search').value.trim();
  if (!q) return;
  try {
    const users = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    const list = $('contacts-list');
    if (!users.length) { list.innerHTML = '<div class="empty-state"><p>Не найдено</p></div>'; return; }
    list.innerHTML = users.map(u => `<div class="contact-item">
      ${avatarHTML(u, 'ct-avatar')}
      <div class="ct-info"><div class="ct-name">${escHTML(u.displayName)}</div><div class="ct-status">@${escHTML(u.username)}</div></div>
      <div class="ct-actions">
        <button title="Добавить в друзья" onclick="addFriend('${u.id}')"><i class="fas fa-user-plus"></i></button>
        <button title="Написать" onclick="startChatWith('${u.id}')"><i class="fas fa-comment"></i></button>
      </div></div>`).join('');
  } catch (e) { showToast(e.message, 'error'); }
}

async function addFriend(uid) {
  try { await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ userId: uid }) }); showToast('Запрос отправлен', 'success'); loadFriends(); } catch (e) { showToast(e.message, 'error'); }
}
async function acceptFriend(id) {
  try { await api(`/api/friends/accept/${id}`, { method: 'POST' }); showToast('Друг добавлен', 'success'); loadFriends(); } catch (e) { showToast(e.message, 'error'); }
}
async function rejectFriend(id) {
  try { await api(`/api/friends/reject/${id}`, { method: 'POST' }); loadFriends(); } catch (e) { showToast(e.message, 'error'); }
}
async function removeFriend(id) {
  try { await api(`/api/friends/${id}`, { method: 'DELETE' }); loadFriends(); } catch (e) { showToast(e.message, 'error'); }
}
window.addFriend = addFriend;
window.acceptFriend = acceptFriend;
window.rejectFriend = rejectFriend;
window.removeFriend = removeFriend;

async function startChatWith(uid) {
  try {
    const chat = await api('/api/chats', { method: 'POST', body: JSON.stringify({ userId: uid }) });
    await loadChats();
    openChat(chat.id);
    switchTab('chats');
  } catch (e) { showToast(e.message, 'error'); }
}
window.startChatWith = startChatWith;

async function startCallTo(uid, type) {
  await startChatWith(uid);
  setTimeout(() => startCallAction(type), 500);
}
window.startCallTo = startCallTo;

/* ══════════════════════════════════════════════════════════════════════
   GROUP
   ══════════════════════════════════════════════════════════════════════ */
let _groupMembers = [];
function searchGroupUsers() {
  const q = $('group-search').value.trim();
  if (!q) { $('group-results').innerHTML = ''; return; }
  api(`/api/users/search?q=${encodeURIComponent(q)}`).then(users => {
    $('group-results').innerHTML = users.filter(u => !_groupMembers.includes(u.id)).map(u =>
      `<div class="contact-item" style="cursor:pointer" data-uid="${u.id}" data-name="${escHTML(u.displayName)}">
        ${avatarHTML(u, 'ct-avatar')}
        <div class="ct-info"><div class="ct-name">${escHTML(u.displayName)}</div></div>
      </div>`
    ).join('');
    $('group-results').querySelectorAll('.contact-item').forEach(el => el.onclick = () => {
      const uid = el.dataset.uid, name = el.dataset.name;
      if (!_groupMembers.includes(uid)) {
        _groupMembers.push(uid);
        $('group-chips').innerHTML += `<span class="group-chip" data-uid="${uid}">${name} <i class="fas fa-xmark"></i></span>`;
        $('group-chips').querySelectorAll('.group-chip').forEach(c => c.onclick = () => { _groupMembers = _groupMembers.filter(id => id !== c.dataset.uid); c.remove(); });
      }
    });
  });
}

async function createGroup() {
  const name = $('group-name').value.trim();
  if (!name) { showToast('Введите название', 'warning'); return; }
  const typeBtn = document.querySelector('#group-type-opts .s-opt-btn.active');
  const type = typeBtn ? typeBtn.dataset.val : 'group';
  const description = $('group-description') ? $('group-description').value.trim() : '';
  try {
    const body = { name, memberIds: _groupMembers, type };
    if (description) body.description = description;
    const chat = await api('/api/chats/group', { method: 'POST', body: JSON.stringify(body) });
    hide($('modal-group'));
    _groupMembers = [];
    $('group-chips').innerHTML = '';
    $('group-name').value = '';
    if ($('group-description')) $('group-description').value = '';
    $('group-search').value = '';
    $('group-results').innerHTML = '';
    // Reset type selector
    document.querySelectorAll('#group-type-opts .s-opt-btn').forEach(b => b.classList.toggle('active', b.dataset.val === 'group'));
    await loadChats();
    openChat(chat.id);
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   MEMBERS
   ══════════════════════════════════════════════════════════════════════ */
function toggleMembers(force) {
  const panel = $('members-panel');
  const show_ = force !== undefined ? force : panel.classList.contains('hidden');
  if (show_) {
    panel.classList.remove('hidden');
    if (S.isMobile) panel.classList.add('mob-show');
    $('app').classList.remove('members-hidden');
    renderMembers();
  } else {
    panel.classList.add('hidden');
    if (S.isMobile) panel.classList.remove('mob-show');
    $('app').classList.add('members-hidden');
  }
}

function renderMembers() {
  const c = S.chatObj;
  if (!c) return;
  const list = $('members-list');
  if (c.membersInfo?.length) {
    list.innerHTML = c.membersInfo.map(m => `<div class="member-item" onclick="showProfileById('${m.id}')">
      <div class="m-avatar" style="background:${m.avatarColor || AVATARS[0]}">${(m.displayName || '?')[0].toUpperCase()}${m.avatar ? `<img src="${escHTML(m.avatar)}">` : ''}<div class="m-dot ${m.online ? 'on' : 'off'}"></div></div>
      <span class="m-name ${m.online ? 'm-online' : ''}">${escHTML(m.displayName)}</span>
    </div>`).join('');
  } else if (c.type === 'private') {
    const p = getPartner();
    if (p) {
      list.innerHTML = `<div class="member-item">
        ${avatarHTML(p, 'm-avatar')}
        <span class="m-name m-online">${escHTML(p.displayName)}</span>
      </div>`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   PROFILE VIEWER
   ══════════════════════════════════════════════════════════════════════ */
async function showProfileById(uid) {
  try {
    const u = await api(`/api/users/${uid}`);
    showProfile(u);
  } catch {}
}
window.showProfileById = showProfileById;

function showProfile(u) {
  if (!u) return;
  $('pv-name').textContent = u.displayName || u.username || '?';
  $('pv-username').textContent = '@' + (u.username || '');
  $('pv-bio').textContent = u.bio || '';
  const av = $('pv-avatar');
  av.style.background = u.avatarColor || AVATARS[0];
  av.innerHTML = (u.displayName || '?')[0].toUpperCase() + (u.avatar ? `<img src="${escHTML(u.avatar)}">` : '');

  const actions = $('pv-actions');
  if (u.id !== S.user.id) {
    actions.innerHTML = `<button class="btn-primary" onclick="startChatWith('${u.id}')"><i class="fas fa-comment"></i> Написать</button><button class="btn-sm" onclick="addFriend('${u.id}')"><i class="fas fa-user-plus"></i> Добавить</button>`;
  } else {
    actions.innerHTML = '';
  }
  showProfileExtended(u);
  show($('profile-viewer'));
}

/* ══════════════════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════════════════ */
function openSettings() {
  fillSettings();
  loadSessions();
  show($('modal-settings'));
  const main = $('tg-settings-main');
  const detail = $('tg-settings-detail');
  const isMob = window.innerWidth <= 768;
  if (isMob) {
    // Reset to main list (slide style)
    if (main) main.classList.remove('slid-out');
    if (detail) detail.classList.remove('open');
  } else {
    // Desktop: show both panels, open first section by default
    if (detail) detail.classList.add('open');
    switchSettingsSection('sec-profile');
  }
}

function openMobSub(id) {
  // Hide all sub-pages and main
  $$('.mob-settings-sub').forEach(s => s.classList.add('hidden'));
  $('mob-settings-main').classList.add('hidden');
  const sub = $(id);
  if (sub) sub.classList.remove('hidden');
  // Sync toggle states
  _syncMobToggles();
  // Sync radio states for nested pages
  _syncMobRadios();
  // Fill profile fields
  if (id === 'mob-sub-profile') _fillMobProfile();
  // Load sessions
  if (id === 'mob-sub-sessions') _loadMobSessions();
  // Fill premium status
  if (id === 'mob-sub-premium') _fillMobPremium();
}

function _syncMobToggles() {
  const s = S.user?.settings || {};
  if ($('mob-set-notifications')) $('mob-set-notifications').checked = s.notifications !== false;
  if ($('mob-set-sounds')) $('mob-set-sounds').checked = s.soundEnabled !== false;
  if ($('mob-set-online')) $('mob-set-online').checked = s.privShowOnline !== false;
  if ($('mob-set-read')) $('mob-set-read').checked = s.privReadReceipts !== false;
  if ($('mob-set-typing')) $('mob-set-typing').checked = s.privShowTyping !== false;
  if ($('mob-set-ghost')) $('mob-set-ghost').checked = S.ghostMode;
  if ($('mob-set-dnd')) $('mob-set-dnd').checked = !!S.user?.dndMode;
  if ($('mob-set-dnd-reply')) $('mob-set-dnd-reply').value = S.user?.dndAutoReply || '';
  if ($('mob-set-animations')) $('mob-set-animations').checked = s.animations !== false;
  if ($('mob-set-send-enter')) $('mob-set-send-enter').checked = !!s.sendByEnter;
  if ($('mob-set-super-moderate')) $('mob-set-super-moderate').checked = !!s.superModerate;
  if ($('mob-set-super-see-hidden')) $('mob-set-super-see-hidden').checked = s.superExtended !== false;
  // Sync mobile custom theme inputs
  const ct = s.customTheme || {};
  if ($('mob-ct-bg')) $('mob-ct-bg').value = ct.bg || '#313338';
  if ($('mob-ct-dark')) $('mob-ct-dark').value = ct.dark || '#1e1f22';
  if ($('mob-ct-sec')) $('mob-ct-sec').value = ct.sec || '#2b2d31';
  if ($('mob-ct-brand')) $('mob-ct-brand').value = ct.brand || '#5865f2';
  if (typeof _updateMobCpSwatches === 'function') _updateMobCpSwatches();
}

function _syncMobRadios() {
  const s = S.user?.settings || {};
  const fs = s.fontSize || 'normal';
  const dn = s.msgDensity || 'cozy';
  const bs = s.bubbleStyle || 'default';
  const br = s.borderRadius || 'normal';
  const fsEl = document.querySelector(`input[name="mob-fontsize"][value="${fs}"]`);
  if (fsEl) fsEl.checked = true;
  const dnEl = document.querySelector(`input[name="mob-density"][value="${dn}"]`);
  if (dnEl) dnEl.checked = true;
  const bsEl = document.querySelector(`input[name="mob-msgstyle"][value="${bs}"]`);
  if (bsEl) bsEl.checked = true;
  const brEl = document.querySelector(`input[name="mob-radius"][value="${br}"]`);
  if (brEl) brEl.checked = true;
}

function _fillMobProfile() {
  if ($('mob-set-username')) $('mob-set-username').value = S.user?.username || '';
  if ($('mob-set-displayname')) $('mob-set-displayname').value = S.user?.displayName || '';
  if ($('mob-set-bio')) $('mob-set-bio').value = S.user?.bio || '';
  if ($('mob-set-cur-password')) $('mob-set-cur-password').value = '';
  if ($('mob-set-new-password')) $('mob-set-new-password').value = '';
  const av = $('mob-edit-avatar');
  if (av) {
    av.style.background = S.user?.avatarColor || AVATARS[0];
    av.innerHTML = (S.user?.displayName || '?')[0].toUpperCase() + (S.user?.avatar ? `<img src="${escHTML(S.user.avatar)}">` : '');
  }
}

async function _loadMobSessions() {
  try {
    const sessions = await api('/api/me/sessions');
    const el = $('mob-sessions-list');
    if (el) el.innerHTML = sessions.map(s =>
      `<div class="tg-mob-session${s.current ? ' current' : ''}"><i class="fas ${s.device?.includes('Mobile') ? 'fa-mobile-screen' : 'fa-desktop'}"></i><div class="tg-mob-session-info"><span class="tg-mob-session-device">${escHTML(s.device)}${s.current ? ' <small>(текущая)</small>' : ''}</span><span class="tg-mob-session-date">${new Date(s.createdAt).toLocaleDateString('ru')}</span></div></div>`
    ).join('');
  } catch {}
}

function _fillMobPremium() {
  const card = $('mob-premium-card');
  if (!card) return;
  const role = S.user?.superUser ? 'super_user' : (S.user?.premium || S.user?.premiumFree) ? 'premium' : 'user';
  const icons = { user: '👻', premium: '💎', super_user: '⚡', admin: '🛡️' };
  const names = { user: 'Обычный пользователь', premium: 'Shadow+', super_user: 'Super User', admin: 'Администратор' };
  card.querySelector('.tg-mob-premium-icon').textContent = icons[role] || '👻';
  card.querySelector('.tg-mob-premium-role').textContent = names[role] || 'Пользователь';
  card.querySelector('.tg-mob-premium-desc').textContent = role === 'user' ? 'Активируйте Shadow+ для расширенных возможностей' : 'Все возможности активны';

  const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
  const configEl = $('mob-premium-config');
  const lockArea = $('mob-premium-lock-area');
  if (lockArea) {
    lockArea.innerHTML = canUse ? '' : '<div class="mob-premium-lock-badge"><i class="fas fa-lock"></i> Функции ниже доступны для Shadow+</div>';
  }
  if (configEl) configEl.classList.toggle('mob-premium-locked', !canUse);

  // Premium card style
  card.classList.remove('psc-premium', 'psc-super');
  if (S.user?.superUser) card.classList.add('psc-super');
  else if (canUse) card.classList.add('psc-premium');

  // Custom status
  if ($('mob-cs-text')) $('mob-cs-text').value = S.user?.customStatus || '';
  if ($('mob-cs-emoji')) $('mob-cs-emoji').value = S.user?.customStatusEmoji || '';
  if ($('mob-cs-color')) $('mob-cs-color').value = S.user?.customStatusColor || '#5865f2';

  // Social links
  const sl = S.user?.socialLinks || {};
  if ($('mob-social-tg')) $('mob-social-tg').value = sl.telegram || '';
  if ($('mob-social-ig')) $('mob-social-ig').value = sl.instagram || '';
  if ($('mob-social-gh')) $('mob-social-gh').value = sl.github || '';
  if ($('mob-social-web')) $('mob-social-web').value = sl.website || '';

  initMobPremiumPickers();

  // Tab switching
  document.querySelectorAll('.mob-prem-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.mob-prem-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.ptab;
      if ($('mob-prem-tab-settings')) $('mob-prem-tab-settings').style.display = tab === 'settings' ? '' : 'none';
      if ($('mob-prem-tab-about')) $('mob-prem-tab-about').style.display = tab === 'about' ? '' : 'none';
    };
  });
}
  // Emoji picker
  const emojiGrid = $('mob-premium-emoji-grid');
  if (emojiGrid) {
    const emojis = ['⭐', '💎', '👑', '🔥', '💫', '✨', '🌟', '⚡', '🎯', '🦋', '🌈', '🍀', '💜', '🖤', '❤️‍🔥', '🎵', '🎮', '🏆', '🦄', '🌸', '🐉', '☠️', '👾', '🤖', '🎭', '🌙', '❄️', '🍭', '🧬', '🎪', '🃏', '🔮', ''];
    emojiGrid.innerHTML = emojis.map(e => `<span class="pe-emoji${e === (S.user?.premiumEmoji || '') ? ' active' : ''}" data-emoji="${e}">${e || '✕'}</span>`).join('');
    emojiGrid.querySelectorAll('.pe-emoji').forEach(el => {
      el.ontouchend = el.onclick = async (ev) => {
        ev.preventDefault();
        const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
        if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
        emojiGrid.querySelectorAll('.pe-emoji').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        try {
          S.user = await api('/api/me/emoji', { method: 'PUT', body: JSON.stringify({ emoji: el.dataset.emoji }) });
          showToast(el.dataset.emoji ? `Эмодзи: ${el.dataset.emoji}` : 'Эмодзи убрано', 'success');
        } catch (e) { showToast(e.message, 'error'); }
      };
    });
  }

  // Custom emoji
  const btnCE = $('mob-btn-set-custom-emoji');
  if (btnCE) btnCE.onclick = async () => {
    const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
    if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
    const val = $('mob-custom-emoji-input').value.trim();
    if (emojiGrid) emojiGrid.querySelectorAll('.pe-emoji').forEach(x => x.classList.remove('active'));
    try {
      S.user = await api('/api/me/emoji', { method: 'PUT', body: JSON.stringify({ emoji: val }) });
      showToast(val ? `Эмодзи: ${val}` : 'Эмодзи убрано', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Badge picker
  const badgeGrid = $('mob-premium-badge-grid');
  if (badgeGrid) {
    const badges = ['', 'VIP', 'PRO', 'ELITE', 'BOSS', 'KING', 'ACE', 'TOP', 'MVP', 'HERO', 'LEGEND', 'OG', 'ALPHA', 'SIGMA'];
    badgeGrid.innerHTML = badges.map(b => `<span class="pe-badge${b === (S.user?.premiumBadge || '') ? ' active' : ''}" data-badge="${b}">${b || '✕'}</span>`).join('');
    badgeGrid.querySelectorAll('.pe-badge').forEach(el => {
      el.ontouchend = el.onclick = async (ev) => {
        ev.preventDefault();
        const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
        if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
        badgeGrid.querySelectorAll('.pe-badge').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        try {
          S.user = await api('/api/me/badge', { method: 'PUT', body: JSON.stringify({ badge: el.dataset.badge }) });
          showToast(el.dataset.badge ? `Значок: ${el.dataset.badge}` : 'Значок убран', 'success');
        } catch (e) { showToast(e.message, 'error'); }
      };
    });
  }

  // Custom badge
  const btnCB = $('mob-btn-set-custom-badge');
  if (btnCB) btnCB.onclick = async () => {
    const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
    if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
    const val = $('mob-custom-badge-input').value.trim();
    if (val.length > 12) { showToast('Макс. 12 символов', 'warning'); return; }
    if (badgeGrid) badgeGrid.querySelectorAll('.pe-badge').forEach(x => x.classList.remove('active'));
    try {
      S.user = await api('/api/me/badge', { method: 'PUT', body: JSON.stringify({ badge: val }) });
      showToast(val ? `Значок: ${val}` : 'Значок убран', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Color picker
  const colorGrid = $('mob-premium-color-grid');
  if (colorGrid) {
    const colors = ['', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#e84393', '#00cec9', '#fd79a8', '#a29bfe', '#ff9ff3', '#f368e0', '#ff6348', '#7bed9f', '#70a1ff', '#5352ed', '#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#eccc68'];
    colorGrid.innerHTML = colors.map(c => {
      const active = c === (S.user?.premiumNameColor || '') ? ' active' : '';
      return c ? `<span class="pe-color${active}" data-color="${c}" style="background:${c}"></span>` : `<span class="pe-color${active}" data-color="">✕</span>`;
    }).join('');
    colorGrid.querySelectorAll('.pe-color').forEach(el => {
      el.ontouchend = el.onclick = async (ev) => {
        ev.preventDefault();
        const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
        if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
        colorGrid.querySelectorAll('.pe-color').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        try {
          S.user = await api('/api/me/namecolor', { method: 'PUT', body: JSON.stringify({ color: el.dataset.color }) });
          showToast(el.dataset.color ? 'Цвет применён' : 'Цвет сброшен', 'success');
        } catch (e) { showToast(e.message, 'error'); }
      };
    });
  }

  // Premium themes
  const themesGrid = $('mob-premium-themes-grid');
  if (themesGrid) {
    const names = {neon:'Неон',sakura:'Сакура',cyber:'Кибер',golden:'Золото',aurora:'Аврора',vampire:'Вампир',lavender:'Лаванда',emerald:'Изумруд',synthwave:'Синтвейв',arctic:'Арктика',magma:'Магма',matrix:'Матрица',cosmic:'Космос','midnight-blue':'Индиго'};
    themesGrid.innerHTML = Object.entries(PREMIUM_THEMES).map(([name, t]) =>
      `<div class="theme-swatch${name === (S.user?.settings?.theme || '') ? ' active' : ''}" data-theme="${name}" style="background:${t.bg}">
        <div class="ts-preview"><div class="ts-sb" style="background:${t.dark}"></div><div class="ts-pnl" style="background:${t.sec}"></div><div class="ts-ch"><div class="ts-m1" style="background:${t.sec}"></div><div class="ts-m2" style="background:${t.brand}"></div></div></div>
        <span class="ts-name">💎 ${names[name] || name}</span>
      </div>`
    ).join('');
    themesGrid.querySelectorAll('.theme-swatch').forEach(s => s.onclick = async () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
      const themeName = s.dataset.theme;
      const t = PREMIUM_THEMES[themeName];
      if (!t) return;
      applyTheme(themeName);
      themesGrid.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      try { S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { theme: themeName } }) }); showToast('Тема применена', 'success'); } catch {}
    });
  }

  // Custom status save
  const btnStatus = $('mob-btn-save-status');
  if (btnStatus) btnStatus.onclick = async () => {
    const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
    if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
    try {
      S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({
        customStatus: $('mob-cs-text')?.value || '',
        customStatusEmoji: $('mob-cs-emoji')?.value || '',
        customStatusColor: $('mob-cs-color')?.value || '#5865f2'
      }) });
      showToast('Статус сохранён', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // Social links save
  const btnSocial = $('mob-btn-save-social');
  if (btnSocial) btnSocial.onclick = async () => {
    const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
    if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
    try {
      S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({
        socialLinks: {
          telegram: $('mob-social-tg')?.value || '',
          instagram: $('mob-social-ig')?.value || '',
          github: $('mob-social-gh')?.value || '',
          website: $('mob-social-web')?.value || ''
        }
      }) });
      showToast('Ссылки сохранены', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
}

function closeMobSub(id, parentId) {
  const sub = $(id);
  if (sub) sub.classList.add('hidden');
  if (parentId) {
    // Navigate back to parent sub-page
    const parent = $(parentId);
    if (parent) parent.classList.remove('hidden');
  } else {
    // Navigate back to main settings
    $('mob-settings-main').classList.remove('hidden');
  }
}

function switchSettingsSection(secId) {
  const titles = {'sec-profile':'Аккаунт','sec-appearance':'Внешний вид','sec-notifications':'Уведомления','sec-privacy':'Конфиденциальность','sec-premium':'Shadow+','sec-sessions':'Устройства'};
  const isMob = window.innerWidth <= 768;
  const main = $('tg-settings-main');
  const detail = $('tg-settings-detail');
  if (isMob) {
    // Mobile: slide panels
    if (main) main.classList.add('slid-out');
    if (detail) detail.classList.add('open');
  } else {
    // Desktop: always visible, just switch content
    if (detail && !detail.classList.contains('open')) detail.classList.add('open');
  }
  // Highlight active item
  $$('.tg-settings-item[data-sec]').forEach(b => b.classList.toggle('pc-active', b.dataset.sec === secId));
  const titleEl = $('tg-detail-title');
  if (titleEl) titleEl.textContent = titles[secId] || 'Настройки';
  $$('.settings-section').forEach(s => s.classList.toggle('active', s.id === secId));
}

function fillSettings() {
  $('set-username').value = S.user?.username || '';
  $('set-displayname').value = S.user?.displayName || '';
  $('set-bio').value = S.user?.bio || '';
  $('set-cur-password').value = '';
  $('set-new-password').value = '';

  const s = S.user?.settings || {};
  $('set-notifications').checked = s.notifications !== false;
  $('set-sounds').checked = s.soundEnabled !== false;
  $('set-show-online').checked = s.privShowOnline !== false;
  $('set-read-receipts').checked = s.privReadReceipts !== false;
  $('set-show-typing').checked = s.privShowTyping !== false;
  $('set-ghost').checked = S.ghostMode;

  // Profile preview card
  const avPreview = $('settings-avatar-preview');
  if (avPreview) {
    avPreview.style.background = S.user?.avatarColor || AVATARS[0];
    avPreview.innerHTML = (S.user?.displayName || '?')[0].toUpperCase() + (S.user?.avatar ? `<img src="${escHTML(S.user.avatar)}">` : '');
  }
  if ($('settings-preview-name')) $('settings-preview-name').textContent = S.user?.displayName || '';
  if ($('settings-preview-uname')) $('settings-preview-uname').textContent = '@' + (S.user?.username || '');

  // Telegram settings profile card
  const tgAv = $('tg-profile-avatar');
  if (tgAv) {
    tgAv.style.background = S.user?.avatarColor || AVATARS[0];
    tgAv.innerHTML = (S.user?.displayName || '?')[0].toUpperCase() + (S.user?.avatar ? `<img src="${escHTML(S.user.avatar)}">` : '');
  }
  if ($('tg-profile-name')) $('tg-profile-name').textContent = S.user?.displayName || 'Пользователь';
  if ($('tg-profile-status')) $('tg-profile-status').textContent = '@' + (S.user?.username || '');

  // Mobile settings badges
  const ghostBadge = $('ghost-mob-badge');
  if (ghostBadge) { ghostBadge.textContent = S.ghostMode ? 'Вкл' : 'Выкл'; ghostBadge.className = 'mob-badge ' + (S.ghostMode ? 'on' : 'off'); }
  const notifBadge = $('notif-mob-badge');
  if (notifBadge) { notifBadge.textContent = s.notifications !== false ? 'Вкл' : 'Выкл'; notifBadge.className = 'tg-mob-value'; }
  if ($('mob-set-ghost-app')) $('mob-set-ghost-app').checked = S.ghostMode;

  // Mobile profile
  $('mob-name') && ($('mob-name').textContent = S.user?.displayName || '');
  if ($('mob-avatar')) {
    $('mob-avatar').style.background = S.user?.avatarColor || AVATARS[0];
    $('mob-avatar').innerHTML = (S.user?.displayName || '?')[0].toUpperCase() + (S.user?.avatar ? `<img src="${escHTML(S.user.avatar)}">` : '');
  }

  // Design prefs in settings UI
  const fontSize = S.user?.settings?.fontSize || 'normal';
  $$('#font-size-opts .s-opt-btn').forEach(b => b.classList.toggle('active', b.dataset.val === fontSize));
  const msgDensity = S.user?.settings?.msgDensity || 'cozy';
  $$('#msg-density-opts .s-opt-btn').forEach(b => b.classList.toggle('active', b.dataset.val === msgDensity));
  const bubbleStyle = S.user?.settings?.bubbleStyle || 'default';
  $$('#bubble-style-opts .s-opt-btn').forEach(b => b.classList.toggle('active', b.dataset.val === bubbleStyle));
  const borderRadius = S.user?.settings?.borderRadius || 'normal';
  $$('#border-radius-opts .s-opt-btn').forEach(b => b.classList.toggle('active', b.dataset.val === borderRadius));
  const animEl = $('set-animations');
  if (animEl) animEl.checked = S.user?.settings?.animations !== false;

  // Premium features visibility — always visible, lock for non-premium
  const premiumSection = $('premium-emoji-section');
  const canUsePremium = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
  if (premiumSection) {
    premiumSection.classList.toggle('premium-locked', !canUsePremium);
    const lockArea = $('premium-lock-area');
    if (lockArea) {
      if (!canUsePremium) {
        lockArea.innerHTML = '<div class="premium-lock-notice"><i class="fas fa-lock"></i> Доступно для Shadow+</div>';
      } else {
        lockArea.innerHTML = '';
      }
    }
  }
  // Lock notification sounds for non-premium
  const nsg = $('notif-sounds-grid');
  if (nsg) nsg.classList.toggle('premium-locked-inline', !canUsePremium);
  // Lock custom theme creator for non-premium
  const ctc = $('custom-theme-creator');
  if (ctc) ctc.classList.toggle('premium-locked-inline', !canUsePremium);
  // Lock premium themes for non-premium
  const ptg = $('premium-themes-grid');
  if (ptg) ptg.classList.toggle('premium-locked-inline', !canUsePremium);

  // Premium status card
  const psc = $('premium-status-card');
  if (psc) {
    if (S.user?.superUser) {
      psc.querySelector('.psc-icon').innerHTML = '<i class="fas fa-bolt" style="color:#ffd700;font-size:24px"></i>';
      psc.querySelector('.psc-role').textContent = 'Super User';
      psc.querySelector('.psc-desc').textContent = 'У вас есть все Shadow+ функции и эксклюзивные возможности';
      psc.className = 'premium-status-card psc-super';
    } else if (S.user?.premium || S.user?.premiumFree) {
      psc.querySelector('.psc-icon').textContent = '💎';
      psc.querySelector('.psc-role').textContent = 'Shadow+';
      psc.querySelector('.psc-desc').textContent = 'Вам доступны все Shadow+ функции';
      psc.className = 'premium-status-card psc-premium';
    } else {
      psc.querySelector('.psc-icon').textContent = '👻';
      psc.querySelector('.psc-role').textContent = 'Обычный пользователь';
      psc.querySelector('.psc-desc').textContent = 'Активируйте Shadow+ для расширенных возможностей';
      psc.className = 'premium-status-card';
    }
  }

  // Super user section
  const suSection = $('super-user-section');
  if (suSection) {
    if (S.user?.superUser) show(suSection);
    else hide(suSection);
  }
  const mobSuSection = $('mob-super-user-section');
  if (mobSuSection) {
    if (S.user?.superUser) show(mobSuSection);
    else hide(mobSuSection);
  }

  // DND
  if ($('set-dnd')) $('set-dnd').checked = !!S.user?.dndMode;
  if ($('set-dnd-reply')) $('set-dnd-reply').value = S.user?.dndAutoReply || '';

  // Custom status
  if ($('cs-text')) $('cs-text').value = S.user?.customStatus || '';
  if ($('cs-emoji')) $('cs-emoji').value = S.user?.customStatusEmoji || '';
  if ($('cs-color')) $('cs-color').value = S.user?.customStatusColor || '#5865f2';

  // Social links
  const sl = S.user?.socialLinks || {};
  if ($('social-tg')) $('social-tg').value = sl.telegram || '';
  if ($('social-ig')) $('social-ig').value = sl.instagram || '';
  if ($('social-gh')) $('social-gh').value = sl.github || '';
  if ($('social-web')) $('social-web').value = sl.website || '';

  // Notification sounds
  buildNotifSoundsGrid();

  // Re-init premium pickers to reflect current user state
  initPremiumEmojiPicker();
}

async function saveProfile() {
  try {
    const body = {
      displayName: $('set-displayname').value.trim(),
      bio: $('set-bio').value,
      username: $('set-username').value.trim(),
    };
    S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify(body) });
    showToast('Профиль сохранён', 'success');
    fillSettings();
  } catch (e) { showToast(e.message, 'error'); }
}

async function saveSettingsToggle(key, value) {
  try {
    S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { [key]: value } }) });
  } catch (e) { showToast(e.message, 'error'); }
}

async function changePassword() {
  const cur = $('set-cur-password').value;
  const nw = $('set-new-password').value;
  if (!cur || !nw) { showToast('Заполните оба поля', 'warning'); return; }
  try {
    await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
    showToast('Пароль изменён', 'success');
    $('set-cur-password').value = '';
    $('set-new-password').value = '';
  } catch (e) { showToast(e.message, 'error'); }
}

async function uploadAvatar() {
  const file = $('avatar-input').files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('avatar', file);
  try {
    const res = await api('/api/me/avatar', { method: 'POST', body: fd });
    S.user.avatar = res.avatar;
    showToast('Аватар обновлён', 'success');
    fillSettings();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadSessions() {
  try {
    const sessions = await api('/api/me/sessions');
    $('sessions-list').innerHTML = sessions.map(s =>
      `<div class="session-item${s.current ? ' current' : ''}"><span>${escHTML(s.device)}${s.current ? ' (текущая)' : ''}</span><span>${new Date(s.createdAt).toLocaleDateString('ru')}</span></div>`
    ).join('');
  } catch {}
}

async function revokeSessions() {
  try { await api('/api/me/sessions/revoke', { method: 'POST' }); showToast('Сессии завершены', 'success'); loadSessions(); } catch (e) { showToast(e.message, 'error'); }
}

/* ── Ghost mode ────────────────────────────────────────────────────── */
async function toggleGhost() {
  const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
  if (!canUse && !S.ghostMode) {
    showToast('👻 Режим Призрака доступен только для Shadow+', 'warning');
    $('set-ghost').checked = false;
    if ($('mob-set-ghost')) $('mob-set-ghost').checked = false;
    return;
  }
  S.ghostMode = !S.ghostMode;
  document.body.classList.toggle('ghost-active', S.ghostMode);
  $('ghost-toggle').classList.toggle('ghost-active', S.ghostMode);
  $('set-ghost').checked = S.ghostMode;
  fillSettings();

  try {
    await api('/api/me', { method: 'PUT', body: JSON.stringify({
      settings: {
        privShowOnline: !S.ghostMode,
        privReadReceipts: !S.ghostMode,
        privShowTyping: !S.ghostMode
      }
    }) });
    showToast(S.ghostMode ? '👻 Режим Призрака активирован' : 'Режим Призрака отключён', S.ghostMode ? 'warning' : 'info');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ── Theme ─────────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.body.className = document.body.className.replace(/theme-\S+/g, '');
  // Clear custom CSS variables
  ['--bg-pri','--bg-dark','--bg-sec','--brand','--bg-hover','--bg-active','--bg-input','--bg-float','--text','--text-muted','--head','--head2'].forEach(v => document.documentElement.style.removeProperty(v));
  if (theme === 'custom') {
    const ct = S.user?.settings?.customTheme;
    if (ct) {
      document.body.classList.add('theme-custom');
      document.documentElement.style.setProperty('--bg-pri', ct.bg);
      document.documentElement.style.setProperty('--bg-dark', ct.dark);
      document.documentElement.style.setProperty('--bg-sec', ct.sec);
      document.documentElement.style.setProperty('--brand', ct.brand);
      document.documentElement.style.setProperty('--bg-hover', adjustColor(ct.bg, 15));
      document.documentElement.style.setProperty('--bg-active', adjustColor(ct.bg, 30));
      document.documentElement.style.setProperty('--bg-input', adjustColor(ct.dark, 15));
    }
  } else if (theme && theme !== 'default') {
    document.body.classList.add(`theme-${theme}`);
  }
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === (theme || 'default')));
}

function buildThemeGrid(containerId) {
  const grid = $(containerId);
  if (!grid) return;
  const isLarge = grid.classList.contains('theme-grid-large');
  const names = {default:'По умолч.',midnight:'Полночь',forest:'Лес',crimson:'Кармин',purple:'Фиалка',ocean:'Океан',sunset:'Закат',nord:'Nord',monokai:'Monokai',dracula:'Dracula',solarized:'Solarized',onedark:'One Dark',gruvbox:'Gruvbox',tokyo:'Токио',material:'Material',catppuccin:'Catppuccin',light:'Светлая'};
  grid.innerHTML = Object.entries(THEMES).map(([name, t]) =>
    `<div class="theme-swatch${name === (S.user?.settings?.theme || 'default') ? ' active' : ''}" data-theme="${name}" style="background:${t.bg}">
      ${isLarge ? `<div class="ts-preview"><div class="ts-sb" style="background:${t.dark}"></div><div class="ts-pnl" style="background:${t.sec}"><div class="ts-pnl-item"></div><div class="ts-pnl-item"></div><div class="ts-pnl-item"></div></div><div class="ts-ch"><div class="ts-ch-header"></div><div class="ts-m1" style="background:${t.sec}"></div><div class="ts-m2" style="background:${t.brand}"></div></div></div>` : `<div class="ts-preview"><div class="ts-sb" style="background:${t.dark}"></div><div class="ts-pnl" style="background:${t.sec}"></div><div class="ts-ch"><div class="ts-m1" style="background:${t.sec}"></div><div class="ts-m2" style="background:${t.brand}"></div></div></div>`}
      <span class="ts-name">${names[name] || name}</span>
    </div>`
  ).join('');
  grid.querySelectorAll('.theme-swatch').forEach(s => s.onclick = async () => {
    const themeName = s.dataset.theme;
    const t = THEMES[themeName];
    if (!t) return;
    // On mobile (theme-grid-mob), apply directly without preview
    const isMobile = containerId === 'theme-grid-mob';
    const inl = !isMobile ? $('theme-preview-inline') : null;
    if (inl) {
      const box = $('theme-preview-box-inline');
      if (box) box.style.background = t.bg;
      const sidebar = $('tpi-sidebar');
      if (sidebar) sidebar.style.background = t.dark;
      const panel = $('tpi-panel');
      if (panel) panel.style.background = t.sec;
      const chat = $('tpi-chat');
      if (chat) chat.style.background = t.bg;
      const header = $('tpi-header');
      if (header) header.style.background = t.sec;
      const msgBrand = $('tpi-msg-brand');
      if (msgBrand) msgBrand.style.background = t.brand;
      show(inl);
      inl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      $('tpi-apply').onclick = async () => {
        applyTheme(themeName);
        try { S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { theme: themeName } }) }); } catch {}
        hide(inl);
      };
      $('tpi-cancel').onclick = () => hide(inl);
    } else {
      applyTheme(themeName);
      grid.querySelectorAll('.theme-swatch').forEach(x => x.classList.toggle('active', x.dataset.theme === themeName));
      try { S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { theme: themeName } }) }); } catch {}
      const modal = $('modal-themes');
      if (modal) hide(modal);
      showToast('Тема применена', 'success');
    }
  });
}

/* ── Design customization ──────────────────────────────────────────── */
function applyDesignPrefs() {
  const s = S.user?.settings || {};
  // Font size
  document.body.classList.remove('font-small', 'font-large');
  if (s.fontSize && s.fontSize !== 'normal') document.body.classList.add(`font-${s.fontSize}`);
  // Message density
  document.body.classList.remove('density-compact', 'density-comfortable');
  if (s.msgDensity && s.msgDensity !== 'cozy') document.body.classList.add(`density-${s.msgDensity}`);
  // Wallpaper
  applyWallpaper(s.wallpaper);
  // Bubble style
  document.body.classList.remove('style-bubbles');
  if (s.bubbleStyle === 'bubbles') document.body.classList.add('style-bubbles');
  // Border radius
  document.body.classList.remove('radius-none', 'radius-round');
  if (s.borderRadius && s.borderRadius !== 'normal') document.body.classList.add(`radius-${s.borderRadius}`);
  // Animations
  document.body.classList.remove('no-animations');
  if (s.animations === false) document.body.classList.add('no-animations');
}

function applyWallpaper(wp) {
  const mc = $('messages-container');
  if (mc) {
    mc.classList.remove('wp-dots', 'wp-grid', 'wp-diag', 'wp-cross');
    if (wp && wp !== 'none') mc.classList.add(`wp-${wp}`);
  }
}

function buildWallpaperGrid() {
  const wallpapers = [
    { id: 'none', label: 'Нет', bg: '' },
    { id: 'dots', label: '···', bg: 'radial-gradient(circle,var(--bg-active) 1px,transparent 1px)' },
    { id: 'grid', label: '⊞', bg: 'linear-gradient(var(--bg-active) 1px,transparent 1px),linear-gradient(90deg,var(--bg-active) 1px,transparent 1px)' },
    { id: 'diag', label: '⟋', bg: 'repeating-linear-gradient(45deg,transparent,transparent 6px,rgba(255,255,255,.03) 6px,rgba(255,255,255,.03) 12px)' },
    { id: 'cross', label: '✕', bg: 'repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(255,255,255,.02) 8px,rgba(255,255,255,.02) 9px),repeating-linear-gradient(-45deg,transparent,transparent 8px,rgba(255,255,255,.02) 8px,rgba(255,255,255,.02) 9px)' },
  ];
  const current = S.user?.settings?.wallpaper || 'none';
  ['wallpaper-grid', 'mob-wallpaper-grid'].forEach(gid => {
    const grid = $(gid);
    if (!grid) return;
    grid.innerHTML = wallpapers.map(w =>
      `<div class="wp-swatch${w.id === current ? ' active' : ''}" data-wp="${w.id}" style="${w.bg ? 'background-image:' + w.bg + ';background-size:12px 12px' : ''}"><span class="wp-label">${w.label}</span></div>`
    ).join('');
    grid.querySelectorAll('.wp-swatch').forEach(s => s.onclick = async () => {
      document.querySelectorAll('.wp-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      applyWallpaper(s.dataset.wp);
      saveSettingsToggle('wallpaper', s.dataset.wp);
    });
  });
}

function initDesignOptions() {
  // Font size
  $$('#font-size-opts .s-opt-btn').forEach(b => b.onclick = () => {
    $$('#font-size-opts .s-opt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.body.classList.remove('font-small', 'font-large');
    if (b.dataset.val !== 'normal') document.body.classList.add(`font-${b.dataset.val}`);
    saveSettingsToggle('fontSize', b.dataset.val);
  });
  // Message density
  $$('#msg-density-opts .s-opt-btn').forEach(b => b.onclick = () => {
    $$('#msg-density-opts .s-opt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.body.classList.remove('density-compact', 'density-comfortable');
    if (b.dataset.val !== 'cozy') document.body.classList.add(`density-${b.dataset.val}`);
    saveSettingsToggle('msgDensity', b.dataset.val);
  });
  // Wallpaper
  buildWallpaperGrid();

  // Bubble style
  $$('#bubble-style-opts .s-opt-btn').forEach(b => b.onclick = () => {
    $$('#bubble-style-opts .s-opt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.body.classList.remove('style-bubbles');
    if (b.dataset.val === 'bubbles') document.body.classList.add('style-bubbles');
    saveSettingsToggle('bubbleStyle', b.dataset.val);
  });

  // Border radius
  $$('#border-radius-opts .s-opt-btn').forEach(b => b.onclick = () => {
    $$('#border-radius-opts .s-opt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.body.classList.remove('radius-none', 'radius-round');
    if (b.dataset.val !== 'normal') document.body.classList.add(`radius-${b.dataset.val}`);
    saveSettingsToggle('borderRadius', b.dataset.val);
  });

  // Animations toggle
  const animEl = $('set-animations');
  if (animEl) animEl.onchange = () => {
    document.body.classList.toggle('no-animations', !animEl.checked);
    saveSettingsToggle('animations', animEl.checked);
  };

  // Custom theme creator
  initCustomThemeCreator();

  // Premium emoji picker
  initPremiumEmojiPicker();
}

let _themeBackup = null;

function initCustomThemeCreator() {
  const inputs = ['ct-bg', 'ct-dark', 'ct-sec', 'ct-brand'];
  inputs.forEach(id => {
    const el = $(id);
    if (el) el.oninput = () => {
      if (!_themeBackup) _backupTheme();
      updateCustomThemePreview();
    };
  });
  const btnApply = $('btn-apply-custom-theme');
  if (btnApply) btnApply.onclick = () => applyCustomTheme();
  const mobApply = $('mob-btn-apply-custom-theme');
  if (mobApply) mobApply.onclick = () => {
    // Sync mobile inputs to desktop values and apply
    ['bg', 'dark', 'sec', 'brand'].forEach(k => {
      const mv = $('mob-ct-' + k)?.value;
      if (mv && $('ct-' + k)) $('ct-' + k).value = mv;
    });
    applyCustomTheme();
  };

  // Mobile color picker buttons
  const cpLabels = { bg: 'Основной фон', dark: 'Тёмный фон', sec: 'Вторичный', brand: 'Акцент' };
  ['bg', 'dark', 'sec', 'brand'].forEach(k => {
    const btn = $('mob-ct-' + k + '-btn');
    const hidden = $('mob-ct-' + k);
    const swatch = $('mob-ct-' + k + '-swatch');
    const valSpan = $('mob-ct-' + k + '-val');
    if (btn && hidden) {
      // Init swatch
      if (swatch) swatch.style.background = hidden.value;
      btn.onclick = () => openColorPicker(hidden.value, cpLabels[k], color => {
        hidden.value = color;
        if (swatch) swatch.style.background = color;
        if (valSpan) valSpan.textContent = color;
        if ($('ct-' + k)) $('ct-' + k).value = color;
        if (!_themeBackup) _backupTheme();
        updateCustomThemePreview();
      });
    }
  });

  // Mobile status color button
  const csBtn = $('mob-cs-color-btn');
  const csHidden = $('mob-cs-color');
  const csSwatch = $('mob-cs-color-swatch');
  if (csBtn && csHidden) {
    if (csSwatch) csSwatch.style.background = csHidden.value;
    csBtn.onclick = () => openColorPicker(csHidden.value, 'Цвет статуса', color => {
      csHidden.value = color;
      if (csSwatch) csSwatch.style.background = color;
    });
  }

  // Load saved custom theme
  const ct = S.user?.settings?.customTheme;
  if (ct) {
    if ($('ct-bg')) $('ct-bg').value = ct.bg || '#313338';
    if ($('ct-dark')) $('ct-dark').value = ct.dark || '#1e1f22';
    if ($('ct-sec')) $('ct-sec').value = ct.sec || '#2b2d31';
    if ($('ct-brand')) $('ct-brand').value = ct.brand || '#5865f2';
  }
  updateCustomThemePreview();
  _updateMobCpSwatches();
}

function _updateMobCpSwatches() {
  ['bg', 'dark', 'sec', 'brand'].forEach(k => {
    const hidden = $('mob-ct-' + k);
    const swatch = $('mob-ct-' + k + '-swatch');
    const valSpan = $('mob-ct-' + k + '-val');
    if (hidden && swatch) swatch.style.background = hidden.value;
    if (hidden && valSpan) valSpan.textContent = hidden.value;
  });
  const csHidden = $('mob-cs-color');
  const csSwatch = $('mob-cs-color-swatch');
  if (csHidden && csSwatch) csSwatch.style.background = csHidden.value;
}

function _backupTheme() {
  const cs = getComputedStyle(document.documentElement);
  _themeBackup = {
    className: document.body.className,
    bgPri: cs.getPropertyValue('--bg-pri').trim(),
    bgDark: cs.getPropertyValue('--bg-dark').trim(),
    bgSec: cs.getPropertyValue('--bg-sec').trim(),
    brand: cs.getPropertyValue('--brand').trim(),
    bgHover: cs.getPropertyValue('--bg-hover').trim(),
    bgActive: cs.getPropertyValue('--bg-active').trim(),
    bgInput: cs.getPropertyValue('--bg-input').trim()
  };
}

function restoreThemeBackup() {
  if (!_themeBackup) return;
  document.body.className = _themeBackup.className;
  document.documentElement.style.setProperty('--bg-pri', _themeBackup.bgPri);
  document.documentElement.style.setProperty('--bg-dark', _themeBackup.bgDark);
  document.documentElement.style.setProperty('--bg-sec', _themeBackup.bgSec);
  document.documentElement.style.setProperty('--brand', _themeBackup.brand);
  document.documentElement.style.setProperty('--bg-hover', _themeBackup.bgHover);
  document.documentElement.style.setProperty('--bg-active', _themeBackup.bgActive);
  document.documentElement.style.setProperty('--bg-input', _themeBackup.bgInput);
  _themeBackup = null;
}

function updateCustomThemePreview() {
  const bg = $('ct-bg')?.value || '#313338';
  const dark = $('ct-dark')?.value || '#1e1f22';
  const sec = $('ct-sec')?.value || '#2b2d31';
  const brand = $('ct-brand')?.value || '#5865f2';
  if ($('ct-p-dark')) $('ct-p-dark').style.background = dark;
  if ($('ct-p-sec')) $('ct-p-sec').style.background = sec;
  if ($('ct-p-m1')) $('ct-p-m1').style.background = sec;
  if ($('ct-p-brand')) $('ct-p-brand').style.background = brand;
  const box = $('ct-preview-box');
  if (box) box.style.background = bg;

  // Apply live to the whole app
  document.body.className = document.body.className.replace(/theme-\S+/g, '');
  document.body.classList.add('theme-custom');
  document.documentElement.style.setProperty('--bg-pri', bg);
  document.documentElement.style.setProperty('--bg-dark', dark);
  document.documentElement.style.setProperty('--bg-sec', sec);
  document.documentElement.style.setProperty('--brand', brand);
  document.documentElement.style.setProperty('--bg-hover', adjustColor(bg, 15));
  document.documentElement.style.setProperty('--bg-active', adjustColor(bg, 30));
  document.documentElement.style.setProperty('--bg-input', adjustColor(dark, 15));
}

async function applyCustomTheme() {
  const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
  if (!canUse) { restoreThemeBackup(); showToast('Создание своей темы доступно только для Shadow+', 'warning'); return; }
  const bg = $('ct-bg')?.value;
  const dark = $('ct-dark')?.value;
  const sec = $('ct-sec')?.value;
  const brand = $('ct-brand')?.value;
  if (!bg || !dark || !sec || !brand) return;

  // Theme is already applied live, just commit it
  _themeBackup = null;

  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
  showToast('Кастомная тема применена', 'success');

  try {
    await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { theme: 'custom', customTheme: { bg, dark, sec, brand } } }) });
    S.user.settings.theme = 'custom';
    S.user.settings.customTheme = { bg, dark, sec, brand };
  } catch {}
}

function adjustColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xFF) + amount);
  const g = Math.min(255, ((num >> 8) & 0xFF) + amount);
  const b = Math.min(255, (num & 0xFF) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ── Custom Color Picker (mobile-friendly) ──────────────────────── */
function openColorPicker(currentColor, title, callback) {
  let hue = 0, sat = 1, val = 1;
  // Parse current color to HSV
  const hex2rgb = h => { const n = parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
  const rgb2hsv = (r,g,b) => { r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; let h=0; if(d){if(mx===r)h=((g-b)/d+6)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;} return [h,mx?d/mx:0,mx]; };
  const hsv2rgb = (h,s,v) => { const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s); let r,g,b; switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;} return [Math.round(r*255),Math.round(g*255),Math.round(b*255)]; };
  const rgb2hex = (r,g,b) => '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
  const hue2hex = h => rgb2hex(...hsv2rgb(h,1,1));

  if (currentColor && /^#[0-9a-f]{6}$/i.test(currentColor)) {
    [hue, sat, val] = rgb2hsv(...hex2rgb(currentColor));
  }

  const getHex = () => rgb2hex(...hsv2rgb(hue, sat, val));

  const overlay = document.createElement('div');
  overlay.className = 'custom-cp-overlay';
  overlay.innerHTML = `
    <div class="custom-cp-sheet">
      <div class="custom-cp-title">${title || 'Выберите цвет'}</div>
      <div class="custom-cp-preview" id="cp-preview"></div>
      <div class="custom-cp-sat-wrap" id="cp-sat"><div class="custom-cp-sat-thumb" id="cp-sat-thumb"></div></div>
      <div class="custom-cp-hue-wrap" id="cp-hue"><div class="custom-cp-hue-thumb" id="cp-hue-thumb"></div></div>
      <div class="custom-cp-hex-row"><input class="custom-cp-hex-input" id="cp-hex" maxlength="7" value="${getHex()}"></div>
      <div class="custom-cp-btns"><button class="custom-cp-btn-cancel" id="cp-cancel">Отмена</button><button class="custom-cp-btn-ok" id="cp-ok">Выбрать</button></div>
    </div>`;
  document.body.appendChild(overlay);

  const preview = overlay.querySelector('#cp-preview');
  const satWrap = overlay.querySelector('#cp-sat');
  const satThumb = overlay.querySelector('#cp-sat-thumb');
  const hueWrap = overlay.querySelector('#cp-hue');
  const hueThumb = overlay.querySelector('#cp-hue-thumb');
  const hexInput = overlay.querySelector('#cp-hex');

  function updateUI() {
    const hex = getHex();
    preview.style.background = hex;
    satWrap.style.background = hue2hex(hue);
    hueThumb.style.left = (hue * 100) + '%';
    hueThumb.style.background = hue2hex(hue);
    satThumb.style.left = (sat * 100) + '%';
    satThumb.style.top = ((1 - val) * 100) + '%';
    satThumb.style.background = hex;
    hexInput.value = hex;
  }

  // Hue slider
  function onHue(e) {
    const r = hueWrap.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    hue = Math.max(0, Math.min(1, (t.clientX - r.left) / r.width));
    updateUI();
  }
  hueWrap.addEventListener('pointerdown', e => { onHue(e); hueWrap.setPointerCapture(e.pointerId); });
  hueWrap.addEventListener('pointermove', e => { if (e.pressure > 0) onHue(e); });

  // Saturation/Value pad
  function onSat(e) {
    const r = satWrap.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    sat = Math.max(0, Math.min(1, (t.clientX - r.left) / r.width));
    val = Math.max(0, Math.min(1, 1 - (t.clientY - r.top) / r.height));
    updateUI();
  }
  satWrap.addEventListener('pointerdown', e => { onSat(e); satWrap.setPointerCapture(e.pointerId); });
  satWrap.addEventListener('pointermove', e => { if (e.pressure > 0) onSat(e); });

  // Hex input
  hexInput.addEventListener('input', () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      [hue, sat, val] = rgb2hsv(...hex2rgb(v));
      updateUI();
    }
  });

  // Buttons
  overlay.querySelector('#cp-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#cp-ok').onclick = () => { callback(getHex()); overlay.remove(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  updateUI();
}

function initPremiumEmojiPicker() {
  const grid = $('premium-emoji-grid');
  if (!grid) return;
  const premiumEmojis = ['⭐', '💎', '👑', '🔥', '💫', '✨', '🌟', '⚡', '🎯', '🦋', '🌈', '🍀', '💜', '🖤', '❤️‍🔥', '🎵', '🎮', '🏆', '🦄', '🌸', '🐉', '☠️', '👾', '🤖', '🎭', '🌙', '❄️', '🍭', '🧬', '🎪', '🃏', '🔮', ''];
  grid.innerHTML = premiumEmojis.map(e => `<span class="pe-emoji${e === (S.user?.premiumEmoji || '') ? ' active' : ''}" data-emoji="${e}">${e || '✕'}</span>`).join('');
  grid.querySelectorAll('.pe-emoji').forEach(el => {
    const handler = async () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
      grid.querySelectorAll('.pe-emoji').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      try {
        S.user = await api('/api/me/emoji', { method: 'PUT', body: JSON.stringify({ emoji: el.dataset.emoji }) });
        showToast(el.dataset.emoji ? `Эмодзи: ${el.dataset.emoji}` : 'Эмодзи убрано', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    };
    el.onclick = handler;
    el.ontouchend = (ev) => { ev.preventDefault(); handler(); };
  });

  // Custom emoji input
  const btnCustomEmoji = $('btn-set-custom-emoji');
  if (btnCustomEmoji) {
    btnCustomEmoji.onclick = async () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
      const val = $('custom-emoji-input').value.trim();
      grid.querySelectorAll('.pe-emoji').forEach(x => x.classList.remove('active'));
      try {
        S.user = await api('/api/me/emoji', { method: 'PUT', body: JSON.stringify({ emoji: val }) });
        showToast(val ? `Эмодзи: ${val}` : 'Эмодзи убрано', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    };
  }

  // Premium badge picker
  initPremiumBadgePicker();
  // Premium name color picker
  initPremiumColorPicker();
  // Premium exclusive themes
  initPremiumThemes();
}

function initPremiumBadgePicker() {
  const grid = $('premium-badge-grid');
  if (!grid) return;
  const badges = ['', 'VIP', 'PRO', 'ELITE', 'BOSS', 'KING', 'ACE', 'TOP', 'MVP', 'HERO', 'LEGEND', 'OG', 'ALPHA', 'SIGMA'];
  grid.innerHTML = badges.map(b => `<span class="pe-badge${b === (S.user?.premiumBadge || '') ? ' active' : ''}" data-badge="${b}">${b || '✕'}</span>`).join('');
  grid.querySelectorAll('.pe-badge').forEach(el => {
    const handler = async () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
      grid.querySelectorAll('.pe-badge').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      try {
        S.user = await api('/api/me/badge', { method: 'PUT', body: JSON.stringify({ badge: el.dataset.badge }) });
        showToast(el.dataset.badge ? `Значок: ${el.dataset.badge}` : 'Значок убран', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    };
    el.onclick = handler;
    el.ontouchend = (ev) => { ev.preventDefault(); handler(); };
  });

  // Custom badge input
  const btnCustomBadge = $('btn-set-custom-badge');
  if (btnCustomBadge) {
    btnCustomBadge.onclick = async () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
      const val = $('custom-badge-input').value.trim();
      if (val.length > 12) { showToast('Макс. 12 символов', 'warning'); return; }
      grid.querySelectorAll('.pe-badge').forEach(x => x.classList.remove('active'));
      try {
        S.user = await api('/api/me/badge', { method: 'PUT', body: JSON.stringify({ badge: val }) });
        showToast(val ? `Значок: ${val}` : 'Значок убран', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    };
  }
}

function initPremiumColorPicker() {
  const grid = $('premium-color-grid');
  if (!grid) return;
  const colors = ['', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#e84393', '#00cec9', '#fd79a8', '#a29bfe', '#ff9ff3', '#f368e0', '#ff6348', '#7bed9f', '#70a1ff', '#5352ed', '#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#eccc68'];
  grid.innerHTML = colors.map(c => {
    const active = c === (S.user?.premiumNameColor || '') ? ' active' : '';
    return c ? `<span class="pe-color${active}" data-color="${c}" style="background:${c}"></span>` : `<span class="pe-color${active}" data-color="">✕</span>`;
  }).join('');
  grid.querySelectorAll('.pe-color').forEach(el => {
    const handler = async () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse) { showToast('Требуется Shadow+', 'warning'); return; }
      grid.querySelectorAll('.pe-color').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      try {
        S.user = await api('/api/me/namecolor', { method: 'PUT', body: JSON.stringify({ color: el.dataset.color }) });
        showToast(el.dataset.color ? 'Цвет применён' : 'Цвет сброшен', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    };
    el.onclick = handler;
    el.ontouchend = (ev) => { ev.preventDefault(); handler(); };
  });
}

const PREMIUM_THEMES = {
  'neon':     { bg: '#0a0a1a', dark: '#050510', sec: '#0f0f2e', brand: '#00ff88' },
  'sakura':   { bg: '#2a1525', dark: '#1a0a15', sec: '#351a30', brand: '#ff69b4' },
  'cyber':    { bg: '#0d1117', dark: '#010409', sec: '#161b22', brand: '#00d4ff' },
  'golden':   { bg: '#1a1810', dark: '#121008', sec: '#252218', brand: '#ffd700' },
  'aurora':   { bg: '#0d1520', dark: '#060d15', sec: '#121d2e', brand: '#66ffcc' },
  'vampire':  { bg: '#1a0a0a', dark: '#100505', sec: '#250e0e', brand: '#ff3333' },
  'lavender': { bg: '#1e1828', dark: '#140f1e', sec: '#261e35', brand: '#b388ff' },
  'emerald':  { bg: '#0a1a14', dark: '#05120c', sec: '#0f2419', brand: '#00e676' },
  'synthwave':{ bg: '#1a1028', dark: '#120a1e', sec: '#241638', brand: '#ff6ec7' },
  'arctic':   { bg: '#0e1a24', dark: '#081018', sec: '#14242e', brand: '#80d8ff' },
  'magma':    { bg: '#1c1008', dark: '#120a04', sec: '#281810', brand: '#ff6d00' },
  'matrix':   { bg: '#050e05', dark: '#020802', sec: '#0a180a', brand: '#00e800' },
  'cosmic':   { bg: '#140a22', dark: '#0a0518', sec: '#1e1030', brand: '#ea80fc' },
  'midnight-blue':{ bg: '#0a0e2a', dark: '#06081c', sec: '#101438', brand: '#448aff' },
};

function initPremiumThemes() {
  const grid = $('premium-themes-grid');
  if (!grid) return;
  const names = {neon:'Неон',sakura:'Сакура',cyber:'Кибер',golden:'Золото',aurora:'Аврора',vampire:'Вампир',lavender:'Лаванда',emerald:'Изумруд',synthwave:'Синтвейв',arctic:'Арктика',magma:'Магма',matrix:'Матрица',cosmic:'Космос','midnight-blue':'Индиго'};
  grid.innerHTML = Object.entries(PREMIUM_THEMES).map(([name, t]) =>
    `<div class="theme-swatch${name === (S.user?.settings?.theme || '') ? ' active' : ''}" data-theme="${name}" style="background:${t.bg}">
      <div class="ts-preview"><div class="ts-sb" style="background:${t.dark}"></div><div class="ts-pnl" style="background:${t.sec}"><div class="ts-pnl-item"></div><div class="ts-pnl-item"></div><div class="ts-pnl-item"></div></div><div class="ts-ch"><div class="ts-ch-header"></div><div class="ts-m1" style="background:${t.sec}"></div><div class="ts-m2" style="background:${t.brand}"></div></div></div>
      <span class="ts-name">💎 ${names[name] || name}</span>
    </div>`
  ).join('');
  grid.querySelectorAll('.theme-swatch').forEach(s => s.onclick = async () => {
    const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
    if (!canUse) { showToast('Эксклюзивная тема доступна только для Shadow+', 'warning'); return; }
    const themeName = s.dataset.theme;
    applyTheme(themeName);
    document.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active');
    const names2 = {neon:'Неон',sakura:'Сакура',cyber:'Кибер',golden:'Золото',aurora:'Аврора',vampire:'Вампир',lavender:'Лаванда',emerald:'Изумруд',synthwave:'Синтвейв',arctic:'Арктика',magma:'Магма',matrix:'Матрица',cosmic:'Космос','midnight-blue':'Индиго'};
    showToast(`Тема «${names2[themeName] || themeName}» применена`, 'success');
    try {
      S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { theme: themeName } }) });
    } catch {}
  });
}

/* ══════════════════════════════════════════════════════════════════════
   SAVED MESSAGES / FAVOURITES
   ══════════════════════════════════════════════════════════════════════ */
async function ensureSavedChat() {
  try {
    const chat = await api('/api/chats', { method: 'POST', body: JSON.stringify({ userId: S.user.id }) });
    const introKey = 'shadow_saved_intro_' + S.user.id;
    if (!chat.lastMessage && !localStorage.getItem(introKey)) {
      const intro = `⭐ Добро пожаловать в Shadow Messenger!\n\n📱 Возможности мессенджера:\n\n💬 Сообщения — текст, фото, файлы, голосовые, видеокружки\n📌 Закреп — закрепляйте важные сообщения\n↩️ Ответы — отвечайте на конкретные сообщения\n✏️ Редактирование — измените отправленное\n🗑 Удаление — удаляйте сообщения у всех\n⏩ Пересылка — пересылайте между чатами\n😄 Реакции — ставьте эмодзи-реакции\n\n📞 Звонки — аудио и видео, в т.ч. групповые\n👥 Группы — создавайте чаты с друзьями\n👻 Режим Призрака — полная невидимость\n🎨 Темы — 17+ тем оформления\n🔔 Уведомления — push и звуки\n🔒 Приватность — контроль видимости\n\n💎 Shadow+ — эксклюзивные темы, эмодзи профиля, значки, цвет имени, кастомный статус и многое другое!\n\n⭐ Это ваше Избранное — сохраняйте сюда важные сообщения, ссылки и заметки.`;
      await api(`/api/chats/${chat.id}/messages`, { method: 'POST', body: JSON.stringify({ text: intro }) });
      localStorage.setItem(introKey, '1');
    }
    await loadChats();
  } catch {}
}

async function openSavedChat() {
  try {
    const chat = await api('/api/chats', { method: 'POST', body: JSON.stringify({ userId: S.user.id }) });
    await loadChats();
    openChat(chat.id);
    switchTab('chats');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   EMOJI PICKER
   ══════════════════════════════════════════════════════════════════════ */
const EMOJI_CATS = {
  '😀': ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','😷','🤒','🤕','🤢','🤮','🥴','😇','🥳','🥺','🤠','🤡','🤥','🤫','🤭','🧐','🤓'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  '👋': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','💪'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜'],
  '🍎': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🌶','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🧀','🥚','🍳','🥞','🧇','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆'],
  '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸','🥌','🎿','⛷','🏂','🏋️','🤸','🤺','🤾','🧗','🚣','🏊','🤽','🏇','🚴','🧘'],
};

function toggleEmojiPicker(e) {
  const picker = $('emoji-picker');
  if (!picker.classList.contains('hidden')) { hide(picker); return; }

  const cats = $('emoji-cats');
  const grid = $('emoji-grid');
  const catKeys = Object.keys(EMOJI_CATS);

  cats.innerHTML = catKeys.map((k, i) => `<button data-ci="${i}" class="${i === 0 ? 'active' : ''}" title="${k}">${k}</button>`).join('');

  function insertEmoji(emoji) {
    const inp = $('msg-input');
    inp.value += emoji;
    inp.focus();
    toggleSendBtn();
  }

  function renderCat(i) {
    const emojis = EMOJI_CATS[catKeys[i]];
    grid.innerHTML = emojis.map(e => `<span>${e}</span>`).join('');
    grid.querySelectorAll('span').forEach(s => {
      s.onclick = () => insertEmoji(s.textContent);
      s.ontouchend = (ev) => { ev.preventDefault(); insertEmoji(s.textContent); };
    });
    cats.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.ci === String(i)));
  }

  cats.querySelectorAll('button').forEach(b => {
    b.onclick = () => renderCat(parseInt(b.dataset.ci));
    b.ontouchend = (ev) => { ev.preventDefault(); renderCat(parseInt(b.dataset.ci)); };
  });
  renderCat(0);

  // Mobile: position at bottom of screen; Desktop: near button
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    picker.style.bottom = '60px';
    picker.style.left = '50%';
    picker.style.right = 'auto';
    picker.style.top = 'auto';
    picker.style.transform = 'translateX(-50%)';
  } else {
    const rect = $('btn-emoji').getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.right = (window.innerWidth - rect.right) + 'px';
    picker.style.left = 'auto';
    picker.style.top = 'auto';
    picker.style.transform = 'none';
  }
  show(picker);
}

/* ══════════════════════════════════════════════════════════════════════
   LIGHTBOX
   ══════════════════════════════════════════════════════════════════════ */
function openLightbox(url, type) {
  if (type === 'video') {
    hide($('lb-img'));
    $('lb-video').src = url;
    show($('lb-video'));
  } else {
    $('lb-img').src = url;
    show($('lb-img'));
    hide($('lb-video'));
  }
  show($('lightbox'));
}
window.openLightbox = openLightbox;

function closeLightbox() {
  hide($('lightbox'));
  $('lb-video').pause();
  $('lb-video').src = '';
  $('lb-img').src = '';
}

/* ══════════════════════════════════════════════════════════════════════
   CALLS
   ══════════════════════════════════════════════════════════════════════ */
let _incomingCallData = null;
let _ringTimeoutId = null;

function _resetCallOverlayControls() {
  const overlay = $('active-call-overlay');
  const ctrls = overlay?.querySelector('.vk-call-controls');
  if (ctrls) { ctrls.style.display = ''; ctrls.style.opacity = '1'; }
  const audioLayer = $('call-audio-layer');
  if (audioLayer) { audioLayer.style.display = 'flex'; audioLayer.classList.remove('hidden-layer'); }
  const videoLayer = $('call-video-layer');
  if (videoLayer) videoLayer.classList.remove('active');
  // Reset control states
  $('toggle-mute').classList.remove('vk-ctrl-off');
  $('toggle-mute').querySelector('i').className = 'fas fa-microphone';
  $('toggle-video').classList.add('vk-ctrl-off');
  $('toggle-video').querySelector('i').className = 'fas fa-video-slash';
  $('toggle-screen').classList.remove('sharing');
  // Reset status indicators — show all as active
  const myMic = $('my-mic-status');
  const myCam = $('my-cam-status');
  const peerMic = $('peer-mic-status');
  const peerCam = $('peer-cam-status');
  [myMic, myCam, peerMic, peerCam].forEach(el => { if (el) { el.classList.remove('indicator-off'); el.style.display = 'flex'; } });
}

function startCallAction(type) {
  if (!S.chatObj) return;

  if (S.chatObj.type === 'group') {
    // Group call
    Sounds.ringStart();
    _callTimerStart = Date.now();
    if (window._callTimerInterval) clearInterval(window._callTimerInterval);
    window._callTimerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - _callTimerStart) / 1000);
      const m = Math.floor(sec / 60), s = sec % 60;
      $('call-audio-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
    const overlay = $('active-call-overlay');
    show(overlay);
    _resetCallOverlayControls();
    $('call-audio-name').textContent = S.chatObj.name || 'Групповой звонок';
    const av = $('call-audio-avatar');
    av.style.background = S.chatObj.avatarColor || AVATARS[0];
    av.innerHTML = (S.chatObj.name || '?')[0].toUpperCase();
    $('call-audio-timer').textContent = 'Подключение...';
    window.groupCallModule.joinGroupCall(S.chatId);
    setTimeout(() => { Sounds.ringStop(); }, 3000);
    return;
  }

  // Private call
  const peerId = getPartner()?.id;
  if (!peerId) return;
  Sounds.ringStart();
  _callTimerStart = Date.now();
  if (window._callTimerInterval) clearInterval(window._callTimerInterval);
  window._callTimerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - _callTimerStart) / 1000);
    const m = Math.floor(sec / 60), s = sec % 60;
    $('call-audio-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
  const overlay = $('active-call-overlay');
  show(overlay);
  _resetCallOverlayControls();
  $('call-audio-name').textContent = S.chatObj.displayName || 'Звонок';
  const av = $('call-audio-avatar');
  av.style.background = S.chatObj.displayAvatarColor || AVATARS[0];
  av.innerHTML = (S.chatObj.displayName || '?')[0].toUpperCase() + (S.chatObj.displayAvatar ? `<img src="${escHTML(S.chatObj.displayAvatar)}">` : '');

  // Ring timeout — auto-end call after 60 seconds if no answer
  if (_ringTimeoutId) clearTimeout(_ringTimeoutId);
  _ringTimeoutId = setTimeout(() => {
    if (!window.callsModule.isInCall() || $('call-audio-timer')?.textContent === 'Подключение...') {
      showToast('Абонент не отвечает', 'warning');
      handleCallEnded();
    }
    _ringTimeoutId = null;
  }, 60000);

  window.callsModule.startCall(peerId, type);
}

function handleIncomingCall(data) {
  _incomingCallData = data;
  Sounds.incomingStart();
  const overlay = $('incoming-call-overlay');
  $('incoming-name').textContent = data.fromName || 'Звонок';
  $('incoming-type').textContent = data.callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок';
  const av = $('incoming-avatar');
  av.style.background = data.fromAvatarColor || AVATARS[0];
  av.innerHTML = (data.fromName || '?')[0].toUpperCase() + (data.fromAvatar ? `<img src="${escHTML(data.fromAvatar)}">` : '');
  show(overlay);
  // Native Android call notification (heads-up)
  if (window.ShadowNative?.showNotification) {
    const label = data.callType === 'video' ? '📹 Видеозвонок' : '📞 Входящий звонок';
    window.ShadowNative.showNotification(data.fromName || 'Звонок', label, 'call');
  }
}

let _incomingGroupCallData = null;
function handleIncomingGroupCall(data) {
  // Don't show if already in a call
  if (window.callsModule?.isInCall?.() || window.groupCallModule?.isInGroupCall?.()) return;
  _incomingGroupCallData = data;
  Sounds.incomingStart();
  const overlay = $('incoming-call-overlay');
  $('incoming-name').textContent = data.chatName || 'Групповой звонок';
  $('incoming-type').textContent = `Звонит ${data.callerName || 'участник'}`;
  const av = $('incoming-avatar');
  av.style.background = data.chatAvatarColor || AVATARS[0];
  av.innerHTML = (data.chatName || '?')[0].toUpperCase();
  show(overlay);
  // Native Android call notification (heads-up)
  if (window.ShadowNative?.showNotification) {
    window.ShadowNative.showNotification(data.chatName || 'Группа', `📞 ${data.callerName || 'Участник'} звонит`, 'call');
  }
}

function acceptIncoming() {
  // Cancel native notification
  window.ShadowNative?.cancelCallNotification?.();
  // Handle group call incoming
  if (_incomingGroupCallData) {
    Sounds.incomingStop();
    hide($('incoming-call-overlay'));
    const data = _incomingGroupCallData;
    _incomingGroupCallData = null;
    // Open the group chat and join the call
    const overlay = $('active-call-overlay');
    show(overlay);
    _resetCallOverlayControls();
    $('call-audio-name').textContent = data.chatName || 'Групповой звонок';
    const av = $('call-audio-avatar');
    av.style.background = data.chatAvatarColor || AVATARS[0];
    av.innerHTML = (data.chatName || '?')[0].toUpperCase();
    $('call-audio-timer').textContent = 'Подключение...';
    _callTimerStart = Date.now();
    if (window._callTimerInterval) clearInterval(window._callTimerInterval);
    window._callTimerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - _callTimerStart) / 1000);
      const m = Math.floor(sec / 60), s = sec % 60;
      $('call-audio-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
    window.groupCallModule.joinGroupCall(data.chatId);
    return;
  }

  if (!_incomingCallData) return;
  Sounds.incomingStop();
  Sounds.ringStop();
  if (_ringTimeoutId) { clearTimeout(_ringTimeoutId); _ringTimeoutId = null; }
  hide($('incoming-call-overlay'));
  const overlay = $('active-call-overlay');
  show(overlay);
  _resetCallOverlayControls();

  $('call-audio-name').textContent = _incomingCallData.fromName || 'Звонок';
  const av = $('call-audio-avatar');
  av.style.background = _incomingCallData.fromAvatarColor || AVATARS[0];
  av.innerHTML = (_incomingCallData.fromName || '?')[0].toUpperCase() + (_incomingCallData.fromAvatar ? `<img src="${escHTML(_incomingCallData.fromAvatar)}">` : '');
  // Notify caller to stop ringing
  S.socket.emit('call_accepting', { to: _incomingCallData.from });
  // Force user gesture audio unlock before accepting call
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume().then(() => ctx.close());
  } catch {}
  window.callsModule.acceptCall(_incomingCallData.from, _incomingCallData.offer, _incomingCallData.callType);
  _callTimerStart = Date.now();
  if (window._callTimerInterval) clearInterval(window._callTimerInterval);
  $('call-audio-timer').textContent = '0:00';
  window._callTimerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - _callTimerStart) / 1000);
    const m = Math.floor(sec / 60), s = sec % 60;
    $('call-audio-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
  _incomingCallData = null;
}

function rejectIncoming() {
  // Cancel native notification
  window.ShadowNative?.cancelCallNotification?.();
  if (_incomingGroupCallData) {
    Sounds.incomingStop();
    hide($('incoming-call-overlay'));
    _incomingGroupCallData = null;
    return;
  }
  if (!_incomingCallData) return;
  Sounds.incomingStop();
  S.socket.emit('call_reject', { to: _incomingCallData.from });
  hide($('incoming-call-overlay'));
  _incomingCallData = null;
}

let _callEndingInProgress = false;
function handleCallEnded(remoteInitiated = false) {
  if (_callEndingInProgress) return;
  _callEndingInProgress = true;
  // Cancel native call notification
  window.ShadowNative?.cancelCallNotification?.();
  Sounds.ringStop();
  Sounds.incomingStop();
  Sounds.callEnd();
  if (_ringTimeoutId) { clearTimeout(_ringTimeoutId); _ringTimeoutId = null; }
  // End private or group call
  // remoteInitiated=true means the other side already ended, so skip emitting call_end back
  if (window.groupCallModule?.isInGroupCall()) {
    window.groupCallModule.leaveGroupCall();
  } else {
    window.callsModule.endCall(remoteInitiated); // skipEmit when remote-initiated
  }
  hide($('active-call-overlay'));
  hide($('incoming-call-overlay'));
  hide($('call-mini'));
  _incomingCallData = null;
  _incomingGroupCallData = null;
  if (window._callTimerInterval) { clearInterval(window._callTimerInterval); window._callTimerInterval = null; }
  _callTimerStart = 0;
  // Reset call control states
  $('toggle-mute')?.classList.remove('vk-ctrl-off');
  const muteI = $('toggle-mute')?.querySelector('i');
  if (muteI) muteI.className = 'fas fa-microphone';
  $('toggle-video')?.classList.add('vk-ctrl-off');
  const vidI = $('toggle-video')?.querySelector('i');
  if (vidI) vidI.className = 'fas fa-video-slash';
  $('toggle-screen')?.classList.remove('sharing');
  setTimeout(() => { _callEndingInProgress = false; }, 500);
}

/* ── Call minimize/expand ──────────────────────────────────────────── */
let _callTimerStart = 0;

function minimizeCall() {
  hide($('active-call-overlay'));
  const mini = $('call-mini');
  // Copy name/avatar
  $('call-mini-name').textContent = $('call-audio-name').textContent;
  $('call-mini-avatar').style.background = $('call-audio-avatar').style.background;
  $('call-mini-avatar').innerHTML = $('call-audio-avatar').innerHTML;
  // Sync mute icon
  const muted = window.callsModule.isMuted();
  $('call-mini-mute').querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  // Start timer if not started
  if (!_callTimerStart) _callTimerStart = Date.now();
  if (!window._callTimerInterval) {
    window._callTimerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - _callTimerStart) / 1000);
      const m = Math.floor(sec / 60), s = sec % 60;
      const t = `${m}:${String(s).padStart(2, '0')}`;
      $('call-mini-timer').textContent = t;
      $('call-audio-timer').textContent = t;
    }, 1000);
  }
  show(mini);
}

function expandCall() {
  hide($('call-mini'));
  show($('active-call-overlay'));
}

/* ══════════════════════════════════════════════════════════════════════
   RECORDING (Voice / Video circle)
   ══════════════════════════════════════════════════════════════════════ */
let _recorder = null;
let _recChunks = [];
let _recStream = null;
let _recType = 'audio';
let _recStart = 0;
let _recTimer = null;
let _recAnalyser = null;
let _recAnimFrame = null;

async function startRecording(type) {
  if (!S.chatId) return;
  _recType = type;
  _recChunks = [];

  try {
    const constraints = type === 'video'
      ? { audio: true, video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } } }
      : { audio: true };
    _recStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    showToast('Нет доступа к ' + (type === 'video' ? 'камере' : 'микрофону'), 'error');
    return;
  }

  const circle = $('rec-circle');
  const preview = $('rec-preview');

  if (type === 'video') {
    circle.classList.add('video-mode');
    circle.classList.remove('audio-mode');
    preview.srcObject = _recStream;
    preview.play().catch(() => {});
  } else {
    circle.classList.add('audio-mode');
    circle.classList.remove('video-mode');
    preview.srcObject = null;
    // Audio visualizer
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(_recStream);
      _recAnalyser = ctx.createAnalyser();
      _recAnalyser.fftSize = 256;
      source.connect(_recAnalyser);
      drawVisualizer();
    } catch {}
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
    : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';

  _recorder = new MediaRecorder(_recStream, mimeType ? { mimeType } : undefined);
  _recorder.ondataavailable = e => { if (e.data.size) _recChunks.push(e.data); };
  _recorder.onstop = () => {};
  _recorder.start();
  _recStart = Date.now();
  $('rec-timer').textContent = '0:00';
  _recTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - _recStart) / 1000);
    $('rec-timer').textContent = fmtDuration(sec);
  }, 500);

  show($('rec-overlay'));
}

function drawVisualizer() {
  const canvas = $('rec-visualizer');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = 200;
  const h = canvas.height = 200;
  const data = new Uint8Array(_recAnalyser.frequencyBinCount);

  function draw() {
    _recAnimFrame = requestAnimationFrame(draw);
    _recAnalyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(88, 101, 242, 0.3)';
    const cx = w / 2, cy = h / 2;
    const bars = 60;
    for (let i = 0; i < bars; i++) {
      const val = data[i % data.length] / 255;
      const angle = (i / bars) * Math.PI * 2;
      const r1 = 50;
      const r2 = r1 + val * 40;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(88, 101, 242, ${0.3 + val * 0.7})`;
      ctx.stroke();
    }
  }
  draw();
}

async function stopRecording(send) {
  if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
  if (_recAnimFrame) { cancelAnimationFrame(_recAnimFrame); _recAnimFrame = null; }

  if (_recorder && _recorder.state !== 'inactive') {
    _recorder.stop();
    // Wait for final data
    await new Promise(r => { _recorder.onstop = r; });
  }

  if (_recStream) { _recStream.getTracks().forEach(t => t.stop()); _recStream = null; }
  hide($('rec-overlay'));

  if (!send || !_recChunks.length || !S.chatId) { _recChunks = []; return; }

  const dur = (Date.now() - _recStart) / 1000;
  const mime = _recType === 'video' ? 'video/webm' : 'audio/webm';
  const blob = new Blob(_recChunks, { type: mime });
  _recChunks = [];
  const ext = _recType === 'video' ? 'webm' : 'webm';
  const fileName = `${_recType}_${Date.now()}.${ext}`;

  const fd = new FormData();
  fd.append('file', blob, fileName);
  fd.append('type', _recType === 'video' ? 'video' : 'voice');
  fd.append('duration', String(Math.round(dur)));

  try {
    const msg = await api(`/api/chats/${S.chatId}/upload`, { method: 'POST', body: fd });
    if (!S.messages.some(m => m.id === msg.id)) {
      S.messages.push(msg);
      renderMessages();
      scrollToBottom();
    }
    updateChatInList(S.chatId, msg);
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   PWA / PUSH
   ══════════════════════════════════════════════════════════════════════ */
function setupPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    S.deferredInstall = e;
    show($('install-banner'));
  });

  $('btn-install')?.addEventListener('click', () => {
    if (S.deferredInstall) {
      S.deferredInstall.prompt();
      S.deferredInstall.userChoice.then(() => { S.deferredInstall = null; hide($('install-banner')); });
    }
  });

  $('btn-install-close')?.addEventListener('click', () => hide($('install-banner')));
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('SW registered');
    // Subscribe push
    if (S.user?.settings?.notifications !== false) {
      subscribePush(reg);
    }
  } catch (e) { console.error('SW register error:', e); }
}

async function subscribePush(reg) {
  try {
    const vapidRes = await fetch('/api/push/vapid');
    if (!vapidRes.ok) return;
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) { await sendSubToServer(existing); return; }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await sendSubToServer(sub);
  } catch (e) { console.error('Push subscribe error:', e); }
}

async function sendSubToServer(sub) {
  const raw = sub.toJSON();
  try {
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys }) });
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   FORWARD MESSAGE
   ══════════════════════════════════════════════════════════════════════ */
function showForwardModal(msgId) {
  const list = $('forward-chat-list');
  list.innerHTML = S.chats.filter(c => c.id !== S.chatId).map(c => {
    const name = c.displayName || c.name || 'Чат';
    return `<div class="contact-item fwd-item" data-cid="${c.id}">
      <div class="ct-avatar" style="background:${c.displayAvatarColor || c.avatarColor || '#555'}">${name[0].toUpperCase()}${(c.displayAvatar || c.avatar) ? `<img src="${escHTML(c.displayAvatar || c.avatar)}">` : ''}</div>
      <div class="ct-info"><div class="ct-name">${escHTML(name)}</div></div>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Нет доступных чатов</p></div>';

  list.querySelectorAll('.fwd-item').forEach(el => el.onclick = async () => {
    try {
      await api(`/api/messages/${msgId}/forward`, { method: 'POST', body: JSON.stringify({ targetChatId: el.dataset.cid }) });
      hide($('modal-forward'));
      showToast('Сообщение переслано', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
  show($('modal-forward'));
}

/* ══════════════════════════════════════════════════════════════════════
   PINNED MESSAGE BAR
   ══════════════════════════════════════════════════════════════════════ */
function updatePinnedBar() {
  const bar = $('pinned-msg-bar');
  if (!bar) return;
  const chat = S.chatObj;
  if (!chat?.pinnedMessage) { hide(bar); return; }
  const pinMsg = S.messages.find(m => m.id === chat.pinnedMessage);
  $('pinned-msg-text').textContent = pinMsg ? (pinMsg.text || '📎 Файл').slice(0, 80) : 'Закреплённое сообщение';
  show(bar);
  bar.onclick = () => {
    if (pinMsg) {
      const el = $('messages-area').querySelector(`.msg[data-id="${pinMsg.id}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--brand)'; setTimeout(() => el.style.outline = '', 2000); }
    }
  };
  $('pinned-msg-close').onclick = (e) => {
    e.stopPropagation();
    api(`/api/chats/${S.chatId}/pin`, { method: 'POST', body: JSON.stringify({ messageId: null }) })
      .then(() => { hide(bar); showToast('Открепленo', 'success'); })
      .catch(e => showToast(e.message, 'error'));
  };
}

/* ══════════════════════════════════════════════════════════════════════
   CHAT SEARCH MODAL
   ══════════════════════════════════════════════════════════════════════ */
let _cspResults = [], _cspIdx = -1;
function showChatSearchModal() {
  if (!S.chatId) return;
  const panel = $('chat-search-panel');
  panel.classList.remove('hidden');
  $('chat-search-input').value = '';
  $('csp-results').innerHTML = '';
  $('csp-nav').classList.add('hidden');
  $('csp-counter').textContent = '0/0';
  _cspResults = []; _cspIdx = -1;
  // Clear old highlights
  $('messages-area').querySelectorAll('.msg.csp-highlight').forEach(el => el.classList.remove('csp-highlight'));
  setTimeout(() => $('chat-search-input').focus(), 100);
}
function closeChatSearchPanel() {
  $('chat-search-panel').classList.add('hidden');
  $('messages-area').querySelectorAll('.msg.csp-highlight').forEach(el => el.classList.remove('csp-highlight'));
  _cspResults = []; _cspIdx = -1;
}
function doChatSearch() {
  const q = $('chat-search-input').value.trim().toLowerCase();
  if (!q) return;
  _cspResults = S.messages.filter(m => m.text && m.text.toLowerCase().includes(q));
  $('messages-area').querySelectorAll('.msg.csp-highlight').forEach(el => el.classList.remove('csp-highlight'));
  if (!_cspResults.length) {
    $('csp-results').innerHTML = '<p style="padding:12px;color:var(--muted);text-align:center">Ничего не найдено</p>';
    $('csp-nav').classList.add('hidden');
    $('csp-counter').textContent = '0/0';
    return;
  }
  // Render results list
  $('csp-results').innerHTML = _cspResults.map((m, i) =>
    `<div class="csp-item" data-idx="${i}"><b>${escHTML(m.senderName)}</b> <span class="csp-time">${fmtTime(m.timestamp)}</span><br><span class="csp-text">${escHTML((m.text || '').slice(0, 80))}</span></div>`
  ).join('');
  $('csp-results').querySelectorAll('.csp-item').forEach(el => el.onclick = () => navigateCspTo(parseInt(el.dataset.idx)));
  $('csp-nav').classList.remove('hidden');
  _cspIdx = _cspResults.length - 1;
  navigateCspTo(_cspIdx);
}
function navigateCspTo(idx) {
  if (!_cspResults.length) return;
  _cspIdx = idx;
  $('csp-counter').textContent = `${idx + 1}/${_cspResults.length}`;
  $('messages-area').querySelectorAll('.msg.csp-highlight').forEach(el => el.classList.remove('csp-highlight'));
  const m = _cspResults[idx];
  const target = $('messages-area').querySelector(`.msg[data-id="${m.id}"]`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('csp-highlight');
  }
}
window.doChatSearch = doChatSearch;

/* ══════════════════════════════════════════════════════════════════════
   EDIT GROUP MODAL
   ══════════════════════════════════════════════════════════════════════ */
function showEditGroupModal() {
  if (!S.chatId || (S.chatObj?.type !== 'group' && S.chatObj?.type !== 'channel')) return;
  $('edit-group-name').value = S.chatObj.displayName || S.chatObj.name || '';
  if ($('edit-group-desc')) $('edit-group-desc').value = S.chatObj.description || '';
  // Render members list
  const membersEl = $('edit-group-members-list');
  if (membersEl && S.chatObj.membersInfo) {
    membersEl.innerHTML = S.chatObj.membersInfo.map(m => {
      const isAdmin = S.chatObj.admins?.includes(m.id);
      const isOwner = S.chatObj.owner === m.id;
      const canKick = (S.chatObj.admins?.includes(S.user.id) || S.chatObj.owner === S.user.id) && m.id !== S.user.id;
      const badge = isOwner ? '<span class="egm-badge owner">Владелец</span>' : isAdmin ? '<span class="egm-badge admin">Админ</span>' : '';
      const kickBtn = canKick ? `<button class="egm-kick" data-uid="${m.id}" title="Исключить"><i class="fas fa-user-minus"></i></button>` : '';
      const color = m.avatarColor || '#5865f2';
      return `<div class="egm-member"><div class="egm-av" style="background:${color}">${(m.displayName || m.username || '?')[0].toUpperCase()}${m.avatar ? `<img src="${escHTML(m.avatar)}">` : ''}</div><div class="egm-info"><span class="egm-name">${escHTML(m.displayName || m.username)}</span>${badge}</div>${kickBtn}</div>`;
    }).join('');
    membersEl.querySelectorAll('.egm-kick').forEach(btn => btn.onclick = async () => {
      try {
        await api(`/api/chats/${S.chatId}/members/${btn.dataset.uid}`, { method: 'DELETE' });
        showToast('Участник исключён', 'success');
        btn.closest('.egm-member').remove();
      } catch (e) { showToast(e.message, 'error'); }
    });
  } else if (membersEl) {
    membersEl.innerHTML = '<p class="s-hint">Загрузка...</p>';
  }
  show($('modal-edit-group'));
}
window.submitEditGroup = async function() {
  const name = $('edit-group-name').value.trim();
  if (!name) { showToast('Введите название', 'warning'); return; }
  const description = $('edit-group-desc') ? $('edit-group-desc').value.trim() : undefined;
  try {
    const body = { name };
    if (description !== undefined) body.description = description;
    await api(`/api/chats/${S.chatId}`, { method: 'PUT', body: JSON.stringify(body) });
    showToast('Группа обновлена', 'success');
    hide($('modal-edit-group'));
    loadChats();
  } catch (e) { showToast(e.message, 'error'); }
};

/* ══════════════════════════════════════════════════════════════════════
   INVITE MEMBER MODAL
   ══════════════════════════════════════════════════════════════════════ */
function showInviteMemberModal() {
  if (!S.chatId) return;
  $('invite-username').value = '';
  show($('modal-invite'));
}
window.submitInviteMember = async function() {
  const username = $('invite-username').value.trim();
  if (!username) { showToast('Введите имя пользователя', 'warning'); return; }
  try {
    await api(`/api/chats/${S.chatId}/members`, { method: 'POST', body: JSON.stringify({ username }) });
    showToast('Пользователь добавлен', 'success');
    hide($('modal-invite'));
  } catch (e) { showToast(e.message, 'error'); }
};

/* ══════════════════════════════════════════════════════════════════════
   AUTO-DELETE MODAL
   ══════════════════════════════════════════════════════════════════════ */
function showAutoDeleteModal() {
  if (!S.chatId) return;
  const current = S.chatObj?.autoDeleteTimer || 0;
  const opts = $('autodelete-options');
  opts.querySelectorAll('.s-opt-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) === current));
  opts.querySelectorAll('.s-opt-btn').forEach(b => b.onclick = async () => {
    try {
      await api(`/api/chats/${S.chatId}/autodelete`, { method: 'PUT', body: JSON.stringify({ timer: parseInt(b.dataset.val) }) });
      opts.querySelectorAll('.s-opt-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      showToast(parseInt(b.dataset.val) ? 'Авто-удаление включено' : 'Авто-удаление выключено', 'success');
      hide($('modal-autodelete'));
    } catch (e) { showToast(e.message, 'error'); }
  });
  show($('modal-autodelete'));
}

/* ══════════════════════════════════════════════════════════════════════
   SCHEDULED MESSAGES MODAL
   ══════════════════════════════════════════════════════════════════════ */
function showScheduleModal() {
  if (!S.chatId) return;
  $('schedule-text').value = '';
  // Set default datetime to +1 hour
  const d = new Date(Date.now() + 3600000);
  $('schedule-datetime').value = d.toISOString().slice(0, 16);
  show($('modal-schedule'));
}

/* ══════════════════════════════════════════════════════════════════════
   ROLES MODAL
   ══════════════════════════════════════════════════════════════════════ */
function showRolesModal() {
  if (!S.chatId || (S.chatObj?.type !== 'group' && S.chatObj?.type !== 'channel')) return;
  const roles = S.chatObj.roles || {};
  const PERM_LABELS = { write: 'Писать', delete: 'Удалять', pin: 'Закреплять', invite: 'Приглашать', kick: 'Исключать', editGroup: 'Ред. группу', manageRoles: 'Управл. ролями' };
  const list = $('roles-list');
  if (!Object.keys(roles).length) {
    list.innerHTML = '<p class="s-hint">Нет ролей</p>';
  } else {
    list.innerHTML = Object.entries(roles).map(([name, r]) => {
      const perms = r.permissions || {};
      const permTags = Object.entries(PERM_LABELS).filter(([k]) => perms[k]).map(([, v]) => `<span class="role-perm-tag">${v}</span>`).join('');
      return `<div class="role-card">
        <div class="role-card-header">
          <span class="role-dot" style="background:${r.color || '#888'}"></span>
          <span class="role-card-name">${escHTML(name)}</span>
          <button class="btn-sm role-delete-btn" onclick="deleteRole('${escHTML(name)}')"><i class="fas fa-trash"></i></button>
        </div>
        <div class="role-card-perms">${permTags || '<span class="s-hint" style="margin:0;font-size:11px">Нет прав</span>'}</div>
      </div>`;
    }).join('');
  }
  show($('modal-roles'));
}
window.deleteRole = async function(name) {
  if (!S.chatId) return;
  const roles = { ...(S.chatObj.roles || {}) };
  delete roles[name];
  try {
    const res = await api(`/api/chats/${S.chatId}/roles`, { method: 'PUT', body: JSON.stringify({ roles }) });
    S.chatObj.roles = res.roles;
    showRolesModal();
    showToast('Роль удалена', 'success');
  } catch (e) { showToast(e.message, 'error'); }
};

/* ══════════════════════════════════════════════════════════════════════
   GROUP INFO PANEL
   ══════════════════════════════════════════════════════════════════════ */
function openGroupInfo() {
  const c = S.chatObj;
  if (!c) return;
  const panel = $('group-info-panel');
  panel.classList.remove('hidden');
  // Name & description
  $('gip-name').textContent = c.displayName || c.name || 'Группа';
  $('gip-desc').textContent = c.description || '';
  if ($('gip-members-count')) $('gip-members-count').textContent = `${c.members?.length || 0} участников`;
  // Avatar
  const av = $('gip-avatar');
  const name = c.displayName || c.name || '?';
  const color = c.displayAvatarColor || c.avatarColor || '#5865f2';
  av.style.background = color;
  av.innerHTML = name[0].toUpperCase() + ((c.displayAvatar || c.avatar) ? `<img src="${escHTML(c.displayAvatar || c.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '');
  // Media
  const media = S.messages.filter(m => m.type === 'image' || m.type === 'video');
  const mediaEl = $('gip-media');
  const noMedia = $('gip-no-media');
  if (media.length) {
    mediaEl.innerHTML = media.slice(-12).map(m => {
      if (m.type === 'image') return `<img src="${escHTML(m.fileUrl)}" class="gip-media-thumb" onclick="openLightbox('${escHTML(m.fileUrl)}','image')">`;
      return `<video src="${escHTML(m.fileUrl)}" class="gip-media-thumb" onclick="openLightbox('${escHTML(m.fileUrl)}','video')"></video>`;
    }).join('');
    hide(noMedia); show(mediaEl);
  } else { hide(mediaEl); show(noMedia); }
  // Files
  const files = S.messages.filter(m => m.type === 'file');
  const filesEl = $('gip-files');
  const noFiles = $('gip-no-files');
  if (files.length) {
    filesEl.innerHTML = files.slice(-20).map(m =>
      `<a href="${escHTML(m.fileUrl)}" target="_blank" class="gip-file-item"><i class="fas fa-file"></i> ${escHTML(m.fileName || 'Файл')}</a>`
    ).join('');
    hide(noFiles); show(filesEl);
  } else { hide(filesEl); show(noFiles); }
  // Members
  const membersEl = $('gip-members-list');
  if (c.membersInfo && c.membersInfo.length) {
    membersEl.innerHTML = c.membersInfo.map(m => {
      const isAdmin = c.admins?.includes(m.id);
      const isOwner = c.owner === m.id;
      const badge = isOwner ? '<span class="egm-badge owner">Владелец</span>' : isAdmin ? '<span class="egm-badge admin">Админ</span>' : '';
      const onlineDot = m.online ? '<span class="gip-online-dot"></span>' : '';
      const col = m.avatarColor || '#5865f2';
      return `<div class="egm-member" data-uid="${m.id}" style="cursor:pointer"><div class="egm-av" style="background:${col}">${(m.displayName || '?')[0].toUpperCase()}${m.avatar ? `<img src="${escHTML(m.avatar)}">` : ''}</div><div class="egm-info"><span class="egm-name">${escHTML(m.displayName || 'Пользователь')}${onlineDot}</span>${badge}</div></div>`;
    }).join('');
    membersEl.querySelectorAll('.egm-member').forEach(el => el.onclick = () => showProfileById(el.dataset.uid));
  } else {
    membersEl.innerHTML = '<p class="s-hint">Нет данных</p>';
  }
}
function closeGroupInfo() {
  $('group-info-panel').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════════════════
   DND MODE
   ══════════════════════════════════════════════════════════════════════ */
async function toggleDnd(enabled) {
  const reply = $('set-dnd-reply')?.value || '';
  try {
    S.user = await api('/api/me/dnd', { method: 'PUT', body: JSON.stringify({ enabled, autoReply: reply }) });
    showToast(enabled ? '🔕 Не беспокоить включён' : 'Не беспокоить выключён', enabled ? 'warning' : 'info');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   CUSTOM STATUS (Premium)
   ══════════════════════════════════════════════════════════════════════ */
async function saveCustomStatus() {
  const text = $('cs-text')?.value || '';
  const emoji = $('cs-emoji')?.value || '';
  const color = $('cs-color')?.value || '';
  try {
    S.user = await api('/api/me/status', { method: 'PUT', body: JSON.stringify({ text, emoji, color }) });
    showToast(text ? 'Статус установлен' : 'Статус убран', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   SOCIAL LINKS (Premium)
   ══════════════════════════════════════════════════════════════════════ */
async function saveSocialLinks() {
  const socialLinks = {
    telegram: $('social-tg')?.value || '',
    instagram: $('social-ig')?.value || '',
    github: $('social-gh')?.value || '',
    website: $('social-web')?.value || '',
  };
  try {
    S.user = await api('/api/me/social', { method: 'PUT', body: JSON.stringify({ socialLinks }) });
    showToast('Ссылки сохранены', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   NOTIFICATION SOUNDS (Premium)
   ══════════════════════════════════════════════════════════════════════ */
const NOTIF_SOUNDS = [
  { id: 'default', label: 'Стандартный', freq: 800 },
  { id: 'bell', label: 'Колокольчик', freq: 1200 },
  { id: 'chime', label: 'Перезвон', freq: 600 },
  { id: 'ping', label: 'Пинг', freq: 1000 },
  { id: 'pop', label: 'Поп', freq: 500 },
  { id: 'ding', label: 'Динь', freq: 900 },
  { id: 'soft', label: 'Мягкий', freq: 400 },
  { id: 'bright', label: 'Яркий', freq: 1400 },
  { id: 'deep', label: 'Глубокий', freq: 300 },
  { id: 'crystal', label: 'Кристалл', freq: 1600 },
  { id: 'bubble', label: 'Пузырёк', freq: 700 },
  { id: 'knock', label: 'Стук', freq: 200 },
];

function buildNotifSoundsGrid() {
  const current = S.user?.settings?.notifSound || 'default';
  ['notif-sounds-grid', 'mob-notif-sounds-grid'].forEach(gid => {
    const grid = $(gid);
    if (!grid) return;
    grid.innerHTML = NOTIF_SOUNDS.map(s => `<button class="notif-sound-btn${s.id === current ? ' active' : ''}" data-sid="${s.id}" data-freq="${s.freq}"><i class="fas fa-music"></i> ${s.label}</button>`).join('');
    grid.querySelectorAll('.notif-sound-btn').forEach(b => b.onclick = () => {
      const canUse = S.user?.premium || S.user?.superUser || S.user?.premiumFree;
      if (!canUse && b.dataset.sid !== 'default') { showToast('Требуется Shadow+', 'warning'); return; }
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = parseInt(b.dataset.freq);
        osc.type = 'sine';
        gain.gain.value = 0.3;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      } catch {}
      document.querySelectorAll('.notif-sound-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      saveSettingsToggle('notifSound', b.dataset.sid);
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   TRANSLATE MESSAGE (Premium)
   ══════════════════════════════════════════════════════════════════════ */
async function translateMessage(msgId) {
  const msg = S.messages.find(m => m.id === msgId);
  if (!msg || !msg.text) return;
  showToast('Перевод...', 'info');
  // Use free translation API
  try {
    // Detect if text is mostly Cyrillic → translate to English, otherwise to Russian
    const textSample = msg.text.slice(0, 200);
    const cyrCount = (textSample.match(/[а-яёА-ЯЁ]/g) || []).length;
    const srcLang = cyrCount > textSample.length * 0.3 ? 'ru' : 'en';
    const tgtLang = srcLang === 'ru' ? 'en' : 'ru';
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(msg.text.slice(0, 500))}&langpair=${srcLang}|${tgtLang}`);
    const data = await resp.json();
    if (data.responseData?.translatedText) {
      const el = $('messages-area').querySelector(`.msg[data-id="${msgId}"] .msg-content`);
      if (el) {
        el.innerHTML += `<div class="msg-translation"><i class="fas fa-language"></i> ${escHTML(data.responseData.translatedText)}</div>`;
      }
      showToast('Переведено', 'success');
    } else {
      showToast('Не удалось перевести', 'error');
    }
  } catch { showToast('Ошибка перевода', 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════
   PROFILE VIEWER EXTENDED
   ══════════════════════════════════════════════════════════════════════ */
function showProfileExtended(u) {
  // Custom status
  const csEl = $('pv-custom-status');
  if (csEl) {
    if (u.customStatus) {
      csEl.innerHTML = `<span class="pv-cs-emoji">${escHTML(u.customStatusEmoji || '')}</span> ${escHTML(u.customStatus)}`;
      if (u.customStatusColor) csEl.style.background = u.customStatusColor + '33';
      else csEl.style.background = '';
      show(csEl);
    } else hide(csEl);
  }
  // Social links
  const socEl = $('pv-social');
  if (socEl) {
    const links = u.socialLinks || {};
    const items = [];
    if (links.telegram) items.push(`<a href="https://t.me/${links.telegram.replace('@','')}" target="_blank" rel="noopener"><i class="fab fa-telegram"></i> ${escHTML(links.telegram)}</a>`);
    if (links.instagram) items.push(`<a href="https://instagram.com/${links.instagram.replace('@','')}" target="_blank" rel="noopener"><i class="fab fa-instagram"></i> ${escHTML(links.instagram)}</a>`);
    if (links.github) items.push(`<a href="https://github.com/${links.github}" target="_blank" rel="noopener"><i class="fab fa-github"></i> ${escHTML(links.github)}</a>`);
    if (links.website) items.push(`<a href="${escHTML(links.website)}" target="_blank" rel="noopener"><i class="fas fa-globe"></i> Сайт</a>`);
    if (items.length) { socEl.innerHTML = items.join(''); show(socEl); }
    else hide(socEl);
  }
  // Banner
  const banner = $('pv-banner');
  if (banner && u.banner) banner.style.backgroundImage = `url(${u.banner})`;
  // DND indicator
  if (u.dndMode) {
    const nameEl = $('pv-name');
    if (nameEl) nameEl.innerHTML = `${escHTML(u.displayName || u.username)} <span class="dnd-badge">🔕</span>`;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   IN-APP NOTIFICATION POPUP
   ══════════════════════════════════════════════════════════════════════ */
function showInAppNotif(msg) {
  // Remove old popup if any
  document.querySelectorAll('.in-app-notif').forEach(el => el.remove());
  const chat = S.chats.find(c => c.id === msg.chatId);
  const senderName = msg.senderName || (chat ? chat.name : 'Сообщение');
  const text = msg.text ? (msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text) : (msg.fileUrl ? '📎 Файл' : '💬');

  const el = document.createElement('div');
  el.className = 'in-app-notif';
  el.innerHTML = `<div class="ian-left"><div class="ian-avatar">${senderName.charAt(0).toUpperCase()}</div></div><div class="ian-body"><div class="ian-name">${senderName}</div><div class="ian-text">${text}</div></div><div class="ian-close">&times;</div>`;
  el.querySelector('.ian-close').onclick = e => { e.stopPropagation(); el.classList.add('ian-hide'); setTimeout(() => el.remove(), 300); };
  el.onclick = () => { el.remove(); if (chat) openChat(chat.id); };
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) { el.classList.add('ian-hide'); setTimeout(() => el.remove(), 300); } }, 5000);
}

/* ══════════════════════════════════════════════════════════════════════
   SUPER USER: ONLINE ANIMATION
   ══════════════════════════════════════════════════════════════════════ */
function showSuperEntryAnimation() {
  if (!S.user?.superUser) return;
  const overlay = document.createElement('div');
  overlay.className = 'super-entry-overlay';
  // Central icon — lightning bolt instead of crown
  const crown = document.createElement('div');
  crown.className = 'super-entry-crown';
  crown.innerHTML = '<i class="fas fa-bolt" style="font-size:60px;color:#ffd700"></i>';
  overlay.appendChild(crown);
  // Welcome text
  const txt = document.createElement('div');
  txt.className = 'super-entry-text';
  txt.textContent = S.user.displayName || S.user.username;
  overlay.appendChild(txt);
  // Particles
  const symbols = ['✦','✧','⚡','💎','🌟','⭐'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'super-entry-particle';
    p.textContent = symbols[i % symbols.length];
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.fontSize = (12 + Math.random() * 18) + 'px';
    overlay.appendChild(p);
  }
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.classList.add('super-entry-fade'); }, 2200);
  setTimeout(() => overlay.remove(), 3000);
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
initAuth();
if (S.token) boot();
