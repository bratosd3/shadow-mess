/* ════════════════════════════════════════════════════════════
   Shadow Message v2.0 — Frontend SPA
   ════════════════════════════════════════════════════════════ */
'use strict';

// ── State ─────────────────────────────────────────────────
const S = {
  token:          null,
  user:           null,
  chats:          [],
  activeChat:     null,
  messages:       [],
  socket:         null,
  replyTo:        null,
  editingMsgId:   null,
  searchHits:     [],
  searchIdx:      0,
  typingTimers:   {},
  grpMembers:     [],
  ctxMsg:         null,
  voiceRecorder:  null,
  voiceChunks:    [],
  isRecording:    false,
  activeTab:      'all',
  notif: { messages: true, sound: true, calls: true, mentions: true },
  drafts: {},
  favourites: [],
};
window.State = S; // expose for calls.js

// ── API helper ────────────────────────────────────────────
const API = {
  async req(method, path, body, fd) {
    const h = {};
    if (S.token) h['Authorization'] = `Bearer ${S.token}`;
    const opts = { method, headers: h };
    if (fd) { opts.body = body; }
    else if (body) { h['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(path, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  },
  get:  p     => API.req('GET',    p),
  post: (p,b) => API.req('POST',   p, b),
  put:  (p,b) => API.req('PUT',    p, b),
  del:  p     => API.req('DELETE', p),
  up: (p, f, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', p);
      if (S.token) xhr.setRequestHeader('Authorization', `Bearer ${S.token}`);
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.onload = () => {
        try {
          const d = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(d);
          else reject(new Error(d.error || `HTTP ${xhr.status}`));
        } catch { reject(new Error(`HTTP ${xhr.status}`)); }
      };
      xhr.onerror = () => reject(new Error('Ошибка сети'));
      xhr.send(f);
    });
  },
};

// ── DOM shortcuts ─────────────────────────────────────────
const $  = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const qsa = sel => document.querySelectorAll(sel);

// ── Utils ─────────────────────────────────────────────────
function showToast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 320);
  }, ms);
}
window.showToast = showToast;

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}

function fmtSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b/1024).toFixed(1) + ' КБ';
  return (b/1048576).toFixed(1) + ' МБ';
}

function avatarText(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function renderAvatar(el, user, size='') {
  if (!el) return;
  el.className = `avatar ${size}`.trim();
  el.innerHTML = '';
  if (user?.avatar) {
    const img = document.createElement('img');
    img.src = user.avatar; img.alt = '';
    el.appendChild(img);
  } else {
    el.style.background = user?.avatarColor || '#333333';
    el.textContent = avatarText(user?.displayName || user?.name || '?');
  }
  if (user?.online) el.classList.add('avatar-online');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function linkify(text) {
  // URLs
  let t = escHtml(text);
  t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Mentions @user
  t = t.replace(/@(\w+)/g, '<span class="mention" data-user="$1">@$1</span>');
  // Hashtags
  t = t.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  return t;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ── Theme & Font ─────────────────────────────────────────
function applyTheme(t) {
  document.body.setAttribute('data-theme', t || 'light');
  const r = document.querySelector(`input[name="theme"][value="${t || 'light'}"]`);
  if (r) r.checked = true;
}

// ── Language / i18n ──────────────────────────────────────
const _i18n = {
  ru: {
    search:         'Поиск',
    newMsg:         'Написать сообщение...',
    tabs:           { all: 'Все', personal: 'Личные', groups: 'Группы', channels: 'Каналы' },
    welcome:        'Выберите чат',
    welcomeSub:     'Выберите чат из списка или создайте новый',
    noChats:        'Нет чатов',
    settings:       'Настройки',
    profile:        'Профиль',
    appearance:     'Оформление',
    notifications:  'Уведомления',
    privacy:        'Приватность',
    security:       'Безопасность',
    sessions:       'Сессии',
    logoutBtn:      'Выйти',
    favourites:     'Избранное',
    archive:        'Архив',
    contacts:       'Контакты',
  },
  en: {
    search:         'Search',
    newMsg:         'Type a message...',
    tabs:           { all: 'All', personal: 'Private', groups: 'Groups', channels: 'Channels' },
    welcome:        'Select a chat',
    welcomeSub:     'Select a chat from the list or create a new one',
    noChats:        'No chats',
    settings:       'Settings',
    profile:        'Profile',
    appearance:     'Appearance',
    notifications:  'Notifications',
    privacy:        'Privacy',
    security:       'Security',
    sessions:       'Sessions',
    logoutBtn:      'Logout',
    favourites:     'Favourites',
    archive:        'Archive',
    contacts:       'Contacts',
  }
};

function applyLanguage(lang) {
  const t = _i18n[lang] || _i18n.ru;
  document.documentElement.lang = lang || 'ru';

  // Обновляем статические тексты в интерфейсе
  const map = {
    'search-input':    { attr: 'placeholder', val: t.search },
    'msg-input':       { attr: 'placeholder', val: t.newMsg },
    'welcome-sub':     { attr: 'text', val: t.welcomeSub },
    'no-chats-text':   { attr: 'text', val: t.noChats },
    'menu-settings':   { attr: 'text', val: t.settings },
    'menu-favourites': { attr: 'text', val: t.favourites },
    'menu-archive':    { attr: 'text', val: t.archive },
    'menu-logout':     { attr: 'text', val: t.logoutBtn },
  };

  for (const [id, { attr, val }] of Object.entries(map)) {
    const el = $(id);
    if (!el) continue;
    if (attr === 'text') {
      // Для кнопок меню: заменяем только текстовые узлы, сохраняя SVG
      const textNodes = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
      if (textNodes.length) {
        textNodes.forEach(n => n.textContent = '\n          ' + val + '\n        ');
      } else if (!el.querySelector('svg')) {
        el.textContent = val;
      }
    } else if (attr === 'placeholder') {
      el.placeholder = val;
    }
  }

  // Табы
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    const key = tab.dataset.tab;
    if (key && t.tabs[key]) tab.textContent = t.tabs[key];
  });
}

function applyFontSize(sz) {
  document.documentElement.style.setProperty('--font-size', sz + 'px');
  const range = $('font-size-range');
  if (range) { range.value = sz; updateRangeGradient(range); }
  const lbl = $('font-size-label');
  if (lbl) lbl.textContent = sz + 'px';
}

function updateRangeGradient(input) {
  const min = +input.min || 12, max = +input.max || 20, val = +input.value;
  const pct = ((val - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border-mid) ${pct}%)`;
}

// ── Accent color override ────────────────────────────────
function applyAccentColor(color) {
  if (color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-hover', color);
    document.documentElement.style.setProperty('--accent-light', color + '1a');
    document.documentElement.style.setProperty('--accent-glow', color + '33');
    document.documentElement.style.setProperty('--gradient', `linear-gradient(135deg, ${color}, ${color}dd)`);
    document.documentElement.style.setProperty('--gradient-btn', `linear-gradient(135deg, ${color}, ${color}dd)`);
    document.documentElement.style.setProperty('--bg-bubble-out', color);
  } else {
    // Reset — re-apply theme to restore defaults
    ['--accent','--accent-hover','--accent-light','--accent-glow','--gradient','--gradient-btn','--bg-bubble-out'].forEach(p => {
      document.documentElement.style.removeProperty(p);
    });
  }
}

// ── Bubble style ─────────────────────────────────────────
function applyBubbleStyle(style) {
  document.body.classList.toggle('bubble-cornered', style === 'cornered');
}

// ── Compact mode ─────────────────────────────────────────
function applyCompactMode(on) {
  document.body.classList.toggle('compact-mode', !!on);
}

// ── Chat wallpaper ───────────────────────────────────────
function applyWallpaper(wp) {
  document.body.setAttribute('data-wallpaper', wp || 'dots');
}

// ── Tab title unread counter ─────────────────────────────
function updateTabTitle() {
  const total = S.chats.reduce((s, c) => s + (c.unreadCount || 0), 0);
  document.title = total > 0 ? `(${total}) Shadow Message` : 'Shadow Message';
}

// ══════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════
let _regWantsSetup = false; // флаг: пользователь хочет настройку после регистрации

function initAuth() {
  // Tab switch
  qsa('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.auth-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      const loginForm = $('login-form');
      const regForm = $('register-form');
      const showForm = tab === 'login' ? loginForm : regForm;
      const hideForm = tab === 'login' ? regForm : loginForm;
      hideForm.classList.add('form-slide-out');
      setTimeout(() => {
        hideForm.classList.add('hidden');
        hideForm.classList.remove('form-slide-out');
        showForm.classList.remove('hidden');
        showForm.classList.add('form-slide-in');
        setTimeout(() => showForm.classList.remove('form-slide-in'), 400);
      }, 250);
    });
  });

  // PW toggle
  qsa('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = $(btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  on('login-form', 'submit', async e => {
    e.preventDefault();
    $('login-error').textContent = '';
    try {
      const d = await API.post('/api/login', {
        username: $('li-username').value.trim(),
        password: $('li-password').value,
      });
      await onLogin(d, false);
    } catch (err) { $('login-error').textContent = err.message; }
  });

  on('register-form', 'submit', async e => {
    e.preventDefault();
  });

  // ── Step-by-step registration navigation ──
  function regGoToStep(n) {
    const regForm = $('register-form');
    if (!regForm) return;
    regForm.querySelectorAll('.reg-step').forEach(s => {
      const sn = parseInt(s.dataset.rstep);
      s.style.display = sn === n ? '' : 'none';
      s.classList.toggle('active', sn === n);
    });
    regForm.querySelectorAll('.reg-dot').forEach(d => {
      const dn = parseInt(d.dataset.rdot);
      d.classList.toggle('active', dn === n);
    });
    // Focus first input in step
    const stepEl = regForm.querySelector(`.reg-step[data-rstep="${n}"]`);
    const inp = stepEl?.querySelector('input:not([type="button"])');
    if (inp) setTimeout(() => inp.focus(), 100);
  }

  // Next buttons (validate before moving)
  qsa('.reg-next-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = parseInt(btn.dataset.next);
      const cur = next - 1;
      // Validate current step
      if (cur === 1) {
        const name = $('rg-displayname').value.trim();
        if (!name) { $('reg-error-1').textContent = 'Введите ваше имя'; return; }
        $('reg-error-1').textContent = '';
      } else if (cur === 2) {
        const login = $('rg-username').value.trim();
        if (!login) { $('reg-error-2').textContent = 'Введите логин'; return; }
        if (!/^[a-zA-Z0-9_]+$/.test(login)) { $('reg-error-2').textContent = 'Только латиница, цифры и _'; return; }
        $('reg-error-2').textContent = '';
      } else if (cur === 3) {
        const pw = $('rg-password').value;
        const pw2 = $('rg-password2').value;
        if (pw.length < 4) { $('reg-error-3').textContent = 'Минимум 4 символа'; return; }
        if (pw !== pw2) { $('reg-error-3').textContent = 'Пароли не совпадают'; return; }
        $('reg-error-3').textContent = '';
      }
      regGoToStep(next);
    });
  });

  // Back buttons
  qsa('.reg-back-btn').forEach(btn => {
    btn.addEventListener('click', () => regGoToStep(parseInt(btn.dataset.back)));
  });

  // Step 4: setup decision
  on('reg-do-setup', 'click', async () => {
    _regWantsSetup = true;
    await doRegister();
  });
  on('reg-skip-setup', 'click', async () => {
    _regWantsSetup = false;
    await doRegister();
  });

  // Enter key moves to next step
  ['rg-displayname', 'rg-username'].forEach(id => {
    on(id, 'keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const regForm = $('register-form');
        const activeStep = regForm?.querySelector('.reg-step.active');
        const nextBtn = activeStep?.querySelector('.reg-next-btn');
        if (nextBtn) nextBtn.click();
      }
    });
  });
  on('rg-password2', 'keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextBtn = document.querySelector('.reg-step[data-rstep="3"] .reg-next-btn');
      if (nextBtn) nextBtn.click();
    }
  });
}

async function doRegister() {
  const errEl = $('reg-error-4');
  if (errEl) errEl.textContent = '';
  try {
    const d = await API.post('/api/register', {
      username: $('rg-username').value.trim(),
      displayName: $('rg-displayname').value.trim(),
      password: $('rg-password').value,
    });
    await onLogin(d, true);
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  }
}

async function onLogin({ token, user }, isRegister = false) {
  S.token = token; S.user = user;
  localStorage.setItem('sm_token', token);
  localStorage.setItem('sm_user', JSON.stringify(user));

  const overlay = $('auth-success-overlay');
  const successText = $('success-text');

  if (isRegister) {
    successText.textContent = 'Готово!';
    overlay.classList.remove('hidden');
    await new Promise(r => setTimeout(r, 1400));
    successText.style.animation = 'none';
    successText.offsetHeight;
    successText.style.animation = 'textReveal .5s ease forwards';
    successText.textContent = 'Добро пожаловать!';
    await new Promise(r => setTimeout(r, 1200));
  } else {
    successText.textContent = 'Добро пожаловать!';
    overlay.classList.remove('hidden');
    await new Promise(r => setTimeout(r, 1600));
  }

  overlay.classList.add('fade-out');
  await new Promise(r => setTimeout(r, 500));

  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('app').classList.add('app-enter');
  overlay.classList.add('hidden');
  overlay.classList.remove('fade-out');

  applyAllSettings(user.settings);
  S.notif.messages = user.settings?.notifications !== false;
  S.notif.sound    = user.settings?.soundEnabled   !== false;
  S.notif.calls    = user.settings?.notifCalls     !== false;
  S.notif.mentions = user.settings?.notifMentions  !== false;
  updateMenuProfile();
  initSocket();
  await loadChats();
  initApp();
  subscribeToPush();

  // Для регистрации: показать визард если пользователь выбрал "Да, настроить"
  if (isRegister && _regWantsSetup) {
    showWelcomeWizard(true); // принудительно, игнорируя localStorage
  } else if (!isRegister) {
    // Для входа: показать промпт "Провести настройку?"
    showLoginSetupPrompt();
  }

  requestAnimationFrame(() => {
    setTimeout(() => $('app').classList.remove('app-enter'), 800);
  });
}

function logout() {
  S.token = null; S.user = null; S.chats = []; S.activeChat = null; S.messages = [];
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  localStorage.removeItem('sm_token');
  localStorage.removeItem('sm_user');
  $('app').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
  $('chat-list').querySelectorAll('.chat-item').forEach(el => el.remove());
  $('messages-area').innerHTML = '';
  $('active-chat').classList.add('hidden');
  $('welcome-screen').classList.remove('hidden');
  $('side-menu').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════
// SOCKET
// ══════════════════════════════════════════════════════════
function initSocket() {
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  const socket = io({ auth: { token: S.token } });
  S.socket = socket;

  socket.on('new_message',        handleNewMessage);
  socket.on('message_edited',     m  => { const i = S.messages.findIndex(x=>x.id===m.id); if(i!==-1){S.messages[i]=m; refreshMsgEl(m);} });
  socket.on('message_deleted',    ({messageId,chatId}) => { if(S.activeChat?.id===chatId){S.messages=S.messages.filter(m=>m.id!==messageId); document.querySelector(`[data-msgid="${messageId}"]`)?.remove();} });
  socket.on('message_reaction',   ({messageId,reactions}) => { const m=S.messages.find(x=>x.id===messageId); if(m){m.reactions=reactions; refreshMsgEl(m);} });
  socket.on('messages_read',      ({chatId,userId}) => { if(S.activeChat?.id===chatId && userId!==S.user.id) S.messages.filter(m=>m.senderId===S.user.id).forEach(m=>{if(!m.readBy?.includes(userId)){m.readBy=[...(m.readBy||[]),userId]; refreshMsgEl(m);}}) });
  socket.on('user_typing',        ({userId,chatId}) => { if(S.activeChat?.id===chatId && userId!==S.user.id) showTyping(userId, chatId); });
  socket.on('user_stopped_typing',({userId}) => hideTyping(userId));
  socket.on('user_online',        ({userId}) => updateOnlineStatus(userId, true));
  socket.on('user_offline',       ({userId,lastSeen}) => updateOnlineStatus(userId, false, lastSeen));
  socket.on('chat_created',       async chat => {
    socket.emit('join_chat', { chatId: chat.id });
    try { await loadChats(); } catch(e) { console.error('[chat_created] loadChats error:', e); }
  });
  socket.on('chat_updated',       chat => { const i=S.chats.findIndex(c=>c.id===chat.id); if(i!==-1){S.chats[i]={...S.chats[i],...chat}; renderChatList();} });
  socket.on('chat_deleted',       ({chatId}) => { S.chats=S.chats.filter(c=>c.id!==chatId); if(S.activeChat?.id===chatId){S.activeChat=null; $('active-chat').classList.add('hidden'); $('welcome-screen').classList.remove('hidden');} renderChatList(); });
  socket.on('call_incoming',      handleIncomingCall);
  socket.on('call_answered',      d => { stopDialTone(); playCallConnectSound(); showToast('📞 Звонок начат', 'success'); window.callsModule?.onAnswer(d); });
  socket.on('call_ice',           d => window.callsModule?.onIce(d));
  socket.on('call_renegotiate',   d => window.callsModule?.onRenegotiate(d));
  socket.on('call_accepting',     () => { stopDialTone(); stopRingtone(); });
  socket.on('call_rejected',      () => { stopDialTone(); hideCallOverlays(); clearInterval(_callTimerInt); showToast('Звонок отклонён', 'info'); });
  socket.on('call_ended',         () => { stopDialTone(); stopRingtone(); playCallEndSound(); clearInterval(_callTimerInt); $('call-mini-bar')?.classList.add('hidden'); $('sidebar-call-indicator')?.classList.add('hidden'); showToast('📞 Звонок завершён', 'info'); window.callsModule?.onEnded(); });
  socket.on('call_status',        d => window.callsModule?.onPeerStatus(d));
  socket.on('session_revoked',    () => { showToast('Сессия завершена', 'info'); setTimeout(() => logout(), 1500); });

  // Group call signaling
  socket.on('group_call_user_joined', d => window.groupCallModule?.onUserJoined(d));
  socket.on('group_call_joined',      d => window.groupCallModule?.onJoined(d));
  socket.on('group_call_offer',       d => window.groupCallModule?.onGroupOffer(d));
  socket.on('group_call_answer',      d => window.groupCallModule?.onGroupAnswer(d));
  socket.on('group_call_ice',         d => window.groupCallModule?.onGroupIce(d));
  socket.on('group_call_user_left',   d => window.groupCallModule?.onUserLeft(d));
  socket.on('group_call_members',     d => window.groupCallModule?.onMembersUpdate(d));
  socket.on('group_call_mic_status',  d => window.groupCallModule?.onMicStatus(d));

  // Реконнект — обновляем онлайн-статусы из API
  socket.on('connect', () => {
    if (S.chats.length > 0) {
      loadChats().catch(() => {});
    }
  });
}

// ══════════════════════════════════════════════════════════
// CHAT LIST
// ══════════════════════════════════════════════════════════
async function loadChats() {
  try {
    S.chats = await API.get('/api/chats');
  } catch (e) {
    console.error('[loadChats] error:', e);
    showToast('Ошибка загрузки чатов', 'error');
    return;
  }
  renderChatList();
}

function filterChats() {
  const tab = S.activeTab;
  return S.chats.filter(c => {
    if (tab === 'all')      return true;
    if (tab === 'personal') return c.type === 'private';
    if (tab === 'groups')   return c.type === 'group';
    if (tab === 'channels') return c.type === 'channel';
    return true;
  });
}

function renderChatList(filter = '') {
  const list = $('chat-list');
  if (!list) return;
  let chats = filterChats();
  if (filter) chats = chats.filter(c => (c.displayName || '').toLowerCase().includes(filter.toLowerCase()));

  // Remove only chat-item elements, keep chat-list-empty intact
  list.querySelectorAll('.chat-item').forEach(el => el.remove());

  const emptyEl = $('chat-list-empty');
  if (emptyEl) emptyEl.classList.toggle('hidden', chats.length > 0);

  // Pinned first
  const pinned   = chats.filter(c => c.pinned);
  const unpinned = chats.filter(c => !c.pinned);
  [...pinned, ...unpinned].forEach(chat => list.appendChild(buildChatItem(chat)));

  // Update browser tab title with unread count
  updateTabTitle();
}

function buildChatItem(chat) {
  const item = document.createElement('div');
  item.className = `chat-item${chat.id === S.activeChat?.id ? ' active' : ''}`;
  item.dataset.chatid = chat.id;

  const av = document.createElement('div');
  renderAvatar(av, { displayName: chat.displayName, avatar: chat.displayAvatar, avatarColor: chat.displayAvatarColor, online: chat.online });
  item.appendChild(av);

  const cnt = document.createElement('div');
  cnt.className = 'chat-item-content';

  const hdr = document.createElement('div');
  hdr.className = 'chat-item-header';

  const nm = document.createElement('div');
  nm.className = 'chat-item-name';
  nm.textContent = chat.displayName || '';
  if (chat.pinned) nm.appendChild(Object.assign(document.createElement('span'), { className: 'chat-item-pinned', textContent: ' 📌' }));

  const tm = document.createElement('div');
  tm.className = 'chat-item-time';
  if (chat.lastMessage) tm.textContent = formatTime(chat.lastMessage.timestamp);

  hdr.appendChild(nm); hdr.appendChild(tm);

  const ftr = document.createElement('div');
  ftr.className = 'chat-item-footer';

  const pv = document.createElement('div');
  pv.className = 'chat-item-preview';

  // Draft
  const draft = S.drafts[chat.id];
  if (draft) {
    const dl = document.createElement('span');
    dl.className = 'draft-label';
    dl.textContent = 'Черновик: ';
    pv.appendChild(dl);
    pv.appendChild(document.createTextNode(draft.slice(0, 40)));
  } else if (chat.lastMessage) {
    const lm = chat.lastMessage;
    let preview = '';
    if (lm.type === 'image') preview = 'Фото';
    else if (lm.type === 'file') preview = lm.fileName || 'Файл';
    else if (lm.type === 'voice') preview = '🎤 Голосовое';
    else if (lm.type === 'sticker') preview = lm.text || 'Стикер';
    else preview = lm.text || '';
    pv.textContent = (lm.senderId === S.user?.id ? 'Вы: ' : '') + preview;
  }

  ftr.appendChild(pv);
  if (chat.unreadCount > 0) {
    const badge = document.createElement('div');
    badge.className = 'chat-item-badge';
    badge.textContent = chat.unreadCount > 99 ? '99+' : chat.unreadCount;
    if (chat.muted) badge.style.opacity = '0.5';
    ftr.appendChild(badge);
  }

  cnt.appendChild(hdr); cnt.appendChild(ftr);
  item.appendChild(cnt);

  item.addEventListener('click', () => openChat(chat.id));
  return item;
}

// ══════════════════════════════════════════════════════════
// OPEN CHAT
// ══════════════════════════════════════════════════════════
async function openChat(chatId) {
  // Save draft of previous chat
  if (S.activeChat && $('msg-input').value.trim()) {
    S.drafts[S.activeChat.id] = $('msg-input').value.trim();
  }

  const chat = S.chats.find(c => c.id === chatId);
  if (!chat) return;

  S.activeChat = chat;
  S.messages = [];
  S.replyTo = null;
  S.editingMsgId = null;
  hideReplyPreview();

  qsa('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.chatid === chatId));

  $('welcome-screen').classList.add('hidden');
  $('active-chat').classList.remove('hidden');
  $('active-chat').classList.add('chat-enter');
  setTimeout(() => $('active-chat').classList.remove('chat-enter'), 500);

  // Header
  const headerAv = $('chat-header-avatar');
  renderAvatar(headerAv, { displayName: chat.displayName, avatar: chat.displayAvatar, avatarColor: chat.displayAvatarColor, online: chat.online });
  $('chat-header-name').textContent = chat.displayName || '';
  updateChatStatus(chat);

  // Pinned bar
  if (chat.pinnedMessage) {
    $('pinned-bar').classList.remove('hidden');
    $('pinned-bar-text').textContent = chat.pinnedMessage.text || 'Сообщение';
  } else {
    $('pinned-bar').classList.add('hidden');
  }

  // Restore draft
  $('msg-input').value = S.drafts[chatId] || '';
  delete S.drafts[chatId];
  toggleSendVoiceBtn();

  // Load messages
  const area = $('messages-area');
  area.innerHTML = '<div class="messages-loader">Загрузка...</div>';
  try {
    S.messages = await API.get(`/api/chats/${chatId}/messages?limit=80`);
    renderMessages();
    scrollBottom(true);
  } catch { showToast('Ошибка загрузки сообщений', 'error'); }

  // Join room & mark read
  S.socket?.emit('join_chat', { chatId });
  S.socket?.emit('mark_read', { chatId });
  const c = S.chats.find(x => x.id === chatId);
  if (c) { c.unreadCount = 0; renderChatList(); }

  // Mobile
  if (window.innerWidth <= 680) {
    $('chat-panel').classList.add('mobile-active');
    $('back-btn').classList.remove('hidden');
  }
}

function updateChatStatus(chat) {
  const el = $('chat-header-status');
  if (!el) return;
  if (chat.type === 'private') {
    if (chat.online) { el.textContent = 'в сети'; el.className = 'chat-header-status online'; }
    else { el.textContent = chat.lastSeen ? `был(а) ${formatDate(chat.lastSeen)} в ${formatTime(chat.lastSeen)}` : 'не в сети'; el.className = 'chat-header-status'; }
  } else if (chat.type === 'channel') {
    el.textContent = 'Канал'; el.className = 'chat-header-status';
  } else {
    const cnt = (chat.membersInfo || []).length;
    const online = (chat.membersInfo || []).filter(m => m.online).length;
    el.textContent = `${cnt} участн.${online > 0 ? `, ${online} в сети` : ''}`;
    el.className = 'chat-header-status';
  }
}

// ══════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════
function renderMessages() {
  const area = $('messages-area');
  area.innerHTML = '';
  let lastDate = null;
  S.messages.forEach(msg => {
    const dt = new Date(msg.timestamp).toDateString();
    if (dt !== lastDate) {
      lastDate = dt;
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span>${formatDate(msg.timestamp)}</span>`;
      area.appendChild(sep);
    }
    area.appendChild(buildMsgEl(msg));
  });
}

function buildMsgEl(msg) {
  const isMine   = msg.senderId === S.user?.id;
  const inGroup  = S.activeChat?.type === 'group';
  const isSecret = S.activeChat?.isSecret;

  const row = document.createElement('div');
  row.className = `message-row ${isMine ? 'out' : 'in'}`;
  row.dataset.msgid = msg.id;

  // Group avatar
  if (!isMine && inGroup) {
    const av = document.createElement('div');
    renderAvatar(av, { displayName: msg.senderName, avatar: msg.senderAvatar, avatarColor: msg.senderAvatarColor }, 'avatar-sm');
    av.className = 'message-avatar avatar avatar-sm';
    row.appendChild(av);
  }

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  // Group sender name
  if (!isMine && inGroup) {
    const sn = document.createElement('div');
    sn.className = 'message-sender';
    sn.textContent = msg.senderName || '';
    bubble.appendChild(sn);
  }

  // Forward
  if (msg.forwardFrom) {
    const fl = document.createElement('div');
    fl.className = 'message-forward-label';
    fl.textContent = `Переслано от ${msg.forwardFrom}`;
    bubble.appendChild(fl);
  }

  // Reply
  if (msg.replyTo) {
    const orig = S.messages.find(m => m.id === msg.replyTo);
    const rp = document.createElement('div');
    rp.className = 'message-reply';
    rp.innerHTML = `<div class="message-reply-name">${escHtml(orig?.senderName||'Сообщение')}</div><div class="message-reply-text">${escHtml(orig?.text||'')}</div>`;
    rp.addEventListener('click', () => scrollToMsg(msg.replyTo));
    bubble.appendChild(rp);
  }

  // Content
  if (msg.type === 'image' && msg.fileUrl) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'message-media-wrap';
    const img = document.createElement('img');
    img.className = 'message-image'; img.src = msg.fileUrl; img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(msg.fileUrl));
    mediaWrap.appendChild(img);
    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'media-actions';
    actions.innerHTML = `<button class="media-action-btn media-preview-btn" title="Просмотр">👁</button><a class="media-action-btn media-download-btn" href="${escHtml(msg.fileUrl)}" download="${escHtml(msg.fileName || 'image')}" title="Скачать" onclick="event.stopPropagation()">⬇</a>`;
    actions.querySelector('.media-preview-btn').addEventListener('click', (e) => { e.stopPropagation(); openLightbox(msg.fileUrl); });
    mediaWrap.appendChild(actions);
    bubble.appendChild(mediaWrap);
  } else if (msg.type === 'video' && msg.fileUrl) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'message-media-wrap message-video-wrap';
    const video = document.createElement('video');
    video.className = 'message-video';
    video.src = msg.fileUrl;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.controls = true;
    mediaWrap.appendChild(video);
    const actions = document.createElement('div');
    actions.className = 'media-actions';
    actions.innerHTML = `<a class="media-action-btn media-download-btn" href="${escHtml(msg.fileUrl)}" download="${escHtml(msg.fileName || 'video')}" title="Скачать" onclick="event.stopPropagation()">⬇</a>`;
    mediaWrap.appendChild(actions);
    bubble.appendChild(mediaWrap);
  } else if (msg.type === 'file' && msg.fileUrl) {
    const a = document.createElement('a');
    a.className = 'message-file'; a.href = msg.fileUrl; a.target = '_blank'; a.download = msg.fileName || '';
    a.innerHTML = `<span class="message-file-icon">📎</span><div><div class="message-file-name">${escHtml(msg.fileName||'Файл')}</div><div class="message-file-size">${fmtSize(msg.fileSize||0)}</div></div>`;
    bubble.appendChild(a);
  } else if (msg.type === 'voice' && msg.fileUrl) {
    bubble.appendChild(buildVoiceEl(msg));
  } else if (msg.type === 'sticker') {
    const st = document.createElement('div');
    st.style.cssText = 'font-size:56px;line-height:1;padding:4px 0';
    st.textContent = msg.text || '😀';
    bubble.appendChild(st);
  }

  if (msg.text && msg.type !== 'sticker') {
    const t = document.createElement('div');
    t.className = 'message-text';
    t.innerHTML = linkify(msg.text);
    bubble.appendChild(t);
  }

  // Self-destruct badge
  if (msg.destructAfter && isSecret) {
    const bd = document.createElement('div');
    bd.className = 'msg-destruct-badge';
    bd.textContent = `⏱ ${msg.destructAfter}с`;
    bubble.appendChild(bd);
  }

  // Meta
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  if (msg.editedAt) meta.innerHTML += `<span class="message-edited">изм.</span>`;
  meta.innerHTML += `<span class="message-time">${formatTime(msg.timestamp)}</span>`;
  if (isMine) {
    const read = (msg.readBy||[]).some(id => id !== S.user.id);
    meta.innerHTML += `<span class="message-status${read?' read':''}">✓${read?'✓':''}</span>`;
  }
  bubble.appendChild(meta);

  // Reactions
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    bubble.appendChild(buildReactionsEl(msg));
  }

  // Right-click context menu
  bubble.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, msg); });

  // Long press mobile
  let lpTimer, lpTouchMoved = false;
  bubble.addEventListener('touchstart', (e) => {
    lpTouchMoved = false;
    lpTimer = setTimeout(() => {
      if (!lpTouchMoved) {
        if (navigator.vibrate) navigator.vibrate(30);
        showCtxMenu(null, msg);
      }
    }, 500);
  }, { passive: true });
  bubble.addEventListener('touchmove', () => { lpTouchMoved = true; clearTimeout(lpTimer); }, { passive: true });
  bubble.addEventListener('touchend',   () => clearTimeout(lpTimer), { passive: true });
  bubble.addEventListener('touchcancel', () => clearTimeout(lpTimer), { passive: true });

  // Double-tap reply
  let tapTime = 0;
  bubble.addEventListener('click', () => {
    const now = Date.now();
    if (now - tapTime < 350) setReply(msg);
    tapTime = now;
  });

  row.appendChild(bubble);
  return row;
}

function buildVoiceEl(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'message-voice';
  const audio = new Audio(msg.fileUrl);
  audio.preload = 'metadata';
  let playing = false;

  const playBtn = document.createElement('button');
  playBtn.className = 'voice-play-btn';
  playBtn.innerHTML = '▶';
  playBtn.addEventListener('click', () => {
    if (playing) { audio.pause(); playBtn.innerHTML = '▶'; playing = false; }
    else { audio.play(); playBtn.innerHTML = '⏸'; playing = true; }
  });
  audio.addEventListener('ended', () => { playBtn.innerHTML = '▶'; playing = false; progressFill.style.width = '0%'; });

  const dur = document.createElement('div');
  dur.className = 'voice-duration';
  const displayDur = msg.duration ? `${Math.round(msg.duration)}с` : '';
  dur.textContent = displayDur || '—';

  // Update duration from audio metadata if not provided
  audio.addEventListener('loadedmetadata', () => {
    if (!msg.duration && audio.duration && isFinite(audio.duration)) {
      dur.textContent = `${Math.round(audio.duration)}с`;
    }
  });

  wrap.appendChild(playBtn);

  // Waveform container with fake bars and progress overlay
  const barWrap = document.createElement('div');
  barWrap.className = 'voice-waveform';

  // Generate pseudo-random waveform bars
  const barsContainer = document.createElement('div');
  barsContainer.className = 'voice-bars';
  const barCount = 32;
  const seed = (msg.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('span');
    bar.className = 'voice-bar';
    const h = 20 + ((Math.sin(seed * 0.3 + i * 0.7) * 0.5 + 0.5) * 80);
    bar.style.height = h + '%';
    barsContainer.appendChild(bar);
  }
  barWrap.appendChild(barsContainer);

  // Progress overlay
  const progressFill = document.createElement('div');
  progressFill.className = 'voice-progress-fill';
  barWrap.appendChild(progressFill);

  // Seek on click
  barWrap.addEventListener('click', (e) => {
    const rect = barWrap.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (audio.duration && isFinite(audio.duration)) {
      audio.currentTime = pct * audio.duration;
      if (!playing) { audio.play(); playBtn.innerHTML = '⏸'; playing = true; }
    }
  });

  // Update progress during playback
  audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = pct + '%';
      const remaining = Math.round(audio.duration - audio.currentTime);
      dur.textContent = `${remaining}с`;
    }
  });

  wrap.appendChild(barWrap);
  wrap.appendChild(dur);
  return wrap;
}

function buildReactionsEl(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'message-reactions';
  Object.entries(msg.reactions || {}).forEach(([em, users]) => {
    if (!users.length) return;
    const own = users.includes(S.user?.id);
    const item = document.createElement('div');
    item.className = `reaction-item${own ? ' own' : ''}`;
    item.textContent = `${em} ${users.length}`;
    item.addEventListener('click', () => reactMsg(msg.id, em));
    wrap.appendChild(item);
  });
  return wrap;
}

function refreshMsgEl(msg) {
  const old = document.querySelector(`[data-msgid="${msg.id}"]`);
  if (old) { const nw = buildMsgEl(msg); old.replaceWith(nw); }
}

function scrollBottom(force = false) {
  const area = $('messages-area');
  if (!area) return;
  if (force || area.scrollHeight - area.scrollTop - area.clientHeight < 120) {
    requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
  }
}

function scrollToMsg(msgId) {
  const el = document.querySelector(`[data-msgid="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const b = el.querySelector('.message-bubble');
    if (b) { b.classList.add('message-highlight'); setTimeout(() => b.classList.remove('message-highlight'), 1500); }
  }
}

// ── Socket → new message ──────────────────────────────────
function handleNewMessage(msg) {
  // Duplicate guard
  if (S.messages.find(m => m.id === msg.id)) return;

  // Update active chat
  if (S.activeChat?.id === msg.chatId) {
    S.messages.push(msg);
    const area = $('messages-area');
    // Date separator?
    const prev = S.messages.slice(0, -1);
    const pDt = prev.length ? new Date(prev[prev.length-1].timestamp).toDateString() : null;
    if (new Date(msg.timestamp).toDateString() !== pDt) {
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.innerHTML = `<span>${formatDate(msg.timestamp)}</span>`;
      area.appendChild(sep);
    }
    const el = buildMsgEl(msg);
    // Animate new messages
    const isMine = msg.senderId === S.user?.id;
    el.classList.add(isMine ? 'msg-sending' : 'msg-new');
    el.addEventListener('animationend', () => el.classList.remove('msg-sending', 'msg-new'), { once: true });
    area.appendChild(el);
    scrollBottom();
    S.socket?.emit('mark_read', { chatId: msg.chatId });
  }

  // Update chat list
  const chat = S.chats.find(c => c.id === msg.chatId);
  if (chat) {
    chat.lastMessage = msg;
    if (S.activeChat?.id !== msg.chatId) chat.unreadCount = (chat.unreadCount || 0) + 1;
    S.chats.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt || 0);
      const tb = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt || 0);
      return tb - ta;
    });
    renderChatList();
  }

  // Notification
  if (msg.senderId !== S.user?.id) {
    if (S.notif.messages) {
      if (S.notif.sound) playNotifSound();
      if (document.hidden && Notification.permission === 'granted') {
        new Notification(msg.senderName || 'Shadow Message', { body: msg.text || 'Новое сообщение' });
      }
    }
  }
}

function showTyping(userId, chatId) {
  const chat = S.chats.find(c => c.id === chatId);
  const sender = chat?.membersInfo?.find(m => m.id === userId);
  const name = sender?.displayName || 'Кто-то';
  $('typing-text').textContent = `${name} печатает...`;
  $('typing-indicator').classList.remove('hidden');
  clearTimeout(S.typingTimers[userId]);
  S.typingTimers[userId] = setTimeout(() => hideTyping(userId), 3000);
}

function hideTyping(userId) {
  clearTimeout(S.typingTimers[userId]);
  $('typing-indicator').classList.add('hidden');
}

function updateOnlineStatus(userId, online, lastSeen) {
  // Обновляем все чаты в кэше
  S.chats.forEach(c => {
    if (c.type === 'private' && c.members?.includes(userId)) {
      c.online = online;
      if (lastSeen) c.lastSeen = lastSeen;
    }
    c.membersInfo?.forEach(m => { if (m.id === userId) m.online = online; });
  });

  // Обновляем activeChat напрямую (раньше не обновлялся → баг)
  if (S.activeChat?.type === 'private' && S.activeChat.members?.includes(userId)) {
    S.activeChat.online = online;
    if (lastSeen) S.activeChat.lastSeen = lastSeen;
    const headerAv = $('chat-header-avatar');
    renderAvatar(headerAv, { displayName: S.activeChat.displayName, avatar: S.activeChat.displayAvatar, avatarColor: S.activeChat.displayAvatarColor, online });
    updateChatStatus(S.activeChat);
  }
  // Групповые чаты — обновляем статус
  if (S.activeChat?.type === 'group') {
    updateChatStatus(S.activeChat);
  }
  renderChatList();
}

// ══════════════════════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════════════════════
function initInput() {
  const inp = $('msg-input');
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 140) + 'px';
    toggleSendVoiceBtn();
  });

  let typTimer;
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const sendEnter = S.user?.settings?.sendByEnter !== false;
      if (sendEnter) { e.preventDefault(); sendMessage(); return; }
    }
    if (S.activeChat) {
      S.socket?.emit('typing_start', { chatId: S.activeChat.id });
      clearTimeout(typTimer);
      typTimer = setTimeout(() => S.socket?.emit('typing_stop', { chatId: S.activeChat.id }), 2000);
    }
  });

  on('send-btn',     'click', sendMessage);
  on('attach-btn',   'click', () => $('file-input').click());
  on('file-input',   'change', uploadFile);
  on('reply-cancel', 'click', hideReplyPreview);

  // Voice record
  on('voice-record-btn', 'click', toggleVoiceRecord);

  // Video message record
  on('video-msg-btn', 'click', toggleVideoMsgRecord);

  // Paste image from clipboard (PrtSc / Ctrl+V)
  document.addEventListener('paste', handlePasteImage);
}

async function handlePasteImage(e) {
  if (!S.activeChat) return;
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const ext = item.type.split('/')[1] || 'png';
      const name = `screenshot_${Date.now()}.${ext}`;
      const renamedFile = new File([file], name, { type: file.type });

      // Показываем превью и спрашиваем подтверждение
      const url = URL.createObjectURL(renamedFile);
      const confirmed = await showPastePreview(url, name);
      URL.revokeObjectURL(url);

      if (confirmed) {
        const fd = new FormData();
        fd.append('file', renamedFile);
        try {
          const msg = await API.up(`/api/chats/${S.activeChat.id}/upload`, fd);
          handleNewMessage(msg);
          showToast('Скриншот отправлен', 'success');
        } catch (err) { showToast(err.message, 'error'); }
      }
      break; // только 1 изображение за раз
    }
  }
}

function showPastePreview(url, name) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'paste-preview-overlay';
    overlay.innerHTML = `
      <div class="paste-preview-card">
        <div class="paste-preview-header">📋 Вставка изображения</div>
        <img src="${url}" class="paste-preview-img" alt="preview"/>
        <div class="paste-preview-name">${escHtml(name)}</div>
        <div class="paste-preview-actions">
          <button class="paste-btn paste-btn-cancel">Отмена</button>
          <button class="paste-btn paste-btn-send">Отправить</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.paste-btn-send').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('.paste-btn-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    // Esc
    const onKey = e => { if (e.key === 'Escape') { overlay.remove(); resolve(false); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  });
}

function toggleSendVoiceBtn() {
  const has = $('msg-input')?.value.trim().length > 0;
  $('send-btn')?.classList.toggle('hidden', !has);
  $('voice-record-btn')?.classList.toggle('hidden', has);
  $('video-msg-btn')?.classList.toggle('hidden', has);
}

let _isSending = false;
async function sendMessage() {
  const inp  = $('msg-input');
  const text = inp.value.trim();
  if (!text || !S.activeChat || _isSending) return;

  if (S.editingMsgId) {
    try {
      _isSending = true;
      await API.put(`/api/messages/${S.editingMsgId}`, { text });
      S.editingMsgId = null;
      inp.value = ''; inp.style.height = 'auto';
      inp.placeholder = 'Написать сообщение...';
      toggleSendVoiceBtn();
    } catch (e) { showToast(e.message, 'error'); }
    finally { _isSending = false; }
    return;
  }

  try {
    _isSending = true;
    // Очищаем поле сразу чтобы предотвратить повторную отправку
    const replyId = S.replyTo?.id || null;
    inp.value = ''; inp.style.height = 'auto';
    hideReplyPreview();
    toggleSendVoiceBtn();
    const msg = await API.post(`/api/chats/${S.activeChat.id}/messages`, {
      text,
      replyTo: replyId,
    });
    handleNewMessage(msg);
  } catch (e) {
    // Восстанавливаем текст при ошибке
    inp.value = text;
    toggleSendVoiceBtn();
    showToast(e.message, 'error');
  } finally { _isSending = false; }
}

async function uploadFile() {
  const files = $('file-input').files;
  if (!files.length || !S.activeChat) return;
  for (const f of files) {
    const fd = new FormData(); fd.append('file', f);
    // Show upload progress
    const progEl = createUploadProgress(f.name);
    try {
      const msg = await API.up(`/api/chats/${S.activeChat.id}/upload`, fd, (pct) => {
        updateUploadProgress(progEl, pct);
      });
      removeUploadProgress(progEl);
      handleNewMessage(msg);
    }
    catch (e) { removeUploadProgress(progEl); showToast(e.message, 'error'); }
  }
  $('file-input').value = '';
}

function createUploadProgress(fileName) {
  const area = $('messages-area');
  if (!area) return null;
  const el = document.createElement('div');
  el.className = 'upload-progress-bar';
  el.innerHTML = `
    <div class="upload-progress-info">
      <span class="upload-progress-name">${escHtml(fileName?.slice(0,30) || 'Файл')}</span>
      <span class="upload-progress-pct">0%</span>
    </div>
    <div class="upload-progress-track"><div class="upload-progress-fill"></div></div>
  `;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
  return el;
}

function updateUploadProgress(el, pct) {
  if (!el) return;
  const fill = el.querySelector('.upload-progress-fill');
  const pctEl = el.querySelector('.upload-progress-pct');
  if (fill) fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
}

function removeUploadProgress(el) {
  if (el) {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }
}

async function toggleVoiceRecord() {
  if (!S.isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      S.voiceChunks = [];
      // Choose best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : '';
      const opts = mimeType ? { mimeType } : {};
      S.voiceRecorder = new MediaRecorder(stream, opts);
      S.voiceRecorder.addEventListener('dataavailable', e => {
        if (e.data.size > 0) S.voiceChunks.push(e.data);
      });
      S.voiceRecorder.addEventListener('stop', sendVoiceMessage);
      S.voiceRecorder.start(100); // collect data every 100ms
      S.voiceRecordStart = Date.now();
      S.isRecording = true;
      $('voice-record-btn')?.classList.add('recording');
      $('voice-record-btn').title = 'Остановить запись';
      // Show recording timer
      _voiceTimerInt = setInterval(() => {
        const sec = Math.round((Date.now() - S.voiceRecordStart) / 1000);
        $('voice-record-btn').title = `Запись: ${sec}с`;
      }, 500);
    } catch { showToast('Нет доступа к микрофону', 'error'); }
  } else {
    clearInterval(_voiceTimerInt);
    S.voiceRecorder?.stop();
    S.voiceRecorder?.stream?.getTracks().forEach(t => t.stop());
    S.isRecording = false;
    $('voice-record-btn')?.classList.remove('recording');
    $('voice-record-btn').title = 'Голосовое сообщение';
  }
}
let _voiceTimerInt;

async function sendVoiceMessage() {
  if (!S.voiceChunks.length || !S.activeChat) return;
  const mimeType = S.voiceChunks[0].type || 'audio/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(S.voiceChunks, { type: mimeType });
  const duration = S.voiceRecordStart ? Math.round((Date.now() - S.voiceRecordStart) / 1000) : 0;
  const fd = new FormData();
  fd.append('file', blob, `voice_${Date.now()}.${ext}`);
  fd.append('type', 'voice');
  fd.append('duration', String(duration));
  try {
    const msg = await API.up(`/api/chats/${S.activeChat.id}/upload`, fd);
    handleNewMessage(msg);
  }
  catch (e) { showToast(e.message, 'error'); }
  S.voiceRecordStart = null;
}

// ── Video message recording ──────────────────────────
let _videoRecorder = null;
let _videoChunks = [];
let _videoStream = null;
let _videoRecStart = null;
let _videoTimerInt = null;
let _videoPreviewOverlay = null;

async function toggleVideoMsgRecord() {
  if (_videoRecorder && _videoRecorder.state === 'recording') {
    // Stop recording
    _videoRecorder.stop();
    clearInterval(_videoTimerInt);
    $('video-msg-btn')?.classList.remove('recording');
    $('video-msg-btn').title = 'Видеосообщение';
    return;
  }

  try {
    _videoStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    // Show preview overlay
    _videoPreviewOverlay = document.createElement('div');
    _videoPreviewOverlay.className = 'video-msg-preview-overlay';
    _videoPreviewOverlay.innerHTML = `
      <div class="video-msg-preview-wrap">
        <video class="video-msg-preview" autoplay playsinline muted></video>
        <div class="video-msg-timer">0с</div>
        <button class="video-msg-stop-btn">⏹ Остановить</button>
      </div>
    `;
    document.body.appendChild(_videoPreviewOverlay);

    const previewVideo = _videoPreviewOverlay.querySelector('.video-msg-preview');
    previewVideo.srcObject = _videoStream;

    const stopBtn = _videoPreviewOverlay.querySelector('.video-msg-stop-btn');
    stopBtn.addEventListener('click', () => {
      if (_videoRecorder && _videoRecorder.state === 'recording') {
        _videoRecorder.stop();
      }
    });

    _videoChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
      : MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : '';
    const opts = mimeType ? { mimeType } : {};
    _videoRecorder = new MediaRecorder(_videoStream, opts);
    _videoRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) _videoChunks.push(e.data);
    });
    _videoRecorder.addEventListener('stop', sendVideoMessage);
    _videoRecorder.start(200);
    _videoRecStart = Date.now();

    $('video-msg-btn')?.classList.add('recording');
    $('video-msg-btn').title = 'Остановить запись';

    _videoTimerInt = setInterval(() => {
      const sec = Math.round((Date.now() - _videoRecStart) / 1000);
      const timerEl = _videoPreviewOverlay?.querySelector('.video-msg-timer');
      if (timerEl) timerEl.textContent = `${sec}с`;
    }, 500);
  } catch (e) {
    console.error('[videoMsg] error:', e);
    showToast('Нет доступа к камере', 'error');
  }
}

async function sendVideoMessage() {
  clearInterval(_videoTimerInt);
  // Clean up preview
  if (_videoPreviewOverlay) {
    _videoPreviewOverlay.remove();
    _videoPreviewOverlay = null;
  }
  // Stop stream
  if (_videoStream) {
    _videoStream.getTracks().forEach(t => t.stop());
    _videoStream = null;
  }
  $('video-msg-btn')?.classList.remove('recording');
  $('video-msg-btn').title = 'Видеосообщение';

  if (!_videoChunks.length || !S.activeChat) return;
  const mimeType = _videoChunks[0].type || 'video/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(_videoChunks, { type: mimeType });
  const duration = _videoRecStart ? Math.round((Date.now() - _videoRecStart) / 1000) : 0;

  const fd = new FormData();
  fd.append('file', blob, `video_${Date.now()}.${ext}`);
  fd.append('duration', String(duration));

  const progressEl = createUploadProgress(`video_${Date.now()}.${ext}`);
  try {
    const msg = await API.up(`/api/chats/${S.activeChat.id}/upload`, fd, (pct) => updateUploadProgress(progressEl, pct));
    removeUploadProgress(progressEl);
    handleNewMessage(msg);
    showToast('Видеосообщение отправлено', 'success');
  } catch (e) {
    removeUploadProgress(progressEl);
    showToast(e.message, 'error');
  }
  _videoChunks = [];
  _videoRecStart = null;
}

async function reactMsg(msgId, emoji) {
  try { await API.post(`/api/messages/${msgId}/react`, { emoji }); }
  catch (e) { showToast(e.message, 'error'); }
}

function setReply(msg) {
  S.replyTo = msg;
  $('reply-preview').classList.remove('hidden');
  $('reply-preview-name').textContent = msg.senderName || 'Сообщение';
  $('reply-preview-text').textContent = msg.text || '';
  $('msg-input').focus();
}

function hideReplyPreview() {
  S.replyTo = null;
  $('reply-preview').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════
// CONTEXT MENU
// ══════════════════════════════════════════════════════════
function showCtxMenu(e, msg) {
  S.ctxMsg = msg;
  const menu = $('context-menu');
  const isMine = msg.senderId === S.user?.id;
  menu.querySelector('[data-action="edit"]')?.style && (menu.querySelector('[data-action="edit"]').style.display = isMine ? '' : 'none');
  menu.querySelector('[data-action="delete"]')?.style && (menu.querySelector('[data-action="delete"]').style.display = isMine ? '' : 'none');

  // Remove old backdrop
  let backdrop = document.querySelector('.ctx-backdrop');
  if (backdrop) backdrop.remove();

  if (isMobile) {
    // Mobile: bottom sheet
    backdrop = document.createElement('div');
    backdrop.className = 'ctx-backdrop';
    backdrop.addEventListener('click', () => hideCtxMenu());
    document.body.appendChild(backdrop);
    menu.classList.remove('hidden');
    menu.classList.add('ctx-bottom-sheet');
    menu.style.cssText = '';
    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      menu.classList.add('visible');
    });
  } else {
    // Desktop: popup at cursor
    menu.classList.remove('ctx-bottom-sheet', 'visible');
    menu.classList.remove('hidden');
    if (e) {
      const x = Math.min(e.clientX, window.innerWidth  - 190);
      const y = Math.min(e.clientY, window.innerHeight - 320);
      menu.style.cssText = `left:${x}px;top:${y}px;transform:none`;
    } else {
      menu.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%)`;
    }
  }
}

function hideCtxMenu() {
  const menu = $('context-menu');
  const backdrop = document.querySelector('.ctx-backdrop');
  menu.classList.add('hidden');
  menu.classList.remove('visible', 'ctx-bottom-sheet');
  menu.style.cssText = '';
  if (backdrop) {
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 250);
  }
}

function initCtxMenu() {
  const menu = $('context-menu');
  menu.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !S.ctxMsg) return;
    const action = btn.dataset.action;
    hideCtxMenu();
    const msg = S.ctxMsg;

    switch (action) {
      case 'reply':     setReply(msg); break;
      case 'copy':      navigator.clipboard.writeText(msg.text || '').then(() => showToast('Скопировано')); break;
      case 'edit':      startEdit(msg); break;
      case 'react':     showReactionPicker(msg); break;
      case 'forward':   openForwardModal(msg); break;
      case 'pin':       pinMessage(msg); break;
      case 'favourite': saveToFavourites(msg); break;
      case 'delete':    await deleteMsg(msg.id); break;
    }
  });

  document.addEventListener('click', e => {
    if (!$('context-menu').contains(e.target)) hideCtxMenu();
  });
}

function startEdit(msg) {
  const inp = $('msg-input');
  S.editingMsgId = msg.id;
  inp.value = msg.text || '';
  inp.placeholder = '✎ Редактирование...';
  inp.focus();
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 140) + 'px';
  toggleSendVoiceBtn();
}

async function deleteMsg(msgId) {
  if (!confirm('Удалить сообщение для всех?')) return;
  try { await API.del(`/api/messages/${msgId}`); }
  catch (e) { showToast(e.message, 'error'); }
}

function showReactionPicker(msg) {
  const picker = $('reaction-picker');
  // Delay showing to avoid the current click event immediately hiding it
  requestAnimationFrame(() => {
    picker.classList.remove('hidden');
    const row = document.querySelector(`[data-msgid="${msg.id}"]`);
    if (row) {
      const rc = row.getBoundingClientRect();
      picker.style.left = Math.min(rc.left, window.innerWidth - 230) + 'px';
      picker.style.top  = Math.max(rc.top - 54, 10) + 'px';
    }
  });
  picker.onclick = e => {
    const em = e.target.dataset.emoji;
    if (em) { reactMsg(msg.id, em); picker.classList.add('hidden'); }
  };
}
document.addEventListener('click', e => {
  const picker = $('reaction-picker');
  if (picker && !picker.classList.contains('hidden') && !picker.contains(e.target)) {
    picker.classList.add('hidden');
  }
});

function pinMessage(msg) {
  if (!S.activeChat) return;
  API.put(`/api/chats/${S.activeChat.id}`, { pinnedMessage: { id: msg.id, text: msg.text } })
    .then(() => { $('pinned-bar').classList.remove('hidden'); $('pinned-bar-text').textContent = msg.text || 'Сообщение'; showToast('Сообщение закреплено'); })
    .catch(e => showToast(e.message, 'error'));
}

function saveToFavourites(msg) {
  S.favourites.push(msg);
  showToast('Добавлено в избранное');
}

// Forward
let _fwdMsg = null;
function openForwardModal(msg) {
  _fwdMsg = msg;
  const list = $('forward-chat-list');
  list.innerHTML = '';
  S.chats.forEach(chat => {
    if (chat.id === S.activeChat?.id) return;
    const item = document.createElement('div');
    item.className = 'user-result-item';
    const av = document.createElement('div');
    renderAvatar(av, { displayName: chat.displayName, avatar: chat.displayAvatar, avatarColor: chat.displayAvatarColor }, 'avatar-sm');
    item.appendChild(av);
    const info = document.createElement('div');
    info.innerHTML = `<div class="user-result-name">${escHtml(chat.displayName || '')}</div>`;
    item.appendChild(info);
    item.addEventListener('click', () => forwardMsg(chat.id));
    list.appendChild(item);
  });
  $('forward-modal').classList.remove('hidden');
}

async function forwardMsg(toChatId) {
  if (!_fwdMsg) return;
  $('forward-modal').classList.add('hidden');
  try {
    await API.post(`/api/chats/${toChatId}/messages`, { text: _fwdMsg.text || '', forwardFrom: _fwdMsg.senderName || 'Пользователь' });
    showToast('Сообщение переслано', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// EMOJI & STICKER PICKERS
// ══════════════════════════════════════════════════════════
const EMOJIS = [
  '😀','😂','😍','🥰','😊','😎','🤔','😮','😢','😡','🥲','🤩','😏','🤗','🫡',
  '👍','👎','❤️','🔥','🎉','✨','🙏','💪','💯','⚡','🎯','✅','❌','🌙','⭐',
  '💀','🙈','🤦','🚀','🌍','💎','🎮','🎵','🍕','☕','🧠','👀','🫶','💫','🤝',
];
const STICKERS = ['🐶','🐱','🐸','🦊','🐻','🐼','🦁','🐯','🐨','🐮','🐷','🐸','🦅','🦋','🌸','🌺','🌈','⛄','🎃','🎄','💥','💢','💤','🎀','🎁','🏆','💔','💝','💘','🎭'];

function initPickers() {
  const epicker  = $('emoji-picker');
  const spicker  = $('sticker-picker');
  const emojiBtn = $('emoji-btn');
  const stickerBtn = $('sticker-btn');

  EMOJIS.forEach(em => {
    const sp = document.createElement('span'); sp.textContent = em;
    sp.addEventListener('click', () => { insertText(em); epicker.classList.add('hidden'); });
    epicker.appendChild(sp);
  });

  STICKERS.forEach(st => {
    const item = document.createElement('div');
    item.className = 'sticker-item'; item.textContent = st;
    item.addEventListener('click', async () => {
      spicker.classList.add('hidden');
      if (!S.activeChat) return;
      try { await API.post(`/api/chats/${S.activeChat.id}/messages`, { text: st, type: 'sticker', replyTo: S.replyTo?.id || null }); hideReplyPreview(); }
      catch (e) { showToast(e.message, 'error'); }
    });
    spicker.appendChild(item);
  });

  emojiBtn?.addEventListener('click', e => { e.stopPropagation(); epicker.classList.toggle('hidden'); spicker.classList.add('hidden'); });
  stickerBtn?.addEventListener('click', e => { e.stopPropagation(); spicker.classList.toggle('hidden'); epicker.classList.add('hidden'); });

  document.addEventListener('click', e => {
    if (!epicker?.contains(e.target)  && e.target !== emojiBtn)   epicker?.classList.add('hidden');
    if (!spicker?.contains(e.target)  && e.target !== stickerBtn) spicker?.classList.add('hidden');
  });
}

function insertText(txt) {
  const inp = $('msg-input');
  const pos = inp.selectionStart || inp.value.length;
  inp.value = inp.value.slice(0, pos) + txt + inp.value.slice(pos);
  inp.setSelectionRange(pos + txt.length, pos + txt.length);
  inp.focus(); toggleSendVoiceBtn();
}

// ══════════════════════════════════════════════════════════
// IN-CHAT SEARCH
// ══════════════════════════════════════════════════════════
function initChatSearch() {
  on('chat-search-btn', 'click', () => {
    $('chat-searchbar').classList.toggle('hidden');
    if (!$('chat-searchbar').classList.contains('hidden')) $('chat-search-input').focus();
  });
  on('cs-close', 'click', () => { $('chat-searchbar').classList.add('hidden'); clearSearch(); });
  on('chat-search-input', 'input', debounce(runSearch, 200));
  on('cs-prev', 'click', () => navSearch(-1));
  on('cs-next', 'click', () => navSearch(1));
}

function runSearch() {
  clearSearch();
  const q = $('chat-search-input').value.toLowerCase().trim();
  if (!q) return;
  qsa('.message-row').forEach(row => {
    const txt = row.querySelector('.message-text')?.textContent.toLowerCase();
    if (txt?.includes(q)) {
      const bubble = row.querySelector('.message-bubble');
      if (bubble) bubble.classList.add('message-highlight');
      S.searchHits.push(row);
    }
  });
  $('cs-counter').textContent = S.searchHits.length ? `1/${S.searchHits.length}` : '0/0';
  if (S.searchHits.length) S.searchHits[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearSearch() {
  qsa('.message-bubble.message-highlight').forEach(b => b.classList.remove('message-highlight'));
  S.searchHits = []; S.searchIdx = 0; $('cs-counter').textContent = '0/0';
}

function navSearch(dir) {
  if (!S.searchHits.length) return;
  S.searchIdx = (S.searchIdx + dir + S.searchHits.length) % S.searchHits.length;
  S.searchHits[S.searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('cs-counter').textContent = `${S.searchIdx+1}/${S.searchHits.length}`;
}

// ══════════════════════════════════════════════════════════
// SIDEBAR SEARCH
// ══════════════════════════════════════════════════════════
function initSidebarSearch() {
  const inp  = $('search-input');
  const clr  = $('search-clear');
  const sr   = $('search-results');
  const cl   = $('chat-list');

  inp.addEventListener('input', debounce(async () => {
    const q = inp.value.trim();
    clr.classList.toggle('hidden', !q);
    if (!q) { sr.classList.add('hidden'); cl.classList.remove('hidden'); return; }

    cl.classList.add('hidden'); sr.classList.remove('hidden'); sr.innerHTML = '';

    const localChats = S.chats.filter(c => (c.displayName||'').toLowerCase().includes(q.toLowerCase()));
    if (localChats.length) {
      const title = document.createElement('div'); title.className = 'search-section-title'; title.textContent = 'Чаты';
      sr.appendChild(title);
      localChats.forEach(c => {
        const item = buildSearchItem(null, c.displayName, '', () => { inp.value=''; clr.classList.add('hidden'); sr.classList.add('hidden'); cl.classList.remove('hidden'); openChat(c.id); });
        sr.appendChild(item);
      });
    }

    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (users.length) {
        const title = document.createElement('div'); title.className = 'search-section-title'; title.textContent = 'Пользователи';
        sr.appendChild(title);
        users.forEach(u => {
          const item = buildSearchItem(u, u.displayName, '@'+u.username, null);
          // Add 'Написать' button
          const btn = document.createElement('button');
          btn.className = 'btn-primary';
          btn.textContent = 'Написать';
          btn.style.cssText = 'padding:5px 12px;font-size:12px;flex-shrink:0;margin-left:auto';
          btn.addEventListener('click', async e => {
            e.stopPropagation();
            inp.value=''; clr.classList.add('hidden'); sr.classList.add('hidden'); cl.classList.remove('hidden');
            try {
              const chat = await API.post('/api/chats', { userId: u.id });
              await loadChats(); // always reload to get enriched data
              openChat(chat.id);
            } catch(err) { showToast(err.message || 'Ошибка создания чата', 'error'); }
          });
          item.appendChild(btn);
          sr.appendChild(item);
        });
      }
    } catch {}
  }, 300));

  clr.addEventListener('click', () => { inp.value=''; clr.classList.add('hidden'); sr.classList.add('hidden'); cl.classList.remove('hidden'); });
}

function buildSearchItem(user, name, sub, onclick) {
  const item = document.createElement('div'); item.className = 'search-item';
  const av = document.createElement('div');
  renderAvatar(av, user || { displayName: name }, 'avatar-sm');
  const info = document.createElement('div');
  info.innerHTML = `<div class="search-item-name">${escHtml(name)}</div>${sub?`<div class="search-item-sub">${escHtml(sub)}</div>`:''}`;
  item.appendChild(av); item.appendChild(info);
  if (onclick) item.addEventListener('click', onclick);
  return item;
}

// ══════════════════════════════════════════════════════════
// SIDEBAR TABS
// ══════════════════════════════════════════════════════════
function initSidebarTabs() {
  qsa('.sidebar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.sidebar-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.activeTab = btn.dataset.tab;
      // Animate chat list transition
      const list = $('chat-list');
      list.classList.add('tab-fade-out');
      setTimeout(() => {
        renderChatList();
        list.classList.remove('tab-fade-out');
        list.classList.add('tab-fade-in');
        setTimeout(() => list.classList.remove('tab-fade-in'), 400);
      }, 200);
    });
  });
}

// ══════════════════════════════════════════════════════════
// NEW CHAT MODAL
// ══════════════════════════════════════════════════════════
function initNewChatModal() {
  on('new-chat-btn', 'click', () => { $('new-chat-modal').classList.remove('hidden'); $('group-name-input').focus(); });

  $('new-chat-modal').querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $('new-chat-modal').querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.tab;
      $('group-tab').classList.toggle('hidden', t !== 'group');
      $('channel-tab').classList.toggle('hidden', t !== 'channel');
    });
  });

  // Group
  on('group-user-search', 'input', debounce(async () => {
    const q = $('group-user-search').value.trim();
    const res = $('group-search-results');
    if (!q) { res.innerHTML = '<p class="hint-center">Начните вводить...</p>'; return; }
    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      res.innerHTML = '';
      users.forEach(u => {
        const item = buildUserResultItem(u, () => addGroupMember(u));
        res.appendChild(item);
      });
    } catch {}
  }, 300));

  on('create-group-btn', 'click', createGroup);
  on('create-channel-btn', 'click', createChannel);
}

function buildUserResultItem(user, onclick) {
  const item = document.createElement('div'); item.className = 'user-result-item';
  const av = document.createElement('div');
  renderAvatar(av, user, 'avatar-sm');
  const info = document.createElement('div');
  info.innerHTML = `<div class="user-result-name">${escHtml(user.displayName)}</div><div class="user-result-username">@${escHtml(user.username)}</div>`;
  if (user.online) info.innerHTML += `<div style="font-size:11px;color:var(--success)">● в сети</div>`;
  item.appendChild(av); item.appendChild(info);
  item.addEventListener('click', onclick);
  return item;
}

function addGroupMember(user) {
  if (S.grpMembers.find(u => u.id === user.id)) return;
  S.grpMembers.push(user);
  renderGroupChips();
}

function renderGroupChips() {
  const wrap = $('group-selected-users'); wrap.innerHTML = '';
  S.grpMembers.forEach(u => {
    const chip = document.createElement('div'); chip.className = 'selected-user-chip';
    chip.textContent = u.displayName;
    const rm = document.createElement('span'); rm.className = 'chip-remove'; rm.textContent = '✕';
    rm.addEventListener('click', () => { S.grpMembers = S.grpMembers.filter(x => x.id !== u.id); renderGroupChips(); });
    chip.appendChild(rm); wrap.appendChild(chip);
  });
}

async function createGroup() {
  const name = $('group-name-input').value.trim();
  if (!name) { showToast('Введите название', 'error'); return; }
  if (!S.grpMembers.length) { showToast('Добавьте участников', 'error'); return; }
  try {
    const chat = await API.post('/api/chats/group', { name, memberIds: S.grpMembers.map(u=>u.id), description: $('group-desc-input').value.trim() });
    $('new-chat-modal').classList.add('hidden');
    S.grpMembers = []; $('group-selected-users').innerHTML = ''; $('group-name-input').value = '';
    await loadChats(); openChat(chat.id);
  } catch (e) { showToast(e.message, 'error'); }
}

async function createChannel() {
  const name = $('channel-name-input').value.trim();
  if (!name) { showToast('Введите название', 'error'); return; }
  try {
    const chat = await API.post('/api/chats/group', { name, memberIds: [], type: 'channel', description: $('channel-desc-input').value.trim() });
    $('new-chat-modal').classList.add('hidden'); $('channel-name-input').value = '';
    await loadChats(); openChat(chat.id);
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// CHAT INFO MODAL
// ══════════════════════════════════════════════════════════
function initChatInfo() {
  on('chat-info-btn',        'click', openChatInfo);
  on('chat-header-info-btn', 'click', openChatInfo);

  on('leave-chat-btn', 'click', async () => {
    if (!confirm('Покинуть / удалить чат?')) return;
    try { await API.del(`/api/chats/${S.activeChat.id}`); $('chat-info-modal').classList.add('hidden'); }
    catch (e) { showToast(e.message, 'error'); }
  });

  on('add-members-btn', 'click', async () => {
    const q = prompt('Логин или имя пользователя:'); if (!q) return;
    try {
      const users = await API.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!users.length) { showToast('Не найдено', 'error'); return; }
      await API.post(`/api/chats/${S.activeChat.id}/members`, { userIds: [users[0].id] });
      showToast(`${users[0].displayName} добавлен`, 'success'); await loadChats();
    } catch (e) { showToast(e.message, 'error'); }
  });

  on('pin-chat-btn', 'click', async () => {
    const c = S.chats.find(x => x.id === S.activeChat?.id); if (!c) return;
    try {
      await API.put(`/api/chats/${S.activeChat.id}`, { pinned: !c.pinned });
      c.pinned = !c.pinned; renderChatList();
      showToast(c.pinned ? 'Чат закреплён' : 'Откреплён');
    } catch (e) { showToast(e.message, 'error'); }
  });

  on('archive-chat-btn', 'click', async () => {
    const c = S.chats.find(x => x.id === S.activeChat?.id); if (!c) return;
    c.archived = !c.archived;
    showToast(c.archived ? 'Чат перемещён в архив' : 'Чат восстановлен из архива');
    $('chat-info-modal').classList.add('hidden');
    renderChatList();
  });

  on('mute-chat-btn', 'click', () => {
    const c = S.chats.find(x => x.id === S.activeChat?.id); if (!c) return;
    c.muted = !c.muted; showToast(c.muted ? 'Уведомления отключены' : 'Уведомления включены'); renderChatList();
  });

  on('unpin-btn', 'click', () => {
    if (!S.activeChat) return;
    API.put(`/api/chats/${S.activeChat.id}`, { pinnedMessage: null }).catch(() => {});
    $('pinned-bar').classList.add('hidden');
  });
}

function openChatInfo() {
  const chat = S.activeChat; if (!chat) return;
  $('chat-info-title').textContent = chat.type === 'group' ? 'Группа' : chat.type === 'channel' ? 'Канал' : 'Информация';
  const cont = $('chat-info-content'); cont.innerHTML = '';

  const av = document.createElement('div'); av.className = 'avatar avatar-xxl';
  renderAvatar(av, { displayName: chat.displayName, avatar: chat.displayAvatar, avatarColor: chat.displayAvatarColor });
  av.style.margin = '0 auto 8px';

  cont.appendChild(av);
  cont.innerHTML += `<h3>${escHtml(chat.displayName || '')}</h3>`;
  if (chat.description) cont.innerHTML += `<p>${escHtml(chat.description)}</p>`;
  if (chat.type === 'private') {
    cont.innerHTML += `<p style="color:var(--success)">${chat.online ? '● в сети' : 'не в сети'}</p>`;
  }

  if (chat.type !== 'private') {
    $('chat-info-members-section').classList.remove('hidden');
    const ml = $('chat-info-members'); ml.innerHTML = '';
    (chat.membersInfo || []).forEach(m => {
      ml.appendChild(buildUserResultItem(m, () => {}));
    });
  } else {
    $('chat-info-members-section').classList.add('hidden');
  }

  $('chat-info-modal').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════
function initSettings() {
  on('menu-settings', 'click', () => { $('side-menu').classList.add('hidden'); openSettings(); });

  qsa('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.settings-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      qsa('.settings-section').forEach(s => {
        if (s.classList.contains('active')) {
          s.classList.add('section-fade-out');
          setTimeout(() => {
            s.classList.remove('active', 'section-fade-out');
          }, 200);
        }
      });
      setTimeout(() => {
        const target = $(`section-${btn.dataset.section}`);
        if (target) {
          target.classList.add('active', 'section-fade-in');
          setTimeout(() => target.classList.remove('section-fade-in'), 450);
        }
      }, 210);
    });
  });

  // Avatar
  on('upload-avatar-btn', 'click', () => $('avatar-input').click());
  on('settings-avatar',   'click', () => $('avatar-input').click());
  on('avatar-input', 'change', async () => {
    const f = $('avatar-input').files[0]; if (!f) return;
    const fd = new FormData(); fd.append('avatar', f);
    try {
      const { avatar } = await API.up('/api/me/avatar', fd);
      S.user.avatar = avatar; updateMenuProfile();
      renderAvatar($('settings-avatar'), S.user, 'avatar-xxl');
      showToast('Аватар обновлён', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // Color swatches
  const colors = ['#e74c3c','#e67e22','#f59e0b','#10b981','#0ea5e9','#2563eb','#7c3aed','#db2777','#334155','#475569','#0d9488','#d97706'];
  const sw = $('color-swatches');
  if (sw) {
    colors.forEach(c => {
      const el = document.createElement('div');
      el.className = `color-swatch${S.user?.avatarColor === c ? ' active' : ''}`;
      el.style.background = c;
      el.addEventListener('click', () => {
        qsa('.color-swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active'); S.user.avatarColor = c;
        renderAvatar($('settings-avatar'), S.user, 'avatar-xxl');
      });
      sw.appendChild(el);
    });
  }

  on('save-profile-btn', 'click', async () => {
    try {
      const newUsername = $('settings-username').value.trim();
      const user = await API.put('/api/me', {
        displayName: $('settings-displayname').value.trim(),
        firstName:   $('settings-firstname').value.trim(),
        lastName:    $('settings-lastname').value.trim(),
        bio:         $('settings-bio').value,
        avatarColor: S.user.avatarColor,
        username:    newUsername,
      });
      S.user = user; updateMenuProfile(); showToast('Профиль сохранён', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  on('change-password-btn', 'click', async () => {
    $('password-msg').textContent = '';
    const cur = $('cur-password').value, nw = $('new-password').value;
    try {
      await API.put('/api/me/password', { currentPassword: cur, newPassword: nw });
      $('cur-password').value = ''; $('new-password').value = '';
      showToast('Пароль изменён', 'success');
    } catch (e) { $('password-msg').textContent = e.message; }
  });

  // Appearance
  qsa('input[name="theme"]').forEach(r => r.addEventListener('change', () => applyTheme(r.value)));

  const rangeEl = $('font-size-range');
  if (rangeEl) {
    rangeEl.addEventListener('input', () => {
      const v = rangeEl.value;
      $('font-size-label').textContent = v + 'px';
      applyFontSize(+v);
      updateRangeGradient(rangeEl);
    });
    updateRangeGradient(rangeEl);
  }

  // Accent color swatches
  const ACCENT_COLORS = [
    { label: 'default', color: '' },
    { label: 'blue',    color: '#4f7cff' },
    { label: 'purple',  color: '#8b5cf6' },
    { label: 'teal',    color: '#06b6d4' },
    { label: 'green',   color: '#22c55e' },
    { label: 'amber',   color: '#f59e0b' },
    { label: 'rose',    color: '#f43f5e' },
    { label: 'red',     color: '#ef4444' },
    { label: 'indigo',  color: '#6366f1' },
    { label: 'pink',    color: '#ec4899' },
    { label: 'lime',    color: '#84cc16' },
    { label: 'sky',     color: '#0ea5e9' },
  ];
  const accentWrap = $('accent-swatches');
  if (accentWrap) {
    ACCENT_COLORS.forEach(({ label, color }) => {
      const el = document.createElement('div');
      el.className = `accent-swatch${label === 'default' ? ' swatch-default' : ''}`;
      if (color) el.style.background = color;
      el.dataset.color = color;
      el.title = label === 'default' ? 'Авто (из темы)' : label;
      el.addEventListener('click', () => {
        qsa('.accent-swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
        applyAccentColor(color);
      });
      accentWrap.appendChild(el);
    });
  }

  // Wallpaper options
  qsa('.wallpaper-option').forEach(opt => {
    opt.addEventListener('click', () => {
      qsa('.wallpaper-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      applyWallpaper(opt.dataset.wp);
    });
  });

  // Bubble style
  on('set-bubble-rounded', 'change', () => {
    applyBubbleStyle($('set-bubble-rounded').checked ? 'rounded' : 'cornered');
  });

  // Compact mode
  on('set-compact', 'change', () => {
    applyCompactMode($('set-compact').checked);
  });

  on('save-appearance-btn', 'click', async () => {
    const theme      = document.querySelector('input[name="theme"]:checked')?.value || 'light';
    const fontSize   = +($('font-size-range')?.value || 14);
    const accentEl   = document.querySelector('.accent-swatch.active');
    const accentColor = accentEl?.dataset.color || '';
    const bubbleStyle = $('set-bubble-rounded')?.checked ? 'rounded' : 'cornered';
    const compactMode = !!$('set-compact')?.checked;
    const chatWallpaper = document.querySelector('.wallpaper-option.active')?.dataset.wp || 'dots';
    const sendByEnter = !!$('set-send-enter')?.checked;
    const uiAnimations = $('set-animations')?.checked !== false;
    const autoMedia = $('set-auto-media')?.checked !== false;
    const time24 = $('set-time24')?.checked !== false;
    const groupMessages = $('set-group-msgs')?.checked !== false;
    const language = $('set-language')?.value || 'ru';
    // Подсказки (hints)
    const hintsEnabled = !!$('set-hints')?.checked;
    toggleHints(hintsEnabled);
    try {
      const user = await API.put('/api/me', { settings: { theme, fontSize, accentColor, bubbleStyle, compactMode, chatWallpaper, sendByEnter, uiAnimations, autoMedia, time24, groupMessages, language } });
      S.user = user;
      // Apply animation toggle
      document.body.classList.toggle('no-animations', !uiAnimations);
      applyLanguage(language);
      showToast(language === 'en' ? 'Appearance saved' : 'Оформление сохранено', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  on('save-notifications-btn', 'click', async () => {
    S.notif.messages  = $('notif-messages').checked;
    S.notif.sound     = $('notif-sound').checked;
    S.notif.calls     = $('notif-calls').checked;
    S.notif.mentions  = $('notif-mentions').checked;
    const notifPreview = $('notif-preview')?.checked !== false;
    try {
      const user = await API.put('/api/me', { settings: {
        notifications: S.notif.messages,
        soundEnabled:  S.notif.sound,
        notifCalls:    S.notif.calls,
        notifMentions: S.notif.mentions,
        notifPreview:  notifPreview,
      }});
      S.user = user;
      showToast('Уведомления сохранены', 'success');
    } catch (e) { showToast(e.message || 'Ошибка сохранения', 'error'); }
  });

  on('save-privacy-btn', 'click', async () => {
    try {
      const user = await API.put('/api/me', { settings: {
        privShowLastSeen: $('priv-lastseen').checked,
        privShowOnline:   $('priv-online').checked,
        privShowAvatar:   $('priv-avatar').checked,
        privAllowForward: $('priv-forward').checked,
        privReadReceipts: $('priv-read-receipts')?.checked !== false,
        privShowTyping:   $('priv-show-typing')?.checked !== false,
      }});
      S.user = user;
      showToast('Приватность сохранена', 'success');
    } catch (e) { showToast(e.message || 'Ошибка сохранения', 'error'); }
  });

  on('save-security-btn', 'click', async () => {
    try {
      const user = await API.put('/api/me', { settings: {
        secE2E: $('sec-e2e').checked,
        sec2FA: $('sec-2fa').checked
      }});
      S.user = user;
      showToast('Безопасность сохранена', 'success');
    } catch (e) { showToast(e.message || 'Ошибка сохранения', 'error'); }
  });

  on('sessions-revoke-btn', 'click', async () => {
    if (!confirm('Завершить все другие сессии?')) return;
    try {
      await API.post('/api/me/sessions/revoke');
      showToast('Все другие сессии завершены', 'success');
      // Refresh sessions list
      loadSessions();
    } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
  });
}

function openSettings() {
  const u = S.user; if (!u) return;
  $('settings-displayname').value = u.displayName || '';
  $('settings-firstname').value   = u.firstName   || '';
  $('settings-lastname').value    = u.lastName    || '';
  $('settings-username').value    = u.username    || '';
  $('settings-bio').value         = u.bio         || '';
  renderAvatar($('settings-avatar'), u, 'avatar-xxl');

  // Appearance
  applyTheme(u.settings?.theme || 'light');
  applyFontSize(u.settings?.fontSize || 14);
  const themeRadio = document.querySelector(`input[name="theme"][value="${u.settings?.theme || 'light'}"]`);
  if (themeRadio) themeRadio.checked = true;
  const rangeEl = $('font-size-range');
  if (rangeEl) { rangeEl.value = u.settings?.fontSize || 14; $('font-size-label').textContent = (u.settings?.fontSize || 14) + 'px'; }

  // Accent color swatches
  const curAccent = u.settings?.accentColor || '';
  document.querySelectorAll('.accent-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === curAccent);
  });

  // Bubble style
  const bubbleEl = $('set-bubble-rounded');
  if (bubbleEl) bubbleEl.checked = (u.settings?.bubbleStyle || 'rounded') !== 'cornered';

  // Compact mode
  const compactEl = $('set-compact');
  if (compactEl) compactEl.checked = !!u.settings?.compactMode;

  // Wallpaper
  const curWp = u.settings?.chatWallpaper || 'dots';
  document.querySelectorAll('.wallpaper-option').forEach(wo => {
    wo.classList.toggle('active', wo.dataset.wp === curWp);
  });

  // Send by enter
  const sendEnterEl = $('set-send-enter');
  if (sendEnterEl) sendEnterEl.checked = u.settings?.sendByEnter !== false;

  // New settings
  const animEl = $('set-animations');
  if (animEl) animEl.checked = u.settings?.uiAnimations !== false;
  const autoMediaEl = $('set-auto-media');
  if (autoMediaEl) autoMediaEl.checked = u.settings?.autoMedia !== false;
  const time24El = $('set-time24');
  if (time24El) time24El.checked = u.settings?.time24 !== false;
  const grpMsgEl = $('set-group-msgs');
  if (grpMsgEl) grpMsgEl.checked = u.settings?.groupMessages !== false;
  const hintsEl = $('set-hints');
  if (hintsEl) hintsEl.checked = localStorage.getItem('sm_hints') === 'true';
  const langEl = $('set-language');
  if (langEl) langEl.value = u.settings?.language || 'ru';

  // Notifications
  $('notif-messages').checked = S.notif.messages;
  $('notif-sound').checked    = S.notif.sound;
  $('notif-calls').checked    = S.notif.calls;
  $('notif-mentions').checked = S.notif.mentions;
  const notifPrevEl = $('notif-preview');
  if (notifPrevEl) notifPrevEl.checked = u.settings?.notifPreview !== false;

  // Privacy
  $('priv-lastseen').checked = u.settings?.privShowLastSeen !== false;
  $('priv-online').checked   = u.settings?.privShowOnline   !== false;
  $('priv-avatar').checked   = u.settings?.privShowAvatar   !== false;
  $('priv-forward').checked  = u.settings?.privAllowForward !== false;
  const rrEl = $('priv-read-receipts');
  if (rrEl) rrEl.checked = u.settings?.privReadReceipts !== false;
  const stEl = $('priv-show-typing');
  if (stEl) stEl.checked = u.settings?.privShowTyping !== false;

  // Security
  $('sec-e2e').checked  = !!u.settings?.secE2E;
  $('sec-2fa').checked  = !!u.settings?.sec2FA;

  $('settings-modal').classList.remove('hidden');

  // Sessions list
  loadSessions();
}

async function loadSessions() {
  const sl = $('sessions-list');
  if (!sl) return;
  sl.innerHTML = '<div style="padding:8px 0;color:var(--text-secondary)">Загрузка...</div>';
  try {
    const sessions = await API.get('/api/me/sessions');
    sl.innerHTML = '';
    if (!sessions.length) { sl.innerHTML = '<div style="padding:8px 0;color:var(--text-secondary)">Нет активных сессий</div>'; return; }
    sessions.forEach(s => {
      const el = document.createElement('div');
      el.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;';
      const date = new Date(s.createdAt).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      const current = s.current ? ' <span style="color:var(--accent);font-weight:600">(текущая)</span>' : '';
      el.innerHTML = `<div style="font-weight:500">${escHtml(s.device || 'Неизвестное устройство')}${current}</div>`
        + `<div style="color:var(--text-secondary)">${escHtml(s.ip || '')} · ${date}</div>`;
      sl.appendChild(el);
    });
  } catch {
    sl.innerHTML = '<div style="padding:8px 0">💻 Текущая сессия — этот браузер</div>';
  }
}

// ══════════════════════════════════════════════════════════
// SIDE MENU
// ══════════════════════════════════════════════════════════
function initSideMenu() {
  on('menu-btn', 'click', e => { e.stopPropagation(); $('side-menu').classList.toggle('hidden'); });
  on('menu-logout',     'click', logout);
  on('menu-contacts',   'click', () => { $('side-menu').classList.add('hidden'); $('new-chat-btn').click(); });
  on('menu-favourites', 'click', () => {
    $('side-menu').classList.add('hidden');
    const list = $('fav-list');
    list.innerHTML = '';
    if (!S.favourites.length) { list.innerHTML = '<p class="hint-center">Нет сохранённых</p>'; }
    else {
      S.favourites.forEach(msg => {
        const el = document.createElement('div');
        el.className = 'user-result-item';
        el.innerHTML = `<div><div class="user-result-name">${escHtml(msg.senderName||'')}</div><div style="font-size:12px;color:var(--text-secondary)">${escHtml(msg.text||'')}</div></div>`;
        list.appendChild(el);
      });
    }
    $('fav-modal').classList.remove('hidden');
  });
  on('menu-archive', 'click', () => {
    $('side-menu').classList.add('hidden');
    const list = $('archive-list'); list.innerHTML = '';
    const archived = S.chats.filter(c => c.archived);
    if (!archived.length) { list.innerHTML = '<p class="hint-center">Архив пуст</p>'; }
    else archived.forEach(c => {
      const item = document.createElement('div'); item.className = 'user-result-item'; item.style.cursor='pointer';
      item.innerHTML = `<div class="user-result-name">${escHtml(c.displayName||'')}</div>`;
      item.addEventListener('click', () => { $('archive-modal').classList.add('hidden'); openChat(c.id); });
      list.appendChild(item);
    });
    $('archive-modal').classList.remove('hidden');
  });

  document.addEventListener('click', e => {
    if (!$('side-menu').contains(e.target) && e.target !== $('menu-btn')) $('side-menu').classList.add('hidden');
  });
}

function updateMenuProfile() {
  const u = S.user; if (!u) return;
  $('menu-display-name').textContent = u.displayName || '';
  $('menu-username').textContent = '@' + (u.username || '');
  renderAvatar($('menu-avatar'), u);
}

// ══════════════════════════════════════════════════════════
// MODAL CLOSE
// ══════════════════════════════════════════════════════════
function initModalClose() {
  qsa('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => { const m = $(btn.dataset.modal); if (m) m.classList.add('hidden'); });
  });
  qsa('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
  });
}

// ══════════════════════════════════════════════════════════
// PINNED BAR
// ══════════════════════════════════════════════════════════
function initPinnedBar() {
  on('pinned-bar', 'click', e => {
    if (e.target.closest('#unpin-btn')) return;
    if (S.activeChat?.pinnedMessage) scrollToMsg(S.activeChat.pinnedMessage.id);
  });
}

// ══════════════════════════════════════════════════════════
// CALLS
// ══════════════════════════════════════════════════════════
function handleIncomingCall({ from, fromName, fromAvatarColor, offer, callType }) {
  renderAvatar($('inc-call-avatar'), { displayName: fromName, avatarColor: fromAvatarColor || '#333333' }, 'avatar-lg');
  $('inc-call-name').textContent = fromName || 'Неизвестный';
  $('inc-call-type').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Голосовой звонок';
  $('incoming-call').classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  if (S.notif.calls && S.notif.sound) playRingtone();

  S._pendingCall = { from, fromName, fromAvatarColor, offer, callType };
  let _handled = false;

  function doAccept(e) {
    e.preventDefault();
    e.stopPropagation();
    if (_handled) return;
    _handled = true;
    if (navigator.vibrate) navigator.vibrate(0);
    stopRingtone();
    $('incoming-call').classList.add('hidden');
    const c = S._pendingCall;
    if (!c) return;
    S._pendingCall = null;
    // Мгновенно уведомляем звонящего — гудки прекратятся до завершения WebRTC
    S.socket?.emit('call_accepting', { to: c.from });
    startActiveCall(c.from, c.fromName, c.fromAvatarColor || '#333333', c.callType);
    window.callsModule?.acceptCall(c.from, c.offer, c.callType)
      .then(() => {
        playCallConnectSound();
        showToast('📞 Звонок начат', 'success');
      })
      .catch(err => {
        console.error('[doAccept] acceptCall error:', err);
        hideCallOverlays();
        clearInterval(_callTimerInt);
        showToast('Ошибка подключения звонка', 'error');
      });
  }

  function doReject(e) {
    e.preventDefault();
    e.stopPropagation();
    if (_handled) return;
    _handled = true;
    if (navigator.vibrate) navigator.vibrate(0);
    stopRingtone();
    $('incoming-call').classList.add('hidden');
    S.socket?.emit('call_reject', { to: from });
    S._pendingCall = null;
  }

  const acceptBtn = $('inc-accept-btn');
  const rejectBtn = $('inc-reject-btn');
  const newAccept = acceptBtn.cloneNode(true);
  const newReject = rejectBtn.cloneNode(true);
  acceptBtn.parentNode.replaceChild(newAccept, acceptBtn);
  rejectBtn.parentNode.replaceChild(newReject, rejectBtn);
  newAccept.addEventListener('click', doAccept);
  newAccept.addEventListener('touchend', doAccept);
  newReject.addEventListener('click', doReject);
  newReject.addEventListener('touchend', doReject);
}

function hideCallOverlays() {
  stopRingtone();
  stopDialTone();
  playCallEndSound();
  $('incoming-call').classList.add('hidden');
  $('active-call-overlay').classList.add('hidden');
  $('call-mini-bar')?.classList.add('hidden');
  $('sidebar-call-indicator')?.classList.add('hidden');
  S._callMinimized = false;
}

let _activeCallType = 'audio';
let _activeCallName = '';

function startActiveCall(userId, name, avatarColor, type) {
  _activeCallType = type || 'audio';
  _activeCallName = name || '';

  // Render avatars into both layers
  renderAvatar($('active-call-avatar-big'), { displayName: name, avatarColor }, 'avatar-xxl');
  renderAvatar($('active-call-avatar'), { displayName: name, avatarColor }, 'avatar-xs');
  $('active-call-name-audio').textContent = name || '';
  $('active-call-name').textContent = name || '';
  $('call-timer').textContent = '00:00';
  $('call-timer-audio').textContent = '00:00';

  // Let calls.js updateCallView handle layer visibility
  if (_activeCallType === 'video') {
    $('call-video-layer')?.classList.add('active');
    $('call-audio-layer')?.classList.add('hidden-layer');
  } else {
    $('call-video-layer')?.classList.remove('active');
    $('call-audio-layer')?.classList.remove('hidden-layer');
  }

  $('active-call-overlay').classList.remove('hidden');
  $('call-mini-bar')?.classList.add('hidden');
  $('sidebar-call-indicator')?.classList.remove('hidden');
  S._callMinimized = false;
  startCallTimer();
}

function minimizeCall() {
  $('active-call-overlay').classList.add('hidden');
  $('call-mini-bar')?.classList.remove('hidden');
  $('call-mini-name').textContent = _activeCallName || 'Звонок';
  $('sidebar-call-indicator')?.classList.remove('hidden');
  S._callMinimized = true;
}

function expandCall() {
  $('call-mini-bar')?.classList.add('hidden');
  $('active-call-overlay').classList.remove('hidden');
  S._callMinimized = false;
}

let _callTimerInt;
function startCallTimer() {
  let sec = 0; clearInterval(_callTimerInt);
  _callTimerInt = setInterval(() => {
    sec++;
    const t = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    // Update all timer displays
    const ct = $('call-timer'); if (ct) ct.textContent = t;
    const cta = $('call-timer-audio'); if (cta) cta.textContent = t;
    const cmt = $('call-mini-timer'); if (cmt) cmt.textContent = t;
  }, 1000);
}

function initCallButtons() {
  async function initiateCall(type) {
    const c = S.activeChat; if (!c) return;
    if (c.type === 'group') { startGroupCallUI(c); return; }
    const otherId = c.members?.find(id => id !== S.user?.id);
    if (!otherId) { showToast('Не удалось определить собеседника', 'error'); return; }
    playDialTone();
    startActiveCall(otherId, c.displayName, c.displayAvatarColor || '#333333', type);
    try {
      await window.callsModule?.startCall(otherId, type);
    } catch (err) {
      console.error('[initiateCall] error:', err);
      stopDialTone();
      hideCallOverlays();
      clearInterval(_callTimerInt);
      showToast('Не удалось начать звонок', 'error');
    }
  }
  on('call-audio-btn', 'click', () => initiateCall('audio'));
  on('call-video-btn', 'click', () => initiateCall('video'));
  on('end-call-btn', 'click', () => { stopDialTone(); stopRingtone(); playCallEndSound(); clearInterval(_callTimerInt); $('active-call-overlay').classList.add('hidden'); $('call-mini-bar')?.classList.add('hidden'); $('sidebar-call-indicator')?.classList.add('hidden'); showToast('📞 Звонок завершён', 'info'); window.callsModule?.endCall(); });
  on('toggle-mute',  'click', () => { const m = window.callsModule?.toggleMute(); $('toggle-mute').classList.toggle('muted', m); });
  on('toggle-video', 'click', async () => {
    try {
      const off = await window.callsModule?.toggleVideo();
      $('toggle-video')?.classList.toggle('active', !off);
      if (!off) _activeCallType = 'video';
    } catch (err) {
      console.error('[toggle-video] error:', err);
      showToast('Ошибка переключения камеры', 'error');
    }
  });
  on('toggle-speaker', 'click', () => showToast('Переключение динамика', 'info'));
  on('toggle-screen', 'click', async () => {
    const btn = $('toggle-screen');
    if (!btn) return;
    if (btn.classList.contains('sharing')) {
      window.callsModule?.stopScreenShare();
      btn.classList.remove('sharing');
      showToast('Демонстрация остановлена', 'info');
    } else {
      try {
        await window.callsModule?.startScreenShare();
        btn.classList.add('sharing');
        showToast('Демонстрация экрана', 'success');
      } catch (err) {
        showToast('Не удалось начать демонстрацию', 'error');
      }
    }
  });
  // Minimize / expand call
  on('minimize-call-btn', 'click', () => minimizeCall());
  on('call-mini-expand', 'click', (e) => { e.stopPropagation(); expandCall(); });
  on('call-mini-end', 'click', (e) => { e.stopPropagation(); stopDialTone(); stopRingtone(); playCallEndSound(); clearInterval(_callTimerInt); $('call-mini-bar')?.classList.add('hidden'); $('sidebar-call-indicator')?.classList.add('hidden'); showToast('📞 Звонок завершён', 'info'); window.callsModule?.endCall(); });
  on('call-mini-mute', 'click', (e) => { e.stopPropagation(); const m = window.callsModule?.toggleMute(); $('toggle-mute').classList.toggle('muted', m); $('call-mini-mute').textContent = m ? '🔇' : '🎙'; });
  // Click on mini bar to expand
  $('call-mini-bar')?.addEventListener('click', () => expandCall());

  // Sidebar call indicator — click to expand call
  on('sidebar-call-indicator', 'click', () => expandCall());

  // Group call controls
  on('gc-toggle-mute', 'click', () => {
    const m = window.groupCallModule?.toggleMute();
    $('gc-toggle-mute')?.classList.toggle('muted', m);
  });
  on('gc-end-call', 'click', () => endGroupCallUI());
}

// ══════════════════════════════════════════════════════════
// GROUP CALL UI
// ══════════════════════════════════════════════════════════
let _groupCallTimerInt;
function startGroupCallUI(chat) {
  const overlay = $('group-call-overlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  $('group-call-title').textContent = chat.displayName || 'Групповой звонок';
  $('group-call-participants').innerHTML = '';
  playCallConnectSound();
  showToast('📞 Групповой звонок начат', 'success');

  // Add self to participants
  renderGroupCallParticipants([{ id: S.user?.id, name: S.user?.displayName || 'Я', avatarColor: S.user?.avatarColor || '#333', muted: false }]);

  // Timer
  let sec = 0;
  clearInterval(_groupCallTimerInt);
  _groupCallTimerInt = setInterval(() => {
    sec++;
    const t = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    $('group-call-timer').textContent = t;
  }, 1000);

  // Join group call
  window.groupCallModule?.setOnMembersChange((members) => {
    const allMembers = [{ id: S.user?.id, name: S.user?.displayName || 'Я', avatarColor: S.user?.avatarColor || '#333', muted: false }, ...members];
    renderGroupCallParticipants(allMembers);
  });

  window.groupCallModule?.joinGroupCall(chat.id).catch(err => {
    console.error('[groupCall] join error:', err);
    endGroupCallUI();
  });
}

function renderGroupCallParticipants(members) {
  const container = $('group-call-participants');
  if (!container) return;
  container.innerHTML = '';
  members.forEach(m => {
    const card = document.createElement('div');
    card.className = 'gc-participant';
    const av = document.createElement('div');
    renderAvatar(av, { displayName: m.name, avatarColor: m.avatarColor }, 'avatar-lg');
    card.appendChild(av);
    const name = document.createElement('div');
    name.className = 'gc-participant-name';
    name.textContent = m.id === S.user?.id ? 'Вы' : (m.name || '?');
    card.appendChild(name);
    const micIcon = document.createElement('div');
    micIcon.className = `gc-participant-mic ${m.muted ? 'muted' : ''}`;
    micIcon.innerHTML = m.muted
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .67-.13 1.3-.36 1.9"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    card.appendChild(micIcon);
    container.appendChild(card);
  });
}

function endGroupCallUI() {
  clearInterval(_groupCallTimerInt);
  $('group-call-overlay')?.classList.add('hidden');
  $('group-call-timer').textContent = '00:00';
  window.groupCallModule?.leaveGroupCall();
  playCallEndSound();
  showToast('📞 Групповой звонок завершён', 'info');
}

// ══════════════════════════════════════════════════════════
// BACK BUTTON (mobile)
// ══════════════════════════════════════════════════════════
function initBackBtn() {
  on('back-btn', 'click', () => {
    // Auto-minimize active call when going back to sidebar
    if (!$('active-call-overlay')?.classList.contains('hidden') && window.callsModule?.isInCall?.()) {
      minimizeCall();
    }
    $('chat-panel').classList.remove('mobile-active');
    $('back-btn').classList.add('hidden');
    S.activeChat = null;
    $('active-chat').classList.add('hidden');
    $('welcome-screen').classList.remove('hidden');
  });
}

// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// NOTIFICATION SOUND & CALL SOUNDS
// ══════════════════════════════════════════════════════════
let _notifAudioCtx = null;
function getAudioCtx() {
  if (!_notifAudioCtx) _notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_notifAudioCtx.state === 'suspended') _notifAudioCtx.resume();
  return _notifAudioCtx;
}

function playNotifSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

// ── Рингтон входящего звонка (реалистичный телефонный) ────────────
let _ringtoneInterval = null;
let _ringtoneNodes = [];

function playRingtone() {
  stopRingtone();
  const playBurst = () => {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      // Настоящий телефонный рингтон: два наложенных тона (425 + 480 Hz)
      // Два коротких звонка с паузой
      const ringPairs = [[0, 0.4], [0.5, 0.9]];
      ringPairs.forEach(([start, end]) => {
        [425, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.connect(g); g.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          g.gain.setValueAtTime(0, now + start);
          g.gain.linearRampToValueAtTime(0.08, now + start + 0.02);
          g.gain.setValueAtTime(0.08, now + end - 0.02);
          g.gain.linearRampToValueAtTime(0, now + end);
          osc.start(now + start);
          osc.stop(now + end + 0.01);
          _ringtoneNodes.push(osc, g);
        });
      });
    } catch {}
  };
  playBurst();
  _ringtoneInterval = setInterval(playBurst, 2200);
}

function stopRingtone() {
  clearInterval(_ringtoneInterval);
  _ringtoneInterval = null;
  _ringtoneNodes.forEach(n => { try { n.disconnect(); } catch {} });
  _ringtoneNodes = [];
}

// ── Звук дозвона (исходящий — гудки как в телефоне) ──────────────
let _dialInterval = null;
let _dialNodes = [];
function playDialTone() {
  stopDialTone();
  const playBeep = () => {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      // Реалистичный КПВ (длинные гудки): 425 Hz, 1 сек звучит, 3 сек пауза
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.setValueAtTime(425, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.08, now + 0.02);
      g.gain.setValueAtTime(0.08, now + 0.98);
      g.gain.linearRampToValueAtTime(0, now + 1.0);
      osc.start(now); osc.stop(now + 1.05);
      _dialNodes.push(osc, g);
    } catch {}
  };
  playBeep();
  _dialInterval = setInterval(playBeep, 4000);
}

function stopDialTone() {
  clearInterval(_dialInterval);
  _dialInterval = null;
  _dialNodes.forEach(n => { try { n.disconnect(); } catch {} });
  _dialNodes = [];
}

// ── Звук соединения / завершения ────────────────────────────────────
function playCallConnectSound() {
  try {
    const ctx = getAudioCtx();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.2);
    });
  } catch {}
}

function playCallEndSound() {
  try {
    const ctx = getAudioCtx();
    [600, 400].forEach((freq, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      g.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.25);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.25);
    });
  } catch {}
}

// ══════════════════════════════════════════════════════════
// NOTIFICATION PERMISSION
// ══════════════════════════════════════════════════════════
function requestNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

// ══════════════════════════════════════════════════════════
// IMAGE LIGHTBOX
// ══════════════════════════════════════════════════════════
function openLightbox(url) {
  const lb = $('lightbox');
  const img = $('lightbox-img');
  if (!lb || !img) return;
  img.src = url;
  lb.classList.remove('hidden');
}

function initLightbox() {
  on('lightbox-close', 'click', () => $('lightbox').classList.add('hidden'));
  on('lightbox', 'click', e => { if (e.target === $('lightbox')) $('lightbox').classList.add('hidden'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('lightbox').classList.contains('hidden')) $('lightbox').classList.add('hidden');
  });
}

// ══════════════════════════════════════════════════════════
// SCROLL-TO-BOTTOM BUTTON
// ══════════════════════════════════════════════════════════
function initScrollBtn() {
  const area = $('messages-area');
  const btn = $('scroll-bottom-btn');
  if (!area || !btn) return;

  area.addEventListener('scroll', () => {
    const gap = area.scrollHeight - area.scrollTop - area.clientHeight;
    btn.classList.toggle('hidden', gap < 200);
  });

  btn.addEventListener('click', () => {
    area.scrollTop = area.scrollHeight;
    btn.classList.add('hidden');
  });
}

// ══════════════════════════════════════════════════════════
// APPLY ALL SETTINGS
// ══════════════════════════════════════════════════════════
function applyAllSettings(s) {
  applyTheme(s?.theme || 'light');
  applyFontSize(s?.fontSize || 14);
  applyAccentColor(s?.accentColor || '');
  applyBubbleStyle(s?.bubbleStyle || 'rounded');
  applyCompactMode(!!s?.compactMode);
  applyWallpaper(s?.chatWallpaper || 'dots');
  applyLanguage(s?.language || 'ru');
  document.body.classList.toggle('no-animations', s?.uiAnimations === false);
}

// ══════════════════════════════════════════════════════════
// MOBILE KEYBOARD & VIEWPORT FIX
// ══════════════════════════════════════════════════════════
function initMobileKeyboardFix() {
  const isMobile = () => window.innerWidth <= 680;
  if (!isMobile()) return;

  // ── Fix iOS 100vh: set --vh from visual viewport ──
  function setVH() {
    const h = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
  }
  setVH();
  (window.visualViewport || window).addEventListener('resize', setVH);

  // ── Keyboard open/close detection ──
  const initialHeight = window.visualViewport?.height || window.innerHeight;
  let kbOpen = false;

  function onViewportResize() {
    if (!isMobile()) return;
    const vpH = window.visualViewport?.height || window.innerHeight;
    const diff = initialHeight - vpH;
    const nowOpen = diff > 80; // keyboard is open if viewport shrank >80px

    if (nowOpen && !kbOpen) {
      kbOpen = true;
      document.body.classList.add('keyboard-open');
      // Resize active-chat to fit visual viewport
      const ac = $('active-chat');
      if (ac) ac.style.height = vpH + 'px';
      // Scroll messages to bottom
      const ma = $('messages-area');
      if (ma) setTimeout(() => { ma.scrollTop = ma.scrollHeight; }, 100);
    } else if (!nowOpen && kbOpen) {
      kbOpen = false;
      document.body.classList.remove('keyboard-open');
      const ac = $('active-chat');
      if (ac) ac.style.height = '';
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize);
    window.visualViewport.addEventListener('scroll', () => {
      // Keep fixed-like elements in view on iOS scroll
      document.documentElement.style.setProperty('--vv-offset', `${window.visualViewport.offsetTop}px`);
    });
  }

  // ── Scroll input into view after focus (with delay for keyboard) ──
  const msgInput = $('msg-input');
  if (msgInput) {
    msgInput.addEventListener('focus', () => {
      setTimeout(() => {
        const wrap = msgInput.closest('.message-input-wrap');
        if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 350);
    });
    // On blur, scroll messages-area back
    msgInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) {
          const ma = $('messages-area');
          if (ma) ma.scrollTop = ma.scrollHeight;
        }
      }, 200);
    });
  }

  // ── Android hardware back button ──
  window.addEventListener('popstate', () => {
    const cp = $('chat-panel');
    if (cp && cp.classList.contains('mobile-active')) {
      cp.classList.remove('mobile-active');
      $('back-btn')?.classList.add('hidden');
      S.activeChat = null;
      $('active-chat')?.classList.add('hidden');
      $('welcome-screen')?.classList.remove('hidden');
    }
  });

  // ── Push history state when opening chat on mobile ──
  const cp = $('chat-panel');
  if (cp) {
    new MutationObserver(() => {
      if (cp.classList.contains('mobile-active')) {
        history.pushState({ chatOpen: true }, '');
      }
    }).observe(cp, { attributes: true, attributeFilter: ['class'] });
  }
}

// ══════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS SUBSCRIPTION
// ══════════════════════════════════════════════════════════
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;

    // Already subscribed?
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Re-send to server in case it was lost
      try { await API.post('/api/push/subscribe', existing.toJSON()); } catch {}
      return;
    }

    // Ask permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push: notification permission denied');
      if (permission === 'denied') {
        showToast('Push-уведомления заблокированы. Разрешите их в настройках браузера.', 'error');
      }
      return;
    }

    // Get VAPID public key (с повторной попыткой)
    let publicKey;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await API.get('/api/push/vapid');
        publicKey = resp.publicKey;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!publicKey) {
      console.warn('Push: VAPID key not available');
      return;
    }
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    await API.post('/api/push/subscribe', subscription.toJSON());
    console.log('Push subscription active');
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ══════════════════════════════════════════════════════════
// WELCOME WIZARD (полная настройка) — v2.8
// ══════════════════════════════════════════════════════════
function showWelcomeWizard(force = false) {
  const key = 'sm_wizard_v28';
  if (!force && localStorage.getItem(key) === 'hidden') return;

  const overlay = document.getElementById('welcome-wizard');
  if (!overlay) return;

  overlay.style.display = '';
  overlay.classList.remove('hidden');

  let currentStep = 1;
  const totalSteps = 4;
  const steps = overlay.querySelectorAll('.wizard-step');
  const dots = overlay.querySelectorAll('.wizard-dot');
  const nextBtn = document.getElementById('wizard-next');
  const skipBtn = document.getElementById('wizard-skip');

  if (!nextBtn || !skipBtn || steps.length === 0) return;

  function goToStep(step) {
    currentStep = step;
    steps.forEach(s => {
      const active = parseInt(s.dataset.step) === step;
      s.style.display = active ? '' : 'none';
      s.classList.toggle('active', active);
    });
    dots.forEach(d => {
      const active = parseInt(d.dataset.dot) === step;
      d.classList.toggle('active', active);
      d.style.background = active ? 'var(--accent)' : 'var(--border)';
    });
    nextBtn.textContent = step >= totalSteps ? 'Готово!' : 'Далее';
  }

  goToStep(1);

  // ── Step 2: Theme cards ──
  overlay.querySelectorAll('.wiz-theme-card').forEach(card => {
    card.addEventListener('click', () => {
      overlay.querySelectorAll('.wiz-theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      applyTheme(card.dataset.theme);
    });
  });

  // ── Step 3: Permissions ──
  function bindPerm(btnId, statusId, cardId, permFn) {
    const btn = document.getElementById(btnId);
    const st = document.getElementById(statusId);
    const card = document.getElementById(cardId);
    if (!btn || !st) return;
    btn.addEventListener('click', async () => {
      try {
        const ok = await permFn();
        if (ok) {
          st.textContent = 'Включено ✓';
          if (card) card.classList.add('granted');
          if (card) card.classList.remove('denied');
        } else {
          st.textContent = 'Отклонено';
          if (card) card.classList.add('denied');
          if (card) card.classList.remove('granted');
        }
      } catch {
        st.textContent = 'Ошибка';
        if (card) card.classList.add('denied');
        if (card) card.classList.remove('granted');
      }
    });
  }

  // Notifications — request permission + subscribe to push
  bindPerm('wizard-notif-btn', 'wizard-notif-status', 'wizard-notif-card', async () => {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      subscribeToPush();
      return true;
    }
    return false;
  });
  bindPerm('wizard-mic-btn', 'wizard-mic-status', 'wizard-mic-card', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  });
  bindPerm('wizard-cam-btn', 'wizard-cam-status', 'wizard-cam-card', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  });

  // ── Next / Done ──
  nextBtn.addEventListener('click', () => {
    if (currentStep < totalSteps) {
      goToStep(currentStep + 1);
    } else {
      finishWizard();
    }
  });

  skipBtn.addEventListener('click', finishWizard);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finishWizard();
  });

  function finishWizard() {
    // Hints
    const hintsEl = document.getElementById('wizard-hints-toggle');
    if (hintsEl?.checked) {
      document.body.classList.add('hints-enabled');
      localStorage.setItem('sm_hints', 'true');
    }

    // Theme
    const activeTheme = overlay.querySelector('.wiz-theme-card.active')?.dataset?.theme || 'light';
    applyTheme(activeTheme);

    // Gather extra settings
    const settings = { theme: activeTheme };
    const soundEl = document.getElementById('wizard-sound-toggle');
    const enterEl = document.getElementById('wizard-enter-toggle');
    const compactEl = document.getElementById('wizard-compact-toggle');
    const wpEl = document.getElementById('wizard-wallpaper-toggle');
    if (soundEl) settings.soundEnabled = soundEl.checked;
    if (enterEl) settings.sendByEnter = enterEl.checked;
    if (compactEl) settings.compactMode = compactEl.checked;
    if (wpEl) settings.chatWallpaper = wpEl.checked ? 'dots' : 'none';

    API.put('/api/me', { settings }).catch(() => {});

    const dontShow = document.getElementById('wizard-dont-show');
    if (dontShow?.checked) {
      localStorage.setItem(key, 'hidden');
    }
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════
// LOGIN SETUP PROMPT (для входящих пользователей)
// ══════════════════════════════════════════════════════════
function showLoginSetupPrompt() {
  const key = 'sm_login_setup_skip';
  if (localStorage.getItem(key) === 'true') return;

  const overlay = document.getElementById('login-setup-prompt');
  if (!overlay) return;

  overlay.style.display = '';
  overlay.classList.remove('hidden');

  const yesBtn = document.getElementById('login-setup-yes');
  const noBtn = document.getElementById('login-setup-no');
  const dontShow = document.getElementById('login-setup-dont-show');

  function close() {
    if (dontShow?.checked) {
      localStorage.setItem(key, 'true');
    }
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }

  yesBtn?.addEventListener('click', () => {
    close();
    showWelcomeWizard(true);
  });
  noBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

// ══════════════════════════════════════════════════════════
// EXTENDED TOOLTIPS (подсказки)
// ══════════════════════════════════════════════════════════
function initHints() {
  if (localStorage.getItem('sm_hints') === 'true') {
    document.body.classList.add('hints-enabled');
  }
  // Позиционируем тултипы через CSS custom properties (не ломает flex)
  document.addEventListener('mouseenter', e => {
    const el = e.target.closest?.('[data-hint]');
    if (!el || !document.body.classList.contains('hints-enabled')) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(10, Math.min(window.innerWidth - 110, rect.left + rect.width / 2 - 100));
    const y = Math.max(4, rect.top - 36);
    el.style.setProperty('--hint-x', x + 'px');
    el.style.setProperty('--hint-y', y + 'px');
  }, true);
}

function toggleHints(enabled) {
  document.body.classList.toggle('hints-enabled', enabled);
  localStorage.setItem('sm_hints', enabled ? 'true' : 'false');
}

// Управление БД — только через admin.bat на ПК

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
let _appInitialized = false;
function initApp() {
  if (_appInitialized) return; // предотвращаем двойную инициализацию
  _appInitialized = true;
  initInput();
  initPickers();
  initChatSearch();
  initSidebarSearch();
  initSidebarTabs();
  initNewChatModal();
  initSettings();
  initChatInfo();
  initSideMenu();
  initModalClose();
  initCtxMenu();
  initCallButtons();
  initBackBtn();
  initPinnedBar();
  initLightbox();
  initScrollBtn();
  requestNotifPerm();
  toggleSendVoiceBtn();
  updateMenuProfile();
  initMobileKeyboardFix();
  initHints();
}

// ══════════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════════
(async () => {
  // Apply saved theme immediately to prevent flash
  try {
    const savedUser = JSON.parse(localStorage.getItem('sm_user') || '{}');
    const savedTheme = savedUser?.settings?.theme || 'dark';
    applyTheme(savedTheme);
  } catch { applyTheme('dark'); }

  initAuth();
  const tok = localStorage.getItem('sm_token');
  if (tok) {
    S.token = tok;
    try {
      const user = await API.get('/api/me');
      // Saved session: skip animation, go straight to app
      S.user = user;
      localStorage.setItem('sm_user', JSON.stringify(user));
      $('auth-screen').classList.add('hidden');
      $('app').classList.remove('hidden');
      applyAllSettings(user.settings);
      S.notif.messages = user.settings?.notifications !== false;
      S.notif.sound    = user.settings?.soundEnabled   !== false;
      S.notif.calls    = user.settings?.notifCalls     !== false;
      S.notif.mentions = user.settings?.notifMentions  !== false;
      updateMenuProfile();
      initSocket();
      await loadChats();
      initApp();
      subscribeToPush();
    } catch {
      S.token = null;
      localStorage.removeItem('sm_token');
      localStorage.removeItem('sm_user');
    }
  }
})();
