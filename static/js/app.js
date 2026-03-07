/* ═══════════════════════════════════════════════════════════
   Shadow Messenger v3 — Dual-Layout App (Desktop + Mobile)
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ── Globals for calls.js ─────────────────────────────────── */
window.State = { socket: null, user: null };
window._callTimerInterval = null;

const $ = id => document.getElementById(id);
const API = '/api';
let TOKEN = localStorage.getItem('token') || '';
const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` });

/* ── State ────────────────────────────────────────────────── */
let currentUser   = null;
let chats         = [];
let friends       = [];
let pendingIn     = [];
let pendingOut    = [];
let openChatId    = null;
let messages      = {};   // chatId -> []
let onlineUsers   = new Set();
let editingMsgId  = null;
let replyToMsg    = null;
let typingTimers  = {};
let emojiDB       = [];
let isMobile      = false;

const TILE_COLORS = ['tile-blue','tile-green','tile-orange','tile-purple','tile-red','tile-teal','tile-pink','tile-gray'];
const THEMES = {
  phantom:  {'--bg-darkest':'#0F0F0F','--bg-dark':'#1A1A1A','--bg-primary':'#151515','--bg-secondary':'#1A1A1A','--bg-tertiary':'#0F0F0F','--bg-input':'#252525','--accent-color':'#5865f2','--bg-brand':'#5865f2'},
  midnight: {'--bg-darkest':'#000005','--bg-dark':'#0a0a1a','--bg-primary':'#05050f','--bg-secondary':'#0a0a1a','--bg-tertiary':'#000005','--bg-input':'#15152a','--accent-color':'#5865f2','--bg-brand':'#5865f2'},
  obsidian: {'--bg-darkest':'#1a1a2e','--bg-dark':'#16213e','--bg-primary':'#181830','--bg-secondary':'#16213e','--bg-tertiary':'#1a1a2e','--bg-input':'#1f2b4d','--accent-color':'#4fc3f7','--bg-brand':'#4fc3f7'},
  crimson:  {'--bg-darkest':'#1a0000','--bg-dark':'#2d0000','--bg-primary':'#200000','--bg-secondary':'#2d0000','--bg-tertiary':'#1a0000','--bg-input':'#3d0000','--accent-color':'#ef5350','--bg-brand':'#ef5350'},
  emerald:  {'--bg-darkest':'#001a0a','--bg-dark':'#002d12','--bg-primary':'#001f0c','--bg-secondary':'#002d12','--bg-tertiary':'#001a0a','--bg-input':'#003d18','--accent-color':'#66bb6a','--bg-brand':'#66bb6a'},
  ocean:    {'--bg-darkest':'#001020','--bg-dark':'#001830','--bg-primary':'#001428','--bg-secondary':'#001830','--bg-tertiary':'#001020','--bg-input':'#002040','--accent-color':'#42a5f5','--bg-brand':'#42a5f5'},
  violet:   {'--bg-darkest':'#10001a','--bg-dark':'#1a0030','--bg-primary':'#140024','--bg-secondary':'#1a0030','--bg-tertiary':'#10001a','--bg-input':'#24003e','--accent-color':'#ab47bc','--bg-brand':'#ab47bc'},
  sunset:   {'--bg-darkest':'#1a0800','--bg-dark':'#2d1200','--bg-primary':'#200a00','--bg-secondary':'#2d1200','--bg-tertiary':'#1a0800','--bg-input':'#3d1800','--accent-color':'#ff7043','--bg-brand':'#ff7043'},
  arctic:   {'--bg-darkest':'#0a1520','--bg-dark':'#122030','--bg-primary':'#0e1a28','--bg-secondary':'#122030','--bg-tertiary':'#0a1520','--bg-input':'#1a2a3e','--accent-color':'#80cbc4','--bg-brand':'#80cbc4'},
  rose:     {'--bg-darkest':'#1a0010','--bg-dark':'#2d001a','--bg-primary':'#200014','--bg-secondary':'#2d001a','--bg-tertiary':'#1a0010','--bg-input':'#3d0024','--accent-color':'#f48fb1','--bg-brand':'#f48fb1'},
  cyber:    {'--bg-darkest':'#0a0a0a','--bg-dark':'#001a1a','--bg-primary':'#0d0d0d','--bg-secondary':'#001a1a','--bg-tertiary':'#0a0a0a','--bg-input':'#002828','--accent-color':'#00e5ff','--bg-brand':'#00e5ff'},
  amber:    {'--bg-darkest':'#1a1000','--bg-dark':'#2d1a00','--bg-primary':'#201400','--bg-secondary':'#2d1a00','--bg-tertiary':'#1a1000','--bg-input':'#3d2400','--accent-color':'#ffca28','--bg-brand':'#ffca28'},
  slate:    {'--bg-darkest':'#1a1a1a','--bg-dark':'#2a2a2a','--bg-primary':'#222','--bg-secondary':'#2a2a2a','--bg-tertiary':'#1a1a1a','--bg-input':'#353535','--accent-color':'#90a4ae','--bg-brand':'#90a4ae'},
  nord:     {'--bg-darkest':'#2e3440','--bg-dark':'#3b4252','--bg-primary':'#343c4c','--bg-secondary':'#3b4252','--bg-tertiary':'#2e3440','--bg-input':'#434c5e','--accent-color':'#88c0d0','--bg-brand':'#88c0d0'},
  dracula:  {'--bg-darkest':'#282a36','--bg-dark':'#44475a','--bg-primary':'#363948','--bg-secondary':'#44475a','--bg-tertiary':'#282a36','--bg-input':'#6272a4','--accent-color':'#bd93f9','--bg-brand':'#bd93f9'},
  monokai:  {'--bg-darkest':'#272822','--bg-dark':'#3e3d32','--bg-primary':'#2f302a','--bg-secondary':'#3e3d32','--bg-tertiary':'#272822','--bg-input':'#49483e','--accent-color':'#a6e22e','--bg-brand':'#a6e22e'},
  abyss:    {'--bg-darkest':'#000020','--bg-dark':'#000040','--bg-primary':'#000030','--bg-secondary':'#000040','--bg-tertiary':'#000020','--bg-input':'#000060','--accent-color':'#6495ed','--bg-brand':'#6495ed'},
};

/* ══════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════ */
function apiFetch(url, opts = {}) {
  return fetch(url, { headers: headers(), ...opts }).then(r => {
    if (!r.ok) return r.json().then(d => Promise.reject(d));
    return r.json();
  });
}
function apiPost(url, body) { return apiFetch(url, { method: 'POST', body: JSON.stringify(body) }); }
function apiPut(url, body) { return apiFetch(url, { method: 'PUT', body: JSON.stringify(body) }); }
function apiDelete(url) { return apiFetch(url, { method: 'DELETE' }); }

window.showToast = function(text, type = 'info') {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = text;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
};

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s/60)} мин назад`;
  if (s < 86400) return `${Math.floor(s/3600)} ч назад`;
  return new Date(d).toLocaleDateString('ru-RU');
}
function formatTime(d) { return new Date(d).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}); }
function formatDate(d) {
  const opts = {day:'numeric',month:'long'};
  const y = new Date(d).getFullYear();
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(d).toLocaleDateString('ru-RU', opts);
}
function initials(name) { return (name||'?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function avatarStyle(url, color) {
  if (url) return `background-image:url(${url})`;
  return `background:${color||'#5865f2'}`;
}
function isOnline(userId) { return onlineUsers.has(userId); }
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
function linkify(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
function detectMode() {
  isMobile = window.innerWidth <= 1024;
}

/* ══════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════ */
function showAuth() {
  $('auth-screen').classList.remove('hidden');
  $('app').classList.add('hidden');
}
function hideAuth() {
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function initAuth() {
  $('btn-login').onclick = async () => {
    const u = $('li-username').value.trim();
    const p = $('li-password').value;
    if (!u || !p) return;
    try {
      const d = await apiPost(`${API}/login`, { username: u, password: p });
      TOKEN = d.token;
      localStorage.setItem('token', TOKEN);
      await bootstrap();
    } catch(e) { $('login-error').textContent = e.error || 'Ошибка входа'; }
  };
  $('btn-register').onclick = async () => {
    const dn = $('rg-displayname').value.trim();
    const u  = $('rg-username').value.trim();
    const p  = $('rg-password').value;
    const p2 = $('rg-password2').value;
    if (!dn||!u||!p) return;
    if (p !== p2) { $('reg-error').textContent = 'Пароли не совпадают'; return; }
    try {
      const d = await apiPost(`${API}/register`, { displayName:dn, username:u, password:p });
      TOKEN = d.token;
      localStorage.setItem('token', TOKEN);
      await bootstrap();
    } catch(e) { $('reg-error').textContent = e.error || 'Ошибка регистрации'; }
  };
  $('show-register').onclick = e => { e.preventDefault(); $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); };
  $('show-login').onclick = e => { e.preventDefault(); $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); };

  // Enter key
  $('li-password').addEventListener('keydown', e => { if (e.key==='Enter') $('btn-login').click(); });
  $('rg-password2').addEventListener('keydown', e => { if (e.key==='Enter') $('btn-register').click(); });
}

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════════════════════ */
async function bootstrap() {
  try {
    currentUser = await apiFetch(`${API}/me`);
    window.State.user = currentUser;
  } catch {
    TOKEN = '';
    localStorage.removeItem('token');
    showAuth();
    return;
  }
  hideAuth();
  detectMode();
  initSocket();
  await Promise.all([loadChats(), loadFriends()]);
  renderAll();
  applyTheme(localStorage.getItem('theme') || 'phantom');
  applyFontSize(parseInt(localStorage.getItem('fontSize') || '16'));
  updateProfileUI();
}

/* ══════════════════════════════════════════════════════════
   SOCKET
   ══════════════════════════════════════════════════════════ */
function initSocket() {
  if (window.State.socket) window.State.socket.disconnect();
  const sock = io({ auth: { token: TOKEN } });
  window.State.socket = sock;

  sock.on('connect', () => console.log('[socket] connected'));
  sock.on('disconnect', () => console.log('[socket] disconnected'));

  sock.on('user_online', ({ userId }) => { onlineUsers.add(userId); refreshOnlineStatus(userId); });
  sock.on('user_offline', ({ userId }) => { onlineUsers.delete(userId); refreshOnlineStatus(userId); });

  sock.on('new_message', msg => onNewMessage(msg));
  sock.on('message_edited', msg => onMessageEdited(msg));
  sock.on('message_deleted', ({ messageId, chatId }) => onMessageDeleted(messageId, chatId));
  sock.on('message_reaction', ({ messageId, reactions }) => onMessageReaction(messageId, reactions));

  sock.on('user_typing', ({ userId, chatId }) => onTyping(userId, chatId, true));
  sock.on('user_stopped_typing', ({ userId, chatId }) => onTyping(userId, chatId, false));
  sock.on('messages_read', ({ chatId, userId }) => onMessagesRead(chatId, userId));

  sock.on('chat_created', chat => { chats.push(chat); renderChatLists(); });
  sock.on('chat_updated', chat => { const i = chats.findIndex(c=>c.id===chat.id); if(i>=0)chats[i]={...chats[i],...chat}; renderChatLists(); });
  sock.on('chat_deleted', ({ chatId }) => { chats = chats.filter(c=>c.id!==chatId); if(openChatId===chatId) closeChat(); renderChatLists(); });

  sock.on('friend_request', () => loadFriends());
  sock.on('friend_accepted', () => loadFriends());

  // Call events — pass to calls.js
  sock.on('call_incoming', d => window.callsModule?.handleIncoming(d));
  sock.on('call_answered', d => window.callsModule?.handleAnswered(d));
  sock.on('call_accepting', d => window.callsModule?.handleAccepting?.(d));
  sock.on('call_ice', d => window.callsModule?.handleIce(d));
  sock.on('call_rejected', d => window.callsModule?.handleRejected(d));
  sock.on('call_ended', d => window.callsModule?.handleEnded(d));
  sock.on('call_busy', d => window.callsModule?.handleBusy?.(d));
  sock.on('call_renegotiate', d => window.callsModule?.handleRenegotiate?.(d));
  sock.on('call_status', d => window.callsModule?.handleStatus?.(d));

  // Group call events
  sock.on('group_call_user_joined', d => window.groupCallModule?.handleUserJoined?.(d));
  sock.on('group_call_members', d => window.groupCallModule?.handleMembers?.(d));
  sock.on('group_call_offer', d => window.groupCallModule?.handleOffer?.(d));
  sock.on('group_call_answer', d => window.groupCallModule?.handleAnswer?.(d));
  sock.on('group_call_ice', d => window.groupCallModule?.handleIce?.(d));
  sock.on('group_call_user_left', d => window.groupCallModule?.handleUserLeft?.(d));
  sock.on('group_call_mic_status', d => window.groupCallModule?.handleMicStatus?.(d));
}

/* ══════════════════════════════════════════════════════════
   DATA LOADING
   ══════════════════════════════════════════════════════════ */
async function loadChats() {
  try { chats = await apiFetch(`${API}/chats`); } catch { chats = []; }
  chats.forEach(c => { if (c.id) window.State.socket?.emit('join_chat', { chatId: c.id }); });
}
async function loadFriends() {
  try { [friends, pendingIn, pendingOut] = await Promise.all([
    apiFetch(`${API}/friends`),
    apiFetch(`${API}/friends/pending`),
    apiFetch(`${API}/friends/outgoing`),
  ]); } catch { friends = []; pendingIn = []; pendingOut = []; }
  renderFriends();
}
async function loadMessages(chatId) {
  try {
    const msgs = await apiFetch(`${API}/chats/${encodeURIComponent(chatId)}/messages`);
    messages[chatId] = msgs;
  } catch { messages[chatId] = []; }
}

/* ══════════════════════════════════════════════════════════
   RENDERING
   ══════════════════════════════════════════════════════════ */
function renderAll() {
  renderChatLists();
  renderFriends();
  renderHubs();
  if (isMobile) renderMobileProfile();
}

// ── Desktop col2 mode ────────────────────────────────────
let dkMode = 'dms'; // 'dms' | 'friends' | 'hub:id'

function setDkMode(mode) {
  dkMode = mode;
  const title = $('dk-col2-title');
  const action = $('dk-col2-action');
  const ftabs = $('dk-friends-tabs');
  if (mode === 'dms') {
    title.textContent = 'Личные сообщения';
    action.classList.remove('hidden');
    action.innerHTML = '<i class="fas fa-pen-to-square"></i>';
    ftabs.classList.add('hidden');
    renderDkDMList();
  } else if (mode === 'friends') {
    title.textContent = 'Друзья';
    action.classList.remove('hidden');
    action.innerHTML = '<i class="fas fa-user-plus"></i>';
    ftabs.classList.remove('hidden');
    renderDkFriendsList();
  } else if (mode.startsWith('hub:')) {
    const hubId = mode.slice(4);
    const hub = chats.find(c => c.id === hubId);
    title.textContent = hub?.displayName || hub?.name || 'Хаб';
    action.classList.add('hidden');
    ftabs.classList.add('hidden');
    renderDkSubchatList(hubId);
  }
}

// ── Chat lists ───────────────────────────────────────
function renderChatLists() {
  // Desktop
  if (dkMode === 'dms') renderDkDMList();
  else if (dkMode.startsWith('hub:')) renderDkSubchatList(dkMode.slice(4));
  // Mobile
  renderMobDialogList();
  renderHubs();
}

function renderDkDMList() {
  const el = $('dk-col2-list');
  const dms = chats.filter(c => c.type === 'private').sort(chatSorter);
  if (!dms.length) { el.innerHTML = '<div class="empty-state"><p>Нет диалогов</p></div>'; return; }
  el.innerHTML = dms.map(c => chatItemHTML(c)).join('');
  el.querySelectorAll('.chat-item').forEach(item => {
    item.onclick = () => openChat(item.dataset.id);
  });
}

function renderDkSubchatList(hubId) {
  const el = $('dk-col2-list');
  // For group chats, we show them as "subchats" of the hub
  const hub = chats.find(c => c.id === hubId);
  if (!hub) { el.innerHTML = ''; return; }
  // Show the subchat channels list. For now each group is its own hub
  el.innerHTML = `
    <div class="dk-subchat-item active" data-id="${hub.id}">
      <i class="fas fa-hashtag"></i> общий
    </div>`;
  el.querySelectorAll('.dk-subchat-item').forEach(item => {
    item.onclick = () => openChat(item.dataset.id);
  });
}

function renderMobDialogList() {
  const el = $('mob-dialog-list');
  const sorted = [...chats].sort(chatSorter);
  if (!sorted.length) { el.innerHTML = '<div class="empty-state"><p>Нет чатов</p></div>'; return; }
  el.innerHTML = sorted.map(c => chatItemHTML(c)).join('');
  el.querySelectorAll('.chat-item').forEach(item => {
    item.onclick = () => { openChat(item.dataset.id); if (isMobile) showMobScreen('mob-chat'); };
  });
}

function chatItemHTML(c) {
  const name = c.displayName || c.name || 'Чат';
  const av = c.displayAvatar;
  const col = c.displayAvatarColor || '#5865f2';
  const online = c.online;
  const lm = c.lastMessage;
  const preview = lm ? (lm.type === 'text' ? lm.text : '📎 Файл') : '';
  const time = lm ? formatTime(lm.timestamp) : '';
  const unread = c.unreadCount || 0;
  return `<div class="chat-item${openChatId===c.id?' active':''}" data-id="${c.id}">
    <div class="chat-item-avatar" style="${avatarStyle(av,col)}">
      ${av?'':`<span>${initials(name)}</span>`}
      ${c.type==='private'?`<div class="chat-item-status ${online?'online':'offline'}"></div>`:''}
    </div>
    <div class="chat-item-info">
      <div class="chat-item-name">${escapeHtml(name)}</div>
      <div class="chat-item-preview">${escapeHtml(preview).slice(0,50)}</div>
    </div>
    <div class="chat-item-meta">
      <span class="chat-item-time">${time}</span>
      ${unread?`<span class="chat-item-badge">${unread}</span>`:''}
    </div>
  </div>`;
}

function chatSorter(a, b) {
  const ta = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt);
  const tb = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt);
  return tb - ta;
}

// ── Hubs ─────────────────────────────────────────────
function renderHubs() {
  // Desktop hub icons in col1
  const dkList = $('dk-hubs-list');
  const groups = chats.filter(c => c.type === 'group');
  dkList.innerHTML = groups.map(g => {
    const name = g.displayName || g.name || 'Хаб';
    const av = g.displayAvatar || g.avatar;
    const col = g.displayAvatarColor || g.avatarColor || '#5865f2';
    const active = dkMode === `hub:${g.id}`;
    return `<div class="dk-hub-icon${active?' active':''}" data-id="${g.id}" style="${avatarStyle(av,col)}" title="${escapeHtml(name)}">
      ${av?'':`<span>${initials(name)}</span>`}
    </div>`;
  }).join('');
  dkList.querySelectorAll('.dk-hub-icon').forEach(el => {
    el.onclick = () => { setDkMode(`hub:${el.dataset.id}`); };
  });

  // Mobile horizontal scroll
  const mobScroll = $('mob-hubs-scroll');
  mobScroll.innerHTML = groups.map((g,i) => {
    const name = g.displayName || g.name || 'Хаб';
    const av = g.displayAvatar || g.avatar;
    const col = g.displayAvatarColor || g.avatarColor || '#5865f2';
    return `<div class="mob-hub-icon${i===0?' selected':''}" data-id="${g.id}">
      <div class="mob-hub-icon-avatar" style="${avatarStyle(av,col)}">
        ${av?'':`<span>${initials(name)}</span>`}
      </div>
      <span class="mob-hub-icon-name">${escapeHtml(name)}</span>
    </div>`;
  }).join('');
  mobScroll.querySelectorAll('.mob-hub-icon').forEach(el => {
    el.onclick = () => {
      mobScroll.querySelectorAll('.mob-hub-icon').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      renderMobSubchats(el.dataset.id);
    };
  });
  if (groups.length) renderMobSubchats(groups[0].id);
  else $('mob-subchat-grid').innerHTML = '<div class="empty-state"><p>Создайте хаб</p></div>';
}

function renderMobSubchats(hubId) {
  const grid = $('mob-subchat-grid');
  const hub = chats.find(c => c.id === hubId);
  if (!hub) { grid.innerHTML = ''; return; }
  const tileColor = TILE_COLORS[Math.abs(hashCode(hubId)) % TILE_COLORS.length];
  grid.innerHTML = `<div class="mob-tile ${tileColor}" data-id="${hub.id}">
    <div class="mob-tile-icon"><i class="fas fa-hashtag"></i></div>
    <div class="mob-tile-name">общий</div>
    <div class="mob-tile-count">${hub.membersInfo?.length||0} участников</div>
    ${hub.unreadCount?`<div class="mob-tile-unread">${hub.unreadCount}</div>`:''}
  </div>`;
  grid.querySelectorAll('.mob-tile').forEach(t => {
    t.onclick = () => { openChat(t.dataset.id); if (isMobile) showMobScreen('mob-chat'); };
  });
}

function hashCode(s) { let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return h; }

// ── Friends ──────────────────────────────────────────
function renderFriends() {
  renderDkFriendsList();
  renderMobFriendsList();
}

let dkFriendsTab = 'online';
let mobFriendsTab = 'online';

function renderDkFriendsList() {
  if (dkMode !== 'friends') return;
  const el = $('dk-col2-list');
  el.innerHTML = friendsListHTML(dkFriendsTab);
  bindFriendActions(el);
}

function renderMobFriendsList() {
  const el = $('mob-friends-list');
  el.innerHTML = friendsListHTML(mobFriendsTab);
  bindFriendActions(el);
  const empty = $('mob-friends-empty');
  if (el.children.length === 0) { empty.classList.remove('hidden'); } else { empty.classList.add('hidden'); }
}

function friendsListHTML(tab) {
  if (tab === 'online') {
    const online = friends.filter(f => isOnline(f.id || f._id));
    if (!online.length) return '<div class="empty-state"><p>Никого нет в сети</p></div>';
    return online.map(f => friendItemHTML(f, 'friend')).join('');
  }
  if (tab === 'all') {
    if (!friends.length) return '<div class="empty-state"><p>Список друзей пуст</p></div>';
    return friends.map(f => friendItemHTML(f, 'friend')).join('');
  }
  if (tab === 'pending') {
    let html = '';
    if (pendingIn.length) {
      html += `<div style="padding:8px 12px;color:var(--text-muted);font-size:12px;font-weight:700;text-transform:uppercase">Входящие — ${pendingIn.length}</div>`;
      html += pendingIn.map(f => friendItemHTML(f, 'incoming')).join('');
    }
    if (pendingOut.length) {
      html += `<div style="padding:8px 12px;color:var(--text-muted);font-size:12px;font-weight:700;text-transform:uppercase">Исходящие — ${pendingOut.length}</div>`;
      html += pendingOut.map(f => friendItemHTML(f, 'outgoing')).join('');
    }
    if (!html) html = '<div class="empty-state"><p>Нет запросов</p></div>';
    return html;
  }
  if (tab === 'add') {
    return `<div style="padding:16px">
      <input type="text" id="dk-add-friend-input" class="modal-search" placeholder="Введите имя пользователя" style="width:100%;margin:0"/>
      <div id="dk-add-friend-results" style="margin-top:8px"></div>
    </div>`;
  }
  return '';
}

function friendItemHTML(u, type) {
  const id = u.id || u._id;
  const name = u.displayName || u.username;
  const av = u.avatar;
  const col = u.avatarColor || '#5865f2';
  const on = isOnline(id);
  let actions = '';
  if (type === 'friend') {
    actions = `<button class="icon-btn" data-action="msg" data-uid="${id}" title="Написать"><i class="fas fa-comment"></i></button>
               <button class="icon-btn" data-action="call" data-uid="${id}" title="Позвонить"><i class="fas fa-phone"></i></button>`;
  } else if (type === 'incoming') {
    actions = `<button class="icon-btn friend-accept-btn" data-action="accept" data-uid="${id}" title="Принять"><i class="fas fa-check"></i></button>
               <button class="icon-btn" data-action="reject" data-uid="${id}" title="Отклонить"><i class="fas fa-xmark"></i></button>`;
  } else if (type === 'outgoing') {
    actions = `<button class="icon-btn" data-action="cancel" data-uid="${id}" title="Отменить"><i class="fas fa-xmark"></i></button>`;
  }
  return `<div class="friend-item" data-uid="${id}">
    <div class="friend-item-avatar" style="${avatarStyle(av,col)}">
      ${av?'':`<span>${initials(name)}</span>`}
      <div class="friend-item-dot ${on?'online':'offline'}"></div>
    </div>
    <div class="friend-item-info">
      <div class="friend-item-name">${escapeHtml(name)}</div>
      <div class="friend-item-status">${on?'В сети':'Не в сети'}</div>
    </div>
    <div class="friend-item-actions">${actions}</div>
  </div>`;
}

function bindFriendActions(el) {
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const act = btn.dataset.action;
      if (act === 'msg') await startDM(uid);
      else if (act === 'call') { await startDM(uid); setTimeout(()=>window.callsModule?.startCall(uid,'audio'),200); }
      else if (act === 'accept') { await apiPost(`${API}/friends/accept/${encodeURIComponent(uid)}`); loadFriends(); }
      else if (act === 'reject') { await apiPost(`${API}/friends/reject/${encodeURIComponent(uid)}`); loadFriends(); }
      else if (act === 'cancel') { await apiDelete(`${API}/friends/${encodeURIComponent(uid)}`); loadFriends(); }
    };
  });
  el.querySelectorAll('.friend-item').forEach(item => {
    item.addEventListener('click', () => showProfileViewer(item.dataset.uid));
  });
}

// ── Mobile profile screen ────────────────────────────
function renderMobileProfile() {
  if (!currentUser) return;
  const u = currentUser;
  const avEl = $('mob-profile-avatar');
  avEl.style.cssText = avatarStyle(u.avatar, u.avatarColor);
  avEl.innerHTML = u.avatar ? '' : `<span>${initials(u.displayName)}</span>`;
  $('mob-profile-name').textContent = u.displayName;
  $('mob-profile-username').textContent = `@${u.username}`;
  $('mob-profile-bio').textContent = u.bio || '';
}

/* ══════════════════════════════════════════════════════════
   CHAT
   ══════════════════════════════════════════════════════════ */
async function openChat(chatId) {
  if (openChatId === chatId) return;
  openChatId = chatId;
  editingMsgId = null;
  replyToMsg = null;

  const chat = chats.find(c => c.id === chatId);
  if (!chat) return;

  // Load messages
  await loadMessages(chatId);
  window.State.socket?.emit('mark_read', { chatId });

  // Update headers
  const name = chat.displayName || chat.name || 'Чат';
  const av = chat.displayAvatar;
  const col = chat.displayAvatarColor || '#5865f2';
  const isPriv = chat.type === 'private';
  const otherId = isPriv ? chat.members.find(id => id !== currentUser.id) : null;
  const online = otherId ? isOnline(otherId) : false;
  const status = isPriv ? (online ? 'в сети' : 'не в сети') : `${chat.membersInfo?.length||0} участников`;

  // Desktop
  $('dk-welcome').classList.add('hidden');
  $('dk-chat').classList.remove('hidden');
  const chAv = $('ch-avatar');
  chAv.style.cssText = avatarStyle(av, col);
  chAv.innerHTML = av ? '' : `<span>${initials(name)}</span>`;
  $('chat-name').textContent = name;
  $('chat-status').textContent = status;
  $('btn-call').classList.toggle('hidden', !isPriv);
  $('btn-video-call').classList.toggle('hidden', !isPriv);

  // Mobile
  const mobAv = $('mob-ch-avatar');
  mobAv.style.cssText = avatarStyle(av, col);
  mobAv.innerHTML = av ? '' : `<span>${initials(name)}</span>`;
  $('mob-chat-name').textContent = name;
  $('mob-chat-status').textContent = status;
  $('mob-btn-call').classList.toggle('hidden', !isPriv);

  // Right panel
  renderCol4(chat);

  // Render messages
  renderMessages(chatId);

  // Reset input
  hideReplyBar();
  exitEdit();
  const inp = isMobile ? $('mob-msg-input') : $('msg-input');
  if (inp) inp.value = '';

  // Highlight in list
  renderChatLists();
}

function closeChat() {
  openChatId = null;
  $('dk-welcome').classList.remove('hidden');
  $('dk-chat').classList.add('hidden');
  $('dk-col4-content').innerHTML = '<div class="dk-col4-empty"><p>Выберите чат</p></div>';
}

function renderCol4(chat) {
  const content = $('dk-col4-content');
  const titleEl = $('dk-col4-title');
  if (chat.type === 'private') {
    titleEl.textContent = 'Профиль';
    const otherId = chat.members.find(id => id !== currentUser.id);
    const info = chat.membersInfo?.find(m => m.id === otherId);
    if (!info) {
      // fetch user info
      apiFetch(`${API}/users/${encodeURIComponent(otherId)}`).then(u => {
        renderCol4UserInfo(content, u);
      }).catch(() => { content.innerHTML = ''; });
      return;
    }
    renderCol4UserInfo(content, info);
  } else {
    titleEl.textContent = `Участники — ${chat.membersInfo?.length || 0}`;
    content.innerHTML = (chat.membersInfo || []).map(m => {
      const on = isOnline(m.id);
      return `<div class="dk-member" data-uid="${m.id}">
        <div class="dk-member-avatar" style="${avatarStyle(m.avatar, m.avatarColor)}">
          ${m.avatar?'':`<span>${initials(m.displayName)}</span>`}
          <div class="dk-member-dot ${on?'online':'offline'}"></div>
        </div>
        <div class="dk-member-info">
          <div class="dk-member-name">${escapeHtml(m.displayName)}</div>
          <div class="dk-member-role">${m.superUser?'⚡ Админ':''}</div>
        </div>
      </div>`;
    }).join('');
    content.querySelectorAll('.dk-member').forEach(el => {
      el.onclick = () => showProfileViewer(el.dataset.uid);
    });
  }
}

function renderCol4UserInfo(container, u) {
  const on = isOnline(u.id || u._id);
  container.innerHTML = `<div class="dk-user-info">
    <div class="dk-user-info-avatar" style="${avatarStyle(u.avatar, u.avatarColor)}">
      ${u.avatar?'':`<span>${initials(u.displayName)}</span>`}
    </div>
    <div class="dk-user-info-name">${escapeHtml(u.displayName)}</div>
    <div class="dk-user-info-username">@${escapeHtml(u.username)}</div>
    <div class="dk-user-info-status" style="color:${on?'var(--status-online)':'var(--text-muted)'}">${on?'В сети':'Не в сети'}</div>
    ${u.bio?`<div class="dk-user-info-bio">${escapeHtml(u.bio)}</div>`:''}
    <div class="dk-user-info-actions">
      <button class="btn-accent-sm" onclick="window.callsModule?.startCall('${u.id||u._id}','audio')"><i class="fas fa-phone"></i> Звонок</button>
    </div>
  </div>`;
}

/* ── Messages ─────────────────────────────────────────── */
function renderMessages(chatId) {
  const msgs = messages[chatId] || [];
  const dkArea = $('messages-area');
  const mobArea = $('mob-messages-area');
  const html = buildMessagesHTML(msgs);
  if (dkArea) dkArea.innerHTML = html;
  if (mobArea) mobArea.innerHTML = html;
  scrollToBottom();
  bindMessageActions();
}

function buildMessagesHTML(msgs) {
  if (!msgs.length) return '<div class="empty-state" style="padding:40px"><p>Нет сообщений</p></div>';
  let html = '';
  let lastDate = '';
  let lastSender = '';
  let lastTime = 0;
  for (const m of msgs) {
    const d = formatDate(m.timestamp);
    if (d !== lastDate) {
      html += `<div class="date-separator"><span>${d}</span></div>`;
      lastDate = d;
      lastSender = '';
    }
    const grouped = m.senderId === lastSender && (new Date(m.timestamp) - lastTime) < 300000;
    html += msgRowHTML(m, grouped);
    lastSender = m.senderId;
    lastTime = new Date(m.timestamp);
  }
  return html;
}

function msgRowHTML(m, grouped) {
  const isMine = m.senderId === currentUser?.id;
  const av = m.senderAvatar;
  const col = m.senderAvatarColor || '#5865f2';
  const name = m.senderName || 'Аноним';

  let body = '';
  if (m.replyTo) {
    const orig = (messages[m.chatId]||[]).find(x => x.id === m.replyTo || x._id === m.replyTo);
    if (orig) {
      body += `<div class="msg-reply" data-reply="${orig.id||orig._id}">
        <div class="msg-reply-av" style="${avatarStyle(orig.senderAvatar, orig.senderAvatarColor)}">${orig.senderAvatar?'':initials(orig.senderName)}</div>
        <span class="msg-reply-name">${escapeHtml(orig.senderName)}</span>
        ${escapeHtml((orig.text||'').slice(0,50))}
      </div>`;
    }
  }
  if (m.type === 'text') {
    body += `<div class="msg-text">${linkify(m.text||'')}${m.editedAt?'<span class="msg-edited"> (ред.)</span>':''}</div>`;
  } else if (m.type === 'image') {
    body += `<img class="msg-image" src="${m.fileUrl}" alt="image" loading="lazy"/>`;
    if (m.text) body += `<div class="msg-text">${linkify(m.text)}</div>`;
  } else if (m.type === 'video') {
    body += `<video class="msg-video" src="${m.fileUrl}" controls preload="metadata"></video>`;
  } else if (m.type === 'voice') {
    body += `<div class="msg-voice">
      <div class="voice-play-btn" data-src="${m.fileUrl}"><i class="fas fa-play"></i></div>
      <div class="voice-progress"><div class="voice-progress-fill" style="width:0%"></div></div>
      <span class="voice-duration">${m.duration?Math.ceil(m.duration)+'с':''}</span>
    </div>`;
  } else if (m.type === 'file') {
    body += `<a class="msg-file" href="${m.fileUrl}" target="_blank" rel="noopener noreferrer">
      <i class="fas fa-file msg-file-icon"></i>
      <div><div class="msg-file-name">${escapeHtml(m.fileName||'Файл')}</div><div class="msg-file-size">${formatFileSize(m.fileSize)}</div></div>
    </a>`;
  }

  // Reactions
  if (m.reactions && Object.keys(m.reactions).length) {
    body += '<div class="msg-reactions">';
    for (const [emoji, users] of Object.entries(m.reactions)) {
      const me = users.includes(currentUser?.id);
      body += `<button class="msg-reaction${me?' me':''}" data-mid="${m.id||m._id}" data-emoji="${emoji}">
        <span>${emoji}</span><span class="msg-reaction-count">${users.length}</span>
      </button>`;
    }
    body += '</div>';
  }

  // Actions bar
  const actions = `<div class="msg-actions">
    <button class="msg-action-btn" data-act="reply" data-mid="${m.id||m._id}" title="Ответить"><i class="fas fa-reply"></i></button>
    <button class="msg-action-btn" data-act="react" data-mid="${m.id||m._id}" title="Реакция"><i class="fas fa-face-smile"></i></button>
    ${isMine?`<button class="msg-action-btn" data-act="edit" data-mid="${m.id||m._id}" title="Редактировать"><i class="fas fa-pen"></i></button>
    <button class="msg-action-btn" data-act="delete" data-mid="${m.id||m._id}" title="Удалить"><i class="fas fa-trash"></i></button>`:''}
  </div>`;

  return `<div class="msg-row${grouped?' grouped':''}" data-mid="${m.id||m._id}" data-sender="${m.senderId}">
    <div class="msg-avatar" style="${avatarStyle(av,col)}" data-uid="${m.senderId}">
      ${av?'':`<span>${initials(name)}</span>`}
    </div>
    <span class="msg-hover-time">${formatTime(m.timestamp)}</span>
    <div class="msg-content">
      <div class="msg-header">
        <span class="msg-author" data-uid="${m.senderId}">${escapeHtml(name)}</span>
        <span class="msg-time">${formatTime(m.timestamp)}</span>
      </div>
      ${body}
    </div>
    ${actions}
  </div>`;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' КБ';
  return (bytes/1048576).toFixed(1) + ' МБ';
}

function scrollToBottom() {
  const dk = $('messages-scroll');
  const mob = $('mob-messages-scroll');
  if (dk) dk.scrollTop = dk.scrollHeight;
  if (mob) mob.scrollTop = mob.scrollHeight;
}

function bindMessageActions() {
  // Actions buttons
  document.querySelectorAll('.msg-action-btn').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const mid = btn.dataset.mid;
      const act = btn.dataset.act;
      if (act === 'reply') startReply(mid);
      else if (act === 'edit') startEdit(mid);
      else if (act === 'delete') deleteMessage(mid);
      else if (act === 'react') openEmojiForReaction(mid);
    };
  });
  // Reactions
  document.querySelectorAll('.msg-reaction').forEach(btn => {
    btn.onclick = () => {
      const mid = btn.dataset.mid;
      const emoji = btn.dataset.emoji;
      apiPost(`${API}/messages/${encodeURIComponent(mid)}/react`, { emoji });
    };
  });
  // Images
  document.querySelectorAll('.msg-image').forEach(img => {
    img.onclick = () => openLightbox(img.src);
  });
  // Avatars / author names -> profile
  document.querySelectorAll('.msg-avatar[data-uid], .msg-author[data-uid]').forEach(el => {
    el.onclick = () => showProfileViewer(el.dataset.uid);
  });
  // Voice
  document.querySelectorAll('.voice-play-btn').forEach(btn => {
    btn.onclick = () => playVoice(btn);
  });
  // Reply click
  document.querySelectorAll('.msg-reply').forEach(el => {
    el.onclick = () => {
      const rid = el.dataset.reply;
      const row = document.querySelector(`.msg-row[data-mid="${rid}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });
}

/* ── Send / Edit / Reply / Delete ─────────────────────── */
async function sendMessage() {
  const input = isMobile ? $('mob-msg-input') : $('msg-input');
  const text = input.value.trim();
  if (!text || !openChatId) return;

  if (editingMsgId) {
    await apiPut(`${API}/messages/${encodeURIComponent(editingMsgId)}`, { text });
    exitEdit();
  } else {
    const body = { text };
    if (replyToMsg) body.replyTo = replyToMsg;
    await apiPost(`${API}/chats/${encodeURIComponent(openChatId)}/messages`, body);
    hideReplyBar();
  }
  input.value = '';
  autoResizeTextarea(input);
  window.State.socket?.emit('typing_stop', { chatId: openChatId });
}

function startReply(mid) {
  const msg = findMessage(mid);
  if (!msg) return;
  replyToMsg = mid;
  // Desktop
  $('reply-bar').classList.remove('hidden');
  $('reply-name').textContent = msg.senderName || 'Аноним';
  $('reply-text').textContent = (msg.text || '').slice(0, 50);
  $('chat-input-inner').classList.add('has-reply');
  // Mobile
  $('mob-reply-bar').classList.remove('hidden');
  $('mob-reply-name').textContent = msg.senderName || 'Аноним';
  $('mob-reply-text').textContent = (msg.text || '').slice(0, 50);
  $('mob-chat-input-inner').classList.add('has-reply');
  // Focus
  (isMobile ? $('mob-msg-input') : $('msg-input')).focus();
}

function hideReplyBar() {
  replyToMsg = null;
  $('reply-bar').classList.add('hidden');
  $('mob-reply-bar').classList.add('hidden');
  $('chat-input-inner').classList.remove('has-reply');
  $('mob-chat-input-inner').classList.remove('has-reply');
}

function startEdit(mid) {
  const msg = findMessage(mid);
  if (!msg || msg.senderId !== currentUser?.id) return;
  editingMsgId = mid;
  const input = isMobile ? $('mob-msg-input') : $('msg-input');
  input.value = msg.text || '';
  autoResizeTextarea(input);
  (isMobile ? $('mob-chat-input-inner') : $('chat-input-inner')).classList.add('editing');
  input.focus();
}

function exitEdit() {
  editingMsgId = null;
  $('chat-input-inner')?.classList.remove('editing');
  $('mob-chat-input-inner')?.classList.remove('editing');
}

async function deleteMessage(mid) {
  if (!confirm('Удалить сообщение?')) return;
  await apiDelete(`${API}/messages/${encodeURIComponent(mid)}`);
}

function findMessage(mid) {
  for (const arr of Object.values(messages)) {
    const m = arr.find(x => (x.id||x._id) === mid);
    if (m) return m;
  }
  return null;
}

/* ── File upload ──────────────────────────────────────── */
function initFileUpload() {
  const fileInput = $('file-input');
  $('btn-attach').onclick = () => fileInput.click();
  $('mob-btn-attach').onclick = () => fileInput.click();
  fileInput.onchange = () => uploadFiles(fileInput.files);

  // Paste
  document.addEventListener('paste', e => {
    if (!openChatId) return;
    const files = e.clipboardData?.files;
    if (files?.length) { e.preventDefault(); uploadFiles(files); }
  });
}

async function uploadFiles(fileList) {
  if (!openChatId || !fileList.length) return;
  for (const file of fileList) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch(`${API}/chats/${encodeURIComponent(openChatId)}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        body: fd,
      });
    } catch (e) { showToast('Ошибка загрузки файла', 'error'); }
  }
}

/* ── Typing ───────────────────────────────────────────── */
function initTyping(input) {
  let typing = false;
  input.addEventListener('input', () => {
    if (!openChatId) return;
    if (!typing) {
      typing = true;
      window.State.socket?.emit('typing_start', { chatId: openChatId });
    }
    clearTimeout(typingTimers[openChatId + '_self']);
    typingTimers[openChatId + '_self'] = setTimeout(() => {
      typing = false;
      window.State.socket?.emit('typing_stop', { chatId: openChatId });
    }, 3000);
  });
}

let typingUsers = {}; // chatId -> Set of userIds
function onTyping(userId, chatId, start) {
  if (userId === currentUser?.id) return;
  if (!typingUsers[chatId]) typingUsers[chatId] = new Set();
  if (start) typingUsers[chatId].add(userId);
  else typingUsers[chatId].delete(userId);
  updateTypingBar(chatId);
}
function updateTypingBar(chatId) {
  if (chatId !== openChatId) return;
  const users = typingUsers[chatId];
  const show = users && users.size > 0;
  $('typing-bar').classList.toggle('hidden', !show);
  $('mob-typing-bar').classList.toggle('hidden', !show);
  if (show) {
    const names = [...users].slice(0, 3).map(uid => {
      const f = friends.find(x => (x.id||x._id) === uid);
      return f?.displayName || 'Кто-то';
    }).join(', ');
    const text = `${names} печатает...`;
    $('typing-text').textContent = text;
    $('mob-typing-text').textContent = text;
  }
}

/* ── Socket events for messages ───────────────────────── */
function onNewMessage(msg) {
  if (!messages[msg.chatId]) messages[msg.chatId] = [];
  messages[msg.chatId].push(msg);

  // Update chat in list
  const ci = chats.findIndex(c => c.id === msg.chatId);
  if (ci >= 0) {
    chats[ci].lastMessage = msg;
    if (msg.chatId !== openChatId) chats[ci].unreadCount = (chats[ci].unreadCount || 0) + 1;
  }

  if (msg.chatId === openChatId) {
    renderMessages(msg.chatId);
    window.State.socket?.emit('mark_read', { chatId: msg.chatId });
  }
  renderChatLists();

  // Notification
  if (msg.senderId !== currentUser?.id && msg.chatId !== openChatId) {
    showToast(`${msg.senderName}: ${(msg.text||'📎').slice(0,30)}`, 'info');
  }
}

function onMessageEdited(msg) {
  const arr = messages[msg.chatId];
  if (!arr) return;
  const i = arr.findIndex(m => (m.id||m._id) === (msg.id||msg._id));
  if (i >= 0) { arr[i] = msg; if (msg.chatId === openChatId) renderMessages(msg.chatId); }
}

function onMessageDeleted(messageId, chatId) {
  const arr = messages[chatId];
  if (!arr) return;
  const i = arr.findIndex(m => (m.id||m._id) === messageId);
  if (i >= 0) { arr.splice(i, 1); if (chatId === openChatId) renderMessages(chatId); }
}

function onMessageReaction(messageId, reactions) {
  for (const [cid, arr] of Object.entries(messages)) {
    const m = arr.find(x => (x.id||x._id) === messageId);
    if (m) { m.reactions = reactions; if (cid === openChatId) renderMessages(cid); break; }
  }
}

function onMessagesRead(chatId) {
  const ci = chats.findIndex(c => c.id === chatId);
  if (ci >= 0) chats[ci].unreadCount = 0;
  renderChatLists();
}

/* ── Online status refresh ────────────────────────────── */
function refreshOnlineStatus(userId) {
  renderChatLists();
  renderFriends();
  if (openChatId) {
    const chat = chats.find(c => c.id === openChatId);
    if (chat) {
      const isPriv = chat.type === 'private';
      const otherId = isPriv ? chat.members.find(id => id !== currentUser.id) : null;
      if (otherId === userId) {
        const on = isOnline(userId);
        $('chat-status').textContent = on ? 'в сети' : 'не в сети';
        $('mob-chat-status').textContent = on ? 'в сети' : 'не в сети';
      }
      renderCol4(chat);
    }
  }
}

/* ══════════════════════════════════════════════════════════
   DM
   ══════════════════════════════════════════════════════════ */
async function startDM(userId) {
  // Check existing
  const existing = chats.find(c => c.type === 'private' && c.members.includes(userId));
  if (existing) {
    openChat(existing.id);
    if (isMobile) showMobScreen('mob-chat');
    return;
  }
  try {
    const chat = await apiPost(`${API}/chats`, { memberId: userId });
    chats.push(chat);
    renderChatLists();
    openChat(chat.id);
    if (isMobile) showMobScreen('mob-chat');
  } catch (e) { showToast(e.error || 'Ошибка', 'error'); }
}

/* ══════════════════════════════════════════════════════════
   MOBILE NAVIGATION
   ══════════════════════════════════════════════════════════ */
let currentMobScreen = 'mob-hubs';

function showMobScreen(screenId) {
  currentMobScreen = screenId;
  document.querySelectorAll('.mob-screen').forEach(s => s.classList.remove('active'));
  $(screenId)?.classList.add('active');

  // Bottom nav visibility
  const nav = $('bottom-nav');
  if (screenId === 'mob-chat') {
    nav.classList.add('hidden');
  } else {
    nav.classList.remove('hidden');
    // Update active
    document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
    const map = { 'mob-hubs': 'bnav-hubs', 'mob-chats': 'bnav-chats', 'mob-friends': 'bnav-friends', 'mob-profile': 'bnav-profile' };
    $(map[screenId])?.classList.add('active');
  }
}

function initMobileNav() {
  $('bnav-hubs').onclick = () => showMobScreen('mob-hubs');
  $('bnav-chats').onclick = () => showMobScreen('mob-chats');
  $('bnav-friends').onclick = () => showMobScreen('mob-friends');
  $('bnav-profile').onclick = () => showMobScreen('mob-profile');
  $('mob-chat-back').onclick = () => {
    openChatId = null;
    showMobScreen(currentMobScreen === 'mob-chat' ? 'mob-chats' : currentMobScreen);
  };
}

/* ══════════════════════════════════════════════════════════
   DESKTOP NAVIGATION
   ══════════════════════════════════════════════════════════ */
function initDesktopNav() {
  $('dk-nav-dms').onclick = () => {
    $('dk-nav-dms').classList.add('active');
    $('dk-nav-friends').classList.remove('active');
    setDkMode('dms');
  };
  $('dk-nav-friends').onclick = () => {
    $('dk-nav-friends').classList.add('active');
    $('dk-nav-dms').classList.remove('active');
    setDkMode('friends');
  };
  $('dk-user-avatar').onclick = () => openSettings();

  $('dk-col2-action').onclick = () => {
    if (dkMode === 'dms') openNewChatModal();
    else if (dkMode === 'friends') openNewChatModal(); // search for friends
  };

  // Desktop friends tabs
  $('dk-friends-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.ftab');
    if (!tab) return;
    $('dk-friends-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    dkFriendsTab = tab.dataset.tab;
    renderDkFriendsList();

    // Add friend search
    if (dkFriendsTab === 'add') {
      setTimeout(() => {
        const inp = $('dk-add-friend-input');
        if (inp) {
          inp.focus();
          inp.oninput = debounce(async () => {
            const q = inp.value.trim();
            if (q.length < 2) { $('dk-add-friend-results').innerHTML = ''; return; }
            const users = await apiFetch(`${API}/users/search?q=${encodeURIComponent(q)}`);
            $('dk-add-friend-results').innerHTML = users.filter(u => u.id !== currentUser.id).map(u =>
              `<div class="friend-item" style="cursor:pointer" data-uid="${u.id}">
                <div class="friend-item-avatar" style="${avatarStyle(u.avatar,u.avatarColor)}">${u.avatar?'':initials(u.displayName)}</div>
                <div class="friend-item-info"><div class="friend-item-name">${escapeHtml(u.displayName)}</div><div class="friend-item-status">@${escapeHtml(u.username)}</div></div>
                <div class="friend-item-actions"><button class="btn-accent-sm" data-action="add-friend" data-uid="${u.id}">Добавить</button></div>
              </div>`
            ).join('') || '<div class="empty-state"><p>Не найдено</p></div>';
            $('dk-add-friend-results').querySelectorAll('[data-action="add-friend"]').forEach(btn => {
              btn.onclick = async () => {
                await apiPost(`${API}/friends/request`, { userId: btn.dataset.uid });
                showToast('Запрос отправлен', 'success');
                loadFriends();
              };
            });
          }, 300);
        }
      }, 50);
    }
  });

  // Search in col2
  $('dk-col2-search-input').oninput = debounce(() => {
    const q = $('dk-col2-search-input').value.trim().toLowerCase();
    filterDkList(q);
  }, 200);
}

function filterDkList(q) {
  const items = $('dk-col2-list').querySelectorAll('.chat-item, .friend-item, .dk-subchat-item');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

/* ══════════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════════ */
function openNewChatModal() {
  $('modal-new-chat').classList.remove('hidden');
  $('new-chat-search').value = '';
  $('new-chat-results').innerHTML = '';
  $('new-chat-search').focus();
}

function initModals() {
  // New chat
  $('modal-new-chat-close').onclick = () => $('modal-new-chat').classList.add('hidden');
  $('new-chat-search').oninput = debounce(async () => {
    const q = $('new-chat-search').value.trim();
    if (q.length < 2) { $('new-chat-results').innerHTML = ''; return; }
    const users = await apiFetch(`${API}/users/search?q=${encodeURIComponent(q)}`);
    $('new-chat-results').innerHTML = users.filter(u => u.id !== currentUser.id).map(u =>
      `<div class="modal-result-item" data-uid="${u.id}">
        <div class="modal-result-av" style="${avatarStyle(u.avatar,u.avatarColor)}">${u.avatar?'':initials(u.displayName)}</div>
        <span class="modal-result-name">${escapeHtml(u.displayName)}</span>
        <span class="modal-result-tag">@${escapeHtml(u.username)}</span>
      </div>`
    ).join('') || '<div style="padding:16px;color:var(--text-muted)">Не найдено</div>';
    $('new-chat-results').querySelectorAll('.modal-result-item').forEach(item => {
      item.onclick = async () => {
        await startDM(item.dataset.uid);
        $('modal-new-chat').classList.add('hidden');
      };
    });
  }, 300);
  $('mob-new-dm').onclick = () => openNewChatModal();

  // New hub/group
  $('dk-hub-add').onclick = () => openNewGroupModal();
  $('mob-hub-add').onclick = () => openNewGroupModal();
  $('modal-new-group-close').onclick = () => $('modal-new-group').classList.add('hidden');
  $('btn-cancel-group').onclick = () => $('modal-new-group').classList.add('hidden');

  let selectedMembers = [];
  $('group-member-search').oninput = debounce(async () => {
    const q = $('group-member-search').value.trim();
    if (q.length < 2) { $('group-search-results').innerHTML = ''; return; }
    const users = await apiFetch(`${API}/users/search?q=${encodeURIComponent(q)}`);
    $('group-search-results').innerHTML = users
      .filter(u => u.id !== currentUser.id && !selectedMembers.includes(u.id))
      .map(u => `<div class="modal-result-item" data-uid="${u.id}">
        <div class="modal-result-av" style="${avatarStyle(u.avatar,u.avatarColor)}">${u.avatar?'':initials(u.displayName)}</div>
        <span class="modal-result-name">${escapeHtml(u.displayName)}</span>
      </div>`).join('');
    $('group-search-results').querySelectorAll('.modal-result-item').forEach(item => {
      item.onclick = () => {
        selectedMembers.push(item.dataset.uid);
        const name = item.querySelector('.modal-result-name').textContent;
        renderGroupTags(selectedMembers, name);
        $('group-member-search').value = '';
        $('group-search-results').innerHTML = '';
      };
    });
  }, 300);

  function renderGroupTags() {
    // Simple: just show count
    $('group-selected').innerHTML = selectedMembers.map((id, i) =>
      `<span class="modal-tag">Участник ${i+1} <button onclick="this.parentElement.remove()">×</button></span>`
    ).join('');
  }

  $('btn-create-group').onclick = async () => {
    const name = $('group-name-input').value.trim();
    if (!name) { showToast('Введите название', 'error'); return; }
    try {
      const chat = await apiPost(`${API}/chats/group`, { name, members: selectedMembers });
      chats.push(chat);
      renderChatLists();
      openChat(chat.id);
      $('modal-new-group').classList.add('hidden');
      selectedMembers = [];
      $('group-selected').innerHTML = '';
      $('group-name-input').value = '';
    } catch (e) { showToast(e.error || 'Ошибка', 'error'); }
  };

  // Mobile friend add
  $('mob-add-friend').onclick = () => openNewChatModal(); // reuse search modal to find and add friends

  // Mobile friends tabs
  $('mob-friends-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.ftab');
    if (!tab) return;
    $('mob-friends-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    mobFriendsTab = tab.dataset.tab;
    renderMobFriendsList();
  });

  // Mobile search
  $('mob-chats-search').oninput = debounce(() => {
    const q = $('mob-chats-search').value.trim().toLowerCase();
    $('mob-dialog-list').querySelectorAll('.chat-item').forEach(item => {
      item.style.display = !q || item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }, 200);

  $('mob-friends-search').oninput = debounce(() => {
    const q = $('mob-friends-search').value.trim().toLowerCase();
    $('mob-friends-list').querySelectorAll('.friend-item').forEach(item => {
      item.style.display = !q || item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }, 200);

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov && ov.id !== 'modal-settings') ov.classList.add('hidden');
    });
  });
}

function openNewGroupModal() {
  $('modal-new-group').classList.remove('hidden');
  $('group-name-input').value = '';
  $('group-member-search').value = '';
  $('group-search-results').innerHTML = '';
  $('group-selected').innerHTML = '';
  $('group-name-input').focus();
}

/* ══════════════════════════════════════════════════════════
   PROFILE VIEWER
   ══════════════════════════════════════════════════════════ */
async function showProfileViewer(userId) {
  try {
    const u = await apiFetch(`${API}/users/${encodeURIComponent(userId)}`);
    const pv = $('profile-viewer');
    pv.classList.remove('hidden');
    const on = isOnline(u.id || u._id);
    $('pv-avatar').style.cssText = avatarStyle(u.avatar, u.avatarColor);
    $('pv-avatar').innerHTML = u.avatar ? '' : `<span>${initials(u.displayName)}</span>`;
    $('pv-name').textContent = u.displayName;
    $('pv-username').textContent = `@${u.username}`;
    $('pv-status').textContent = on ? '🟢 В сети' : '⚫ Не в сети';
    $('pv-status').style.color = on ? 'var(--status-online)' : 'var(--text-muted)';
    $('pv-bio').textContent = u.bio || '';
    $('pv-mutual').textContent = '';

    $('pv-msg-btn').onclick = async () => { pv.classList.add('hidden'); await startDM(u.id||u._id); };
    $('pv-call-btn').onclick = () => { pv.classList.add('hidden'); window.callsModule?.startCall(u.id||u._id, 'audio'); };
  } catch { showToast('Не удалось загрузить профиль', 'error'); }
}

function initProfileViewer() {
  $('pv-close').onclick = () => $('profile-viewer').classList.add('hidden');
  $('profile-viewer').addEventListener('click', e => {
    if (e.target.id === 'profile-viewer') $('profile-viewer').classList.add('hidden');
  });
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════ */
function openSettings() {
  $('modal-settings').classList.remove('hidden');
  updateSettingsProfile();
}

function initSettings() {
  $('settings-close-btn').onclick = () => $('modal-settings').classList.add('hidden');

  // Nav
  document.querySelectorAll('.settings-nav-item[data-section]').forEach(item => {
    item.onclick = () => {
      document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.settings-page').forEach(p => p.classList.add('hidden'));
      const section = item.dataset.section;
      $(`settings-${section}`)?.classList.remove('hidden');
    };
  });

  // Mobile settings access
  $('mob-btn-settings').onclick = () => openSettings();
  $('mob-btn-edit-profile').onclick = () => {
    openSettings();
    setTimeout(() => {
      document.querySelector('.settings-nav-item[data-section="profiles"]')?.click();
    }, 100);
  };

  // Desktop chat info
  $('btn-chat-info').onclick = () => {
    const col4 = $('dk-col4');
    col4.style.display = col4.style.display === 'none' ? '' : 'none';
  };

  // Mobile chat profile
  $('mob-btn-chat-profile').onclick = () => {
    if (!openChatId) return;
    const chat = chats.find(c => c.id === openChatId);
    if (chat?.type === 'private') {
      const otherId = chat.members.find(id => id !== currentUser.id);
      if (otherId) showProfileViewer(otherId);
    }
  };

  // Edit profile
  $('btn-edit-profile').onclick = () => {
    const p = $('edit-profile-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) {
      $('set-displayname').value = currentUser.displayName;
      $('set-username').value = currentUser.username;
      $('set-bio').value = currentUser.bio || '';
    }
  };
  $('btn-cancel-edit').onclick = () => $('edit-profile-panel').classList.add('hidden');
  $('btn-save-profile').onclick = async () => {
    const data = {};
    const dn = $('set-displayname').value.trim();
    const un = $('set-username').value.trim();
    const bio = $('set-bio').value.trim();
    if (dn) data.displayName = dn;
    if (un) data.username = un;
    data.bio = bio;
    try {
      currentUser = await apiPut(`${API}/me`, data);
      window.State.user = currentUser;
      showToast('Профиль обновлён', 'success');
      updateProfileUI();
      $('edit-profile-panel').classList.add('hidden');
    } catch (e) { showToast(e.error || 'Ошибка', 'error'); }
  };

  // Password
  $('btn-change-pw').onclick = async () => {
    const cur = $('set-cur-pw').value;
    const nw = $('set-new-pw').value;
    if (!cur || !nw) return;
    try {
      await apiPut(`${API}/me/password`, { currentPassword: cur, newPassword: nw });
      showToast('Пароль изменён', 'success');
      $('set-cur-pw').value = '';
      $('set-new-pw').value = '';
    } catch (e) { showToast(e.error || 'Ошибка', 'error'); }
  };

  // Avatar
  $('btn-upload-avatar').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('avatar', file);
      try {
        const res = await fetch(`${API}/me/avatar`, { method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd });
        const data = await res.json();
        currentUser.avatar = data.avatar;
        window.State.user = currentUser;
        updateProfileUI();
        showToast('Аватар обновлён', 'success');
      } catch { showToast('Ошибка загрузки', 'error'); }
    };
    inp.click();
  };

  // About me
  $('set-about-me').oninput = () => {
    $('about-me-count').textContent = $('set-about-me').value.length;
  };

  // Theme
  $('theme-options').addEventListener('change', e => {
    if (e.target.name === 'theme') {
      applyTheme(e.target.value);
      document.querySelectorAll('.theme-option').forEach(o => o.classList.toggle('selected', o.querySelector('input').checked));
    }
  });

  // Font size
  $('font-size-slider').oninput = () => {
    const v = $('font-size-slider').value;
    applyFontSize(parseInt(v));
    $('font-size-preview').textContent = `Текущий: ${v}px`;
  };

  // Logout
  $('btn-settings-logout').onclick = logout;
  $('mob-btn-logout').onclick = logout;

  // Calls
  $('btn-call').onclick = () => {
    if (!openChatId) return;
    const chat = chats.find(c => c.id === openChatId);
    if (chat?.type === 'private') {
      const otherId = chat.members.find(id => id !== currentUser.id);
      if (otherId) window.callsModule?.startCall(otherId, 'audio');
    }
  };
  $('btn-video-call').onclick = () => {
    if (!openChatId) return;
    const chat = chats.find(c => c.id === openChatId);
    if (chat?.type === 'private') {
      const otherId = chat.members.find(id => id !== currentUser.id);
      if (otherId) window.callsModule?.startCall(otherId, 'video');
    }
  };
  $('mob-btn-call').onclick = () => {
    if (!openChatId) return;
    const chat = chats.find(c => c.id === openChatId);
    if (chat?.type === 'private') {
      const otherId = chat.members.find(id => id !== currentUser.id);
      if (otherId) window.callsModule?.startCall(otherId, 'audio');
    }
  };

  // Incoming call
  $('btn-accept-call').onclick = () => window.callsModule?.acceptCall();
  $('btn-reject-call').onclick = () => window.callsModule?.endCall();
  $('btn-end-call').onclick = () => window.callsModule?.endCall();
  $('toggle-mute').onclick = () => window.callsModule?.toggleMute();
  $('toggle-video').onclick = () => window.callsModule?.toggleVideo();
  $('toggle-screen').onclick = () => {
    const cm = window.callsModule;
    if (cm?.isScreenSharing?.()) cm.stopScreenShare();
    else cm?.startScreenShare();
  };
}

function updateSettingsProfile() {
  if (!currentUser) return;
  const u = currentUser;
  $('sc-avatar').style.cssText = avatarStyle(u.avatar, u.avatarColor);
  $('sc-avatar').innerHTML = u.avatar ? '' : initials(u.displayName);
  $('sc-name').textContent = u.displayName;
  $('sc-tag').textContent = `@${u.username}`;
  $('sc-displayname').textContent = u.displayName;
  $('sc-username').textContent = u.username;
  if ($('avatar-upload-preview')) {
    $('avatar-upload-preview').style.cssText = avatarStyle(u.avatar, u.avatarColor);
    $('avatar-upload-preview').innerHTML = u.avatar ? '' : `<i class="fas fa-camera"></i>`;
  }
}

function updateProfileUI() {
  if (!currentUser) return;
  // Desktop user pill
  const av = $('dk-user-avatar');
  av.style.cssText = avatarStyle(currentUser.avatar, currentUser.avatarColor);
  av.innerHTML = currentUser.avatar ? '' : initials(currentUser.displayName);
  // Mobile profile
  renderMobileProfile();
  // Settings
  updateSettingsProfile();
}

function logout() {
  TOKEN = '';
  localStorage.removeItem('token');
  window.State.socket?.disconnect();
  window.State.socket = null;
  window.State.user = null;
  currentUser = null;
  chats = [];
  messages = {};
  openChatId = null;
  showAuth();
  $('modal-settings').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   THEMES
   ══════════════════════════════════════════════════════════ */
function applyTheme(name) {
  const vars = THEMES[name];
  if (!vars) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${vars['--accent-color']}, ${lighten(vars['--accent-color'], 20)})`);
  root.style.setProperty('--glow', hexToRgba(vars['--accent-color'], 0.3));
  localStorage.setItem('theme', name);

  // Update radio
  const radio = document.querySelector(`input[name="theme"][value="${name}"]`);
  if (radio) { radio.checked = true; document.querySelectorAll('.theme-option').forEach(o => o.classList.toggle('selected', o.querySelector('input')?.checked)); }
}

function applyFontSize(px) {
  document.documentElement.style.setProperty('font-size', px + 'px');
  localStorage.setItem('fontSize', px);
  if ($('font-size-slider')) $('font-size-slider').value = px;
  if ($('font-size-preview')) $('font-size-preview').textContent = `Текущий: ${px}px`;
}

function lighten(hex, pct) {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r + Math.round((255-r)*(pct/100)));
  g = Math.min(255, g + Math.round((255-g)*(pct/100)));
  b = Math.min(255, b + Math.round((255-b)*(pct/100)));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ══════════════════════════════════════════════════════════
   EMOJI PICKER
   ══════════════════════════════════════════════════════════ */
const EMOJI_LIST = ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤔','😏','😢','😭','😤','🤬','🥺','😴','🤮','🤯','🥳','😇','🤡','💀','👻','👽','🤖','💩','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💯','✨','🔥','⭐','🌈','🎉','🎊','💪','👍','👎','👏','🙌','🤝','✌️','🤞','👋','✋','🖐️','🫡','🫶','🫵'];
let reactionTargetMid = null;

function initEmoji() {
  const grid = $('ep-grid');
  grid.innerHTML = EMOJI_LIST.map(e => `<button class="emoji-btn">${e}</button>`).join('');
  grid.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.onclick = () => {
      if (reactionTargetMid) {
        apiPost(`${API}/messages/${encodeURIComponent(reactionTargetMid)}/react`, { emoji: btn.textContent });
        reactionTargetMid = null;
        $('emoji-picker').classList.add('hidden');
      } else {
        const input = isMobile ? $('mob-msg-input') : $('msg-input');
        input.value += btn.textContent;
        input.focus();
        $('emoji-picker').classList.add('hidden');
      }
    };
  });

  $('ep-search').oninput = () => {
    const q = $('ep-search').value.trim().toLowerCase();
    grid.querySelectorAll('.emoji-btn').forEach(b => b.style.display = '');
    // Simple filter — no real search, just show all
  };

  $('btn-emoji').onclick = () => toggleEmojiPicker();
  $('mob-btn-emoji').onclick = () => toggleEmojiPicker();
}

function toggleEmojiPicker() {
  reactionTargetMid = null;
  $('emoji-picker').classList.toggle('hidden');
}

function openEmojiForReaction(mid) {
  reactionTargetMid = mid;
  $('emoji-picker').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════
   CONTEXT MENU
   ══════════════════════════════════════════════════════════ */
function initContextMenu() {
  document.addEventListener('contextmenu', e => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    e.preventDefault();
    const mid = row.dataset.mid;
    const isMine = row.dataset.sender === currentUser?.id;
    const menu = $('ctx-menu');
    menu.classList.remove('hidden');
    // Position
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    // Show/hide edit & delete
    menu.querySelector('[data-action="edit"]').style.display = isMine ? '' : 'none';
    menu.querySelector('[data-action="delete"]').style.display = isMine ? '' : 'none';
    // Bind
    menu.querySelectorAll('.ctx-item').forEach(item => {
      item.onclick = () => {
        menu.classList.add('hidden');
        const act = item.dataset.action;
        if (act === 'reply') startReply(mid);
        else if (act === 'edit') startEdit(mid);
        else if (act === 'delete') deleteMessage(mid);
        else if (act === 'react') openEmojiForReaction(mid);
      };
    });
  });
  document.addEventListener('click', () => $('ctx-menu').classList.add('hidden'));
}

/* ══════════════════════════════════════════════════════════
   LIGHTBOX
   ══════════════════════════════════════════════════════════ */
function openLightbox(src) {
  $('lightbox-img').src = src;
  $('lightbox').classList.remove('hidden');
}
function initLightbox() {
  $('lightbox').onclick = () => $('lightbox').classList.add('hidden');
  $('lightbox-close').onclick = () => $('lightbox').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   VOICE PLAYBACK
   ══════════════════════════════════════════════════════════ */
let currentAudio = null;
function playVoice(btn) {
  const src = btn.dataset.src;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const audio = new Audio(src);
  currentAudio = audio;
  const fill = btn.closest('.msg-voice').querySelector('.voice-progress-fill');
  const dur = btn.closest('.msg-voice').querySelector('.voice-duration');
  btn.innerHTML = '<i class="fas fa-pause"></i>';
  audio.play();
  audio.ontimeupdate = () => {
    if (audio.duration) {
      fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
      dur.textContent = Math.ceil(audio.duration - audio.currentTime) + 'с';
    }
  };
  audio.onended = () => {
    btn.innerHTML = '<i class="fas fa-play"></i>';
    fill.style.width = '0%';
    currentAudio = null;
  };
  btn.onclick = () => {
    if (audio.paused) { audio.play(); btn.innerHTML = '<i class="fas fa-pause"></i>'; }
    else { audio.pause(); btn.innerHTML = '<i class="fas fa-play"></i>'; }
  };
}

/* ══════════════════════════════════════════════════════════
   TEXTAREA AUTO-RESIZE
   ══════════════════════════════════════════════════════════ */
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function initInputs() {
  const dk = $('msg-input');
  const mob = $('mob-msg-input');

  [dk, mob].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => autoResizeTextarea(inp));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    initTyping(inp);
  });
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════ */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('emoji-picker').classList.contains('hidden')) { $('emoji-picker').classList.add('hidden'); return; }
      if (!$('lightbox').classList.contains('hidden')) { $('lightbox').classList.add('hidden'); return; }
      if (!$('profile-viewer').classList.contains('hidden')) { $('profile-viewer').classList.add('hidden'); return; }
      if (!$('modal-settings').classList.contains('hidden')) { $('modal-settings').classList.add('hidden'); return; }
      if (!$('modal-new-chat').classList.contains('hidden')) { $('modal-new-chat').classList.add('hidden'); return; }
      if (!$('modal-new-group').classList.contains('hidden')) { $('modal-new-group').classList.add('hidden'); return; }
      if (editingMsgId) { exitEdit(); const inp = isMobile?$('mob-msg-input'):$('msg-input'); if(inp) inp.value=''; return; }
      if (replyToMsg) { hideReplyBar(); return; }
    }
  });
}

/* ══════════════════════════════════════════════════════════
   RESIZE HANDLER
   ══════════════════════════════════════════════════════════ */
function initResize() {
  let prev = isMobile;
  window.addEventListener('resize', debounce(() => {
    detectMode();
    if (prev !== isMobile) {
      prev = isMobile;
      renderAll();
      if (openChatId) {
        if (isMobile) showMobScreen('mob-chat');
        renderMessages(openChatId);
      }
    }
  }, 200));
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  detectMode();
  initAuth();
  initMobileNav();
  initDesktopNav();
  initModals();
  initSettings();
  initProfileViewer();
  initEmoji();
  initContextMenu();
  initLightbox();
  initFileUpload();
  initInputs();
  initKeyboard();
  initResize();

  if (TOKEN) bootstrap();
  else showAuth();
});
