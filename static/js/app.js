/* ============================================================
   Shadow Messenger v4 — Discord + Telegram + VK Hybrid
   ============================================================ */
'use strict';

/* ═══════ STATE ═══════ */
window.State = {
  token: localStorage.getItem('sm_token'),
  user: null, socket: null,
  chats: [], friends: [], pending: [], outgoing: [],
  currentChat: null, messages: [],
  replyTo: null, editMsg: null,
  ghostMode: false,
  activeTab: 'chats', contactTab: 'friends',
  isMobile: window.innerWidth <= 768,
  chatOpen: false, membersOpen: false,
  onlineUsers: new Set(),
  typingTimers: {},
  incomingCall: null,
  callHistory: JSON.parse(localStorage.getItem('sm_callHistory') || '[]'),
  groupMembers: [],
};
const S = window.State;

/* ═══════ HELPERS ═══════ */
const $ = id => document.getElementById(id);
const html = str => { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; };
const qs = (sel, el) => (el || document).querySelector(sel);
const qsa = (sel, el) => (el || document).querySelectorAll(sel);

async function api(url, opts = {}) {
  const h = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (S.token) h['Authorization'] = 'Bearer ' + S.token;
  if (opts.body instanceof FormData) delete h['Content-Type'];
  try {
    const r = await fetch(url, { ...opts, headers: h });
    if (r.status === 401) { logout(); return null; }
    return r;
  } catch { return null; }
}

function avatarHTML(avatar, color, name, cls = '') {
  if (avatar) return `<div class="${cls}" style="background:${color || '#5865f2'}"><img src="${avatar}" alt=""></div>`;
  const letter = (name || '?')[0].toUpperCase();
  return `<div class="${cls}" style="background:${color || '#5865f2'}">${html(letter)}</div>`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин';
  const today = now.toDateString() === d.toDateString();
  if (today) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) return 'вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function fullTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function dateSep(ts) {
  const d = new Date(ts), now = new Date();
  if (now.toDateString() === d.toDateString()) return 'Сегодня';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ═══════ TOAST ═══════ */
window.showToast = (msg, type = 'info') => {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
};

/* ═══════ AUTH ═══════ */
$('login-form').onsubmit = async e => {
  e.preventDefault();
  const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('login-username').value.trim(), password: $('login-password').value }) });
  if (!r) return;
  const d = await r.json();
  if (!r.ok) return showToast(d.error || 'Ошибка', 'error');
  S.token = d.token;
  localStorage.setItem('sm_token', d.token);
  bootstrap();
};

$('register-form').onsubmit = async e => {
  e.preventDefault();
  const r = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: $('reg-username').value.trim(), displayName: $('reg-displayname').value.trim(), password: $('reg-password').value }) });
  if (!r) return;
  const d = await r.json();
  if (!r.ok) return showToast(d.error || 'Ошибка', 'error');
  S.token = d.token;
  localStorage.setItem('sm_token', d.token);
  bootstrap();
};

$('to-register').onclick = () => { $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); $('to-register').classList.add('hidden'); $('to-login').classList.remove('hidden'); };
$('to-login').onclick = () => { $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); $('to-login').classList.add('hidden'); $('to-register').classList.remove('hidden'); };

function logout() {
  S.token = null; S.user = null;
  localStorage.removeItem('sm_token');
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  $('auth-screen').classList.remove('hidden');
  $('app').classList.add('hidden');
}

/* ═══════ BOOTSTRAP ═══════ */
async function bootstrap() {
  if (!S.token) return;
  const r = await api('/api/me');
  if (!r || !r.ok) return;
  S.user = await r.json();

  // Ghost mode from saved settings
  S.ghostMode = !S.user.privShowOnline && !S.user.privReadReceipts && !S.user.privShowTyping;
  updateGhostUI();

  // Load theme
  const saved = localStorage.getItem('sm_theme');
  if (saved) applyTheme(saved);

  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('app').classList.add('members-hidden');

  updateSidebarUser();
  updateMobSettings();
  connectSocket();
  loadChats();
  loadFriends();
  renderThemes();
}

/* ═══════ SOCKET ═══════ */
function connectSocket() {
  if (S.socket) S.socket.disconnect();
  S.socket = io({ auth: { token: S.token }, transports: ['websocket', 'polling'] });
  const sock = S.socket;

  sock.on('connect', () => console.log('[socket] connected'));

  // Online status
  sock.on('user_online', ({ userId }) => { S.onlineUsers.add(userId); refreshOnline(); });
  sock.on('user_offline', ({ userId }) => { S.onlineUsers.delete(userId); refreshOnline(); });

  // Messages
  sock.on('new_message', msg => {
    const chatIdx = S.chats.findIndex(c => c._id === msg.chat);
    if (chatIdx !== -1) {
      S.chats[chatIdx].lastMessage = { text: msg.text, type: msg.type, timestamp: msg.createdAt, senderName: msg.senderName, senderId: msg.sender };
      if (msg.chat !== S.currentChat?._id) S.chats[chatIdx].unreadCount = (S.chats[chatIdx].unreadCount || 0) + 1;
      // Move chat to top
      const [c] = S.chats.splice(chatIdx, 1);
      S.chats.unshift(c);
    }
    renderChatList();
    updateUnreadBadge();
    if (msg.chat === S.currentChat?._id) {
      S.messages.push(msg);
      appendMessage(msg);
      scrollToBottom();
      if (document.visibilityState === 'visible') sock.emit('mark_read', { chatId: msg.chat });
    }
  });

  sock.on('message_edited', ({ messageId, text }) => {
    if (S.currentChat) {
      const m = S.messages.find(m => m._id === messageId);
      if (m) { m.text = text; m.edited = true; renderMessages(); }
    }
  });

  sock.on('message_deleted', ({ messageId }) => {
    S.messages = S.messages.filter(m => m._id !== messageId);
    renderMessages();
  });

  sock.on('message_reaction', ({ messageId, reactions }) => {
    const m = S.messages.find(m => m._id === messageId);
    if (m) { m.reactions = reactions; renderMessages(); }
  });

  // Typing
  sock.on('user_typing', ({ userId, username }) => {
    if (S.currentChat) {
      S.typingTimers[userId] = { name: username, timer: Date.now() };
      updateTyping();
    }
  });
  sock.on('user_stopped_typing', ({ userId }) => { delete S.typingTimers[userId]; updateTyping(); });
  sock.on('messages_read', ({ chatId, userId }) => { /* could update read receipts UI */ });

  // Chat events
  sock.on('chat_created', chat => { S.chats.unshift(chat); renderChatList(); });
  sock.on('chat_updated', data => {
    const c = S.chats.find(c => c._id === data.chatId);
    if (c) { Object.assign(c, data); renderChatList(); if (S.currentChat?._id === data.chatId) updateChatHeader(); }
  });
  sock.on('chat_deleted', ({ chatId }) => {
    S.chats = S.chats.filter(c => c._id !== chatId);
    if (S.currentChat?._id === chatId) closeChat();
    renderChatList();
  });

  // Friends
  sock.on('friend_request', () => loadFriends());
  sock.on('friend_accepted', () => loadFriends());

  // ── CALLS (CORRECT integration with calls.js) ──
  sock.on('call_incoming', data => {
    // data: { from, fromName, fromAvatar, fromAvatarColor, offer, callType }
    if (window.callsModule?.isInCall()) {
      sock.emit('call_reject', { to: data.from });
      return;
    }
    S.incomingCall = data;
    showIncomingCall(data);
  });

  sock.on('call_accepting', () => {
    // Peer is accepting — stop ringtone if any
  });

  sock.on('call_answered', data => {
    // data: { from, answer }
    window.callsModule?.onAnswer(data);
    startCallTimer();
  });

  sock.on('call_ice', data => {
    // data: { from, candidate }
    window.callsModule?.onIce(data);
  });

  sock.on('call_rejected', data => {
    window.callsModule?.onEnded();
    showToast('Звонок отклонён', 'info');
  });

  sock.on('call_ended', data => {
    window.callsModule?.onEnded();
    stopCallTimer();
  });

  sock.on('call_busy', data => {
    window.callsModule?.onEnded();
    showToast('Абонент занят', 'warning');
  });

  sock.on('call_renegotiate', data => {
    // data: { from, offer, callType, renegotiate }
    window.callsModule?.onRenegotiate(data);
  });

  sock.on('call_status', data => {
    // data: { from, micMuted, camOff }
    window.callsModule?.onPeerStatus(data);
  });
}

/* ═══════ CALL TIMER ═══════ */
function startCallTimer() {
  let sec = 0;
  const el = $('call-audio-timer');
  stopCallTimer();
  window._callTimerInterval = setInterval(() => {
    sec++;
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    if (el) el.textContent = m + ':' + s;
  }, 1000);
}
function stopCallTimer() {
  clearInterval(window._callTimerInterval);
  window._callTimerInterval = null;
  const el = $('call-audio-timer');
  if (el) el.textContent = 'Подключение...';
}

/* ═══════ INCOMING CALL UI ═══════ */
function showIncomingCall(data) {
  const ov = $('incoming-call-overlay');
  $('incoming-name').textContent = data.fromName || 'Звонок';
  $('incoming-type').textContent = data.callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок';
  const av = $('incoming-avatar');
  if (data.fromAvatar) {
    av.innerHTML = `<img src="${data.fromAvatar}" alt="">`;
  } else {
    av.style.background = data.fromAvatarColor || '#5865f2';
    av.textContent = (data.fromName || '?')[0].toUpperCase();
  }
  ov.classList.remove('hidden');

  // Add call to history
  addCallHistory(data.fromName, data.callType, 'incoming');
}

function hideIncomingCall() {
  $('incoming-call-overlay').classList.add('hidden');
  S.incomingCall = null;
}

// Accept call
$('btn-accept').onclick = async () => {
  if (!S.incomingCall) return;
  const data = S.incomingCall;
  hideIncomingCall();
  try {
    // Set caller info on call overlay
    const av = $('call-audio-avatar');
    const nm = $('call-audio-name');
    if (av) {
      if (data.fromAvatar) av.innerHTML = `<img src="${data.fromAvatar}" alt="">`;
      else { av.style.background = data.fromAvatarColor || '#5865f2'; av.textContent = (data.fromName || '?')[0].toUpperCase(); }
    }
    if (nm) nm.textContent = data.fromName || '';

    S.socket.emit('call_accepting', { to: data.from });
    await window.callsModule?.acceptCall(data.from, data.offer, data.callType);
    startCallTimer();
  } catch (e) {
    showToast('Ошибка при принятии звонка', 'error');
  }
};

// Reject call
$('btn-reject').onclick = () => {
  if (!S.incomingCall) return;
  S.socket?.emit('call_reject', { to: S.incomingCall.from });
  hideIncomingCall();
};

// End call button
$('btn-end-call').onclick = () => {
  window.callsModule?.endCall();
  stopCallTimer();
};

// Toggle mute
$('toggle-mute').onclick = () => {
  const muted = window.callsModule?.toggleMute();
  $('toggle-mute')?.classList.toggle('vk-ctrl-off', muted);
};

// Toggle video
$('toggle-video').onclick = async () => {
  const off = await window.callsModule?.toggleVideo();
  $('toggle-video')?.classList.toggle('vk-ctrl-off', off);
};

// Toggle screen share
$('toggle-screen').onclick = async () => {
  try {
    const mod = window.callsModule;
    if ($('toggle-screen').classList.contains('sharing')) {
      await mod?.stopScreenShare();
      $('toggle-screen').classList.remove('sharing');
    } else {
      await mod?.startScreenShare();
      $('toggle-screen').classList.add('sharing');
    }
  } catch {
    showToast('Демонстрация экрана недоступна', 'warning');
  }
};

function addCallHistory(name, type, direction) {
  S.callHistory.unshift({ name, type, direction, time: Date.now() });
  if (S.callHistory.length > 50) S.callHistory.length = 50;
  localStorage.setItem('sm_callHistory', JSON.stringify(S.callHistory));
  renderCallHistory();
}

/* ═══════ DATA LOADING ═══════ */
async function loadChats() {
  const r = await api('/api/chats');
  if (!r || !r.ok) return;
  S.chats = await r.json();
  S.chats.forEach(c => { if (c.online) S.onlineUsers.add(c.members.find(m => m !== S.user._id)); });
  renderChatList();
  updateUnreadBadge();
}

async function loadFriends() {
  const [fr, pn, ou] = await Promise.all([api('/api/friends'), api('/api/friends/pending'), api('/api/friends/outgoing')]);
  if (fr?.ok) S.friends = await fr.json();
  if (pn?.ok) S.pending = await pn.json();
  if (ou?.ok) S.outgoing = await ou.json();
  renderContacts();
  // Badge for pending friend requests
  const badge = $('badge-contacts');
  if (S.pending.length > 0) { badge.textContent = S.pending.length; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

/* ═══════ RENDERING ═══════ */
function renderChatList() {
  const list = $('chat-list');
  const search = $('search-input').value.toLowerCase();
  const filtered = search ? S.chats.filter(c => (c.displayName || c.name || '').toLowerCase().includes(search)) : S.chats;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>Нет чатов</p></div>';
    return;
  }

  list.innerHTML = filtered.map(c => {
    const isActive = S.currentChat?._id === c._id;
    const online = c.type === 'private' && S.onlineUsers.has(c.members?.find(m => m !== S.user._id));
    const name = html(c.displayName || c.name || 'Чат');
    const lm = c.lastMessage;
    let lastText = '';
    if (lm) {
      if (lm.type === 'image') lastText = '🖼 Фото';
      else if (lm.type === 'file') lastText = '📎 Файл';
      else if (lm.type === 'voice') lastText = '🎤 Голосовое';
      else lastText = html(lm.text || '');
      if (lm.senderName && c.type === 'group') lastText = html(lm.senderName) + ': ' + lastText;
    }
    const time = lm ? timeAgo(lm.timestamp) : '';
    const badge = c.unreadCount > 0 ? `<span class="ci-badge">${c.unreadCount > 99 ? '99+' : c.unreadCount}</span>` : '';

    return `<div class="chat-item${isActive ? ' active' : ''}" data-id="${c._id}">
      <div class="ci-avatar" style="background:${c.displayAvatarColor || '#5865f2'}">
        ${c.displayAvatar ? `<img src="${c.displayAvatar}" alt="">` : html((c.displayName || c.name || '?')[0].toUpperCase())}
        ${online ? '<div class="ci-online"></div>' : ''}
      </div>
      <div class="ci-body">
        <div class="ci-top"><span class="ci-name">${name}</span><span class="ci-time">${time}</span></div>
        <div class="ci-bottom"><span class="ci-msg">${lastText || 'Начните общение...'}</span>${badge}</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.chat-item').forEach(el => {
    el.onclick = () => openChat(el.dataset.id);
  });
}

function renderContacts() {
  const list = $('contacts-list');
  const tab = S.contactTab;

  if (tab === 'friends') {
    if (!S.friends.length) { list.innerHTML = '<div class="empty-state"><i class="fas fa-user-group"></i><p>Нет друзей</p></div>'; return; }
    list.innerHTML = S.friends.map(f => contactItem(f, [
      { icon: 'fa-comment', action: 'message', title: 'Написать' },
      { icon: 'fa-phone', action: 'call', title: 'Звонок' },
      { icon: 'fa-user-minus', action: 'unfriend', cls: 'ct-reject', title: 'Удалить' }
    ])).join('');
  } else if (tab === 'pending') {
    if (!S.pending.length) { list.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Нет входящих запросов</p></div>'; return; }
    list.innerHTML = S.pending.map(f => contactItem(f, [
      { icon: 'fa-check', action: 'accept', title: 'Принять' },
      { icon: 'fa-xmark', action: 'reject', cls: 'ct-reject', title: 'Отклонить' }
    ])).join('');
  } else if (tab === 'outgoing') {
    if (!S.outgoing.length) { list.innerHTML = '<div class="empty-state"><i class="fas fa-paper-plane"></i><p>Нет исходящих запросов</p></div>'; return; }
    list.innerHTML = S.outgoing.map(f => contactItem(f, [
      { icon: 'fa-xmark', action: 'cancel-request', cls: 'ct-reject', title: 'Отменить' }
    ])).join('');
  } else if (tab === 'search') {
    // handled by search button
    return;
  }

  bindContactActions();
}

function contactItem(f, actions) {
  const online = S.onlineUsers.has(f._id);
  const status = online ? 'В сети' : 'Не в сети';
  const btns = actions.map(a =>
    `<button data-action="${a.action}" data-id="${f._id}" class="${a.cls || ''}" title="${a.title}"><i class="fas ${a.icon}"></i></button>`
  ).join('');
  return `<div class="contact-item">
    <div class="ct-avatar" style="background:${f.avatarColor || '#5865f2'}">
      ${f.avatar ? `<img src="${f.avatar}" alt="">` : html((f.displayName || f.username || '?')[0].toUpperCase())}
    </div>
    <div class="ct-info"><div class="ct-name">${html(f.displayName || f.username)}</div><div class="ct-status">${status}</div></div>
    <div class="ct-actions">${btns}</div>
  </div>`;
}

function bindContactActions() {
  qsa('.ct-actions button').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'accept') { await api(`/api/friends/accept/${id}`, { method: 'POST' }); loadFriends(); showToast('Запрос принят', 'success'); }
      if (action === 'reject') { await api(`/api/friends/reject/${id}`, { method: 'POST' }); loadFriends(); }
      if (action === 'unfriend' || action === 'cancel-request') { await api(`/api/friends/${id}`, { method: 'DELETE' }); loadFriends(); }
      if (action === 'message') { await openOrCreateDM(id); }
      if (action === 'call') { await openOrCreateDM(id); startCallTo(id, 'audio'); }
      if (action === 'add') { await api(`/api/friends/request`, { method: 'POST', body: JSON.stringify({ userId: id }) }); showToast('Запрос отправлен', 'success'); loadFriends(); }
    };
  });
}

async function openOrCreateDM(userId) {
  let chat = S.chats.find(c => c.type === 'private' && c.members.includes(userId));
  if (!chat) {
    const r = await api('/api/chats', { method: 'POST', body: JSON.stringify({ memberId: userId }) });
    if (!r?.ok) return;
    chat = await r.json();
    S.chats.unshift(chat);
    renderChatList();
  }
  openChat(chat._id);
}

function renderCallHistory() {
  const list = $('calls-list');
  const empty = $('calls-empty');
  if (!S.callHistory.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = S.callHistory.map(c => {
    const icon = c.type === 'video' ? 'fa-video' : 'fa-phone';
    const dir = c.direction === 'incoming' ? 'fa-arrow-down' : 'fa-arrow-up';
    const dirColor = c.direction === 'incoming' ? 'var(--green)' : 'var(--brand)';
    return `<div class="contact-item">
      <div class="ct-avatar" style="background:var(--bg-active)"><i class="fas ${icon}"></i></div>
      <div class="ct-info"><div class="ct-name">${html(c.name)}</div><div class="ct-status">${timeAgo(c.time)}</div></div>
      <i class="fas ${dir}" style="color:${dirColor};font-size:12px"></i>
    </div>`;
  }).join('');
}

/* ═══════ MESSAGES ═══════ */
async function loadMessages(chatId) {
  const r = await api(`/api/chats/${chatId}/messages`);
  if (!r?.ok) return;
  S.messages = await r.json();
  renderMessages();
  scrollToBottom(true);
  S.socket?.emit('mark_read', { chatId });
}

function renderMessages() {
  const area = $('messages-area');
  if (!S.messages.length) { area.innerHTML = '<div class="empty-state" style="padding:40px 0"><i class="fas fa-comment-slash"></i><p>Нет сообщений</p></div>'; return; }

  let out = '';
  let lastDate = '';
  let lastSender = '';
  let lastTime = 0;

  S.messages.forEach(m => {
    // Date separator
    const d = dateSep(m.createdAt);
    if (d !== lastDate) { out += `<div class="msg-date-sep">${d}</div>`; lastDate = d; lastSender = ''; }

    // System message
    if (m.type === 'system') { out += `<div class="msg-system">${html(m.text)}</div>`; return; }

    const isCollapsed = m.sender === lastSender && (new Date(m.createdAt) - lastTime) < 300000;
    const color = m.senderAvatarColor || '#5865f2';
    const name = m.senderName || 'Пользователь';

    out += `<div class="msg${isCollapsed ? ' msg-collapsed' : ''}" data-id="${m._id}" data-sender="${m.sender}">`;

    if (!isCollapsed) {
      out += `<div class="msg-av" style="background:${color}" data-uid="${m.sender}">`;
      if (m.senderAvatar) out += `<img src="${m.senderAvatar}" alt="">`;
      else out += html(name[0].toUpperCase());
      out += `</div>`;
    } else {
      out += `<div class="msg-av"></div>`;
    }

    out += `<div class="msg-body">`;
    if (!isCollapsed) {
      out += `<div class="msg-top"><span class="msg-author" style="color:${color}" data-uid="${m.sender}">${html(name)}</span>`;
      out += `<span class="msg-time">${fullTime(m.createdAt)}</span>`;
      if (m.edited) out += `<span class="msg-edited">(ред.)</span>`;
      out += `</div>`;
    }

    // Reply
    if (m.replyTo) {
      const rep = S.messages.find(x => x._id === m.replyTo._id || x._id === m.replyTo);
      if (rep) out += `<div class="msg-reply" data-reply="${rep._id}"><b>${html(rep.senderName || '')}</b>${html((rep.text || '').substring(0, 60))}</div>`;
    }

    // Content
    if (m.type === 'image' || (m.fileUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.fileUrl))) {
      out += `<div class="msg-content"><img src="${m.fileUrl}" alt="image" class="msg-img"></div>`;
      if (m.text) out += `<div class="msg-content">${linkify(html(m.text))}</div>`;
    } else if (m.type === 'file' || m.fileUrl) {
      out += `<div class="msg-file"><i class="fas fa-file"></i><a href="${m.fileUrl}" target="_blank" rel="noopener">${html(m.fileName || 'Файл')}</a></div>`;
      if (m.text) out += `<div class="msg-content">${linkify(html(m.text))}</div>`;
    } else {
      out += `<div class="msg-content">${linkify(html(m.text || ''))}</div>`;
    }

    // Reactions
    if (m.reactions && Object.keys(m.reactions).length) {
      out += `<div class="msg-reactions">`;
      for (const [emoji, users] of Object.entries(m.reactions)) {
        if (!users.length) continue;
        const reacted = users.includes(S.user._id);
        out += `<span class="msg-react-btn${reacted ? ' reacted' : ''}" data-emoji="${emoji}" data-mid="${m._id}">${emoji} ${users.length}</span>`;
      }
      out += `</div>`;
    }

    out += `</div></div>`;
    lastSender = m.sender;
    lastTime = new Date(m.createdAt);
  });

  area.innerHTML = out;

  // Bind events
  area.querySelectorAll('.msg-img').forEach(img => { img.onclick = () => openLightbox(img.src); });
  area.querySelectorAll('.msg-react-btn').forEach(btn => {
    btn.onclick = () => toggleReaction(btn.dataset.mid, btn.dataset.emoji);
  });
  area.querySelectorAll('.msg-av[data-uid], .msg-author[data-uid]').forEach(el => {
    el.onclick = () => showProfile(el.dataset.uid);
  });
  area.querySelectorAll('.msg-reply[data-reply]').forEach(el => {
    el.onclick = () => {
      const target = area.querySelector(`.msg[data-id="${el.dataset.reply}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });

  // Context menu on messages
  area.querySelectorAll('.msg[data-id]').forEach(el => {
    el.oncontextmenu = e => { e.preventDefault(); showMsgContextMenu(e, el.dataset.id, el.dataset.sender); };
    // Long press for mobile
    let timer;
    el.ontouchstart = e => { timer = setTimeout(() => showMsgContextMenu(e.touches[0], el.dataset.id, el.dataset.sender), 500); };
    el.ontouchend = () => clearTimeout(timer);
    el.ontouchmove = () => clearTimeout(timer);
  });
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function scrollToBottom(instant) {
  const c = $('messages-container');
  if (c) {
    if (instant) c.scrollTop = c.scrollHeight;
    else c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
  }
}

function appendMessage(msg) {
  // Re-render for simplicity (handles grouping)
  renderMessages();
}

/* ═══════ CHAT OPERATIONS ═══════ */
async function openChat(chatId) {
  const chat = S.chats.find(c => c._id === chatId);
  if (!chat) return;
  S.currentChat = chat;
  S.replyTo = null;
  S.editMsg = null;
  S.typingTimers = {};

  // UI
  $('welcome-screen').classList.add('hidden');
  $('chat-view').classList.remove('hidden');
  $('reply-bar').classList.add('hidden');
  $('edit-bar').classList.add('hidden');
  $('typing-bar').classList.add('hidden');
  $('msg-input').value = '';

  updateChatHeader();
  renderChatList();
  loadMessages(chatId);

  // Join room
  S.socket?.emit('join_chat', { chatId });

  // Load members for group
  if (chat.type === 'group' && chat.membersInfo) {
    S.groupMembers = chat.membersInfo;
    renderMembers();
  }

  // Mobile: show chat area
  if (S.isMobile) {
    S.chatOpen = true;
    $('app').classList.add('chat-open');
  }

  // Clear unread
  chat.unreadCount = 0;
  renderChatList();
  updateUnreadBadge();
}

function closeChat() {
  S.currentChat = null;
  S.chatOpen = false;
  $('app').classList.remove('chat-open');
  $('welcome-screen').classList.remove('hidden');
  $('chat-view').classList.add('hidden');
  renderChatList();
}

function updateChatHeader() {
  const c = S.currentChat;
  if (!c) return;
  $('ch-name').textContent = c.displayName || c.name || 'Чат';
  const av = $('ch-avatar');
  av.style.background = c.displayAvatarColor || '#5865f2';
  if (c.displayAvatar) av.innerHTML = `<img src="${c.displayAvatar}" alt="">`;
  else av.textContent = (c.displayName || c.name || '?')[0].toUpperCase();

  if (c.type === 'private') {
    const partnerId = c.members?.find(m => m !== S.user._id);
    const online = S.onlineUsers.has(partnerId);
    $('ch-status').textContent = online ? 'в сети' : 'не в сети';
  } else {
    $('ch-status').textContent = (c.membersInfo?.length || c.members?.length || 0) + ' участников';
  }
}

// Send message
async function sendMessage() {
  const input = $('msg-input');
  const text = input.value.trim();
  if (!text && !S.editMsg) return;
  if (!S.currentChat) return;

  if (S.editMsg) {
    // Edit mode
    const r = await api(`/api/messages/${S.editMsg}`, { method: 'PUT', body: JSON.stringify({ text }) });
    if (r?.ok) {
      S.editMsg = null;
      $('edit-bar').classList.add('hidden');
      input.value = '';
    }
    return;
  }

  const body = { text };
  if (S.replyTo) { body.replyTo = S.replyTo; S.replyTo = null; $('reply-bar').classList.add('hidden'); }
  const r = await api(`/api/chats/${S.currentChat._id}/messages`, { method: 'POST', body: JSON.stringify(body) });
  if (r?.ok) {
    input.value = '';
    input.style.height = 'auto';
    S.socket?.emit('typing_stop', { chatId: S.currentChat._id });
  }
}

$('btn-send').onclick = sendMessage;
$('msg-input').onkeydown = e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

// Typing indicator
let typingTimeout;
$('msg-input').oninput = () => {
  // Auto-resize
  const el = $('msg-input');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';

  // Typing signal
  if (!S.currentChat || S.ghostMode) return;
  if (!typingTimeout) S.socket?.emit('typing_start', { chatId: S.currentChat._id });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    S.socket?.emit('typing_stop', { chatId: S.currentChat._id });
    typingTimeout = null;
  }, 2000);
};

function updateTyping() {
  const bar = $('typing-bar');
  const text = $('typing-text');
  const names = Object.values(S.typingTimers).map(t => t.name).filter(Boolean);
  if (!names.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  text.textContent = names.length === 1 ? names[0] + ' печатает' : names.join(', ') + ' печатают';
}

// Reply
function setReply(msgId) {
  const msg = S.messages.find(m => m._id === msgId);
  if (!msg) return;
  S.replyTo = msgId;
  $('reply-name').textContent = msg.senderName || '';
  $('reply-text').textContent = (msg.text || '').substring(0, 50);
  $('reply-bar').classList.remove('hidden');
  $('edit-bar').classList.add('hidden');
  S.editMsg = null;
  $('msg-input').focus();
}
$('reply-cancel').onclick = () => { S.replyTo = null; $('reply-bar').classList.add('hidden'); };

// Edit
function setEdit(msgId) {
  const msg = S.messages.find(m => m._id === msgId);
  if (!msg) return;
  S.editMsg = msgId;
  $('msg-input').value = msg.text || '';
  $('edit-bar').classList.remove('hidden');
  $('reply-bar').classList.add('hidden');
  S.replyTo = null;
  $('msg-input').focus();
}
$('edit-cancel').onclick = () => { S.editMsg = null; $('edit-bar').classList.add('hidden'); $('msg-input').value = ''; };

// Delete
async function deleteMessage(msgId) {
  await api(`/api/messages/${msgId}`, { method: 'DELETE' });
}

// React
async function toggleReaction(msgId, emoji) {
  await api(`/api/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
}

/* ═══════ START CALL ═══════ */
async function startCallTo(userId, type) {
  if (window.callsModule?.isInCall()) return showToast('Вы уже в звонке', 'warning');
  // Set call overlay info
  const chat = S.currentChat;
  if (chat) {
    const av = $('call-audio-avatar');
    const nm = $('call-audio-name');
    if (av) {
      if (chat.displayAvatar) av.innerHTML = `<img src="${chat.displayAvatar}" alt="">`;
      else { av.style.background = chat.displayAvatarColor || '#5865f2'; av.textContent = (chat.displayName || '?')[0].toUpperCase(); }
    }
    if (nm) nm.textContent = chat.displayName || '';
  }
  try {
    await window.callsModule?.startCall(userId, type);
    addCallHistory(chat?.displayName || 'Звонок', type, 'outgoing');
  } catch (e) {
    showToast('Не удалось начать звонок', 'error');
  }
}

$('btn-audio-call').onclick = () => {
  if (!S.currentChat || S.currentChat.type !== 'private') return;
  const peer = S.currentChat.members.find(m => m !== S.user._id);
  if (peer) startCallTo(peer, 'audio');
};
$('btn-video-call').onclick = () => {
  if (!S.currentChat || S.currentChat.type !== 'private') return;
  const peer = S.currentChat.members.find(m => m !== S.user._id);
  if (peer) startCallTo(peer, 'video');
};

/* ═══════ CONTEXT MENU ═══════ */
function showMsgContextMenu(e, msgId, senderId) {
  const menu = $('ctx-menu');
  const items = $('ctx-items');
  const isMine = senderId === S.user._id;

  let html_str = '';
  html_str += `<div class="ctx-item" data-act="reply" data-id="${msgId}"><i class="fas fa-reply"></i> Ответить</div>`;
  html_str += `<div class="ctx-item" data-act="react" data-id="${msgId}"><i class="fas fa-face-smile"></i> Реакция</div>`;
  if (isMine) {
    html_str += `<div class="ctx-item" data-act="edit" data-id="${msgId}"><i class="fas fa-pen"></i> Редактировать</div>`;
    html_str += `<div class="ctx-item danger" data-act="delete" data-id="${msgId}"><i class="fas fa-trash"></i> Удалить</div>`;
  }
  items.innerHTML = html_str;

  // Position
  const x = e.clientX || e.pageX;
  const y = e.clientY || e.pageY;
  menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  menu.classList.remove('hidden');

  items.querySelectorAll('.ctx-item').forEach(el => {
    el.onclick = () => {
      const act = el.dataset.act;
      const id = el.dataset.id;
      if (act === 'reply') setReply(id);
      if (act === 'edit') setEdit(id);
      if (act === 'delete') deleteMessage(id);
      if (act === 'react') showQuickReact(id, x, y);
      menu.classList.add('hidden');
    };
  });
}

function showQuickReact(msgId, x, y) {
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👎', '🎉'];
  const menu = $('ctx-menu');
  const items = $('ctx-items');
  items.innerHTML = emojis.map(e => `<span class="msg-react-btn" style="font-size:20px;padding:6px;cursor:pointer" data-e="${e}">${e}</span>`).join('');
  items.style.display = 'flex';
  items.style.gap = '4px';
  menu.style.left = Math.min(x, window.innerWidth - 260) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 60) + 'px';
  menu.classList.remove('hidden');
  items.querySelectorAll('[data-e]').forEach(el => {
    el.onclick = () => { toggleReaction(msgId, el.dataset.e); menu.classList.add('hidden'); items.style.display = ''; };
  });
}

// Close context menu on click outside
document.addEventListener('click', e => {
  if (!$('ctx-menu').contains(e.target)) $('ctx-menu').classList.add('hidden');
  if (!$('emoji-picker').contains(e.target) && e.target !== $('btn-emoji')) $('emoji-picker').classList.add('hidden');
});

/* ═══════ FILE UPLOAD ═══════ */
$('btn-attach').onclick = () => $('file-input').click();
$('file-input').onchange = async () => {
  const files = $('file-input').files;
  if (!files.length || !S.currentChat) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api(`/api/chats/${S.currentChat._id}/upload`, { method: 'POST', body: fd, headers: {} });
    if (r?.ok) showToast('Файл отправлен', 'success');
    else showToast('Ошибка загрузки', 'error');
  }
  $('file-input').value = '';
};

/* ═══════ EMOJI PICKER ═══════ */
const EMOJI_DATA = {
  'Смайлы': ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🥸','🤗','😏','😶','😐','😑','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🤠','🥳','🥺','😢','😭','😤','😡','🤬','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'Жесты': ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐','✋','🖖','👏','🙌','🤲','🤝','🙏','💪','🦾','🖕'],
  'Сердца': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Предметы': ['🔥','⭐','🌟','✨','💫','🎉','🎊','🎈','🏆','🥇','🥈','🥉','⚽','🏀','🎮','🎬','🎵','🎶','🎤','🎧','📱','💻','⌨️','🖥','💡','📚','✏️','📝'],
  'Еда': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🥝','🍅','🌽','🍕','🍔','🍟','🌭','🍿','🧀','🥚','🍳','🥞','🧇','🥐','🍞','☕','🍵','🧃','🍺','🍷','🥤'],
  'Природа': ['🌍','🌎','🌏','🌙','⭐','☀️','🌤','⛅','🌧','⛈','🌩','🌨','❄️','🌊','🌸','🌺','🌻','🌹','🍀','🌲','🌴','🍂','🍁','🌈','🔥','💧'],
};
let currentEmojiCat = Object.keys(EMOJI_DATA)[0];

function renderEmojiPicker() {
  const cats = $('emoji-cats');
  const grid = $('emoji-grid');
  const catEmojis = { 'Смайлы': '😀', 'Жесты': '👍', 'Сердца': '❤️', 'Предметы': '🔥', 'Еда': '🍎', 'Природа': '🌍' };
  cats.innerHTML = Object.keys(EMOJI_DATA).map(c =>
    `<button class="${c === currentEmojiCat ? 'active' : ''}" data-cat="${c}">${catEmojis[c] || '📦'}</button>`
  ).join('');
  grid.innerHTML = EMOJI_DATA[currentEmojiCat].map(e => `<span data-e="${e}">${e}</span>`).join('');

  cats.querySelectorAll('button').forEach(b => {
    b.onclick = () => { currentEmojiCat = b.dataset.cat; renderEmojiPicker(); };
  });
  grid.querySelectorAll('span').forEach(s => {
    s.onclick = () => {
      const input = $('msg-input');
      input.value += s.dataset.e;
      input.focus();
    };
  });
}

$('btn-emoji').onclick = e => {
  e.stopPropagation();
  const picker = $('emoji-picker');
  if (!picker.classList.contains('hidden')) { picker.classList.add('hidden'); return; }
  renderEmojiPicker();
  // Position
  const rect = $('btn-emoji').getBoundingClientRect();
  if (S.isMobile) {
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.right = '8px';
    picker.style.left = 'auto';
    picker.style.top = 'auto';
  } else {
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.right = '16px';
    picker.style.left = 'auto';
    picker.style.top = 'auto';
  }
  picker.classList.remove('hidden');
};

/* ═══════ LIGHTBOX ═══════ */
function openLightbox(src) {
  $('lb-img').src = src;
  $('lightbox').classList.remove('hidden');
}
$('lb-close').onclick = () => $('lightbox').classList.add('hidden');
$('lightbox').onclick = e => { if (e.target === $('lightbox')) $('lightbox').classList.add('hidden'); };

/* ═══════ NAVIGATION ═══════ */
// Back button (mobile)
$('chat-back').onclick = closeChat;

// Bottom tabs
qsa('.btab').forEach(btn => {
  btn.onclick = () => {
    const tab = btn.dataset.tab;
    S.activeTab = tab;
    qsa('.btab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    qsa('.tab-pane').forEach(p => p.classList.remove('active'));
    $('tab-' + tab)?.classList.add('active');

    // Update panel title
    const titles = { chats: 'Чаты', contacts: 'Контакты', calls: 'Звонки', settings: 'Настройки' };
    $('panel-title').textContent = titles[tab] || '';

    // Show/hide panel buttons
    const btns = qs('.panel-btns');
    if (btns) btns.style.display = tab === 'chats' ? 'flex' : 'none';

    // Show contacts search for search tab
    if (tab === 'contacts') renderContacts();
    if (tab === 'calls') renderCallHistory();
    if (tab === 'settings') updateMobSettings();
  };
});

// Sidebar nav
$('nav-dms').onclick = () => {
  qsa('.sb-icon').forEach(b => b.classList.remove('active'));
  $('nav-dms').classList.add('active');
  S.activeTab = 'chats';
  $('panel-title').textContent = 'Чаты';
  qsa('.tab-pane').forEach(p => p.classList.remove('active'));
  $('tab-chats').classList.add('active');
  qs('.panel-btns').style.display = 'flex';
};

$('nav-settings').onclick = () => openSettings();

// Contacts sub-tabs
qsa('.sub-tab').forEach(btn => {
  btn.onclick = () => {
    S.contactTab = btn.dataset.ct;
    qsa('.sub-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sw = $('contacts-search-wrap');
    if (S.contactTab === 'search') { sw.classList.remove('hidden'); $('contacts-list').innerHTML = ''; }
    else { sw.classList.add('hidden'); renderContacts(); }
  };
});

// User search in contacts
$('btn-contacts-search').onclick = async () => {
  const q = $('contacts-search').value.trim();
  if (!q) return;
  const r = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  if (!r?.ok) return;
  const users = await r.json();
  const list = $('contacts-list');
  if (!users.length) { list.innerHTML = '<div class="empty-state"><p>Не найдено</p></div>'; return; }
  list.innerHTML = users.filter(u => u._id !== S.user._id).map(u => contactItem(u, [
    { icon: 'fa-user-plus', action: 'add', title: 'Добавить в друзья' },
    { icon: 'fa-comment', action: 'message', title: 'Написать' }
  ])).join('');
  bindContactActions();
};

$('contacts-search').onkeydown = e => { if (e.key === 'Enter') $('btn-contacts-search').click(); };

// Search chats
$('search-input').oninput = () => renderChatList();

// Members panel toggle
$('btn-members').onclick = () => {
  if (S.isMobile) {
    $('members-panel').classList.toggle('mob-show');
  } else {
    const hidden = $('app').classList.toggle('members-hidden');
    $('members-panel').classList.toggle('hidden', hidden);
  }
};
$('members-close').onclick = () => {
  if (S.isMobile) $('members-panel').classList.remove('mob-show');
  else { $('app').classList.add('members-hidden'); $('members-panel').classList.add('hidden'); }
};

function renderMembers() {
  const list = $('members-list');
  if (!S.groupMembers.length) { list.innerHTML = ''; return; }
  list.innerHTML = S.groupMembers.map(m => {
    const online = S.onlineUsers.has(m._id || m.id);
    return `<div class="member-item" data-uid="${m._id || m.id}">
      <div class="m-avatar" style="background:${m.avatarColor || '#5865f2'}">
        ${m.avatar ? `<img src="${m.avatar}" alt="">` : html((m.displayName || m.username || '?')[0].toUpperCase())}
        <div class="m-dot ${online ? 'on' : 'off'}"></div>
      </div>
      <span class="m-name ${online ? 'm-online' : ''}">${html(m.displayName || m.username || 'User')}</span>
    </div>`;
  }).join('');
  list.querySelectorAll('.member-item').forEach(el => {
    el.onclick = () => showProfile(el.dataset.uid);
  });
}

/* ═══════ PROFILE VIEWER ═══════ */
async function showProfile(userId) {
  const r = await api(`/api/users/${userId}`);
  if (!r?.ok) return;
  const u = await r.json();
  const av = $('pv-avatar');
  av.style.background = u.avatarColor || '#5865f2';
  if (u.avatar) av.innerHTML = `<img src="${u.avatar}" alt="">`;
  else av.textContent = (u.displayName || u.username || '?')[0].toUpperCase();
  $('pv-name').textContent = u.displayName || u.username || '';
  $('pv-username').textContent = '@' + (u.username || '');
  $('pv-bio').textContent = u.bio || '';

  // Actions
  const actions = $('pv-actions');
  if (userId === S.user._id) {
    actions.innerHTML = '<button class="btn-primary" onclick="openSettings()">Настройки</button>';
  } else {
    const isFriend = S.friends.some(f => f._id === userId);
    let btns = `<button class="btn-primary" onclick="openOrCreateDM('${userId}')">Написать</button>`;
    if (!isFriend) btns += `<button class="btn-sm" onclick="addFriend('${userId}')">Добавить в друзья</button>`;
    actions.innerHTML = btns;
  }

  $('profile-viewer').classList.remove('hidden');
}
$('profile-close').onclick = () => $('profile-viewer').classList.add('hidden');
$('profile-viewer').onclick = e => { if (e.target === $('profile-viewer')) $('profile-viewer').classList.add('hidden'); };

window.addFriend = async (id) => {
  await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ userId: id }) });
  showToast('Запрос отправлен', 'success');
  loadFriends();
  $('profile-viewer').classList.add('hidden');
};

// Chat header click — show profile
$('ch-click').onclick = () => {
  if (!S.currentChat) return;
  if (S.currentChat.type === 'private') {
    const peer = S.currentChat.members.find(m => m !== S.user._id);
    if (peer) showProfile(peer);
  }
};

/* ═══════ NEW CHAT / GROUP ═══════ */
$('btn-new-chat').onclick = async () => {
  const name = prompt('Введите имя пользователя для чата:');
  if (!name) return;
  const r = await api(`/api/users/search?q=${encodeURIComponent(name.trim())}`);
  if (!r?.ok) return;
  const users = await r.json();
  const target = users.find(u => u._id !== S.user._id);
  if (!target) return showToast('Пользователь не найден', 'error');
  await openOrCreateDM(target._id);
};

$('btn-new-group').onclick = () => {
  $('modal-group').classList.remove('hidden');
  $('group-name').value = '';
  $('group-search').value = '';
  $('group-chips').innerHTML = '';
  $('group-results').innerHTML = '';
  window._groupMembers = [];
};

let groupSearchTimer;
$('group-search').oninput = () => {
  clearTimeout(groupSearchTimer);
  groupSearchTimer = setTimeout(async () => {
    const q = $('group-search').value.trim();
    if (!q) { $('group-results').innerHTML = ''; return; }
    const r = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (!r?.ok) return;
    const users = await r.json();
    $('group-results').innerHTML = users.filter(u => u._id !== S.user._id && !window._groupMembers.includes(u._id)).map(u =>
      `<div class="contact-item" data-uid="${u._id}">
        <div class="ct-avatar" style="background:${u.avatarColor || '#5865f2'}">${u.avatar ? `<img src="${u.avatar}">` : html((u.displayName||u.username||'?')[0].toUpperCase())}</div>
        <div class="ct-info"><div class="ct-name">${html(u.displayName||u.username)}</div></div>
        <div class="ct-actions"><button class="btn-sm" data-add="${u._id}" data-name="${html(u.displayName||u.username)}"><i class="fas fa-plus"></i></button></div>
      </div>`
    ).join('');
    $('group-results').querySelectorAll('[data-add]').forEach(btn => {
      btn.onclick = () => {
        window._groupMembers.push(btn.dataset.add);
        $('group-chips').innerHTML += `<span class="group-chip" data-uid="${btn.dataset.add}">${btn.dataset.name} <i class="fas fa-xmark"></i></span>`;
        btn.closest('.contact-item').remove();
        // Remove chip on click
        $('group-chips').querySelectorAll('.group-chip').forEach(chip => {
          chip.onclick = () => { window._groupMembers = window._groupMembers.filter(id => id !== chip.dataset.uid); chip.remove(); };
        });
      };
    });
  }, 300);
};

$('btn-create-group').onclick = async () => {
  const name = $('group-name').value.trim();
  if (!name) return showToast('Введите название', 'warning');
  if (!window._groupMembers.length) return showToast('Добавьте участников', 'warning');
  const r = await api('/api/chats/group', { method: 'POST', body: JSON.stringify({ name, members: window._groupMembers }) });
  if (r?.ok) {
    const chat = await r.json();
    S.chats.unshift(chat);
    renderChatList();
    openChat(chat._id);
    $('modal-group').classList.add('hidden');
    showToast('Группа создана', 'success');
  }
};

/* ═══════ SETTINGS ═══════ */
function openSettings() {
  const m = $('modal-settings');
  $('set-displayname').value = S.user.displayName || '';
  $('set-bio').value = S.user.bio || '';
  $('set-ghost').checked = S.ghostMode;
  loadSessions();
  m.classList.remove('hidden');
}

$('btn-save-profile').onclick = async () => {
  const r = await api('/api/me', { method: 'PUT', body: JSON.stringify({
    displayName: $('set-displayname').value.trim(),
    bio: $('set-bio').value.trim()
  }) });
  if (r?.ok) {
    S.user = await r.json();
    updateSidebarUser();
    updateMobSettings();
    showToast('Профиль обновлён', 'success');
  }
};

$('btn-change-pw').onclick = async () => {
  const pw = $('set-password').value;
  if (!pw) return;
  const r = await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ password: pw }) });
  if (r?.ok) { $('set-password').value = ''; showToast('Пароль изменён', 'success'); }
  else showToast('Ошибка', 'error');
};

$('set-avatar-btn').onclick = () => $('avatar-input').click();
$('avatar-input').onchange = async () => {
  const file = $('avatar-input').files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('avatar', file);
  const r = await api('/api/me/avatar', { method: 'POST', body: fd, headers: {} });
  if (r?.ok) {
    S.user = await r.json();
    updateSidebarUser();
    updateMobSettings();
    showToast('Аватар обновлён', 'success');
  }
  $('avatar-input').value = '';
};

$('set-ghost').onchange = () => toggleGhostMode($('set-ghost').checked);

$('btn-logout').onclick = logout;

async function loadSessions() {
  const r = await api('/api/me/sessions');
  if (!r?.ok) return;
  const sessions = await r.json();
  $('sessions-list').innerHTML = sessions.map(s =>
    `<div class="session-item ${s.current ? 'current' : ''}"><span>${s.current ? '🟢 Текущая' : '⚪ Другая'} — ${new Date(s.createdAt).toLocaleDateString('ru')}</span></div>`
  ).join('');
}

$('btn-revoke').onclick = async () => {
  await api('/api/me/sessions/revoke', { method: 'POST' });
  showToast('Сессии завершены', 'success');
  loadSessions();
};

// Close modals
qsa('[data-close]').forEach(btn => {
  btn.onclick = () => $(btn.dataset.close)?.classList.add('hidden');
});
qsa('.modal-overlay').forEach(ov => {
  ov.onclick = e => { if (e.target === ov) ov.classList.add('hidden'); };
});

/* ═══════ GHOST MODE 👻 ═══════ */
async function toggleGhostMode(on) {
  S.ghostMode = on;
  const r = await api('/api/me', { method: 'PUT', body: JSON.stringify({
    privShowOnline: !on,
    privReadReceipts: !on,
    privShowTyping: !on
  }) });
  if (r?.ok) S.user = await r.json();
  updateGhostUI();
  showToast(on ? '👻 Режим Призрака активирован' : 'Режим Призрака отключён', on ? 'success' : 'info');
}

function updateGhostUI() {
  document.body.classList.toggle('ghost-active', S.ghostMode);
  $('ghost-toggle')?.classList.toggle('ghost-active', S.ghostMode);
  const mob = $('ghost-mob-badge');
  if (mob) { mob.textContent = S.ghostMode ? 'Вкл' : 'Выкл'; mob.className = 'mob-badge ' + (S.ghostMode ? 'on' : 'off'); }
  const checkbox = $('set-ghost');
  if (checkbox) checkbox.checked = S.ghostMode;
}

// Ghost toggle button (sidebar)
$('ghost-toggle').onclick = () => toggleGhostMode(!S.ghostMode);

/* ═══════ THEMES ═══════ */
const THEMES = [
  { id: '', name: 'Discord', colors: ['#1e1f22','#2b2d31','#313338'] },
  { id: 'midnight', name: 'Midnight', colors: ['#0d1117','#161b22','#1c2128'] },
  { id: 'forest', name: 'Forest', colors: ['#1a1e1a','#22291f','#2a3328'] },
  { id: 'crimson', name: 'Crimson', colors: ['#1a1013','#261418','#30181e'] },
  { id: 'purple', name: 'Purple', colors: ['#16101e','#1e1529','#261a34'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0a1628','#0f1f36','#142844'] },
  { id: 'sunset', name: 'Sunset', colors: ['#1a1210','#261915','#33201a'] },
  { id: 'nord', name: 'Nord', colors: ['#2e3440','#3b4252','#434c5e'] },
  { id: 'monokai', name: 'Monokai', colors: ['#1e1f1c','#272822','#2f302b'] },
  { id: 'dracula', name: 'Dracula', colors: ['#21222c','#282a36','#2d2f3d'] },
  { id: 'solarized', name: 'Solarized', colors: ['#002b36','#073642','#0a3d4a'] },
  { id: 'onedark', name: 'One Dark', colors: ['#21252b','#282c34','#2c313c'] },
  { id: 'gruvbox', name: 'Gruvbox', colors: ['#1d2021','#282828','#3c3836'] },
  { id: 'tokyo', name: 'Tokyo Night', colors: ['#16161e','#1a1b26','#1e202e'] },
  { id: 'material', name: 'Material', colors: ['#1a1a1a','#212121','#2c2c2c'] },
  { id: 'catppuccin', name: 'Catppuccin', colors: ['#1e1e2e','#24243e','#302d41'] },
  { id: 'light', name: 'Светлая', colors: ['#e3e5e8','#f2f3f5','#ffffff'] },
];

function renderThemes() {
  const current = localStorage.getItem('sm_theme') || '';
  const genHTML = () => THEMES.map(t =>
    `<div class="theme-swatch${t.id === current ? ' active' : ''}" data-theme="${t.id}" style="background:linear-gradient(135deg,${t.colors[0]} 33%,${t.colors[1]} 66%,${t.colors[2]} 100%)">
      <span class="ts-name">${t.name}</span>
    </div>`
  ).join('');

  $('theme-grid').innerHTML = genHTML();
  $('theme-grid-mob')&&($('theme-grid-mob').innerHTML = genHTML());

  qsa('.theme-swatch').forEach(el => {
    el.onclick = () => {
      applyTheme(el.dataset.theme);
      localStorage.setItem('sm_theme', el.dataset.theme);
      renderThemes();
    };
  });
}

function applyTheme(id) {
  document.body.className = document.body.className.replace(/theme-\S+/g, '').trim();
  if (id) document.body.classList.add('theme-' + id);
  // Re-apply ghost class
  document.body.classList.toggle('ghost-active', S.ghostMode);
}

/* ═══════ MOBILE SETTINGS ACTIONS ═══════ */
function updateSidebarUser() {
  const pill = $('sb-user-pill');
  if (!S.user) return;
  if (S.user.avatar) pill.innerHTML = `<img src="${S.user.avatar}" alt="">`;
  else { pill.style.background = S.user.avatarColor || '#5865f2'; pill.textContent = (S.user.displayName || S.user.username || '?')[0].toUpperCase(); }
}

function updateMobSettings() {
  if (!S.user) return;
  const av = $('mob-avatar');
  if (av) {
    av.style.background = S.user.avatarColor || '#5865f2';
    if (S.user.avatar) av.innerHTML = `<img src="${S.user.avatar}" alt="">`;
    else av.textContent = (S.user.displayName || S.user.username || '?')[0].toUpperCase();
  }
  const nm = $('mob-name');
  if (nm) nm.textContent = S.user.displayName || S.user.username || '';
  const st = $('mob-status-text');
  if (st) st.textContent = S.ghostMode ? 'Режим Призрака 👻' : 'В сети';
}

qsa('.mob-item[data-act]').forEach(btn => {
  btn.onclick = () => {
    const act = btn.dataset.act;
    if (act === 'edit-profile') openSettings();
    if (act === 'ghost') toggleGhostMode(!S.ghostMode);
    if (act === 'themes') $('modal-themes').classList.remove('hidden');
    if (act === 'sessions') { openSettings(); }
    if (act === 'logout') logout();
  };
});

/* ═══════ ONLINE STATUS ═══════ */
function refreshOnline() {
  updateChatHeader();
  renderChatList();
  renderMembers();
  renderContacts();
}

function updateUnreadBadge() {
  const total = S.chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const badge = $('badge-chats');
  if (total > 0) { badge.textContent = total > 99 ? '99+' : total; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

/* ═══════ RESIZE ═══════ */
window.addEventListener('resize', () => {
  const was = S.isMobile;
  S.isMobile = window.innerWidth <= 768;
  if (was !== S.isMobile) {
    if (!S.isMobile) {
      $('app').classList.remove('chat-open');
      $('members-panel').classList.remove('mob-show');
    }
  }
});

/* ═══════ INIT ═══════ */
document.addEventListener('DOMContentLoaded', () => {
  if (S.token) bootstrap();
  renderCallHistory();
});

// If already loaded
if (document.readyState !== 'loading') {
  if (S.token) bootstrap();
  renderCallHistory();
}
