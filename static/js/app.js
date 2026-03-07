/* ═══════════════════════════════════════════════════════════
   Shadow Messenger — Discord-Clone  (app.js)
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ── State ───────────────────────────────────────────── */
const S = {
  token: null, user: null, chats: [], activeChat: null, messages: [],
  socket: null, replyTo: null, editingMsgId: null,
  membersVisible: false, emojiOpen: false,
  sidebarOpen: false, settingsOpen: false,
};
window.State = S;

/* ── DOM helpers ─────────────────────────────────────── */
const $ = id => document.getElementById(id);
const on = (el, ev, fn, opts) => { if (typeof el === 'string') el = $(el); if (el) el.addEventListener(ev, fn, opts); };
const qsa = (sel, root) => (root || document).querySelectorAll(sel);
const qs = (sel, root) => (root || document).querySelector(sel);
const isMobile = () => window.innerWidth <= 768;

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
function fmtFullDate(iso) {
  const d = new Date(iso);
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}
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

/* ── API helper — auto-logout on 401 ─────────────────── */
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
   AUTH
   ══════════════════════════════════════════════════════════ */
function initAuth() {
  on('show-register', 'click', e => { e.preventDefault(); $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); });
  on('show-login',    'click', e => { e.preventDefault(); $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); });

  on('btn-login', 'click', async () => {
    $('login-error').textContent = '';
    try {
      const d = await API.post('/api/login', {
        username: $('li-username').value.trim(),
        password: $('li-password').value,
      });
      await onLogin(d);
    } catch (err) { $('login-error').textContent = err.message; }
  });
  ['li-username', 'li-password'].forEach(id => on(id, 'keydown', e => { if (e.key === 'Enter') $('btn-login').click(); }));

  on('btn-register', 'click', async () => {
    $('reg-error').textContent = '';
    if ($('rg-password').value !== $('rg-password2').value) { $('reg-error').textContent = 'Пароли не совпадают'; return; }
    try {
      const d = await API.post('/api/register', {
        username:    $('rg-username').value.trim(),
        displayName: $('rg-displayname').value.trim(),
        password:    $('rg-password').value,
      });
      await onLogin(d);
    } catch (err) { $('reg-error').textContent = err.message; }
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
  updateUserPanel();
  initSocket();
  loadChats();
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

function updateUserPanel() {
  if (!S.user) return;
  const av = $('my-avatar');
  if (S.user.avatar) { av.style.backgroundImage = `url(${S.user.avatar})`; av.textContent = ''; }
  else { av.style.backgroundImage = ''; av.style.backgroundColor = S.user.avatarColor || '#5865f2'; av.textContent = avatarText(S.user.displayName); }
  $('my-name').textContent = S.user.displayName;
  $('my-tag').textContent = S.user.username;
}

/* ── Auto-login with token validation ────────────────── */
async function tryAutoLogin() {
  const token = localStorage.getItem('sm_token');
  const userJson = localStorage.getItem('sm_user');
  if (!token || !userJson) return;
  S.token = token;
  try { S.user = JSON.parse(userJson); } catch { return; }
  if (!S.user) return;
  // Validate token with server
  try {
    const freshUser = await API.get('/api/me');
    S.user = freshUser;
    localStorage.setItem('sm_user', JSON.stringify(freshUser));
    showApp();
  } catch {
    // Token invalid — clear and stay on login
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
  sk.on('chat_updated', chat => { const i = S.chats.findIndex(c => c.id === chat.id); if (i !== -1) { Object.assign(S.chats[i], chat); renderChatList(); } });
  sk.on('chat_deleted', ({ chatId }) => { S.chats = S.chats.filter(c => c.id !== chatId); if (S.activeChat?.id === chatId) { S.activeChat = null; showWelcome(); } renderChatList(); });

  // Calls
  sk.on('call_incoming',   d => window.callsModule?.onIncoming?.(d) || showToast(`Входящий звонок от ${d.fromName}`, 'info'));
  sk.on('call_answered',   d => window.callsModule?.onAnswer?.(d));
  sk.on('call_ice',        d => window.callsModule?.onIce?.(d));
  sk.on('call_renegotiate',d => window.callsModule?.onRenegotiate?.(d));
  sk.on('call_accepting',  () => {});
  sk.on('call_busy',       () => showToast('Абонент занят', 'info'));
  sk.on('call_rejected',   () => showToast('Звонок отклонён', 'info'));
  sk.on('call_ended',      () => { showToast('Звонок завершён', 'info'); window.callsModule?.onEnded?.(); });
  sk.on('session_revoked', () => { showToast('Сессия завершена', 'info'); setTimeout(logout, 1500); });
}

/* ══════════════════════════════════════════════════════════
   CHAT LIST
   ══════════════════════════════════════════════════════════ */
async function loadChats() {
  try { S.chats = await API.get('/api/chats'); }
  catch { return; }
  renderChatList();
  updateTabTitle();
}

function renderChatList(filter = '') {
  const list = $('chat-list');
  if (!list) return;
  const items = list.querySelectorAll('.chat-item');
  items.forEach(el => el.remove());

  let chats = S.chats;
  if (filter) chats = chats.filter(c => (c.displayName || c.name || '').toLowerCase().includes(filter.toLowerCase()));

  const empty = $('chat-list-empty');
  if (empty) empty.classList.toggle('hidden', chats.length > 0);

  const frag = document.createDocumentFragment();
  chats.forEach(c => frag.appendChild(buildChatItem(c)));
  list.appendChild(frag);
}

function buildChatItem(chat) {
  const el = document.createElement('div');
  el.className = `chat-item${S.activeChat?.id === chat.id ? ' active' : ''}`;
  el.dataset.chatid = chat.id;

  // Avatar
  const av = document.createElement('div');
  av.className = 'chat-item-avatar';
  if (chat.displayAvatar) av.style.backgroundImage = `url(${chat.displayAvatar})`;
  else { av.style.backgroundColor = chat.displayAvatarColor || '#5865f2'; av.textContent = avatarText(chat.displayName || chat.name); }

  // Status dot
  const dot = document.createElement('div');
  dot.className = `chat-item-status ${chat.online ? 'online' : 'offline'}`;
  av.appendChild(dot);
  el.appendChild(av);

  // Info
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
    if (chat.lastMessage.type === 'image') text = 'Отправил(а) фото';
    else if (chat.lastMessage.type === 'video') text = 'Отправил(а) видео';
    else if (chat.lastMessage.type === 'file') text = 'Отправил(а) файл';
    else if (chat.lastMessage.type === 'voice') text = 'Голосовое сообщение';
    preview.textContent = (chat.type !== 'private' ? sender + ': ' : '') + text;
    info.appendChild(preview);
  }
  el.appendChild(info);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'chat-item-meta';
  if (chat.unreadCount > 0) {
    const badge = document.createElement('div');
    badge.className = 'chat-item-badge';
    badge.textContent = chat.unreadCount > 99 ? '99+' : chat.unreadCount;
    meta.appendChild(badge);
  }
  // Close button (Discord style)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'chat-item-close icon-btn';
  closeBtn.innerHTML = '<i class="fas fa-xmark" style="font-size:12px"></i>';
  closeBtn.addEventListener('click', e => { e.stopPropagation(); });
  meta.appendChild(closeBtn);
  el.appendChild(meta);

  el.addEventListener('click', () => openChat(chat.id));
  return el;
}

function updateTabTitle() {
  const total = S.chats.reduce((s, c) => s + (c.unreadCount || 0), 0);
  document.title = total > 0 ? `(${total}) Shadow Messenger` : 'Shadow Messenger';
}

/* ══════════════════════════════════════════════════════════
   OPEN CHAT
   ══════════════════════════════════════════════════════════ */
async function openChat(chatId) {
  const chat = S.chats.find(c => c.id === chatId);
  if (!chat) return;
  S.activeChat = chat;

  $('welcome-screen').classList.add('hidden');
  $('active-chat').classList.remove('hidden');
  $('chat-name').textContent = chat.displayName || chat.name || 'Чат';
  updateChatStatus(chat);

  // Set header icon
  const icon = $('ch-icon');
  if (chat.type === 'private') icon.innerHTML = '<i class="fas fa-at"></i>';
  else icon.innerHTML = '<i class="fas fa-hashtag"></i>';

  // Call buttons
  $('btn-call').classList.toggle('hidden', chat.type !== 'private');
  $('btn-video-call').classList.toggle('hidden', chat.type !== 'private');

  // Highlight
  qsa('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.chatid === chatId));

  // Load messages
  try { S.messages = await API.get(`/api/chats/${chatId}/messages`); }
  catch { showToast('Ошибка загрузки', 'error'); return; }

  renderMessages();
  scrollBottom();
  S.socket?.emit('mark_read', { chatId });

  // Clear unread
  const ci = S.chats.findIndex(c => c.id === chatId);
  if (ci !== -1) { S.chats[ci].unreadCount = 0; renderChatList(); updateTabTitle(); }

  if (isMobile()) closeSidebar();

  $('msg-input').placeholder = `Написать @${chat.displayName || chat.name || 'чат'}`;

  // Members
  if (chat.type === 'group' && chat.membersInfo) renderMembers(chat.membersInfo);
}

function updateChatStatus(chat) {
  const el = $('chat-status');
  if (!el) return;
  if (chat.type === 'private') {
    el.textContent = chat.online ? 'В сети' : '';
  } else if (chat.type === 'group' && chat.membersInfo) {
    const cnt = chat.membersInfo.length;
    const onl = chat.membersInfo.filter(m => m.online).length;
    el.textContent = `${cnt} участн.${onl > 0 ? ` | ${onl} в сети` : ''}`;
  } else el.textContent = '';
}

function showWelcome() {
  $('active-chat').classList.add('hidden');
  $('welcome-screen').classList.remove('hidden');
  qsa('.chat-item').forEach(el => el.classList.remove('active'));
}

/* ══════════════════════════════════════════════════════════
   MESSAGES
   ══════════════════════════════════════════════════════════ */
function renderMessages() {
  const area = $('messages-area');
  if (!area) return;
  area.innerHTML = '';

  // Chat beginning
  if (S.activeChat) {
    const begin = document.createElement('div');
    begin.className = 'chat-begin';
    const ic = document.createElement('div');
    ic.className = 'chat-begin-icon';
    if (S.activeChat.type === 'private') ic.innerHTML = '<i class="fas fa-at"></i>';
    else ic.innerHTML = '<i class="fas fa-hashtag"></i>';
    begin.appendChild(ic);
    const h3 = document.createElement('h3');
    h3.textContent = S.activeChat.displayName || S.activeChat.name || '';
    begin.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = S.activeChat.type === 'private'
      ? `Это начало вашей переписки с @${S.activeChat.displayName || ''}`
      : `Добро пожаловать в #${S.activeChat.name || ''}!`;
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
    const grouped = msg.senderId === lastSenderId && (ts - lastTime) < 420_000; // 7 min
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

  // Avatar (absolute positioned)
  if (!grouped) {
    const av = document.createElement('div');
    av.className = 'msg-avatar';
    if (msg.senderAvatar) av.style.backgroundImage = `url(${msg.senderAvatar})`;
    else { av.style.backgroundColor = msg.senderAvatarColor || '#5865f2'; av.textContent = avatarText(msg.senderName); }
    row.appendChild(av);
  } else {
    // Hover time for grouped messages
    const ht = document.createElement('span');
    ht.className = 'msg-hover-time';
    ht.textContent = fmtTime(msg.timestamp);
    row.appendChild(ht);
  }

  // Content
  const content = document.createElement('div');
  content.className = 'msg-content';

  // Header
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

  // Reply
  if (msg.replyTo) {
    const orig = S.messages.find(m => m.id === msg.replyTo);
    if (orig) {
      const rp = document.createElement('div');
      rp.className = 'msg-reply';
      // Reply avatar
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

  // Forward
  if (msg.forwardFrom) {
    const fw = document.createElement('div');
    fw.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:2px;font-style:italic';
    fw.textContent = `Переслано от ${msg.forwardFrom}`;
    content.appendChild(fw);
  }

  // Body
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

  // Reactions
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

  // Hover toolbar
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  const reacts = ['😂', '❤️', '👍', '🔥'];
  reacts.forEach(em => {
    const b = document.createElement('button');
    b.className = 'msg-action-btn';
    b.textContent = em;
    b.title = 'Реакция';
    b.addEventListener('click', () => reactToMsg(msg.id, em));
    actions.appendChild(b);
  });
  const replyBtn = document.createElement('button');
  replyBtn.className = 'msg-action-btn';
  replyBtn.innerHTML = '<i class="fas fa-reply"></i>';
  replyBtn.title = 'Ответить';
  replyBtn.addEventListener('click', () => setReply(msg));
  actions.appendChild(replyBtn);
  if (msg.senderId === S.user?.id) {
    const editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn';
    editBtn.innerHTML = '<i class="fas fa-pen"></i>';
    editBtn.title = 'Редактировать';
    editBtn.addEventListener('click', () => startEdit(msg));
    actions.appendChild(editBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'msg-action-btn';
    delBtn.innerHTML = '<i class="fas fa-trash-can"></i>';
    delBtn.title = 'Удалить';
    delBtn.addEventListener('click', () => deleteMsg(msg.id));
    actions.appendChild(delBtn);
  }
  row.appendChild(actions);

  // Context menu
  row.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg); });
  // Long press mobile
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
    // Move to top
    const [c] = S.chats.splice(ci, 1);
    S.chats.unshift(c);
    renderChatList();
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

  // Editing
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
  renderChatList();
  if (S.activeChat) { updateChatStatus(S.activeChat); if (S.activeChat.membersInfo) renderMembers(S.activeChat.membersInfo); }
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
   MEMBERS SIDEBAR
   ══════════════════════════════════════════════════════════ */
function renderMembers(members) {
  const list = $('members-list');
  if (!list) return;
  list.innerHTML = '';
  const online = members.filter(m => m.online);
  const offline = members.filter(m => !m.online);
  if (online.length) {
    const cat = document.createElement('div'); cat.className = 'members-cat';
    cat.textContent = `В СЕТИ — ${online.length}`;
    list.appendChild(cat);
    online.forEach(m => list.appendChild(mkMemberEl(m, true)));
  }
  if (offline.length) {
    const cat = document.createElement('div'); cat.className = 'members-cat';
    cat.textContent = `НЕ В СЕТИ — ${offline.length}`;
    list.appendChild(cat);
    offline.forEach(m => list.appendChild(mkMemberEl(m, false)));
  }
}

function mkMemberEl(m, isOn) {
  const el = document.createElement('div');
  el.className = `member-item${isOn ? '' : ' offline'}`;
  const av = document.createElement('div');
  av.className = 'member-av';
  if (m.avatar) av.style.backgroundImage = `url(${m.avatar})`;
  else { av.style.backgroundColor = m.avatarColor || '#5865f2'; av.textContent = avatarText(m.displayName); }
  const dot = document.createElement('div');
  dot.className = `member-status-dot ${isOn ? 'online' : 'offline'}`;
  av.appendChild(dot);
  el.appendChild(av);
  const nm = document.createElement('div');
  nm.className = 'member-name';
  nm.textContent = m.displayName;
  if (m.superUser) nm.style.color = '#f0b232';
  el.appendChild(nm);
  return el;
}

/* ══════════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════════ */
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

/* New chat */
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

/* New group */
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
   SETTINGS — Discord full-page layout
   ══════════════════════════════════════════════════════════ */
function openSettings() {
  S.settingsOpen = true;
  $('modal-settings').classList.remove('hidden');
  if (!S.user) return;
  // Fill card
  const av = $('sc-avatar');
  if (S.user.avatar) { av.style.backgroundImage = `url(${S.user.avatar})`; av.textContent = ''; }
  else { av.style.backgroundImage = ''; av.style.backgroundColor = S.user.avatarColor || '#5865f2'; av.textContent = avatarText(S.user.displayName); }
  $('sc-name').textContent = S.user.displayName;
  $('sc-tag').textContent = '#' + S.user.username;
  $('sc-displayname').textContent = S.user.displayName;
  $('sc-username').textContent = S.user.username;
  // Fill edit inputs
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
  $('settings-profile').classList.toggle('hidden', sec !== 'profile');
  $('settings-security').classList.toggle('hidden', sec !== 'security');
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
      updateUserPanel();
      openSettings(); // refresh card
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
    btn.addEventListener('click', () => {
      const inp = $('msg-input');
      inp.value += em;
      inp.focus();
    });
    grid.appendChild(btn);
  });
  // Search filter
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
   MOBILE SIDEBAR
   ══════════════════════════════════════════════════════════ */
function openSidebar() {
  S.sidebarOpen = true;
  $('channel-sidebar').classList.add('open');
  $('sidebar-backdrop').classList.add('show');
}
function closeSidebar() {
  S.sidebarOpen = false;
  $('channel-sidebar').classList.remove('open');
  $('sidebar-backdrop').classList.remove('show');
}

/* ── Swipe support ───────────────────────────────────── */
let _touchStartX = 0, _touchStartY = 0, _swiping = false;
function initSwipe() {
  const main = $('main-area');
  if (!main) return;
  main.addEventListener('touchstart', e => {
    const t = e.touches[0];
    _touchStartX = t.clientX;
    _touchStartY = t.clientY;
    _swiping = false;
  }, { passive: true });
  main.addEventListener('touchmove', e => {
    if (_swiping) return;
    const dx = e.touches[0].clientX - _touchStartX;
    const dy = e.touches[0].clientY - _touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
      _swiping = true;
      if (dx > 0 && !S.sidebarOpen) openSidebar();
    }
  }, { passive: true });
}

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
   INIT
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNewChatModal();
  initNewGroupModal();
  initSettings();

  // Auto-login
  tryAutoLogin();

  // ── Send ──────────────────────────────────────────────
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

  // ── File upload ───────────────────────────────────────
  on('btn-attach', 'click', () => $('file-input').click());
  on('file-input', 'change', e => { for (const file of e.target.files) uploadFile(file); e.target.value = ''; });

  // Drag & drop
  const mainArea = $('main-area');
  if (mainArea) {
    mainArea.addEventListener('dragover', e => e.preventDefault());
    mainArea.addEventListener('drop', e => { e.preventDefault(); for (const f of e.dataTransfer.files) uploadFile(f); });
  }

  // Paste images
  document.addEventListener('paste', e => {
    if (!S.activeChat) return;
    for (const item of (e.clipboardData?.items || [])) { if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) uploadFile(f); } }
  });

  // ── Emoji ─────────────────────────────────────────────
  on('btn-emoji', 'click', toggleEmoji);

  // ── Reply ─────────────────────────────────────────────
  on('reply-close', 'click', clearReply);

  // ── Buttons ───────────────────────────────────────────
  on('btn-logout', 'click', logout);
  on('btn-new-chat', 'click', () => openModal('modal-new-chat'));
  on('btn-new-chat2', 'click', () => openModal('modal-new-chat'));
  on('btn-search-open', 'click', () => openModal('modal-new-chat'));
  on('btn-new-group', 'click', () => openModal('modal-new-group'));
  on('btn-settings', 'click', openSettings);
  on('guild-home', 'click', () => { if (isMobile()) { if (S.sidebarOpen) closeSidebar(); else openSidebar(); } else showWelcome(); });

  // ── Members toggle ────────────────────────────────────
  on('btn-members', 'click', () => {
    S.membersVisible = !S.membersVisible;
    $('members-sidebar').classList.toggle('hidden', !S.membersVisible);
  });

  // ── Mobile back button ────────────────────────────────
  on('btn-back', 'click', () => { if (isMobile()) openSidebar(); else showWelcome(); });

  // ── Mobile burger button (friends screen) ─────────────
  on('btn-burger', 'click', () => openSidebar());

  // ── Close modals ──────────────────────────────────────
  on('modal-new-chat-close', 'click', () => closeModal('modal-new-chat'));
  on('modal-new-group-close', 'click', () => closeModal('modal-new-group'));
  qsa('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });

  // ── Context menu ──────────────────────────────────────
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

  // ── Lightbox ──────────────────────────────────────────
  on('lightbox', 'click', () => $('lightbox').classList.add('hidden'));
  on('lightbox-close', 'click', () => $('lightbox').classList.add('hidden'));

  // ── Search / filter ───────────────────────────────────
  /* Channel-header search opens new chat modal on mobile */

  // ── Sidebar backdrop ──────────────────────────────────
  on('sidebar-backdrop', 'click', closeSidebar);

  // ── Calls ─────────────────────────────────────────────
  on('btn-call', 'click', () => {
    if (!S.activeChat || S.activeChat.type !== 'private') return;
    const peerId = S.activeChat.members?.find(id => id !== S.user?.id);
    if (peerId && window.callsModule?.startCall) window.callsModule.startCall(peerId, 'audio');
    else showToast('Модуль звонков не загружен', 'error');
  });
  on('btn-video-call', 'click', () => {
    if (!S.activeChat || S.activeChat.type !== 'private') return;
    const peerId = S.activeChat.members?.find(id => id !== S.user?.id);
    if (peerId && window.callsModule?.startCall) window.callsModule.startCall(peerId, 'video');
    else showToast('Модуль звонков не загружен', 'error');
  });

  // ── Friends tab (no real server logic, just style) ────
  qsa('.fh-tab').forEach(btn => {
    btn.addEventListener('click', () => { qsa('.fh-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); });
  });

  // ── Mic / Deaf toggles ────────────────────────────────
  let micMuted = false, deafened = false;
  on('btn-mic', 'click', () => {
    micMuted = !micMuted;
    const btn = $('btn-mic');
    btn.innerHTML = micMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    btn.style.color = micMuted ? 'var(--text-danger)' : '';
    showToast(micMuted ? 'Микрофон выключен' : 'Микрофон включён', 'info', 2000);
  });
  on('btn-deaf', 'click', () => {
    deafened = !deafened;
    const btn = $('btn-deaf');
    btn.innerHTML = deafened ? '<i class="fas fa-ear-deaf"></i>' : '<i class="fas fa-headphones"></i>';
    btn.style.color = deafened ? 'var(--text-danger)' : '';
    showToast(deafened ? 'Звук выключен' : 'Звук включён', 'info', 2000);
  });

  // ── ESC closes settings / emoji / lightbox ────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (S.settingsOpen) closeSettings();
      else if (S.emojiOpen) { $('emoji-picker').classList.add('hidden'); S.emojiOpen = false; }
      else if (!$('lightbox').classList.contains('hidden')) $('lightbox').classList.add('hidden');
      else if (S.editingMsgId) { S.editingMsgId = null; $('msg-input').value = ''; $('chat-input-inner').classList.remove('editing'); }
    }
  });

  // ── Close emoji on outside click ──────────────────────
  document.addEventListener('click', e => {
    if (S.emojiOpen && !e.target.closest('.emoji-picker') && !e.target.closest('#btn-emoji')) {
      $('emoji-picker').classList.add('hidden');
      S.emojiOpen = false;
    }
  });

  // ── Service Worker ────────────────────────────────────
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});

  // ── Mobile swipe ──────────────────────────────────────
  initSwipe();
});
