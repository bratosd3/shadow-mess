/* ═══════════════════════════════════════════════════════════
   Shadow Messenger v2 — app.js
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ── State ───────────────────────────────────────────── */
const S = {
  token: null, user: null, chats: [], activeChat: null, messages: [],
  socket: null, replyTo: null, editingMsgId: null,
  emojiOpen: false, settingsOpen: false,
  currentScreen: 'chats', previousScreen: 'chats',
};
window.State = S;

/* ── DOM helpers ─────────────────────────────────────── */
const $ = id => document.getElementById(id);
const on = (el, ev, fn, opts) => { if (typeof el === 'string') el = $(el); if (el) el.addEventListener(ev, fn, opts); };
const qsa = (sel, root) => (root || document).querySelectorAll(sel);
const qs = (sel, root) => (root || document).querySelector(sel);
const isMobile = () => window.innerWidth <= 1024;

/* ── Toast ───────────────────────────────────────────── */
function showToast(msg, type = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => el.remove(), 300); }, ms);
}
window.showToast = showToast;

/* ── Formatters ──────────────────────────────────────── */
function fmtTime(iso) { return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(iso) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtFullDate(iso) { return `${fmtDate(iso)} ${fmtTime(iso)}`; }
function fmtSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' КБ';
  return (b / 1048576).toFixed(1) + ' МБ';
}
function avatarText(name) { return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function linkify(text) {
  let t = escHtml(text);
  t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  return t;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ── API helper ──────────────────────────────────────── */
const API = {
  async req(method, path, body, isFormData) {
    const h = {};
    if (S.token) h['Authorization'] = `Bearer ${S.token}`;
    const opts = { method, headers: h };
    if (isFormData) { opts.body = body; }
    else if (body) { h['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    if (r.status === 401) { logout(); throw new Error('Сессия истекла'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  },
  get:  p       => API.req('GET', p),
  post: (p, b)  => API.req('POST', p, b),
  put:  (p, b)  => API.req('PUT', p, b),
  del:  p       => API.req('DELETE', p),
  upload(p, fd) {
    return new Promise((ok, fail) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', p);
      if (S.token) xhr.setRequestHeader('Authorization', `Bearer ${S.token}`);
      xhr.onload = () => {
        if (xhr.status === 401) { logout(); return fail(new Error('Сессия истекла')); }
        try { const d = JSON.parse(xhr.responseText); xhr.status < 300 ? ok(d) : fail(new Error(d.error || `HTTP ${xhr.status}`)); }
        catch { fail(new Error(`HTTP ${xhr.status}`)); }
      };
      xhr.onerror = () => fail(new Error('Ошибка сети'));
      xhr.send(fd);
    });
  },
};

/* ── Link preview cache ──────────────────────────────── */
const _lpCache = new Map();
async function fetchLinkPreview(url, container) {
  try {
    let data = _lpCache.get(url);
    if (!data) {
      const r = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${S.token}` } });
      data = await r.json();
      _lpCache.set(url, data);
    }
    if (!data.title && !data.description) return;
    const el = document.createElement('div');
    el.className = 'link-preview';
    el.innerHTML =
      `${data.siteName ? `<div class="link-preview-site">${escHtml(data.siteName)}</div>` : ''}` +
      `<div class="link-preview-title">${escHtml(data.title || '')}</div>` +
      `${data.description ? `<div class="link-preview-desc">${escHtml(data.description.slice(0, 200))}</div>` : ''}` +
      `${data.image ? `<img src="${escHtml(data.image)}" alt="" loading="lazy">` : ''}`;
    el.addEventListener('click', () => window.open(url, '_blank'));
    container.appendChild(el);
  } catch {}
}

/* ══════════════════════════════════════════════════════════
   SCREEN NAVIGATION
   ══════════════════════════════════════════════════════════ */
function switchScreen(name) {
  // Don't reload if already on this screen (except chat which may change)
  if (name !== 'chat') S.previousScreen = S.currentScreen;
  S.currentScreen = name;

  // Hide all screens, show target
  qsa('.screen').forEach(s => s.classList.remove('active'));
  const screen = $('screen-' + name);
  if (screen) screen.classList.add('active');

  // Update bottom nav
  qsa('.bnav-item').forEach(b => b.classList.remove('active'));
  const navMap = { hubs: 'bnav-hubs', chats: 'bnav-chats', friends: 'bnav-friends', profile: 'bnav-profile' };
  if (navMap[name]) $(navMap[name])?.classList.add('active');

  // Show/hide bottom nav (hide when in chat)
  $('bottom-nav').classList.toggle('hidden', name === 'chat');

  // Load data for target screen
  if (name === 'chats') { loadChats(); }
  else if (name === 'friends') { loadFriends(_currentFriendsTab); }
  else if (name === 'profile') { updateProfileScreen(); }
  else if (name === 'hubs') { renderHubs(); }
}

function goBack() {
  S.activeChat = null;
  switchScreen(S.previousScreen || 'chats');
}

/* ══════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════ */
function initAuth() {
  on('show-register', 'click', e => { e.preventDefault(); $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); });
  on('show-login',    'click', e => { e.preventDefault(); $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); });

  on('btn-login', 'click', async () => {
    const errEl = $('login-error');
    errEl.textContent = '';
    const username = $('li-username').value.trim();
    const password = $('li-password').value;
    if (!username || !password) { errEl.textContent = 'Введите логин и пароль'; return; }
    try {
      const d = await API.post('/api/login', { username, password });
      await onLogin(d);
    } catch (err) {
      errEl.textContent = err.message || 'Ошибка входа';
      errEl.style.color = 'var(--text-danger)';
    }
  });
  ['li-username', 'li-password'].forEach(id => on(id, 'keydown', e => { if (e.key === 'Enter') $('btn-login').click(); }));

  on('btn-register', 'click', async () => {
    const errEl = $('reg-error');
    errEl.textContent = '';
    if ($('rg-password').value !== $('rg-password2').value) { errEl.textContent = 'Пароли не совпадают'; return; }
    const username = $('rg-username').value.trim();
    const displayName = $('rg-displayname').value.trim();
    const password = $('rg-password').value;
    if (!username || !displayName || !password) { errEl.textContent = 'Заполните все поля'; return; }
    try {
      const d = await API.post('/api/register', { username, displayName, password });
      await onLogin(d);
    } catch (err) { errEl.textContent = err.message || 'Ошибка регистрации'; }
  });
  ['rg-displayname', 'rg-username', 'rg-password', 'rg-password2'].forEach(id => on(id, 'keydown', e => { if (e.key === 'Enter') $('btn-register').click(); }));
}

async function onLogin({ token, user }) {
  S.token = token;
  S.user = user;
  localStorage.setItem('sm_token', token);
  localStorage.setItem('sm_user', JSON.stringify(user));
  showApp();
}

function showApp() {
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  initSocket();
  loadChats();
  loadFriends('online');
  updateProfileScreen();
  switchScreen('chats');
  subscribePush();
}

function logout() {
  S.token = null; S.user = null; S.chats = []; S.activeChat = null; S.messages = [];
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  localStorage.removeItem('sm_token');
  localStorage.removeItem('sm_user');
  $('app').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
  $('login-form').classList.remove('hidden');
  $('register-form').classList.add('hidden');
  closeSettings();
}

function updateProfileScreen() {
  if (!S.user) return;
  const av = $('my-profile-avatar');
  if (S.user.avatar) { av.style.backgroundImage = `url(${S.user.avatar})`; av.textContent = ''; }
  else { av.style.backgroundImage = ''; av.style.backgroundColor = S.user.avatarColor || '#5865f2'; av.textContent = avatarText(S.user.displayName); }
  $('my-profile-name').textContent = S.user.displayName;
  $('my-profile-username').textContent = '@' + S.user.username;
  $('my-profile-bio').textContent = S.user.bio || '';
}

async function tryAutoLogin() {
  const token = localStorage.getItem('sm_token');
  const userJson = localStorage.getItem('sm_user');
  if (!token || !userJson) return;
  S.token = token;
  try { S.user = JSON.parse(userJson); } catch { return; }
  if (!S.user) return;
  try {
    const freshUser = await API.get('/api/me');
    S.user = freshUser;
    localStorage.setItem('sm_user', JSON.stringify(freshUser));
    showApp();
  } catch {
    S.token = null; S.user = null;
    localStorage.removeItem('sm_token');
    localStorage.removeItem('sm_user');
  }
}

/* ══════════════════════════════════════════════════════════
   SOCKET
   ══════════════════════════════════════════════════════════ */
function initSocket() {
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  const sk = io({ auth: { token: S.token }, reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });
  S.socket = sk;

  sk.on('connect', () => { if (S.chats.length) loadChats().catch(() => {}); });
  sk.on('connect_error', err => {
    if (err.message === 'Unauthorized' || err.message === 'Invalid token') logout();
  });
  sk.on('new_message',      handleNewMessage);
  sk.on('message_edited',   m => { const i = S.messages.findIndex(x => x.id === m.id); if (i !== -1) { S.messages[i] = m; renderMessages(); } });
  sk.on('message_deleted',  ({ messageId, chatId }) => { if (S.activeChat?.id === chatId) { S.messages = S.messages.filter(x => x.id !== messageId); renderMessages(); } });
  sk.on('message_reaction', ({ messageId, reactions }) => { const m = S.messages.find(x => x.id === messageId); if (m) { m.reactions = reactions; renderMessages(); } });
  sk.on('messages_read',    ({ chatId, userId }) => {
    if (S.activeChat?.id === chatId && userId !== S.user.id)
      S.messages.filter(m => m.senderId === S.user.id).forEach(m => { if (!m.readBy?.includes(userId)) m.readBy = [...(m.readBy || []), userId]; });
  });
  sk.on('user_typing',         ({ userId, chatId }) => { if (S.activeChat?.id === chatId && userId !== S.user.id) showTyping(userId); });
  sk.on('user_stopped_typing', ({ userId }) => hideTyping(userId));
  sk.on('user_online',  ({ userId }) => updateOnline(userId, true));
  sk.on('user_offline', ({ userId }) => updateOnline(userId, false));
  sk.on('chat_created', async chat => { sk.emit('join_chat', { chatId: chat.id }); await loadChats(); });
  sk.on('chat_updated', chat => { const i = S.chats.findIndex(c => c.id === chat.id); if (i !== -1) { Object.assign(S.chats[i], chat); renderChatList(); renderHubs(); } });
  sk.on('chat_deleted', ({ chatId }) => { S.chats = S.chats.filter(c => c.id !== chatId); if (S.activeChat?.id === chatId) { S.activeChat = null; goBack(); } renderChatList(); renderHubs(); });

  // Calls
  sk.on('call_incoming',   d => showIncomingCall(d));
  sk.on('call_answered',   d => window.callsModule?.onAnswer?.(d));
  sk.on('call_ice',        d => window.callsModule?.onIce?.(d));
  sk.on('call_renegotiate',d => window.callsModule?.onRenegotiate?.(d));
  sk.on('call_accepting',  () => {});
  sk.on('call_busy',       () => showToast('Абонент занят', 'info'));
  sk.on('call_rejected',   () => showToast('Звонок отклонён', 'info'));
  sk.on('call_ended',      () => { showToast('Звонок завершён', 'info'); window.callsModule?.onEnded?.(); hideIncomingCall(); });
  sk.on('session_revoked', () => { showToast('Сессия завершена', 'info'); setTimeout(logout, 1500); });
  sk.on('call_status',     d => window.callsModule?.onPeerStatus?.(d));
  sk.on('friend_request',  () => { showToast('Новый запрос в друзья!', 'info'); if (_currentFriendsTab === 'pending') loadFriends('pending'); });
  sk.on('friend_accepted', () => { showToast('Ваш запрос принят!', 'success'); loadFriends(_currentFriendsTab); });
}

/* ══════════════════════════════════════════════════════════
   CHAT LIST (Private chats — "Сообщения")
   ══════════════════════════════════════════════════════════ */
async function loadChats() {
  try { S.chats = await API.get('/api/chats'); }
  catch { return; }
  renderChatList();
  updateTabTitle();
}

function renderChatList(filter = '') {
  const list = $('dialog-list');
  if (!list) return;
  list.innerHTML = '';

  let chats = S.chats.filter(c => c.type === 'private');
  if (filter) chats = chats.filter(c => (c.displayName || c.name || '').toLowerCase().includes(filter.toLowerCase()));

  if (chats.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Нет сообщений</p></div>';
    return;
  }
  const frag = document.createDocumentFragment();
  chats.forEach(c => frag.appendChild(buildChatItem(c)));
  list.appendChild(frag);
}

function buildChatItem(chat) {
  const el = document.createElement('div');
  el.className = `chat-item${S.activeChat?.id === chat.id ? ' active' : ''}`;
  el.dataset.chatid = chat.id;

  const av = document.createElement('div');
  av.className = 'chat-item-avatar';
  if (chat.displayAvatar) av.style.backgroundImage = `url(${chat.displayAvatar})`;
  else { av.style.backgroundColor = chat.displayAvatarColor || '#5865f2'; av.textContent = avatarText(chat.displayName || chat.name); }

  const dot = document.createElement('div');
  dot.className = `chat-item-status ${chat.online ? 'online' : 'offline'}`;
  av.appendChild(dot);
  el.appendChild(av);

  const info = document.createElement('div');
  info.className = 'chat-item-info';
  const name = document.createElement('div');
  name.className = 'chat-item-name';
  name.textContent = chat.displayName || chat.name || 'Чат';
  info.appendChild(name);

  if (chat.lastMessage) {
    const preview = document.createElement('div');
    preview.className = 'chat-item-preview';
    const sender = chat.lastMessage.senderId === S.user?.id ? 'Вы' : (chat.lastMessage.senderName || '').split(' ')[0];
    let text = chat.lastMessage.text || '';
    if (chat.lastMessage.type === 'image') text = '📷 Фото';
    else if (chat.lastMessage.type === 'video') text = '🎬 Видео';
    else if (chat.lastMessage.type === 'file') text = '📎 Файл';
    else if (chat.lastMessage.type === 'voice') text = '🎤 Голосовое';
    preview.textContent = (chat.type !== 'private' ? sender + ': ' : '') + text;
    info.appendChild(preview);
  }
  el.appendChild(info);

  const meta = document.createElement('div');
  meta.className = 'chat-item-meta';
  if (chat.lastMessage) {
    const time = document.createElement('div');
    time.className = 'chat-item-time';
    time.textContent = fmtTime(chat.lastMessage.timestamp);
    meta.appendChild(time);
  }
  if (chat.unreadCount > 0) {
    const badge = document.createElement('div');
    badge.className = 'chat-item-badge';
    badge.textContent = chat.unreadCount > 99 ? '99+' : chat.unreadCount;
    meta.appendChild(badge);
  }
  el.appendChild(meta);

  el.addEventListener('click', () => openChat(chat.id));
  return el;
}

function updateTabTitle() {
  const total = S.chats.reduce((s, c) => s + (c.unreadCount || 0), 0);
  document.title = total > 0 ? `(${total}) Shadow Messenger` : 'Shadow Messenger';
}

/* ══════════════════════════════════════════════════════════
   HUBS (Group chats)
   ══════════════════════════════════════════════════════════ */
function renderHubs() {
  const scroll = $('hubs-scroll');
  const grid = $('subchat-grid');
  if (!scroll || !grid) return;
  scroll.innerHTML = '';
  grid.innerHTML = '';

  const hubs = S.chats.filter(c => c.type === 'group');

  if (hubs.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>У вас пока нет хабов</p></div>';
    return;
  }

  // Horizontal hub icons
  hubs.forEach(h => {
    const icon = document.createElement('div');
    icon.className = 'hub-icon';
    const av = document.createElement('div');
    av.className = 'hub-icon-avatar';
    if (h.displayAvatar) av.style.backgroundImage = `url(${h.displayAvatar})`;
    else { av.style.backgroundColor = h.displayAvatarColor || '#5865f2'; av.textContent = avatarText(h.name).charAt(0); }
    icon.appendChild(av);
    const nm = document.createElement('span');
    nm.className = 'hub-icon-name';
    nm.textContent = (h.name || 'Хаб').slice(0, 8);
    icon.appendChild(nm);
    icon.addEventListener('click', () => openChat(h.id));
    scroll.appendChild(icon);
  });

  // Hub cards grid
  hubs.forEach(h => {
    const card = document.createElement('div');
    card.className = 'subchat-card';
    const nm = document.createElement('div');
    nm.className = 'subchat-card-name';
    nm.textContent = h.name || 'Хаб';
    card.appendChild(nm);
    const inf = document.createElement('div');
    inf.className = 'subchat-card-info';
    inf.textContent = h.membersInfo ? h.membersInfo.length + ' участников' : '';
    card.appendChild(inf);
    if (h.unreadCount > 0) {
      const badge = document.createElement('div');
      badge.className = 'subchat-card-unread';
      badge.textContent = h.unreadCount;
      card.appendChild(badge);
    }
    card.addEventListener('click', () => openChat(h.id));
    grid.appendChild(card);
  });
}

/* ══════════════════════════════════════════════════════════
   OPEN CHAT
   ══════════════════════════════════════════════════════════ */
async function openChat(chatId) {
  const chat = S.chats.find(c => c.id === chatId);
  if (!chat) return;
  S.activeChat = chat;

  // Switch to chat screen
  switchScreen('chat');

  // Set header
  $('chat-name').textContent = chat.displayName || chat.name || 'Чат';
  updateChatStatus(chat);

  const chAv = $('ch-avatar');
  if (chAv) {
    if (chat.displayAvatar) { chAv.style.backgroundImage = `url(${chat.displayAvatar})`; chAv.textContent = ''; }
    else { chAv.style.backgroundImage = ''; chAv.style.backgroundColor = chat.displayAvatarColor || '#5865f2'; chAv.textContent = avatarText(chat.displayName || chat.name); }
  }

  // Call buttons (private only)
  $('btn-call').classList.toggle('hidden', chat.type !== 'private');
  $('btn-video-call').classList.toggle('hidden', chat.type !== 'private');

  // Load messages
  try { S.messages = await API.get(`/api/chats/${chatId}/messages`); }
  catch { showToast('Ошибка загрузки', 'error'); return; }

  renderMessages();
  scrollBottom();
  S.socket?.emit('mark_read', { chatId });

  // Clear unread
  const ci = S.chats.findIndex(c => c.id === chatId);
  if (ci !== -1) { S.chats[ci].unreadCount = 0; renderChatList(); renderHubs(); updateTabTitle(); }

  $('msg-input').placeholder = `Написать @${chat.displayName || chat.name || 'чат'}`;
}

function updateChatStatus(chat) {
  const el = $('chat-status');
  if (!el) return;
  if (chat.type === 'private') {
    el.textContent = chat.online ? 'в сети' : '';
  } else if (chat.type === 'group' && chat.membersInfo) {
    const cnt = chat.membersInfo.length;
    const onl = chat.membersInfo.filter(m => m.online).length;
    el.textContent = `${cnt} уч.${onl > 0 ? ' · ' + onl + ' в сети' : ''}`;
  } else el.textContent = '';
}

/* ══════════════════════════════════════════════════════════
   PROFILE VIEWER
   ══════════════════════════════════════════════════════════ */
function openProfileViewer(user) {
  const pv = $('profile-viewer');
  if (!pv) return;
  const av = $('pv-avatar');
  if (user.avatar || user.displayAvatar) {
    av.style.backgroundImage = `url(${user.avatar || user.displayAvatar})`;
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.style.backgroundColor = user.avatarColor || user.displayAvatarColor || '#5865f2';
    av.textContent = avatarText(user.displayName || user.name);
  }
  $('pv-name').textContent = user.displayName || user.name || '';
  $('pv-username').textContent = '@' + (user.username || user.otherUsername || '');
  $('pv-status').textContent = user.online ? 'В сети' : 'Не в сети';
  $('pv-status').style.color = user.online ? 'var(--status-online)' : 'var(--text-muted)';
  $('pv-bio').textContent = user.bio || '';
  pv.classList.remove('hidden');
}

function closeProfileViewer() {
  $('profile-viewer')?.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   FRIENDS LIST
   ══════════════════════════════════════════════════════════ */
let _friendsList = [];
let _currentFriendsTab = 'online';

async function loadFriends(tab = 'online') {
  _currentFriendsTab = tab;

  if (tab === 'add') {
    renderFriends(tab);
    return;
  }
  if (tab === 'pending') {
    try {
      const pending = await API.get('/api/friends/pending');
      renderPendingFriends(pending);
    } catch { renderPendingFriends([]); }
    return;
  }
  try {
    _friendsList = await API.get('/api/friends');
  } catch { _friendsList = []; }
  renderFriends(tab);
}

function renderFriends(tab) {
  const list = $('friends-list');
  const empty = $('friends-empty');
  if (!list) return;
  list.innerHTML = '';

  const searchQuery = $('friends-search-input')?.value?.trim()?.toLowerCase() || '';

  if (tab === 'add') {
    if (empty) empty.classList.add('hidden');
    if (searchQuery) {
      searchAndRenderUsers(searchQuery);
    } else {
      list.innerHTML = '<div class="empty-state"><p>Введите имя для поиска</p></div>';
    }
    return;
  }

  let users = _friendsList.filter(u => u.id !== S.user?.id);
  if (tab === 'online') users = users.filter(u => u.online);
  if (searchQuery && tab !== 'add') users = users.filter(u => u.displayName.toLowerCase().includes(searchQuery));

  if (users.length === 0) {
    if (empty) {
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent = tab === 'online' ? 'Нет друзей в сети' : 'Список друзей пуст';
    }
    return;
  }
  if (empty) empty.classList.add('hidden');

  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'friend-item';
    const av = document.createElement('div');
    av.className = 'friend-item-avatar';
    if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
    else { av.style.backgroundColor = u.avatarColor || '#444'; av.textContent = avatarText(u.displayName); }
    const dot = document.createElement('div');
    dot.className = `friend-item-dot ${u.online ? 'online' : 'offline'}`;
    av.appendChild(dot);
    item.appendChild(av);

    const info = document.createElement('div');
    info.className = 'friend-item-info';
    info.innerHTML = `<div class="friend-item-name">${escHtml(u.displayName)}</div><div class="friend-item-status">${u.online ? 'В сети' : 'Не в сети'}</div>`;
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'friend-item-actions';
    const msgBtn = document.createElement('button');
    msgBtn.title = 'Написать';
    msgBtn.innerHTML = '<i class="fas fa-comment"></i>';
    msgBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { const chat = await API.post('/api/chats', { userId: u.id }); await loadChats(); openChat(chat.id); }
      catch (err) { showToast(err.message, 'error'); }
    });
    actions.appendChild(msgBtn);

    const callBtn = document.createElement('button');
    callBtn.title = 'Позвонить';
    callBtn.innerHTML = '<i class="fas fa-phone"></i>';
    callBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const chat = await API.post('/api/chats', { userId: u.id });
        await loadChats();
        openChat(chat.id);
        // Start call
        const peerId = chat.members?.find(id => id !== S.user?.id) || u.id;
        if (window.callsModule?.startCall) {
          window.callsModule.startCall(peerId, 'audio');
          showActiveCall(u.displayName, u.avatar, u.avatarColor);
        }
      } catch (err) { showToast(err.message, 'error'); }
    });
    actions.appendChild(callBtn);

    if (u.friendshipId) {
      const delBtn = document.createElement('button');
      delBtn.title = 'Удалить';
      delBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await API.del(`/api/friends/${u.friendshipId}`); showToast('Удалён из друзей', 'info'); loadFriends(_currentFriendsTab); }
        catch (err) { showToast(err.message, 'error'); }
      });
      actions.appendChild(delBtn);
    }
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function renderPendingFriends(pending) {
  const list = $('friends-list');
  const empty = $('friends-empty');
  if (!list) return;
  list.innerHTML = '';

  if (pending.length === 0) {
    if (empty) { empty.classList.remove('hidden'); empty.querySelector('p').textContent = 'Нет входящих запросов'; }
    return;
  }
  if (empty) empty.classList.add('hidden');

  pending.forEach(req => {
    const u = req.user;
    const item = document.createElement('div');
    item.className = 'friend-item';
    const av = document.createElement('div');
    av.className = 'friend-item-avatar';
    if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
    else { av.style.backgroundColor = u.avatarColor || '#444'; av.textContent = avatarText(u.displayName); }
    item.appendChild(av);

    const info = document.createElement('div');
    info.className = 'friend-item-info';
    info.innerHTML = `<div class="friend-item-name">${escHtml(u.displayName)}</div><div class="friend-item-status">Запрос в друзья</div>`;
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'friend-item-actions';
    const acceptBtn = document.createElement('button');
    acceptBtn.title = 'Принять';
    acceptBtn.className = 'friend-accept-btn';
    acceptBtn.innerHTML = '<i class="fas fa-check"></i>';
    acceptBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await API.post(`/api/friends/accept/${req.id}`); showToast('Запрос принят!', 'success'); loadFriends('pending'); }
      catch (err) { showToast(err.message, 'error'); }
    });
    actions.appendChild(acceptBtn);

    const rejectBtn = document.createElement('button');
    rejectBtn.title = 'Отклонить';
    rejectBtn.innerHTML = '<i class="fas fa-xmark"></i>';
    rejectBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await API.post(`/api/friends/reject/${req.id}`); showToast('Запрос отклонён', 'info'); loadFriends('pending'); }
      catch (err) { showToast(err.message, 'error'); }
    });
    actions.appendChild(rejectBtn);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

async function searchAndRenderUsers(q) {
  const list = $('friends-list');
  if (!list) return;
  list.innerHTML = '';
  if (!q) { list.innerHTML = '<div class="empty-state"><p>Введите имя для поиска</p></div>'; return; }
  try {
    const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (!users.length) { list.innerHTML = '<div class="empty-state"><p>Никого не найдено</p></div>'; return; }
    for (const u of users) {
      const item = document.createElement('div');
      item.className = 'friend-item';
      const av = document.createElement('div');
      av.className = 'friend-item-avatar';
      if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
      else { av.style.backgroundColor = u.avatarColor || '#444'; av.textContent = avatarText(u.displayName); }
      item.appendChild(av);

      const info = document.createElement('div');
      info.className = 'friend-item-info';
      info.innerHTML = `<div class="friend-item-name">${escHtml(u.displayName)}</div><div class="friend-item-status">@${escHtml(u.username)}</div>`;
      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'friend-item-actions';
      const isFriend = _friendsList.some(f => f.id === u.id);
      if (isFriend) {
        const badge = document.createElement('span');
        badge.style.cssText = 'color:var(--text-muted);font-size:12px';
        badge.textContent = 'В друзьях';
        actions.appendChild(badge);
      } else {
        const addBtn = document.createElement('button');
        addBtn.title = 'Добавить';
        addBtn.className = 'friend-accept-btn';
        addBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
        addBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await API.post('/api/friends/request', { userId: u.id });
            showToast('Запрос отправлен!', 'success');
            addBtn.disabled = true;
            addBtn.innerHTML = '<i class="fas fa-clock"></i>';
          } catch (err) { showToast(err.message, 'error'); }
        });
        actions.appendChild(addBtn);
      }
      item.appendChild(actions);
      list.appendChild(item);
    }
  } catch { list.innerHTML = '<div class="empty-state"><p>Ошибка поиска</p></div>'; }
}

/* ══════════════════════════════════════════════════════════
   THEMES
   ══════════════════════════════════════════════════════════ */
const THEMES = {
  phantom:  { darkest:'#0A0A0A', dark:'#1E1E1E', primary:'#161616', secondary:'#1A1A1A', tertiary:'#0A0A0A', input:'#2D2D2D', brand:'#5865f2', accent:'linear-gradient(135deg,#5865f2,#7983f5)', accentColor:'#5865f2' },
  midnight: { darkest:'#000005', dark:'#080812', primary:'#0d0d1a', secondary:'#0a0a15', tertiary:'#000005', input:'#141428', brand:'#6366f1', accent:'linear-gradient(135deg,#6366f1,#818cf8)', accentColor:'#6366f1' },
  obsidian: { darkest:'#0e0e1a', dark:'#14142a', primary:'#1a1a2e', secondary:'#16162a', tertiary:'#0e0e1a', input:'#22223a', brand:'#7c83ff', accent:'linear-gradient(135deg,#7c83ff,#a5b4fc)', accentColor:'#7c83ff' },
  crimson:  { darkest:'#0a0000', dark:'#140000', primary:'#1a0000', secondary:'#120000', tertiary:'#0a0000', input:'#2d0000', brand:'#ef4444', accent:'linear-gradient(135deg,#ef4444,#f87171)', accentColor:'#ef4444' },
  emerald:  { darkest:'#000a04', dark:'#001a0a', primary:'#00200d', secondary:'#001a0a', tertiary:'#000a04', input:'#002d12', brand:'#22c55e', accent:'linear-gradient(135deg,#22c55e,#4ade80)', accentColor:'#22c55e' },
  ocean:    { darkest:'#000810', dark:'#001020', primary:'#001428', secondary:'#001020', tertiary:'#000810', input:'#001830', brand:'#3b82f6', accent:'linear-gradient(135deg,#3b82f6,#60a5fa)', accentColor:'#3b82f6' },
  violet:   { darkest:'#08001a', dark:'#10001a', primary:'#140020', secondary:'#10001a', tertiary:'#08001a', input:'#1a0030', brand:'#a855f7', accent:'linear-gradient(135deg,#a855f7,#c084fc)', accentColor:'#a855f7' },
  sunset:   { darkest:'#0a0400', dark:'#1a0800', primary:'#200e00', secondary:'#1a0800', tertiary:'#0a0400', input:'#2d1200', brand:'#f97316', accent:'linear-gradient(135deg,#f97316,#fb923c)', accentColor:'#f97316' },
  arctic:   { darkest:'#050a10', dark:'#0a1520', primary:'#0e1a28', secondary:'#0a1520', tertiary:'#050a10', input:'#122030', brand:'#67e8f9', accent:'linear-gradient(135deg,#67e8f9,#a5f3fc)', accentColor:'#67e8f9' },
  rose:     { darkest:'#0a0008', dark:'#1a0010', primary:'#200015', secondary:'#1a0010', tertiary:'#0a0008', input:'#2d001a', brand:'#f43f5e', accent:'linear-gradient(135deg,#f43f5e,#fb7185)', accentColor:'#f43f5e' },
  cyber:    { darkest:'#050505', dark:'#0a0a0a', primary:'#0f0f0f', secondary:'#0a0a0a', tertiary:'#050505', input:'#001a1a', brand:'#06b6d4', accent:'linear-gradient(135deg,#06b6d4,#22d3ee)', accentColor:'#06b6d4' },
  amber:    { darkest:'#0a0800', dark:'#1a1000', primary:'#201400', secondary:'#1a1000', tertiary:'#0a0800', input:'#2d1a00', brand:'#f59e0b', accent:'linear-gradient(135deg,#f59e0b,#fbbf24)', accentColor:'#f59e0b' },
  slate:    { darkest:'#101010', dark:'#1a1a1a', primary:'#202020', secondary:'#1a1a1a', tertiary:'#101010', input:'#2a2a2a', brand:'#94a3b8', accent:'linear-gradient(135deg,#94a3b8,#cbd5e1)', accentColor:'#94a3b8' },
  nord:     { darkest:'#242933', dark:'#2e3440', primary:'#3b4252', secondary:'#2e3440', tertiary:'#242933', input:'#434c5e', brand:'#88c0d0', accent:'linear-gradient(135deg,#88c0d0,#8fbcbb)', accentColor:'#88c0d0' },
  dracula:  { darkest:'#1e1f29', dark:'#282a36', primary:'#2c2e3a', secondary:'#282a36', tertiary:'#1e1f29', input:'#44475a', brand:'#bd93f9', accent:'linear-gradient(135deg,#bd93f9,#ff79c6)', accentColor:'#bd93f9' },
  monokai:  { darkest:'#1e1f1c', dark:'#272822', primary:'#2d2e27', secondary:'#272822', tertiary:'#1e1f1c', input:'#3e3d32', brand:'#a6e22e', accent:'linear-gradient(135deg,#a6e22e,#e6db74)', accentColor:'#a6e22e' },
  abyss:    { darkest:'#000010', dark:'#000020', primary:'#000030', secondary:'#000020', tertiary:'#000010', input:'#000040', brand:'#4fc1ff', accent:'linear-gradient(135deg,#4fc1ff,#9cdcfe)', accentColor:'#4fc1ff' },
};

function applyTheme(name) {
  const t = THEMES[name];
  if (!t) return;
  const r = document.documentElement.style;
  r.setProperty('--bg-darkest', t.darkest);
  r.setProperty('--bg-dark', t.dark);
  r.setProperty('--bg-primary', t.primary);
  r.setProperty('--bg-secondary', t.secondary);
  r.setProperty('--bg-tertiary', t.tertiary);
  r.setProperty('--bg-input', t.input);
  r.setProperty('--bg-brand', t.brand);
  r.setProperty('--accent-gradient', t.accent);
  r.setProperty('--accent-color', t.accentColor);
  localStorage.setItem('sm_theme', name);
}

/* ══════════════════════════════════════════════════════════
   MESSAGES
   ══════════════════════════════════════════════════════════ */
function renderMessages() {
  const area = $('messages-area');
  if (!area) return;
  area.innerHTML = '';

  if (S.activeChat) {
    const begin = document.createElement('div');
    begin.className = 'chat-begin';
    const ic = document.createElement('div');
    ic.className = 'chat-begin-icon';
    ic.innerHTML = S.activeChat.type === 'private' ? '<i class="fas fa-at"></i>' : '<i class="fas fa-hashtag"></i>';
    begin.appendChild(ic);
    const h3 = document.createElement('h3');
    h3.textContent = S.activeChat.displayName || S.activeChat.name || '';
    begin.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = S.activeChat.type === 'private'
      ? `Начало переписки с @${S.activeChat.displayName || ''}`
      : `Добро пожаловать в ${S.activeChat.name || ''}!`;
    begin.appendChild(p);
    area.appendChild(begin);
  }

  if (S.messages.length === 0) return;

  let lastDate = null, lastSenderId = null, lastTime = 0;
  const frag = document.createDocumentFragment();

  S.messages.forEach(msg => {
    const dt = new Date(msg.timestamp).toDateString();
    if (dt !== lastDate) {
      lastDate = dt;
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span>${fmtDate(msg.timestamp)}</span>`;
      frag.appendChild(sep);
      lastSenderId = null;
    }
    const ts = new Date(msg.timestamp).getTime();
    const grouped = msg.senderId === lastSenderId && (ts - lastTime) < 420_000;
    frag.appendChild(buildMsgEl(msg, grouped));
    lastSenderId = msg.senderId;
    lastTime = ts;
  });
  area.appendChild(frag);
}

function buildMsgEl(msg, grouped) {
  const row = document.createElement('div');
  row.className = `msg-row${grouped ? ' grouped' : ''}`;
  row.dataset.msgid = msg.id;

  if (!grouped) {
    const av = document.createElement('div');
    av.className = 'msg-avatar';
    if (msg.senderAvatar) av.style.backgroundImage = `url(${msg.senderAvatar})`;
    else { av.style.backgroundColor = msg.senderAvatarColor || '#5865f2'; av.textContent = avatarText(msg.senderName); }
    row.appendChild(av);
  } else {
    const ht = document.createElement('span');
    ht.className = 'msg-hover-time';
    ht.textContent = fmtTime(msg.timestamp);
    row.appendChild(ht);
  }

  const content = document.createElement('div');
  content.className = 'msg-content';

  if (!grouped) {
    const hdr = document.createElement('div');
    hdr.className = 'msg-header';
    const author = document.createElement('span');
    author.className = 'msg-author';
    author.textContent = msg.senderName || 'Unknown';
    if (msg.senderSuperUser) author.style.color = '#f0b232';
    hdr.appendChild(author);
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = fmtFullDate(msg.timestamp);
    hdr.appendChild(time);
    content.appendChild(hdr);
  }

  if (msg.replyTo) {
    const orig = S.messages.find(m => m.id === msg.replyTo);
    if (orig) {
      const rp = document.createElement('div');
      rp.className = 'msg-reply';
      const rpAv = document.createElement('div');
      rpAv.className = 'msg-reply-av';
      if (orig.senderAvatar) rpAv.style.backgroundImage = `url(${orig.senderAvatar})`;
      else { rpAv.style.backgroundColor = orig.senderAvatarColor || '#5865f2'; rpAv.textContent = avatarText(orig.senderName).charAt(0); }
      rp.appendChild(rpAv);
      const rpName = document.createElement('span');
      rpName.className = 'msg-reply-name';
      rpName.textContent = orig.senderName;
      rp.appendChild(rpName);
      rp.appendChild(document.createTextNode(' ' + (orig.text || 'Вложение').slice(0, 80)));
      rp.addEventListener('click', () => scrollToMsg(msg.replyTo));
      content.appendChild(rp);
    }
  }

  if (msg.forwardFrom) {
    const fw = document.createElement('div');
    fw.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:2px;font-style:italic';
    fw.textContent = `Переслано от ${msg.forwardFrom}`;
    content.appendChild(fw);
  }

  if (msg.type === 'image' && msg.fileUrl) {
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.src = msg.fileUrl;
    img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(msg.fileUrl));
    content.appendChild(img);
  } else if (msg.type === 'video' && msg.fileUrl) {
    const vid = document.createElement('video');
    vid.className = 'msg-video';
    vid.src = msg.fileUrl;
    vid.controls = true;
    vid.preload = 'metadata';
    vid.playsInline = true;
    content.appendChild(vid);
  } else if (msg.type === 'file' && msg.fileUrl) {
    const fl = document.createElement('a');
    fl.className = 'msg-file';
    fl.href = msg.fileUrl;
    fl.download = msg.fileName || '';
    fl.target = '_blank';
    fl.innerHTML = `<i class="fas fa-file msg-file-icon"></i><div><div class="msg-file-name">${escHtml(msg.fileName || 'Файл')}</div><div class="msg-file-size">${fmtSize(msg.fileSize || 0)}</div></div>`;
    content.appendChild(fl);
  } else if (msg.type === 'voice' && msg.fileUrl) {
    content.appendChild(buildVoiceEl(msg));
  } else if (msg.type === 'sticker') {
    const st = document.createElement('div');
    st.style.cssText = 'font-size:48px;line-height:1;padding:4px 0';
    st.textContent = msg.text || '';
    content.appendChild(st);
  }

  if (msg.text && msg.type !== 'sticker') {
    const txt = document.createElement('div');
    txt.className = 'msg-text';
    txt.innerHTML = linkify(msg.text);
    if (msg.editedAt) txt.innerHTML += ' <span class="msg-edited">(ред.)</span>';
    content.appendChild(txt);
    const urlMatch = msg.text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) fetchLinkPreview(urlMatch[1], content);
  }

  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    const rc = document.createElement('div');
    rc.className = 'msg-reactions';
    for (const [emoji, users] of Object.entries(msg.reactions)) {
      const btn = document.createElement('button');
      btn.className = `msg-reaction${users.includes(S.user?.id) ? ' me' : ''}`;
      btn.innerHTML = `${emoji} <span class="msg-reaction-count">${users.length}</span>`;
      btn.addEventListener('click', () => reactToMsg(msg.id, emoji));
      rc.appendChild(btn);
    }
    content.appendChild(rc);
  }

  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  ['😂', '❤️', '👍', '🔥'].forEach(em => {
    const b = document.createElement('button');
    b.className = 'msg-action-btn';
    b.textContent = em;
    b.addEventListener('click', () => reactToMsg(msg.id, em));
    actions.appendChild(b);
  });
  const replyBtn = document.createElement('button');
  replyBtn.className = 'msg-action-btn';
  replyBtn.innerHTML = '<i class="fas fa-reply"></i>';
  replyBtn.addEventListener('click', () => setReply(msg));
  actions.appendChild(replyBtn);
  if (msg.senderId === S.user?.id) {
    const editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn';
    editBtn.innerHTML = '<i class="fas fa-pen"></i>';
    editBtn.addEventListener('click', () => startEdit(msg));
    actions.appendChild(editBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'msg-action-btn';
    delBtn.innerHTML = '<i class="fas fa-trash-can"></i>';
    delBtn.addEventListener('click', () => deleteMsg(msg.id));
    actions.appendChild(delBtn);
  }
  row.appendChild(actions);

  row.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg); });
  let lp, lpMoved = false;
  row.addEventListener('touchstart', () => { lpMoved = false; lp = setTimeout(() => { if (!lpMoved) showCtxMenu(null, msg); }, 500); }, { passive: true });
  row.addEventListener('touchmove', () => { lpMoved = true; clearTimeout(lp); }, { passive: true });
  row.addEventListener('touchend', () => clearTimeout(lp), { passive: true });

  row.appendChild(content);
  return row;
}

function buildVoiceEl(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-voice';
  const audio = new Audio(msg.fileUrl);
  audio.preload = 'metadata';
  let playing = false;
  const playBtn = document.createElement('button');
  playBtn.className = 'voice-play-btn';
  playBtn.innerHTML = '<i class="fas fa-play"></i>';
  playBtn.addEventListener('click', () => {
    if (playing) { audio.pause(); playBtn.innerHTML = '<i class="fas fa-play"></i>'; playing = false; }
    else { audio.play(); playBtn.innerHTML = '<i class="fas fa-pause"></i>'; playing = true; }
  });
  const progress = document.createElement('div');
  progress.className = 'voice-progress';
  const fill = document.createElement('div');
  fill.className = 'voice-progress-fill';
  progress.appendChild(fill);
  const dur = document.createElement('span');
  dur.className = 'voice-duration';
  dur.textContent = '0:00';
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
      const s = Math.floor(audio.currentTime);
      dur.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
  });
  audio.addEventListener('ended', () => { playing = false; playBtn.innerHTML = '<i class="fas fa-play"></i>'; fill.style.width = '0%'; });
  progress.addEventListener('click', e => { if (audio.duration) { const r = progress.getBoundingClientRect(); audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; } });
  wrap.appendChild(playBtn);
  wrap.appendChild(progress);
  wrap.appendChild(dur);
  return wrap;
}

function scrollBottom() {
  const el = $('messages-scroll');
  if (el) requestAnimationFrame(() => el.scrollTop = el.scrollHeight);
}

function scrollToMsg(id) {
  const el = qs(`[data-msgid="${id}"]`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(88,101,242,.08)'; setTimeout(() => el.style.background = '', 2000); }
}

/* ── New message ─────────────────────────────────────── */
function handleNewMessage(msg) {
  const ci = S.chats.findIndex(c => c.id === msg.chatId);
  if (ci !== -1) {
    S.chats[ci].lastMessage = msg;
    if (S.activeChat?.id !== msg.chatId) S.chats[ci].unreadCount = (S.chats[ci].unreadCount || 0) + 1;
    const [c] = S.chats.splice(ci, 1);
    S.chats.unshift(c);
    if (S.currentScreen === 'chats') renderChatList();
    if (S.currentScreen === 'hubs') renderHubs();
    updateTabTitle();
  }
  if (S.activeChat?.id === msg.chatId) {
    S.messages.push(msg);
    renderMessages();
    scrollBottom();
    S.socket?.emit('mark_read', { chatId: msg.chatId });
  }
}

/* ══════════════════════════════════════════════════════════
   SEND / EDIT / DELETE
   ══════════════════════════════════════════════════════════ */
async function sendMessage() {
  const inp = $('msg-input');
  const text = inp.value.trim();
  if (!text || !S.activeChat) return;

  const chatId = S.activeChat.id;

  if (S.editingMsgId) {
    try {
      const edited = await API.put(`/api/messages/${S.editingMsgId}`, { text });
      const i = S.messages.findIndex(m => m.id === S.editingMsgId);
      if (i !== -1) S.messages[i] = edited;
      S.editingMsgId = null;
      inp.value = '';
      inp.style.height = 'auto';
      $('chat-input-inner').classList.remove('editing');
      renderMessages();
    } catch { showToast('Ошибка редактирования', 'error'); }
    return;
  }

  const body = { text };
  if (S.replyTo) { body.replyTo = S.replyTo.id; clearReply(); }
  inp.value = '';
  inp.style.height = 'auto';
  S.socket?.emit('typing_stop', { chatId });

  try {
    const msg = await API.post(`/api/chats/${chatId}/messages`, body);
    S.messages.push(msg);
    renderMessages();
    scrollBottom();
    const ci = S.chats.findIndex(c => c.id === chatId);
    if (ci !== -1) { S.chats[ci].lastMessage = msg; renderChatList(); }
  } catch { showToast('Ошибка отправки', 'error'); }
}

function setReply(msg) {
  S.replyTo = msg;
  $('reply-bar').classList.remove('hidden');
  $('reply-name').textContent = '@' + (msg.senderName || '');
  $('reply-text').textContent = (msg.text || 'Вложение').slice(0, 100);
  $('chat-input-inner').classList.add('has-reply');
  $('msg-input').focus();
  closeCtxMenu();
}
function clearReply() {
  S.replyTo = null;
  $('reply-bar').classList.add('hidden');
  $('chat-input-inner').classList.remove('has-reply');
}

function startEdit(msg) {
  if (msg.senderId !== S.user?.id) return;
  S.editingMsgId = msg.id;
  const inp = $('msg-input');
  inp.value = msg.text || '';
  inp.focus();
  autoResize();
  $('chat-input-inner').classList.add('editing');
  closeCtxMenu();
}

async function deleteMsg(id) {
  try { await API.del(`/api/messages/${id}`); S.messages = S.messages.filter(m => m.id !== id); renderMessages(); }
  catch { showToast('Ошибка удаления', 'error'); }
  closeCtxMenu();
}

async function reactToMsg(id, emoji) {
  try { await API.post(`/api/messages/${id}/react`, { emoji }); } catch {}
}

/* ══════════════════════════════════════════════════════════
   FILE UPLOAD
   ══════════════════════════════════════════════════════════ */
async function uploadFile(file) {
  if (!S.activeChat) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const msg = await API.upload(`/api/chats/${S.activeChat.id}/upload`, fd);
    S.messages.push(msg);
    renderMessages();
    scrollBottom();
    const ci = S.chats.findIndex(c => c.id === S.activeChat.id);
    if (ci !== -1) { S.chats[ci].lastMessage = msg; renderChatList(); }
  } catch { showToast('Ошибка загрузки файла', 'error'); }
}

/* ══════════════════════════════════════════════════════════
   TYPING
   ══════════════════════════════════════════════════════════ */
const _typingUsers = new Map();
function showTyping(uid) {
  clearTimeout(_typingUsers.get(uid));
  _typingUsers.set(uid, setTimeout(() => hideTyping(uid), 5000));
  updateTypingUI();
}
function hideTyping(uid) {
  clearTimeout(_typingUsers.get(uid));
  _typingUsers.delete(uid);
  updateTypingUI();
}
function updateTypingUI() {
  const bar = $('typing-bar');
  if (!bar) return;
  if (_typingUsers.size > 0) { bar.classList.remove('hidden'); $('typing-text').textContent = _typingUsers.size === 1 ? 'печатает…' : 'печатают…'; }
  else bar.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   ONLINE
   ══════════════════════════════════════════════════════════ */
function updateOnline(uid, online) {
  S.chats.forEach(c => {
    if (c.type === 'private') { const other = c.members?.find(id => id !== S.user?.id); if (other === uid) c.online = online; }
    if (c.membersInfo) c.membersInfo.forEach(m => { if (m.id === uid) m.online = online; });
  });
  if (S.currentScreen === 'chats') renderChatList();
  if (S.currentScreen === 'hubs') renderHubs();
  if (S.activeChat) updateChatStatus(S.activeChat);
}

/* ══════════════════════════════════════════════════════════
   CONTEXT MENU
   ══════════════════════════════════════════════════════════ */
let _ctxMsg = null;
function showCtxMenu(e, msg) {
  _ctxMsg = msg;
  const menu = $('ctx-menu');
  menu.classList.remove('hidden');
  qsa('[data-action="edit"],[data-action="delete"]', menu).forEach(el => el.classList.toggle('hidden', msg.senderId !== S.user?.id));
  if (e) {
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 240) + 'px';
  } else { menu.style.left = '50%'; menu.style.top = '40%'; }
}
function closeCtxMenu() { $('ctx-menu').classList.add('hidden'); _ctxMsg = null; }

/* ══════════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════════ */
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

function initNewChatModal() {
  const inp = $('new-chat-search'), res = $('new-chat-results');
  inp.addEventListener('input', debounce(async () => {
    const q = inp.value.trim(); res.innerHTML = '';
    if (!q) return;
    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      users.forEach(u => {
        const item = document.createElement('div'); item.className = 'modal-result-item';
        const av = document.createElement('div'); av.className = 'modal-result-av';
        if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
        else { av.style.backgroundColor = u.avatarColor || '#5865f2'; av.textContent = avatarText(u.displayName); }
        item.appendChild(av);
        const info = document.createElement('div');
        info.innerHTML = `<span class="modal-result-name">${escHtml(u.displayName)}</span> <span class="modal-result-tag">${escHtml(u.username)}</span>`;
        item.appendChild(info);
        item.addEventListener('click', async () => {
          try { const chat = await API.post('/api/chats', { userId: u.id }); closeModal('modal-new-chat'); inp.value = ''; res.innerHTML = ''; await loadChats(); openChat(chat.id); }
          catch (e) { showToast(e.message, 'error'); }
        });
        res.appendChild(item);
      });
    } catch {}
  }, 300));
}

function initNewGroupModal() {
  const selected = [];
  const inp = $('group-member-search'), res = $('group-search-results'), tags = $('group-selected');
  function renderTags() {
    tags.innerHTML = '';
    selected.forEach(u => {
      const tag = document.createElement('div'); tag.className = 'modal-tag';
      tag.innerHTML = `${escHtml(u.displayName)} <button>&times;</button>`;
      tag.querySelector('button').addEventListener('click', () => { selected.splice(selected.findIndex(s => s.id === u.id), 1); renderTags(); });
      tags.appendChild(tag);
    });
  }
  inp.addEventListener('input', debounce(async () => {
    const q = inp.value.trim(); res.innerHTML = '';
    if (!q) return;
    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      users.filter(u => !selected.find(s => s.id === u.id)).forEach(u => {
        const item = document.createElement('div'); item.className = 'modal-result-item';
        const av = document.createElement('div'); av.className = 'modal-result-av';
        if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
        else { av.style.backgroundColor = u.avatarColor || '#5865f2'; av.textContent = avatarText(u.displayName); }
        item.appendChild(av);
        const info = document.createElement('div');
        info.innerHTML = `<span class="modal-result-name">${escHtml(u.displayName)}</span> <span class="modal-result-tag">${escHtml(u.username)}</span>`;
        item.appendChild(info);
        item.addEventListener('click', () => { selected.push(u); renderTags(); inp.value = ''; res.innerHTML = ''; });
        res.appendChild(item);
      });
    } catch {}
  }, 300));

  on('btn-create-group', 'click', async () => {
    const name = $('group-name-input').value.trim();
    if (!name) { showToast('Введите название', 'error'); return; }
    try {
      const chat = await API.post('/api/chats/group', { name, memberIds: selected.map(u => u.id) });
      closeModal('modal-new-group');
      $('group-name-input').value = ''; inp.value = ''; res.innerHTML = ''; selected.length = 0; tags.innerHTML = '';
      await loadChats();
      openChat(chat.id);
    } catch (e) { showToast(e.message, 'error'); }
  });
  on('btn-cancel-group', 'click', () => closeModal('modal-new-group'));
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════ */
function openSettings() {
  S.settingsOpen = true;
  $('modal-settings').classList.remove('hidden');
  if (!S.user) return;
  const av = $('sc-avatar');
  if (S.user.avatar) { av.style.backgroundImage = `url(${S.user.avatar})`; av.textContent = ''; }
  else { av.style.backgroundImage = ''; av.style.backgroundColor = S.user.avatarColor || '#5865f2'; av.textContent = avatarText(S.user.displayName); }
  $('sc-name').textContent = S.user.displayName;
  $('sc-tag').textContent = '#' + S.user.username;
  $('sc-displayname').textContent = S.user.displayName;
  $('sc-username').textContent = S.user.username;
  $('set-displayname').value = S.user.displayName || '';
  $('set-username').value = S.user.username || '';
  $('set-bio').value = S.user.bio || '';
  showSettingsSection('profile');
}

function closeSettings() {
  S.settingsOpen = false;
  $('modal-settings').classList.add('hidden');
  $('edit-profile-panel').classList.add('hidden');
}

function showSettingsSection(sec) {
  const sections = ['profile','security','profiles','privacy','appearance','notifications','voice','keybinds','language','about'];
  sections.forEach(s => {
    const el = $('settings-' + s);
    if (el) el.classList.toggle('hidden', s !== sec);
  });
  qsa('.settings-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === sec));
}

function initSettings() {
  on('settings-close-btn', 'click', closeSettings);
  qsa('.settings-nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSettingsSection(btn.dataset.section));
  });
  on('btn-edit-profile', 'click', () => $('edit-profile-panel').classList.remove('hidden'));
  on('btn-cancel-edit', 'click', () => $('edit-profile-panel').classList.add('hidden'));
  on('btn-save-profile', 'click', async () => {
    try {
      const user = await API.put('/api/me', {
        displayName: $('set-displayname').value.trim(),
        username: $('set-username').value.trim(),
        bio: $('set-bio').value,
      });
      S.user = user;
      localStorage.setItem('sm_user', JSON.stringify(user));
      updateProfileScreen();
      openSettings();
      $('edit-profile-panel').classList.add('hidden');
      showToast('Профиль обновлён', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
  on('btn-change-pw', 'click', async () => {
    const cur = $('set-cur-pw').value, nw = $('set-new-pw').value;
    if (!cur || !nw) { showToast('Заполните оба поля', 'error'); return; }
    try { await API.put('/api/me/password', { currentPassword: cur, newPassword: nw }); showToast('Пароль изменён', 'success'); $('set-cur-pw').value = ''; $('set-new-pw').value = ''; }
    catch (e) { showToast(e.message, 'error'); }
  });

  on('font-size-slider', 'input', () => {
    const v = $('font-size-slider').value;
    $('font-size-preview').textContent = 'Текущий: ' + v + 'px';
    document.documentElement.style.setProperty('--msg-font-size', v + 'px');
    qsa('.msg-text').forEach(el => { el.style.fontSize = v + 'px'; });
  });

  qsa('.theme-option input[name="theme"]').forEach(r => {
    r.addEventListener('change', () => {
      qsa('.theme-option').forEach(o => o.classList.remove('selected'));
      r.closest('.theme-option').classList.add('selected');
      applyTheme(r.value);
      showToast('Тема применена', 'success', 2000);
    });
  });

  const savedTheme = localStorage.getItem('sm_theme') || 'phantom';
  applyTheme(savedTheme);
  const themeRadio = qs(`input[name="theme"][value="${savedTheme}"]`);
  if (themeRadio) { themeRadio.checked = true; qsa('.theme-option').forEach(o => o.classList.remove('selected')); themeRadio.closest('.theme-option').classList.add('selected'); }

  on('voice-input-vol', 'input', () => { const el = $('voice-input-val'); if (el) el.textContent = $('voice-input-vol').value + '%'; });
  on('voice-output-vol', 'input', () => { const el = $('voice-output-val'); if (el) el.textContent = $('voice-output-vol').value + '%'; });
  on('set-about-me', 'input', () => { const el = $('about-me-count'); if (el) el.textContent = $('set-about-me').value.length; });

  on('btn-revoke-sessions', 'click', async () => {
    try { await API.del('/api/sessions'); showToast('Все сессии завершены', 'success'); }
    catch { showToast('Не удалось завершить сессии', 'error'); }
  });

  const avatarFileInput = document.createElement('input');
  avatarFileInput.type = 'file';
  avatarFileInput.accept = 'image/*';
  avatarFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const user = await API.upload('/api/me/avatar', fd);
      S.user = user;
      localStorage.setItem('sm_user', JSON.stringify(user));
      updateProfileScreen();
      showToast('Аватар обновлён', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });
  on('btn-upload-avatar', 'click', () => avatarFileInput.click());
  on('avatar-upload-preview', 'click', () => avatarFileInput.click());
}

/* ══════════════════════════════════════════════════════════
   EMOJI PICKER
   ══════════════════════════════════════════════════════════ */
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
  '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔',
  '🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤',
  '😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓',
  '🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😖','😣','😞','😓',
  '😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻',
  '👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊',
  '👍','👎','👊','✊','🤛','🤜','🤝','👏','🙌','👐','🤲','🤏','👌','🤌','✌️','🤞',
  '🫰','🤟','🤘','🤙','🫵','👆','👇','👉','👈','🫳','🫴','👋','🤚','🖐️','✋','🖖',
  '💪','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','💔','❣️','💕','💝',
  '💘','💖','💗','💓','💞','💟','💯','💢','💥','💫','💦','💨','🕳️','💣','❗','❓',
  '🔥','⭐','🌟','✨','⚡','💡','🎉','🎊','🎯','🏆','🥇','🥈','🥉',
];

let _emojiPickerBuilt = false;
function buildEmojiPicker() {
  if (_emojiPickerBuilt) return;
  _emojiPickerBuilt = true;
  const grid = $('ep-grid');
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = em;
    btn.addEventListener('click', () => { $('msg-input').value += em; $('msg-input').focus(); });
    grid.appendChild(btn);
  });
  on('ep-search', 'input', () => {
    const q = $('ep-search').value.toLowerCase();
    grid.querySelectorAll('.emoji-btn').forEach(b => { b.style.display = q ? (b.textContent.includes(q) ? '' : 'none') : ''; });
  });
}

function toggleEmoji() {
  const picker = $('emoji-picker');
  buildEmojiPicker();
  picker.classList.toggle('hidden');
  S.emojiOpen = !picker.classList.contains('hidden');
}

/* ══════════════════════════════════════════════════════════
   LIGHTBOX
   ══════════════════════════════════════════════════════════ */
function openLightbox(url) { $('lightbox-img').src = url; $('lightbox').classList.remove('hidden'); }

/* ══════════════════════════════════════════════════════════
   INPUT AUTO-RESIZE
   ══════════════════════════════════════════════════════════ */
function autoResize() {
  const inp = $('msg-input');
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 200) + 'px';
}

/* ══════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) { try { await API.post('/api/push/subscribe', existing.toJSON()); } catch {} return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    let publicKey;
    try { const r = await API.get('/api/push/vapid'); publicKey = r.publicKey; } catch { return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) });
    await API.post('/api/push/subscribe', sub.toJSON());
  } catch {}
}
function urlB64(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/* ══════════════════════════════════════════════════════════
   INCOMING CALL OVERLAY
   ══════════════════════════════════════════════════════════ */
let _incomingCallData = null;
let _ringtoneInterval = null;

function showIncomingCall(data) {
  _incomingCallData = data;
  const overlay = $('incoming-call-overlay');
  if (!overlay) return;
  const av = $('incoming-call-avatar');
  if (data.fromAvatar) { av.style.backgroundImage = `url(${data.fromAvatar})`; av.textContent = ''; }
  else { av.style.backgroundImage = ''; av.style.backgroundColor = data.fromAvatarColor || '#444'; av.textContent = avatarText(data.fromName); }
  $('incoming-call-name').textContent = data.fromName || 'Неизвестный';
  $('incoming-call-type').textContent = data.callType === 'video' ? 'Видеозвонок' : 'Голосовой звонок';
  overlay.classList.remove('hidden');
  _ringtoneInterval = setTimeout(() => { hideIncomingCall(); showToast('Пропущенный звонок', 'warning'); }, 30000);
}

function hideIncomingCall() {
  $('incoming-call-overlay')?.classList.add('hidden');
  clearTimeout(_ringtoneInterval);
  _incomingCallData = null;
}

function showActiveCall(name, avatar, avatarColor) {
  const overlay = $('active-call-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const av = $('call-audio-avatar');
  if (avatar) { av.style.backgroundImage = `url(${avatar})`; av.textContent = ''; }
  else { av.style.backgroundImage = ''; av.style.backgroundColor = avatarColor || '#444'; av.textContent = avatarText(name); }
  $('call-audio-name').textContent = name || '';
  $('call-audio-timer').textContent = 'Подключение...';
  const start = Date.now();
  window._callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const el = $('call-audio-timer');
    if (el) el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNewChatModal();
  initNewGroupModal();
  initSettings();
  tryAutoLogin();

  // ── Send ──
  on('msg-input', 'keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    else if (S.activeChat) S.socket?.emit('typing_start', { chatId: S.activeChat.id });
  });
  on('msg-input', 'input', autoResize);
  let _stopTimer = null;
  on('msg-input', 'input', () => {
    clearTimeout(_stopTimer);
    _stopTimer = setTimeout(() => { if (S.activeChat) S.socket?.emit('typing_stop', { chatId: S.activeChat.id }); }, 3000);
  });

  // ── File upload ──
  on('btn-attach', 'click', () => $('file-input').click());
  on('file-input', 'change', e => { for (const file of e.target.files) uploadFile(file); e.target.value = ''; });

  // Paste images
  document.addEventListener('paste', e => {
    if (!S.activeChat) return;
    for (const item of (e.clipboardData?.items || [])) { if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) uploadFile(f); } }
  });

  // ── Emoji ──
  on('btn-emoji', 'click', toggleEmoji);
  on('reply-close', 'click', clearReply);

  // ── Screen navigation ──
  on('bnav-hubs', 'click', () => switchScreen('hubs'));
  on('bnav-chats', 'click', () => switchScreen('chats'));
  on('bnav-friends', 'click', () => switchScreen('friends'));
  on('bnav-profile', 'click', () => switchScreen('profile'));

  // ── Chat back ──
  on('btn-chat-back', 'click', goBack);

  // ── New chat / hub ──
  on('btn-new-dm', 'click', () => openModal('modal-new-chat'));
  on('btn-create-hub', 'click', () => openModal('modal-new-group'));

  // ── Profile screen buttons ──
  on('btn-open-settings', 'click', openSettings);
  on('btn-edit-my-profile', 'click', () => { openSettings(); showSettingsSection('profiles'); });
  on('btn-logout', 'click', logout);
  on('btn-settings-logout', 'click', logout);

  // ── Chat info button ──
  on('btn-chat-info', 'click', () => {
    if (!S.activeChat) return;
    if (S.activeChat.type === 'private') {
      openProfileViewer(S.activeChat);
    } else {
      showToast(`${S.activeChat.name}: ${S.activeChat.membersInfo?.length || 0} участников`, 'info');
    }
  });

  // ── Profile viewer ──
  on('pv-close', 'click', closeProfileViewer);
  on('profile-viewer', 'click', e => { if (e.target.id === 'profile-viewer') closeProfileViewer(); });
  on('pv-msg-btn', 'click', () => {
    closeProfileViewer();
    if (S.activeChat) openChat(S.activeChat.id);
  });
  on('pv-call-btn', 'click', () => {
    if (!S.activeChat || S.activeChat.type !== 'private') return;
    closeProfileViewer();
    const peerId = S.activeChat.members?.find(id => id !== S.user?.id);
    if (peerId && window.callsModule?.startCall) {
      window.callsModule.startCall(peerId, 'audio');
      showActiveCall(S.activeChat.displayName || S.activeChat.name, S.activeChat.displayAvatar, S.activeChat.displayAvatarColor);
    }
  });

  // ── Friends tabs ──
  qsa('.ftab').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.ftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('btn-add-friend')?.classList.remove('active');
      $('friends-search-input').placeholder = 'Поиск друзей...';
      $('friends-search-input').value = '';
      loadFriends(btn.dataset.tab);
    });
  });

  // ── Add friend button ──
  on('btn-add-friend', 'click', () => {
    qsa('.ftab').forEach(b => b.classList.remove('active'));
    $('btn-add-friend').classList.add('active');
    $('friends-search-input').placeholder = 'Введите имя для поиска...';
    $('friends-search-input').value = '';
    $('friends-search-input').focus();
    loadFriends('add');
  });

  // ── Friends search ──
  on('friends-search-input', 'input', debounce(() => {
    const q = $('friends-search-input').value.trim();
    if (_currentFriendsTab === 'add') {
      searchAndRenderUsers(q);
    } else {
      renderFriends(_currentFriendsTab);
    }
  }, 400));

  // ── Chats search ──
  on('chats-search', 'input', debounce(() => {
    renderChatList($('chats-search').value.trim());
  }, 300));

  // ── Calls ──
  on('btn-call', 'click', () => {
    if (!S.activeChat || S.activeChat.type !== 'private') return;
    const peerId = S.activeChat.members?.find(id => id !== S.user?.id);
    if (peerId && window.callsModule?.startCall) {
      window.callsModule.startCall(peerId, 'audio');
      showActiveCall(S.activeChat.displayName || S.activeChat.name, S.activeChat.displayAvatar, S.activeChat.displayAvatarColor);
    }
  });
  on('btn-video-call', 'click', () => {
    if (!S.activeChat || S.activeChat.type !== 'private') return;
    const peerId = S.activeChat.members?.find(id => id !== S.user?.id);
    if (peerId && window.callsModule?.startCall) {
      window.callsModule.startCall(peerId, 'video');
      showActiveCall(S.activeChat.displayName || S.activeChat.name, S.activeChat.displayAvatar, S.activeChat.displayAvatarColor);
    }
  });

  // ── Incoming call buttons ──
  on('btn-accept-call', 'click', () => {
    if (!_incomingCallData) return;
    const d = _incomingCallData;
    hideIncomingCall();
    S.socket?.emit('call_accepting', { to: d.from });
    window.callsModule?.acceptCall(d.from, d.offer, d.callType);
    showActiveCall(d.fromName, d.fromAvatar, d.fromAvatarColor);
  });
  on('btn-reject-call', 'click', () => {
    if (!_incomingCallData) return;
    S.socket?.emit('call_reject', { to: _incomingCallData.from });
    hideIncomingCall();
  });

  // ── Active call controls ──
  on('btn-end-call', 'click', () => { window.callsModule?.endCall(); });
  on('toggle-mute', 'click', () => {
    const muted = window.callsModule?.toggleMute();
    const btn = $('toggle-mute');
    if (btn) {
      btn.querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
      btn.classList.toggle('vk-ctrl-off', muted);
    }
  });
  on('toggle-video', 'click', async () => {
    const off = await window.callsModule?.toggleVideo();
    const btn = $('toggle-video');
    if (btn) {
      btn.querySelector('i').className = off ? 'fas fa-video-slash' : 'fas fa-video';
      btn.classList.toggle('vk-ctrl-off', off);
    }
  });
  on('toggle-screen', 'click', async () => {
    if (window.callsModule?.isInCall?.()) {
      try {
        if ($('toggle-screen')?.classList.contains('sharing')) { await window.callsModule.stopScreenShare(); $('toggle-screen').classList.remove('sharing'); }
        else { await window.callsModule.startScreenShare(); $('toggle-screen').classList.add('sharing'); }
      } catch { showToast('Не удалось начать демонстрацию', 'error'); }
    }
  });

  // ── Close modals ──
  on('modal-new-chat-close', 'click', () => closeModal('modal-new-chat'));
  on('modal-new-group-close', 'click', () => closeModal('modal-new-group'));
  qsa('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });

  // ── Context menu ──
  document.addEventListener('click', e => { if (!e.target.closest('.ctx-menu')) closeCtxMenu(); });
  $('ctx-menu').addEventListener('click', e => {
    const item = e.target.closest('.ctx-item');
    if (!item || !_ctxMsg) return;
    const a = item.dataset.action;
    if (a === 'reply') setReply(_ctxMsg);
    else if (a === 'edit') startEdit(_ctxMsg);
    else if (a === 'delete') deleteMsg(_ctxMsg.id);
    else if (a === 'react') reactToMsg(_ctxMsg.id, '👍');
    closeCtxMenu();
  });

  // ── Lightbox ──
  on('lightbox', 'click', () => $('lightbox').classList.add('hidden'));
  on('lightbox-close', 'click', () => $('lightbox').classList.add('hidden'));

  // ── ESC handler ──
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (S.settingsOpen) closeSettings();
      else if (!$('profile-viewer').classList.contains('hidden')) closeProfileViewer();
      else if (S.emojiOpen) { $('emoji-picker').classList.add('hidden'); S.emojiOpen = false; }
      else if (!$('lightbox').classList.contains('hidden')) $('lightbox').classList.add('hidden');
      else if (S.editingMsgId) { S.editingMsgId = null; $('msg-input').value = ''; $('chat-input-inner').classList.remove('editing'); }
      else if (S.currentScreen === 'chat') goBack();
    }
  });

  // ── Close emoji on outside click ──
  document.addEventListener('click', e => {
    if (S.emojiOpen && !e.target.closest('.emoji-picker') && !e.target.closest('#btn-emoji')) {
      $('emoji-picker').classList.add('hidden');
      S.emojiOpen = false;
    }
  });

  // ── Service Worker ──
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
});
