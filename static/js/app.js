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
  default:'#313338',midnight:'#0d1117',forest:'#1a1e1a',crimson:'#1a1013',
  purple:'#16101e',ocean:'#0a1628',sunset:'#1a1210',nord:'#2e3440',
  monokai:'#1e1f1c',dracula:'#21222c',solarized:'#002b36',onedark:'#21252b',
  gruvbox:'#1d2021',tokyo:'#16161e',material:'#1a1a1a',catppuccin:'#1e1e2e',light:'#ffffff'
};

const AVATARS = ['#5865f2','#57f287','#fee75c','#eb459e','#ed4245','#3ba55c','#faa61a','#e67e22','#9b59b6','#1abc9c'];

function avatarHTML(u, cls = '') {
  if (!u) return `<div class="${cls}" style="background:#555">?</div>`;
  const style = `background:${u.avatarColor || u.displayAvatarColor || AVATARS[0]}`;
  if (u.avatar || u.displayAvatar) {
    return `<div class="${cls}" style="${style}"><img src="${u.avatar || u.displayAvatar}" alt=""></div>`;
  }
  const letter = (u.displayName || u.username || '?')[0].toUpperCase();
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

/* ── API ────────────────────────────────────────────────────────────── */
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
  message() { if (!S.user?.settings?.soundEnabled) return; this._beep(880, 0.08); setTimeout(() => this._beep(1100, 0.08), 100); },
  callEnd() { this._beep(400, 0.15); setTimeout(() => this._beep(300, 0.15), 180); },
  _ringInterval: null,
  ringStart() {
    this.ringStop();
    const ring = () => { this._beep(523, 0.2, 0.2); setTimeout(() => this._beep(659, 0.2, 0.2), 250); setTimeout(() => this._beep(784, 0.3, 0.2), 500); };
    ring();
    this._ringInterval = setInterval(ring, 2000);
  },
  ringStop() { if (this._ringInterval) { clearInterval(this._ringInterval); this._ringInterval = null; } },
  _incomingInterval: null,
  incomingStart() {
    this.incomingStop();
    const ring = () => { this._beep(784, 0.15, 0.25); setTimeout(() => this._beep(659, 0.15, 0.25), 200); setTimeout(() => this._beep(784, 0.15, 0.25), 400); };
    ring();
    this._incomingInterval = setInterval(ring, 1500);
  },
  incomingStop() { if (this._incomingInterval) { clearInterval(this._incomingInterval); this._incomingInterval = null; } },
};

/* ══════════════════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════════════════ */
function initAuth() {
  const loginForm = $('login-form'), regForm = $('register-form');
  $('to-register').onclick = () => { hide(loginForm); show(regForm); hide($('to-register')); show($('to-login')); };
  $('to-login').onclick = () => { show(loginForm); hide(regForm); show($('to-register')); hide($('to-login')); };

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
}

function logout() {
  S.token = null; S.user = null;
  localStorage.removeItem('token');
  S.socket?.disconnect();
  location.reload();
}

/* ══════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════ */
async function boot() {
  try {
    S.user = await api('/api/me');
  } catch {
    logout(); return;
  }
  hide($('auth-screen'));
  show($('app'));
  applyTheme(S.user.settings?.theme || 'default');
  initSocket();
  initUI();
  loadChats();
  loadFriends();
  registerSW();
  setupPWA();
}

/* ══════════════════════════════════════════════════════════════════════
   SOCKET
   ══════════════════════════════════════════════════════════════════════ */
function initSocket() {
  const socket = io({ auth: { token: S.token }, transports: ['websocket', 'polling'] });
  S.socket = socket;

  socket.on('connect', () => console.log('Socket connected'));

  socket.on('new_message', msg => {
    if (msg.chatId === S.chatId) {
      S.messages.push(msg);
      renderMessages();
      scrollToBottom();
    }
    Sounds.message();
    updateChatInList(msg.chatId, msg);
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
    if (i >= 0) { S.chats[i] = { ...S.chats[i], ...chat }; renderChatList(); if (S.chatId === chat.id) updateChatHeader(); }
  });

  socket.on('chat_deleted', ({ chatId }) => {
    S.chats = S.chats.filter(c => c.id !== chatId);
    renderChatList();
    if (S.chatId === chatId) closeChat();
  });

  socket.on('session_revoked', () => { showToast('Сессия завершена', 'warning'); logout(); });

  socket.on('friend_request', () => loadFriends());
  socket.on('friend_accepted', () => loadFriends());

  // Calls
  socket.on('call_incoming', data => handleIncomingCall(data));
  socket.on('call_answered', data => window.callsModule.onAnswer(data));
  socket.on('call_ice', data => window.callsModule.onIce(data));
  socket.on('call_ended', () => handleCallEnded());
  socket.on('call_rejected', () => handleCallEnded());
  socket.on('call_busy', () => { Sounds.ringStop(); showToast('Абонент занят', 'warning'); });
  socket.on('call_accepting', () => { Sounds.ringStop(); });
  socket.on('call_renegotiate', data => window.callsModule.onRenegotiate ? window.callsModule.onRenegotiate(data) : null);
  socket.on('call_status', data => window.callsModule.onPeerStatus ? window.callsModule.onPeerStatus(data) : null);
}

/* ══════════════════════════════════════════════════════════════════════
   UI INIT
   ══════════════════════════════════════════════════════════════════════ */
function initUI() {
  // Sidebar
  $('sb-user-pill').innerHTML = (S.user.avatar ? `<img src="${escHTML(S.user.avatar)}">` : (S.user.displayName || '?')[0].toUpperCase());
  $('nav-dms').onclick = () => switchTab('chats');
  $('btn-add-hub').onclick = () => show($('modal-group'));
  $('nav-settings').onclick = () => openSettings();
  $('ghost-toggle').onclick = () => toggleGhost();

  // Panel
  $('btn-new-chat').onclick = () => { switchTab('contacts'); switchContactTab('search'); };
  $('btn-new-group').onclick = () => show($('modal-group'));
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
  $('ch-click').onclick = () => { if (S.chatObj) showProfile(getPartner()); };

  // Reply / Edit
  $('reply-cancel').onclick = () => cancelReply();
  $('edit-cancel').onclick = () => cancelEdit();

  // Incoming call
  $('btn-accept').onclick = () => acceptIncoming();
  $('btn-reject').onclick = () => rejectIncoming();

  // Lightbox
  $('lb-close').onclick = () => closeLightbox();
  $('lightbox').onclick = e => { if (e.target === $('lightbox')) closeLightbox(); };

  // Profile viewer
  $('profile-close').onclick = () => hide($('profile-viewer'));

  // Settings
  $('btn-save-profile').onclick = () => saveProfile();
  $('btn-change-pw').onclick = () => changePassword();
  $('btn-logout').onclick = () => logout();
  $('set-avatar-btn').onclick = () => $('avatar-input').click();
  $('avatar-input').onchange = () => uploadAvatar();
  $('btn-revoke').onclick = () => revokeSessions();
  $('set-ghost').onchange = () => toggleGhost();
  $('set-notifications').onchange = () => saveSettingsToggle('notifications', $('set-notifications').checked);
  $('set-sounds').onchange = () => saveSettingsToggle('soundEnabled', $('set-sounds').checked);
  $('set-show-online').onchange = () => saveSettingsToggle('privShowOnline', $('set-show-online').checked);
  $('set-read-receipts').onchange = () => saveSettingsToggle('privReadReceipts', $('set-read-receipts').checked);
  $('set-show-typing').onchange = () => saveSettingsToggle('privShowTyping', $('set-show-typing').checked);

  // Modal close buttons
  $$('[data-close]').forEach(b => b.onclick = () => hide($(b.dataset.close)));

  // Mobile settings items
  $$('.mob-item[data-act]').forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'edit-profile') openSettings();
    else if (act === 'ghost') toggleGhost();
    else if (act === 'notifications') openSettings();
    else if (act === 'themes') { buildThemeGrid('theme-grid-mob'); show($('modal-themes')); }
    else if (act === 'sessions') openSettings();
    else if (act === 'logout') logout();
  });

  // Contact sub-tabs
  $$('.sub-tab').forEach(b => b.onclick = () => switchContactTab(b.dataset.ct));
  $('btn-contacts-search').onclick = () => searchUsers();
  $('contacts-search').onkeydown = e => { if (e.key === 'Enter') searchUsers(); };

  // New group
  $('group-search').oninput = () => searchGroupUsers();
  $('btn-create-group').onclick = () => createGroup();

  // Theme
  buildThemeGrid('theme-grid');

  // Fill settings
  fillSettings();

  // Messages scroll (load more)
  $('messages-container').onscroll = () => {
    if ($('messages-container').scrollTop < 100 && !S.loadingMore && S.hasMore && S.chatId) loadMoreMessages();
  };

  // Clicks to close modals
  document.addEventListener('click', e => {
    if (!$('ctx-menu').classList.contains('hidden') && !$('ctx-menu').contains(e.target)) hide($('ctx-menu'));
    if (!$('emoji-picker').classList.contains('hidden') && !$('emoji-picker').contains(e.target) && e.target !== $('btn-emoji')) hide($('emoji-picker'));
  });

  document.addEventListener('contextmenu', e => {
    const msgEl = e.target.closest('.msg');
    if (msgEl && msgEl.dataset.id) { e.preventDefault(); showContextMenu(e, msgEl.dataset.id); }
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

  if (tab === 'contacts') loadFriends();
  if (tab === 'chats') renderChatList();
}

function switchContactTab(ct) {
  $$('.sub-tab').forEach(b => b.classList.toggle('active', b.dataset.ct === ct));
  if (ct === 'search') { show($('contacts-search-wrap')); } else { hide($('contacts-search-wrap')); }
  renderContacts(ct);
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
    return `<div class="chat-item${c.id === S.chatId ? ' active' : ''}" data-id="${c.id}">
      <div class="ci-avatar" style="background:${c.displayAvatarColor || c.avatarColor || AVATARS[0]}">${c.displayAvatar || c.avatar ? `<img src="${escHTML(c.displayAvatar || c.avatar)}">` : name[0]}${onlineDot}</div>
      <div class="ci-body"><div class="ci-top"><span class="ci-name">${name}</span><span class="ci-time">${time}</span></div><div class="ci-bottom"><span class="ci-msg">${preview}</span>${badge}</div></div>
    </div>`;
  }).join('');

  container.querySelectorAll('.chat-item').forEach(el => el.onclick = () => openChat(el.dataset.id));
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
  avEl.innerHTML = (c.displayAvatar || c.avatar) ? `<img src="${escHTML(c.displayAvatar || c.avatar)}">` : name[0].toUpperCase();

  if (c.type === 'private') {
    $('ch-status').textContent = c.online ? 'в сети' : (c._lastSeen ? `был(а) ${fmtTime(c._lastSeen)}` : '');
  } else {
    $('ch-status').textContent = `${c.members?.length || 0} участников`;
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

    const date = fmtDate(m.timestamp);
    if (date !== lastDate) { html += `<div class="msg-date-sep">${date}</div>`; lastDate = date; lastAuthor = ''; }

    const sameAuthor = m.senderId === lastAuthor && (new Date(m.timestamp) - lastTime < 300000);
    lastAuthor = m.senderId;
    lastTime = new Date(m.timestamp);

    const cls = sameAuthor ? 'msg msg-collapsed' : 'msg';
    const color = m.senderAvatarColor || AVATARS[0];
    const av = sameAuthor ? '<div class="msg-av" style="visibility:hidden"></div>' : `<div class="msg-av" style="background:${color}" data-uid="${m.senderId}">${m.senderAvatar ? `<img src="${escHTML(m.senderAvatar)}">` : (m.senderName || '?')[0].toUpperCase()}</div>`;
    const nameColor = m.senderSuperUser ? '#ffd700' : color;
    const author = sameAuthor ? '' : `<div class="msg-top"><span class="msg-author" style="color:${nameColor}" data-uid="${m.senderId}">${escHTML(m.senderName)}</span><span class="msg-time">${fmtTime(m.timestamp)}</span>${m.editedAt ? '<span class="msg-edited">(ред.)</span>' : ''}</div>`;

    let replyHtml = '';
    if (m.replyTo) {
      const orig = S.messages.find(x => x.id === m.replyTo);
      if (orig) replyHtml = `<div class="msg-reply" data-id="${orig.id}"><b>${escHTML(orig.senderName)}</b>${escHTML((orig.text || '').slice(0, 60))}</div>`;
    }

    let content = '';
    if (m.type === 'image') {
      content = `<img src="${escHTML(m.fileUrl)}" alt="image" class="msg-img" onclick="openLightbox('${escHTML(m.fileUrl)}', 'image')">`;
    } else if (m.type === 'voice') {
      content = `<div class="msg-voice" data-url="${escHTML(m.fileUrl)}"><button class="voice-play-btn"><i class="fas fa-play"></i></button><div class="voice-bar"><div class="voice-progress"></div></div><span class="voice-dur">${m.duration ? fmtDuration(m.duration) : '0:00'}</span></div>`;
    } else if (m.type === 'video') {
      content = `<div class="msg-video-circle" onclick="openLightbox('${escHTML(m.fileUrl)}', 'video')"><video src="${escHTML(m.fileUrl)}" preload="metadata"></video><div class="vc-play"><i class="fas fa-play"></i></div>${m.duration ? `<span class="vc-dur">${fmtDuration(m.duration)}</span>` : ''}</div>`;
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

    html += `<div class="${cls}" data-id="${m.id}">${av}<div class="msg-body">${author}${replyHtml}${content}${reactHtml}</div></div>`;
  });

  area.innerHTML = html;

  // Voice play buttons
  area.querySelectorAll('.voice-play-btn').forEach(btn => btn.onclick = () => playVoice(btn));

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
    // Server doesn't send new_message to sender via socket — add locally
    S.messages.push(msg);
    renderMessages();
    scrollToBottom();
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
      // Server doesn't send new_message to sender via socket — add locally
      S.messages.push(msg);
      renderMessages();
      scrollToBottom();
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
  if (mine) {
    items.push({ icon: 'fa-pen', label: 'Редактировать', action: 'edit' });
  }
  items.push({ icon: 'fa-thumbtack', label: 'Закрепить', action: 'pin' });
  items.push({ icon: 'fa-share', label: 'Переслать', action: 'forward' });
  if (mine) {
    items.push({ icon: 'fa-trash', label: 'Удалить', action: 'delete', danger: true });
  }

  const menu = $('ctx-menu');
  $('ctx-items').innerHTML = items.map(it =>
    `<div class="ctx-item${it.danger ? ' danger' : ''}" data-action="${it.action}"><i class="fas ${it.icon}"></i>${it.label}</div>`
  ).join('');

  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - items.length * 40) + 'px';
  show(menu);

  menu.querySelectorAll('.ctx-item').forEach(el => el.onclick = () => { handleCtxAction(el.dataset.action); hide(menu); });
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
    navigator.clipboard?.writeText(msg.text || '').then(() => showToast('Скопировано', 'success'));
  } else if (action === 'edit') {
    if (msg.senderId !== S.user.id || msg.type !== 'text') return;
    S.editMsg = msg.id;
    $('msg-input').value = msg.text;
    show($('edit-bar'));
    $('msg-input').focus();
  } else if (action === 'delete') {
    if (msg.senderId !== S.user.id) return;
    api(`/api/messages/${msg.id}`, { method: 'DELETE' }).then(() => {
      S.messages = S.messages.filter(m => m.id !== msg.id);
      renderMessages();
      showToast('Сообщение удалено', 'success');
    }).catch(e => showToast(e.message, 'error'));
  } else if (action === 'react') {
    showQuickReact(msg.id);
  } else if (action === 'pin') {
    if (S.chatId) api(`/api/chats/${S.chatId}`, { method: 'PUT', body: JSON.stringify({ pinnedMessage: msg.id }) })
      .then(() => showToast('Закреплено', 'success')).catch(e => showToast(e.message, 'error'));
  } else if (action === 'forward') {
    showToast('Выберите чат для пересылки', 'info');
  }
}

function showQuickReact(msgId) {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  const menu = $('ctx-menu');
  $('ctx-items').innerHTML = emojis.map(e => `<div class="ctx-item" data-emoji="${e}" style="font-size:20px">${e}</div>`).join('');
  show(menu);
  menu.querySelectorAll('.ctx-item').forEach(el => el.onclick = () => { reactToMessage(msgId, el.dataset.emoji); hide(menu); });
}

async function reactToMessage(msgId, emoji) {
  try { await api(`/api/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }); } catch {}
}

function cancelReply() { S.replyTo = null; hide($('reply-bar')); }
function cancelEdit() { S.editMsg = null; $('msg-input').value = ''; hide($('edit-bar')); toggleSendBtn(); }

/* ══════════════════════════════════════════════════════════════════════
   CHAT MENU (delete chat etc.)
   ══════════════════════════════════════════════════════════════════════ */
function showChatMenu(e) {
  if (!S.chatObj) return;
  const items = [];
  items.push({ icon: 'fa-thumbtack', label: S.chatObj.pinned ? 'Открепить' : 'Закрепить', action: 'toggle-pin' });
  items.push({ icon: 'fa-bell-slash', label: S.chatObj.muted ? 'Включить звук' : 'Без звука', action: 'toggle-mute' });
  items.push({ icon: 'fa-trash', label: S.chatObj.type === 'group' ? 'Покинуть группу' : 'Удалить чат', action: 'delete-chat', danger: true });

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
    try { await api(`/api/chats/${S.chatId}`, { method: 'PUT', body: JSON.stringify({ pinned: !S.chatObj.pinned }) }); } catch {}
  } else if (action === 'toggle-mute') {
    try { await api(`/api/chats/${S.chatId}`, { method: 'PUT', body: JSON.stringify({ muted: !S.chatObj.muted }) }); } catch {}
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
    if (!S.chats.find(c => c.id === chat.id)) { await loadChats(); }
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
  try {
    const chat = await api('/api/chats/group', { method: 'POST', body: JSON.stringify({ name, memberIds: _groupMembers }) });
    hide($('modal-group'));
    _groupMembers = [];
    $('group-chips').innerHTML = '';
    $('group-name').value = '';
    $('group-search').value = '';
    $('group-results').innerHTML = '';
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
      <div class="m-avatar" style="background:${m.avatarColor || AVATARS[0]}">${m.avatar ? `<img src="${escHTML(m.avatar)}">` : (m.displayName || '?')[0].toUpperCase()}<div class="m-dot ${m.online ? 'on' : 'off'}"></div></div>
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
  av.innerHTML = u.avatar ? `<img src="${escHTML(u.avatar)}">` : (u.displayName || '?')[0].toUpperCase();

  const actions = $('pv-actions');
  if (u.id !== S.user.id) {
    actions.innerHTML = `<button class="btn-primary" onclick="startChatWith('${u.id}')"><i class="fas fa-comment"></i> Написать</button><button class="btn-sm" onclick="addFriend('${u.id}')"><i class="fas fa-user-plus"></i> Добавить</button>`;
  } else {
    actions.innerHTML = '';
  }
  show($('profile-viewer'));
}

/* ══════════════════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════════════════ */
function openSettings() {
  fillSettings();
  loadSessions();
  show($('modal-settings'));
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

  // Mobile settings badges
  const ghostBadge = $('ghost-mob-badge');
  if (ghostBadge) { ghostBadge.textContent = S.ghostMode ? 'Вкл' : 'Выкл'; ghostBadge.className = 'mob-badge ' + (S.ghostMode ? 'on' : 'off'); }
  const notifBadge = $('notif-mob-badge');
  if (notifBadge) { notifBadge.textContent = s.notifications !== false ? 'Вкл' : 'Выкл'; notifBadge.className = 'mob-badge ' + (s.notifications !== false ? 'on' : 'off'); }

  // Mobile profile
  $('mob-name') && ($('mob-name').textContent = S.user?.displayName || '');
  if ($('mob-avatar')) {
    $('mob-avatar').style.background = S.user?.avatarColor || AVATARS[0];
    $('mob-avatar').innerHTML = S.user?.avatar ? `<img src="${escHTML(S.user.avatar)}">` : (S.user?.displayName || '?')[0].toUpperCase();
  }
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
  if (theme && theme !== 'default') document.body.classList.add(`theme-${theme}`);
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === (theme || 'default')));
}

function buildThemeGrid(containerId) {
  const grid = $(containerId);
  if (!grid) return;
  grid.innerHTML = Object.entries(THEMES).map(([name, color]) =>
    `<div class="theme-swatch${name === (S.user?.settings?.theme || 'default') ? ' active' : ''}" data-theme="${name}" style="background:${color}"><span class="ts-name">${name}</span></div>`
  ).join('');
  grid.querySelectorAll('.theme-swatch').forEach(s => s.onclick = async () => {
    applyTheme(s.dataset.theme);
    try {
      S.user = await api('/api/me', { method: 'PUT', body: JSON.stringify({ settings: { theme: s.dataset.theme } }) });
    } catch {}
  });
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

  function renderCat(i) {
    const emojis = EMOJI_CATS[catKeys[i]];
    grid.innerHTML = emojis.map(e => `<span>${e}</span>`).join('');
    grid.querySelectorAll('span').forEach(s => s.onclick = () => {
      const inp = $('msg-input');
      inp.value += s.textContent;
      inp.focus();
      toggleSendBtn();
    });
    cats.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.ci === String(i)));
  }

  cats.querySelectorAll('button').forEach(b => b.onclick = () => renderCat(parseInt(b.dataset.ci)));
  renderCat(0);

  const rect = $('btn-emoji').getBoundingClientRect();
  picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  picker.style.right = (window.innerWidth - rect.right) + 'px';
  picker.style.left = 'auto';
  picker.style.top = 'auto';
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

function startCallAction(type) {
  if (!S.chatObj || S.chatObj.type !== 'private') { showToast('Звонки только в личных чатах', 'warning'); return; }
  const peerId = getPartner()?.id;
  if (!peerId) return;
  Sounds.ringStart();
  const overlay = $('active-call-overlay');
  show(overlay);
  // Set name/avatar
  $('call-audio-name').textContent = S.chatObj.displayName || 'Звонок';
  const av = $('call-audio-avatar');
  av.style.background = S.chatObj.displayAvatarColor || AVATARS[0];
  av.innerHTML = (S.chatObj.displayAvatar) ? `<img src="${escHTML(S.chatObj.displayAvatar)}">` : (S.chatObj.displayName || '?')[0].toUpperCase();
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
  av.innerHTML = data.fromAvatar ? `<img src="${escHTML(data.fromAvatar)}">` : (data.fromName || '?')[0].toUpperCase();
  show(overlay);
}

function acceptIncoming() {
  if (!_incomingCallData) return;
  Sounds.incomingStop();
  hide($('incoming-call-overlay'));
  show($('active-call-overlay'));
  $('call-audio-name').textContent = _incomingCallData.fromName || 'Звонок';
  const av = $('call-audio-avatar');
  av.style.background = _incomingCallData.fromAvatarColor || AVATARS[0];
  av.innerHTML = _incomingCallData.fromAvatar ? `<img src="${escHTML(_incomingCallData.fromAvatar)}">` : (_incomingCallData.fromName || '?')[0].toUpperCase();
  window.callsModule.acceptCall(_incomingCallData);
  _incomingCallData = null;
}

function rejectIncoming() {
  if (!_incomingCallData) return;
  Sounds.incomingStop();
  S.socket.emit('call_reject', { to: _incomingCallData.from });
  hide($('incoming-call-overlay'));
  _incomingCallData = null;
}

function handleCallEnded() {
  Sounds.ringStop();
  Sounds.incomingStop();
  Sounds.callEnd();
  window.callsModule.endCall();
  hide($('active-call-overlay'));
  hide($('incoming-call-overlay'));
  _incomingCallData = null;
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
    S.messages.push(msg);
    renderMessages();
    scrollToBottom();
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
   INIT
   ══════════════════════════════════════════════════════════════════════ */
initAuth();
if (S.token) boot();
