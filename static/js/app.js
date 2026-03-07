/* ═══════════════════════════════════════════════════════════
   Shadow Messenger — Discord-Clone Frontend
   Full SPA · Socket.io · REST API
   ═══════════════════════════════════════════════════════════ */
'use strict';

// ── State ─────────────────────────────────────────────────
const S = {
  token: null, user: null, chats: [], activeChat: null, messages: [],
  socket: null, replyTo: null, editingMsgId: null, typingTimers: {},
  membersVisible: false, emojiOpen: false,
};
window.State = S;

// ── Helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const qsa = sel => document.querySelectorAll(sel);
const isMobile = () => window.innerWidth <= 768;

function showToast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => el.remove(), 300); }, ms);
}
window.showToast = showToast;

function formatTime(iso) { return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); }
function formatDate(iso) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
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
  t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  t = t.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  return t;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ── API ───────────────────────────────────────────────────
const API = {
  async req(method, path, body, fd) {
    const h = {};
    if (S.token) h['Authorization'] = `Bearer ${S.token}`;
    const opts = { method, headers: h };
    if (fd) opts.body = body;
    else if (body) { h['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  },
  get: p => API.req('GET', p),
  post: (p, b) => API.req('POST', p, b),
  put: (p, b) => API.req('PUT', p, b),
  del: p => API.req('DELETE', p),
  upload(p, fd, onProg) {
    return new Promise((ok, fail) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', p);
      if (S.token) xhr.setRequestHeader('Authorization', `Bearer ${S.token}`);
      if (onProg) xhr.upload.addEventListener('progress', e => { if (e.lengthComputable) onProg(Math.round(e.loaded / e.total * 100)); });
      xhr.onload = () => { try { const d = JSON.parse(xhr.responseText); xhr.status < 300 ? ok(d) : fail(new Error(d.error || `HTTP ${xhr.status}`)); } catch { fail(new Error(`HTTP ${xhr.status}`)); } };
      xhr.onerror = () => fail(new Error('Ошибка сети'));
      xhr.send(fd);
    });
  },
};

// ── Link preview cache ────────────────────────────────────
const _linkCache = new Map();
async function fetchLinkPreview(url, container) {
  try {
    let data;
    if (_linkCache.has(url)) data = _linkCache.get(url);
    else {
      const resp = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${S.token}` } });
      data = await resp.json();
      _linkCache.set(url, data);
    }
    if (!data.title && !data.description) return;
    const el = document.createElement('div');
    el.className = 'link-preview';
    el.innerHTML = `${data.image ? `<img src="${escHtml(data.image)}" alt="" loading="lazy">` : ''}
      ${data.siteName ? `<div class="link-preview-site">${escHtml(data.siteName)}</div>` : ''}
      <div class="link-preview-title">${escHtml(data.title)}</div>
      ${data.description ? `<div class="link-preview-desc">${escHtml(data.description.slice(0, 160))}</div>` : ''}`;
    el.addEventListener('click', () => window.open(url, '_blank'));
    container.appendChild(el);
  } catch {}
}

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
function initAuth() {
  on('show-register', 'click', e => { e.preventDefault(); $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); });
  on('show-login', 'click', e => { e.preventDefault(); $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); });

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

  // Enter to submit login
  ['li-username', 'li-password'].forEach(id => {
    on(id, 'keydown', e => { if (e.key === 'Enter') $('btn-login').click(); });
  });

  on('btn-register', 'click', async () => {
    $('reg-error').textContent = '';
    const pw = $('rg-password').value;
    if (pw !== $('rg-password2').value) { $('reg-error').textContent = 'Пароли не совпадают'; return; }
    try {
      const d = await API.post('/api/register', {
        username: $('rg-username').value.trim(),
        displayName: $('rg-displayname').value.trim(),
        password: pw,
      });
      await onLogin(d);
    } catch (err) { $('reg-error').textContent = err.message; }
  });

  // Enter to submit register
  ['rg-displayname', 'rg-username', 'rg-password', 'rg-password2'].forEach(id => {
    on(id, 'keydown', e => { if (e.key === 'Enter') $('btn-register').click(); });
  });
}

async function onLogin({ token, user }) {
  S.token = token;
  S.user = user;
  localStorage.setItem('sm_token', token);
  localStorage.setItem('sm_user', JSON.stringify(user));
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  updateUserPanel();
  initSocket();
  await loadChats();
  subscribeToPush();
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
}

function updateUserPanel() {
  if (!S.user) return;
  const av = $('my-avatar');
  if (S.user.avatar) {
    av.style.backgroundImage = `url(${S.user.avatar})`;
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.style.backgroundColor = S.user.avatarColor || '#5865f2';
    av.textContent = avatarText(S.user.displayName);
  }
  $('my-name').textContent = S.user.displayName;
  $('my-tag').textContent = '@' + S.user.username;
}

// ══════════════════════════════════════════════════════════
// SOCKET
// ══════════════════════════════════════════════════════════
function initSocket() {
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  const socket = io({ auth: { token: S.token } });
  S.socket = socket;

  socket.on('new_message', handleNewMessage);
  socket.on('message_edited', m => {
    const i = S.messages.findIndex(x => x.id === m.id);
    if (i !== -1) { S.messages[i] = m; renderMessages(); }
  });
  socket.on('message_deleted', ({ messageId, chatId }) => {
    if (S.activeChat?.id === chatId) { S.messages = S.messages.filter(m => m.id !== messageId); renderMessages(); }
  });
  socket.on('message_reaction', ({ messageId, reactions }) => {
    const m = S.messages.find(x => x.id === messageId);
    if (m) { m.reactions = reactions; renderMessages(); }
  });
  socket.on('messages_read', ({ chatId, userId }) => {
    if (S.activeChat?.id === chatId && userId !== S.user.id) {
      S.messages.filter(m => m.senderId === S.user.id).forEach(m => {
        if (!m.readBy?.includes(userId)) m.readBy = [...(m.readBy || []), userId];
      });
    }
  });
  socket.on('user_typing', ({ userId, chatId }) => { if (S.activeChat?.id === chatId && userId !== S.user.id) showTyping(userId); });
  socket.on('user_stopped_typing', ({ userId }) => hideTyping(userId));
  socket.on('user_online', ({ userId }) => updateOnlineUI(userId, true));
  socket.on('user_offline', ({ userId }) => updateOnlineUI(userId, false));
  socket.on('chat_created', async chat => { socket.emit('join_chat', { chatId: chat.id }); await loadChats(); });
  socket.on('chat_updated', chat => {
    const i = S.chats.findIndex(c => c.id === chat.id);
    if (i !== -1) { S.chats[i] = { ...S.chats[i], ...chat }; renderChatList(); }
  });
  socket.on('chat_deleted', ({ chatId }) => {
    S.chats = S.chats.filter(c => c.id !== chatId);
    if (S.activeChat?.id === chatId) { S.activeChat = null; showWelcome(); }
    renderChatList();
  });
  // Calls
  socket.on('call_incoming', d => window.callsModule?.onIncoming?.(d) || handleIncomingCall(d));
  socket.on('call_answered', d => { window.callsModule?.onAnswer?.(d); });
  socket.on('call_ice', d => window.callsModule?.onIce?.(d));
  socket.on('call_renegotiate', d => window.callsModule?.onRenegotiate?.(d));
  socket.on('call_accepting', () => {});
  socket.on('call_busy', () => showToast('Абонент занят', 'info'));
  socket.on('call_rejected', () => showToast('Звонок отклонён', 'info'));
  socket.on('call_ended', () => { showToast('Звонок завершён', 'info'); window.callsModule?.onEnded?.(); });
  socket.on('session_revoked', () => { showToast('Сессия завершена', 'info'); setTimeout(logout, 1500); });
  socket.on('connect', () => { if (S.chats.length > 0) loadChats().catch(() => {}); });
}

function handleIncomingCall(data) {
  if (window.callsModule?.onIncoming) {
    window.callsModule.onIncoming(data);
  } else {
    showToast(`📞 Входящий звонок от ${data.fromName}`, 'info');
  }
}

// ══════════════════════════════════════════════════════════
// CHAT LIST
// ══════════════════════════════════════════════════════════
async function loadChats() {
  try { S.chats = await API.get('/api/chats'); } catch (e) { showToast('Ошибка загрузки чатов', 'error'); return; }
  renderChatList();
  updateTabTitle();
}

function renderChatList(filter = '') {
  const list = $('chat-list');
  if (!list) return;
  list.querySelectorAll('.chat-item').forEach(el => el.remove());
  const empty = $('chat-list-empty');

  let chats = S.chats;
  if (filter) chats = chats.filter(c => (c.displayName || c.name || '').toLowerCase().includes(filter.toLowerCase()));

  if (empty) empty.classList.toggle('hidden', chats.length > 0);

  const pinned = chats.filter(c => c.pinned);
  const unpinned = chats.filter(c => !c.pinned);
  const frag = document.createDocumentFragment();
  [...pinned, ...unpinned].forEach(chat => frag.appendChild(buildChatItem(chat)));
  list.appendChild(frag);
}

function buildChatItem(chat) {
  const el = document.createElement('div');
  el.className = `chat-item${S.activeChat?.id === chat.id ? ' active' : ''}`;
  el.dataset.chatid = chat.id;

  // Avatar
  const av = document.createElement('div');
  av.className = 'chat-item-avatar';
  if (chat.displayAvatar) {
    av.style.backgroundImage = `url(${chat.displayAvatar})`;
  } else {
    av.style.backgroundColor = chat.displayAvatarColor || '#5865f2';
    av.textContent = avatarText(chat.displayName || chat.name);
  }
  if (chat.online) {
    const dot = document.createElement('div');
    dot.className = 'chat-item-online';
    av.appendChild(dot);
  }
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
    if (chat.lastMessage.type === 'image') text = '📷 Фото';
    else if (chat.lastMessage.type === 'video') text = '🎬 Видео';
    else if (chat.lastMessage.type === 'file') text = '📎 Файл';
    else if (chat.lastMessage.type === 'voice') text = '🎤 Голосовое';
    else if (chat.lastMessage.type === 'sticker') text = '😀 Стикер';
    preview.textContent = (chat.type !== 'private' ? sender + ': ' : '') + text;
    info.appendChild(preview);
  }
  el.appendChild(info);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'chat-item-meta';
  if (chat.lastMessage) {
    const time = document.createElement('div');
    time.className = 'chat-item-time';
    time.textContent = formatTime(chat.lastMessage.timestamp);
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

// ══════════════════════════════════════════════════════════
// OPEN CHAT
// ══════════════════════════════════════════════════════════
async function openChat(chatId) {
  const chat = S.chats.find(c => c.id === chatId);
  if (!chat) return;
  S.activeChat = chat;

  // UI
  $('welcome-screen').classList.add('hidden');
  $('active-chat').classList.remove('hidden');
  $('chat-name').textContent = chat.displayName || chat.name || 'Чат';

  // Status
  updateChatStatus(chat);

  // Highlight active
  qsa('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.chatid === chatId));

  // Hash for private vs group
  const hash = $('chat-header-hash');
  if (chat.type === 'private') hash.innerHTML = '<i class="fas fa-at" style="font-size:18px"></i>';
  else hash.textContent = '#';

  // Show call buttons only for private
  $('btn-call').classList.toggle('hidden', chat.type !== 'private');
  $('btn-video-call').classList.toggle('hidden', chat.type !== 'private');

  // Load messages
  try {
    S.messages = await API.get(`/api/chats/${chatId}/messages`);
  } catch (e) { showToast('Ошибка загрузки сообщений', 'error'); return; }

  renderMessages();
  scrollToBottom();
  S.socket?.emit('mark_read', { chatId });

  // Update unread
  const ci = S.chats.findIndex(c => c.id === chatId);
  if (ci !== -1) { S.chats[ci].unreadCount = 0; renderChatList(); }

  // Close sidebar on mobile
  if (isMobile()) closeSidebar();

  // Update input placeholder
  $('msg-input').placeholder = `Написать в ${chat.displayName || chat.name || 'чат'}…`;

  // Members
  if (chat.type === 'group' && chat.membersInfo) renderMembers(chat.membersInfo);
}

function updateChatStatus(chat) {
  const el = $('chat-status');
  if (!el) return;
  if (chat.type === 'private') {
    el.textContent = chat.online ? 'в сети' : '';
    el.style.color = chat.online ? 'var(--bg-green)' : '';
  } else if (chat.type === 'group' && chat.membersInfo) {
    const cnt = chat.membersInfo.length;
    const onl = chat.membersInfo.filter(m => m.online).length;
    el.textContent = `${cnt} участн.${onl > 0 ? `, ${onl} в сети` : ''}`;
    el.style.color = '';
  } else { el.textContent = ''; }
}

function showWelcome() {
  $('active-chat').classList.add('hidden');
  $('welcome-screen').classList.remove('hidden');
  qsa('.chat-item').forEach(el => el.classList.remove('active'));
}

// ══════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════
function renderMessages() {
  const area = $('messages-area');
  if (!area) return;
  area.innerHTML = '';

  if (S.messages.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px;color:var(--text-muted)';
    empty.innerHTML = `<i class="fas fa-ghost" style="font-size:48px;opacity:.3;margin-bottom:12px;display:block"></i><h3 style="color:var(--text-header)">Начало чата</h3><p>Напишите первое сообщение!</p>`;
    area.appendChild(empty);
    return;
  }

  let lastDate = null, lastSenderId = null, lastTime = 0;
  const frag = document.createDocumentFragment();

  S.messages.forEach(msg => {
    const dt = new Date(msg.timestamp).toDateString();
    if (dt !== lastDate) {
      lastDate = dt;
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span>${formatDate(msg.timestamp)}</span>`;
      frag.appendChild(sep);
      lastSenderId = null;
    }

    const ts = new Date(msg.timestamp).getTime();
    const grouped = msg.senderId === lastSenderId && (ts - lastTime) < 5 * 60 * 1000;
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

  // Avatar
  const av = document.createElement('div');
  av.className = 'msg-avatar';
  if (msg.senderAvatar) av.style.backgroundImage = `url(${msg.senderAvatar})`;
  else {
    av.style.backgroundColor = msg.senderAvatarColor || '#5865f2';
    av.textContent = avatarText(msg.senderName);
  }
  row.appendChild(av);

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
    if (msg.senderSuperUser) author.style.color = '#faa61a';
    hdr.appendChild(author);
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = formatDate(msg.timestamp) + ' ' + formatTime(msg.timestamp);
    hdr.appendChild(time);
    content.appendChild(hdr);
  }

  // Reply
  if (msg.replyTo) {
    const orig = S.messages.find(m => m.id === msg.replyTo);
    if (orig) {
      const rp = document.createElement('div');
      rp.className = 'msg-reply';
      rp.innerHTML = `<span class="msg-reply-name">@${escHtml(orig.senderName)}</span> ${escHtml((orig.text || 'Вложение').slice(0, 80))}`;
      rp.addEventListener('click', () => scrollToMsg(msg.replyTo));
      content.appendChild(rp);
    }
  }

  // Forward
  if (msg.forwardFrom) {
    const fw = document.createElement('div');
    fw.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:4px;font-style:italic';
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
    fl.innerHTML = `<i class="fas fa-file-alt msg-file-icon"></i><div><div class="msg-file-name">${escHtml(msg.fileName || 'Файл')}</div><div class="msg-file-size">${fmtSize(msg.fileSize || 0)}</div></div>`;
    content.appendChild(fl);
  } else if (msg.type === 'voice' && msg.fileUrl) {
    content.appendChild(buildVoiceEl(msg));
  } else if (msg.type === 'sticker') {
    const st = document.createElement('div');
    st.style.cssText = 'font-size:48px;line-height:1;padding:4px 0';
    st.textContent = msg.text || '😀';
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

  // Hover actions
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.innerHTML = `
    <button class="msg-action-btn" data-action="react" title="Реакция"><i class="fas fa-face-smile"></i></button>
    <button class="msg-action-btn" data-action="reply" title="Ответить"><i class="fas fa-reply"></i></button>
    ${msg.senderId === S.user?.id ? '<button class="msg-action-btn" data-action="edit" title="Редактировать"><i class="fas fa-pen"></i></button>' : ''}
    ${msg.senderId === S.user?.id ? '<button class="msg-action-btn" data-action="delete" title="Удалить"><i class="fas fa-trash"></i></button>' : ''}`;
  actions.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'reply') setReply(msg);
    else if (action === 'edit') startEdit(msg);
    else if (action === 'delete') deleteMsg(msg.id);
    else if (action === 'react') quickReact(msg);
  });
  row.appendChild(actions);

  // Context menu (right click)
  row.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg); });

  // Long press for mobile
  let lpTimer, lpMoved = false;
  row.addEventListener('touchstart', () => { lpMoved = false; lpTimer = setTimeout(() => { if (!lpMoved) showCtxMenu(null, msg); }, 500); }, { passive: true });
  row.addEventListener('touchmove', () => { lpMoved = true; clearTimeout(lpTimer); }, { passive: true });
  row.addEventListener('touchend', () => clearTimeout(lpTimer), { passive: true });

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
  fill.style.width = '0%';
  progress.appendChild(fill);

  const dur = document.createElement('span');
  dur.className = 'voice-duration';
  dur.textContent = msg.duration ? msg.duration + 'с' : '0:00';

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
      const s = Math.floor(audio.currentTime);
      dur.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
  });
  audio.addEventListener('ended', () => { playing = false; playBtn.innerHTML = '<i class="fas fa-play"></i>'; fill.style.width = '0%'; });

  progress.addEventListener('click', e => {
    if (audio.duration) {
      const rect = progress.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    }
  });

  wrap.appendChild(playBtn);
  wrap.appendChild(progress);
  wrap.appendChild(dur);
  return wrap;
}

function scrollToBottom() {
  const el = $('messages-scroll');
  if (el) requestAnimationFrame(() => el.scrollTop = el.scrollHeight);
}

function scrollToMsg(msgId) {
  const el = document.querySelector(`[data-msgid="${msgId}"]`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(88,101,242,.15)'; setTimeout(() => el.style.background = '', 2000); }
}

// ── New message handler ───────────────────────────────────
function handleNewMessage(msg) {
  // Update chat list
  const ci = S.chats.findIndex(c => c.id === msg.chatId);
  if (ci !== -1) {
    S.chats[ci].lastMessage = msg;
    if (S.activeChat?.id !== msg.chatId) S.chats[ci].unreadCount = (S.chats[ci].unreadCount || 0) + 1;
    renderChatList();
    updateTabTitle();
  }
  // Append to active chat
  if (S.activeChat?.id === msg.chatId) {
    S.messages.push(msg);
    renderMessages();
    scrollToBottom();
    S.socket?.emit('mark_read', { chatId: msg.chatId });
  }
}

// ══════════════════════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════════════════════
async function sendMessage() {
  const inp = $('msg-input');
  const text = inp.value.trim();
  if (!text || !S.activeChat) return;

  const chatId = S.activeChat.id;
  const body = { text };
  if (S.replyTo) { body.replyTo = S.replyTo.id; clearReply(); }

  if (S.editingMsgId) {
    try {
      const edited = await API.put(`/api/messages/${S.editingMsgId}`, { text });
      const i = S.messages.findIndex(m => m.id === S.editingMsgId);
      if (i !== -1) S.messages[i] = edited;
      S.editingMsgId = null;
      inp.value = '';
      renderMessages();
    } catch (e) { showToast('Ошибка редактирования', 'error'); }
    return;
  }

  inp.value = '';
  autoResizeInput();
  S.socket?.emit('typing_stop', { chatId });

  try {
    const msg = await API.post(`/api/chats/${chatId}/messages`, body);
    S.messages.push(msg);
    renderMessages();
    scrollToBottom();

    // Update chat list
    const ci = S.chats.findIndex(c => c.id === chatId);
    if (ci !== -1) { S.chats[ci].lastMessage = msg; renderChatList(); }
  } catch (e) { showToast('Ошибка отправки', 'error'); }
}

// ── Reply ─────────────────────────────────────────────────
function setReply(msg) {
  S.replyTo = msg;
  $('reply-bar').classList.remove('hidden');
  $('reply-name').textContent = msg.senderName;
  $('reply-text').textContent = msg.text || 'Вложение';
  $('msg-input').focus();
  closeCtxMenu();
}

function clearReply() {
  S.replyTo = null;
  $('reply-bar').classList.add('hidden');
}

// ── Edit ──────────────────────────────────────────────────
function startEdit(msg) {
  if (msg.senderId !== S.user?.id) return;
  S.editingMsgId = msg.id;
  $('msg-input').value = msg.text || '';
  $('msg-input').focus();
  autoResizeInput();
  closeCtxMenu();
}

// ── Delete ────────────────────────────────────────────────
async function deleteMsg(msgId) {
  try {
    await API.del(`/api/messages/${msgId}`);
    S.messages = S.messages.filter(m => m.id !== msgId);
    renderMessages();
  } catch (e) { showToast('Ошибка удаления', 'error'); }
  closeCtxMenu();
}

// ── React ─────────────────────────────────────────────────
async function reactToMsg(msgId, emoji) {
  try { await API.post(`/api/messages/${msgId}/react`, { emoji }); } catch {}
}

function quickReact(msg) {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  const pick = emojis[Math.floor(Math.random() * emojis.length)];
  reactToMsg(msg.id, pick);
  closeCtxMenu();
}

// ══════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════
async function uploadFile(file) {
  if (!S.activeChat) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const msg = await API.upload(`/api/chats/${S.activeChat.id}/upload`, fd);
    S.messages.push(msg);
    renderMessages();
    scrollToBottom();
    const ci = S.chats.findIndex(c => c.id === S.activeChat.id);
    if (ci !== -1) { S.chats[ci].lastMessage = msg; renderChatList(); }
  } catch (e) { showToast('Ошибка загрузки файла', 'error'); }
}

// ══════════════════════════════════════════════════════════
// TYPING
// ══════════════════════════════════════════════════════════
const _typingUsers = new Map();
function showTyping(userId) {
  clearTimeout(_typingUsers.get(userId));
  _typingUsers.set(userId, setTimeout(() => hideTyping(userId), 5000));
  updateTypingUI();
}
function hideTyping(userId) {
  clearTimeout(_typingUsers.get(userId));
  _typingUsers.delete(userId);
  updateTypingUI();
}
function updateTypingUI() {
  const bar = $('typing-bar');
  if (!bar) return;
  if (_typingUsers.size > 0) {
    bar.classList.remove('hidden');
    $('typing-text').textContent = _typingUsers.size === 1 ? 'печатает…' : 'печатают…';
  } else bar.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════
// ONLINE STATUS
// ══════════════════════════════════════════════════════════
function updateOnlineUI(userId, online) {
  S.chats.forEach(c => {
    if (c.type === 'private') {
      const other = c.members?.find(id => id !== S.user?.id);
      if (other === userId) c.online = online;
    }
    if (c.membersInfo) c.membersInfo.forEach(m => { if (m.id === userId) m.online = online; });
  });
  renderChatList();
  if (S.activeChat) updateChatStatus(S.activeChat);
}

// ══════════════════════════════════════════════════════════
// CONTEXT MENU
// ══════════════════════════════════════════════════════════
let _ctxMsg = null;
function showCtxMenu(e, msg) {
  _ctxMsg = msg;
  const menu = $('ctx-menu');
  menu.classList.remove('hidden');

  // Show/hide edit/delete based on ownership
  menu.querySelectorAll('[data-action="edit"],[data-action="delete"]').forEach(el => {
    el.classList.toggle('hidden', msg.senderId !== S.user?.id);
  });

  if (e) {
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  } else {
    menu.style.left = '50%';
    menu.style.top = '50%';
  }
}
function closeCtxMenu() { $('ctx-menu').classList.add('hidden'); _ctxMsg = null; }

// ══════════════════════════════════════════════════════════
// MEMBERS SIDEBAR
// ══════════════════════════════════════════════════════════
function renderMembers(members) {
  const list = $('members-list');
  if (!list) return;
  list.innerHTML = '';

  const online = members.filter(m => m.online);
  const offline = members.filter(m => !m.online);

  if (online.length) {
    const cat = document.createElement('div');
    cat.className = 'members-cat';
    cat.textContent = `ОНЛАЙН — ${online.length}`;
    list.appendChild(cat);
    online.forEach(m => list.appendChild(buildMemberEl(m, true)));
  }
  if (offline.length) {
    const cat = document.createElement('div');
    cat.className = 'members-cat';
    cat.textContent = `ОФФЛАЙН — ${offline.length}`;
    list.appendChild(cat);
    offline.forEach(m => list.appendChild(buildMemberEl(m, false)));
  }
}

function buildMemberEl(m, isOnline) {
  const el = document.createElement('div');
  el.className = `member-item${isOnline ? ' is-online' : ''}`;
  const av = document.createElement('div');
  av.className = 'member-av';
  if (m.avatar) av.style.backgroundImage = `url(${m.avatar})`;
  else { av.style.backgroundColor = m.avatarColor || '#5865f2'; av.textContent = avatarText(m.displayName); }
  const dot = document.createElement('div');
  dot.className = `member-status-dot ${isOnline ? 'online' : 'offline'}`;
  av.appendChild(dot);
  el.appendChild(av);
  const nm = document.createElement('div');
  nm.className = 'member-name';
  nm.textContent = m.displayName;
  if (m.superUser) nm.style.color = '#faa61a';
  el.appendChild(nm);
  return el;
}

// ══════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

// New chat
function initNewChatModal() {
  const searchInp = $('new-chat-search');
  const results = $('new-chat-results');
  searchInp.addEventListener('input', debounce(async () => {
    const q = searchInp.value.trim();
    results.innerHTML = '';
    if (!q) return;
    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'modal-result-item';
        const av = document.createElement('div');
        av.className = 'modal-result-av';
        if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
        else { av.style.backgroundColor = u.avatarColor || '#5865f2'; av.textContent = avatarText(u.displayName); }
        item.appendChild(av);
        const info = document.createElement('div');
        info.innerHTML = `<div class="modal-result-name">${escHtml(u.displayName)}</div><div class="modal-result-tag">@${escHtml(u.username)}</div>`;
        item.appendChild(info);
        item.addEventListener('click', async () => {
          try {
            const chat = await API.post('/api/chats', { userId: u.id });
            closeModal('modal-new-chat');
            searchInp.value = '';
            results.innerHTML = '';
            await loadChats();
            openChat(chat.id);
          } catch (e) { showToast(e.message, 'error'); }
        });
        results.appendChild(item);
      });
    } catch {}
  }, 300));
}

// New group
function initNewGroupModal() {
  const selected = [];
  const searchInp = $('group-member-search');
  const results = $('group-search-results');
  const tagsEl = $('group-selected');

  function renderTags() {
    tagsEl.innerHTML = '';
    selected.forEach(u => {
      const tag = document.createElement('div');
      tag.className = 'modal-tag';
      tag.innerHTML = `${escHtml(u.displayName)} <button>&times;</button>`;
      tag.querySelector('button').addEventListener('click', () => {
        const i = selected.findIndex(s => s.id === u.id);
        if (i !== -1) selected.splice(i, 1);
        renderTags();
      });
      tagsEl.appendChild(tag);
    });
  }

  searchInp.addEventListener('input', debounce(async () => {
    const q = searchInp.value.trim();
    results.innerHTML = '';
    if (!q) return;
    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      users.forEach(u => {
        if (selected.find(s => s.id === u.id)) return;
        const item = document.createElement('div');
        item.className = 'modal-result-item';
        const av = document.createElement('div');
        av.className = 'modal-result-av';
        if (u.avatar) av.style.backgroundImage = `url(${u.avatar})`;
        else { av.style.backgroundColor = u.avatarColor || '#5865f2'; av.textContent = avatarText(u.displayName); }
        item.appendChild(av);
        const info = document.createElement('div');
        info.innerHTML = `<div class="modal-result-name">${escHtml(u.displayName)}</div><div class="modal-result-tag">@${escHtml(u.username)}</div>`;
        item.appendChild(info);
        item.addEventListener('click', () => {
          selected.push(u);
          renderTags();
          searchInp.value = '';
          results.innerHTML = '';
        });
        results.appendChild(item);
      });
    } catch {}
  }, 300));

  on('btn-create-group', 'click', async () => {
    const name = $('group-name-input').value.trim();
    if (!name) { showToast('Введите название группы', 'error'); return; }
    try {
      const chat = await API.post('/api/chats/group', { name, memberIds: selected.map(u => u.id) });
      closeModal('modal-new-group');
      $('group-name-input').value = '';
      searchInp.value = '';
      results.innerHTML = '';
      selected.length = 0;
      tagsEl.innerHTML = '';
      await loadChats();
      openChat(chat.id);
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// Settings
function initSettingsModal() {
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
      showToast('Профиль сохранён', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  on('btn-change-pw', 'click', async () => {
    const cur = $('set-cur-pw').value;
    const nw = $('set-new-pw').value;
    if (!cur || !nw) { showToast('Заполните оба поля', 'error'); return; }
    try {
      await API.put('/api/me/password', { currentPassword: cur, newPassword: nw });
      showToast('Пароль изменён', 'success');
      $('set-cur-pw').value = '';
      $('set-new-pw').value = '';
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ══════════════════════════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════════════════════════
function openLightbox(url) {
  $('lightbox-img').src = url;
  $('lightbox').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════
// EMOJI PICKER
// ══════════════════════════════════════════════════════════
const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','😢','😡','🔥','❤️','👍','👎','👏','🙌','🎉','🎵','💯','✨','🌟','⭐','💀','🤡','😈','👻','💩','🤮','🥱','😴','🤯','🥳','😇','🫡','🫠','💪','🤝','✌️','🖖','🤙','👋','🫶','❤️‍🔥','💔','💕','🧡','💛','💚','💙','💜','🖤','🤍','💝'];

let _emojiEl = null;
function toggleEmoji() {
  if (_emojiEl) { _emojiEl.remove(); _emojiEl = null; return; }
  _emojiEl = document.createElement('div');
  _emojiEl.className = 'emoji-picker';
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = e;
    btn.addEventListener('click', () => {
      const inp = $('msg-input');
      inp.value += e;
      inp.focus();
    });
    _emojiEl.appendChild(btn);
  });
  document.querySelector('.chat-input-area').appendChild(_emojiEl);
}

// ══════════════════════════════════════════════════════════
// MOBILE SIDEBAR
// ══════════════════════════════════════════════════════════
let _backdrop = null;
function openSidebar() {
  $('channel-sidebar').classList.add('open');
  if (!_backdrop) {
    _backdrop = document.createElement('div');
    _backdrop.className = 'sidebar-backdrop show';
    _backdrop.addEventListener('click', closeSidebar);
    document.body.appendChild(_backdrop);
  } else _backdrop.classList.add('show');
}
function closeSidebar() {
  $('channel-sidebar').classList.remove('open');
  if (_backdrop) _backdrop.classList.remove('show');
}

// ══════════════════════════════════════════════════════════
// INPUT AUTO-RESIZE
// ══════════════════════════════════════════════════════════
function autoResizeInput() {
  const inp = $('msg-input');
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 200) + 'px';
}

// ══════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ══════════════════════════════════════════════════════════
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) { try { await API.post('/api/push/subscribe', existing.toJSON()); } catch {} return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    let publicKey;
    try { const resp = await API.get('/api/push/vapid'); publicKey = resp.publicKey; } catch { return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await API.post('/api/push/subscribe', sub.toJSON());
  } catch (err) { console.warn('Push failed:', err); }
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNewChatModal();
  initNewGroupModal();
  initSettingsModal();

  // Auto-login
  const token = localStorage.getItem('sm_token');
  const user = localStorage.getItem('sm_user');
  if (token && user) {
    S.token = token;
    try { S.user = JSON.parse(user); } catch { S.user = null; }
    if (S.user) {
      $('auth-screen').classList.add('hidden');
      $('app').classList.remove('hidden');
      updateUserPanel();
      initSocket();
      loadChats();
      subscribeToPush();
    }
  }

  // Event bindings
  on('btn-send', 'click', sendMessage);
  on('msg-input', 'keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    else if (S.activeChat) S.socket?.emit('typing_start', { chatId: S.activeChat.id });
  });
  on('msg-input', 'input', autoResizeInput);

  // Typing stop
  let _typingStopTimer = null;
  on('msg-input', 'input', () => {
    clearTimeout(_typingStopTimer);
    _typingStopTimer = setTimeout(() => { if (S.activeChat) S.socket?.emit('typing_stop', { chatId: S.activeChat.id }); }, 3000);
  });

  // File upload
  on('btn-attach', 'click', () => $('file-input').click());
  on('file-input', 'change', e => {
    for (const file of e.target.files) uploadFile(file);
    e.target.value = '';
  });

  // Drag & drop
  const chatArea = $('chat-area');
  if (chatArea) {
    chatArea.addEventListener('dragover', e => { e.preventDefault(); chatArea.style.outline = '2px dashed var(--bg-accent)'; });
    chatArea.addEventListener('dragleave', () => chatArea.style.outline = '');
    chatArea.addEventListener('drop', e => { e.preventDefault(); chatArea.style.outline = ''; for (const file of e.dataTransfer.files) uploadFile(file); });
  }

  // Emoji
  on('btn-emoji', 'click', toggleEmoji);

  // Reply close
  on('reply-close', 'click', clearReply);

  // Buttons
  on('btn-logout', 'click', logout);
  on('btn-new-chat', 'click', () => openModal('modal-new-chat'));
  on('btn-new-group', 'click', () => openModal('modal-new-group'));
  on('btn-settings', 'click', () => {
    if (S.user) {
      $('set-displayname').value = S.user.displayName || '';
      $('set-username').value = S.user.username || '';
      $('set-bio').value = S.user.bio || '';
    }
    openModal('modal-settings');
  });

  // Members toggle
  on('btn-members', 'click', () => {
    S.membersVisible = !S.membersVisible;
    $('members-sidebar').classList.toggle('hidden', !S.membersVisible);
  });

  // Mobile back
  on('btn-back', 'click', () => { if (isMobile()) openSidebar(); else showWelcome(); });

  // Guild home → open sidebar on mobile
  on('guild-home', 'click', () => { if (isMobile()) openSidebar(); });

  // Close modals
  qsa('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.add('hidden'));
  });
  qsa('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });

  // Close ctx menu
  document.addEventListener('click', () => closeCtxMenu());
  $('ctx-menu').addEventListener('click', e => {
    const item = e.target.closest('.ctx-item');
    if (!item || !_ctxMsg) return;
    const action = item.dataset.action;
    if (action === 'reply') setReply(_ctxMsg);
    else if (action === 'edit') startEdit(_ctxMsg);
    else if (action === 'delete') deleteMsg(_ctxMsg.id);
    else if (action === 'react') quickReact(_ctxMsg);
  });

  // Lightbox
  on('lightbox', 'click', () => $('lightbox').classList.add('hidden'));
  on('lightbox-close', 'click', () => $('lightbox').classList.add('hidden'));

  // Search filter
  on('search-input', 'input', debounce(() => renderChatList($('search-input').value.trim()), 200));

  // Calls
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

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }

  // Paste images
  document.addEventListener('paste', e => {
    if (!S.activeChat) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) uploadFile(file);
      }
    }
  });
});
