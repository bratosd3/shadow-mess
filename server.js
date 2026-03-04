// =============================================================================
// Shadow Mess v2.0 — Node.js Backend (MongoDB)
// Express + Socket.io + WebRTC signaling + JWT Auth + Mongoose
// =============================================================================

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const multer     = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const mongoose   = require('mongoose');
const webpush    = require('web-push');

const app  = express();
const srv  = http.createServer(app);
const io   = new Server(srv, { cors: { origin: '*', credentials: true } });

const PORT        = process.env.PORT || 5000;
const JWT_SECRET  = process.env.JWT_SECRET || 'shadow_mess_jwt_secret_v2_2026';
const MONGO_URI   = process.env.MONGODB_URI || 'mongodb://localhost:27017/shadowmess';
const ADMIN_KEY   = process.env.ADMIN_KEY || 'shadow_admin_secret_2026';
const STATIC_DIR  = path.join(__dirname, 'static');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ── VAPID keys for Web Push ───────────────────────────────────────────────
// Ключи сохраняются в MongoDB чтобы не терялись при перезапусках на Render.
// Если есть в env — используются оттуда. Иначе — из БД или генерируются новые.
let VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
let VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
let vapidReady    = false; // будет true после initVapid()

// ── Directories ────────────────────────────────────────────────────────────
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// =============================================================================
// Mongoose Models (оптимизированные)
// =============================================================================

// ── Config: хранит настройки сервера (VAPID ключи и т.д.) ─────────────────
const configSchema = new mongoose.Schema({
  _id:   { type: String },
  value: { type: mongoose.Schema.Types.Mixed },
});
const Config = mongoose.model('Config', configSchema);

const userSchema = new mongoose.Schema({
  _id:           { type: String, default: uuidv4 },
  username:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName:   { type: String, required: true, trim: true },
  passwordHash:  { type: String, required: true },
  avatar:        String,
  avatarColor:   { type: String, default: () => `hsl(${Math.floor(Math.random()*360)},65%,55%)` },
  bio:           { type: String, default: '' },
  phone:         { type: String, default: '' },
  firstName:     { type: String, default: '' },
  lastName:      { type: String, default: '' },
  online:        { type: Boolean, default: false },
  lastSeen:      { type: Date, default: Date.now },
  createdAt:     { type: Date, default: Date.now },
  settings: {
    theme:            { type: String, default: 'light' },
    fontSize:         { type: Number, default: 14 },
    notifications:    { type: Boolean, default: true },
    soundEnabled:     { type: Boolean, default: true },
    notifCalls:       { type: Boolean, default: true },
    notifMentions:    { type: Boolean, default: true },
    notifPreview:     { type: Boolean, default: true },
    privShowLastSeen: { type: Boolean, default: true },
    privShowOnline:   { type: Boolean, default: true },
    privShowAvatar:   { type: Boolean, default: true },
    privAllowForward: { type: Boolean, default: true },
    privReadReceipts: { type: Boolean, default: true },
    privShowTyping:   { type: Boolean, default: true },
    language:         { type: String, default: 'ru' },
    accentColor:      { type: String, default: '' },
    bubbleStyle:      { type: String, default: 'rounded' },
    compactMode:      { type: Boolean, default: false },
    chatWallpaper:    { type: String, default: 'dots' },
    sendByEnter:      { type: Boolean, default: true },
  }
}, { _id: false, timestamps: false });
userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => { ret.id = ret._id; delete ret.__v; delete ret.passwordHash; return ret; }
});
const User = mongoose.model('User', userSchema);

// Сессии: TTL index — автоудаление через 30 дней
const sessionSchema = new mongoose.Schema({
  _id:       { type: String, default: uuidv4 },
  userId:    { type: String, required: true, index: true },
  device:    { type: String, default: 'Unknown' },
  ip:        { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 2592000 }, // 30 дней
  active:    { type: Boolean, default: true },
}, { _id: false });
sessionSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; }
});
const Session = mongoose.model('Session', sessionSchema);

const chatSchema = new mongoose.Schema({
  _id:            { type: String, default: uuidv4 },
  type:           { type: String, enum: ['private', 'group', 'channel'], default: 'private' },
  members:        [{ type: String }],
  name:           String,
  description:    { type: String, default: '' },
  avatar:         String,
  avatarColor:    String,
  createdAt:      { type: Date, default: Date.now },
  createdBy:      String,
  admins:         [{ type: String }],
  pinned:         { type: Boolean, default: false },
  muted:          { type: Boolean, default: false },
  archived:       { type: Boolean, default: false },
  pinnedMessage:  String,
}, { _id: false });
chatSchema.index({ members: 1 });
chatSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; }
});
const Chat = mongoose.model('Chat', chatSchema);

const messageSchema = new mongoose.Schema({
  _id:              { type: String, default: uuidv4 },
  chatId:           { type: String, required: true, index: true },
  senderId:         { type: String, required: true },
  senderName:       { type: String, default: '' },
  senderAvatar:     String,
  senderAvatarColor:String,
  type:             { type: String, default: 'text' },
  text:             { type: String, default: '' },
  fileName:         String,
  fileSize:         Number,
  fileUrl:          String,
  fileMime:         String,
  duration:         Number,
  timestamp:        { type: Date, default: Date.now },
  editedAt:         Date,
  replyTo:          String,
  forwardFrom:      String,
  reactions:        { type: mongoose.Schema.Types.Mixed, default: {} },
  readBy:           [{ type: String }],
}, { _id: false });
messageSchema.index({ chatId: 1, timestamp: -1 });
messageSchema.index({ chatId: 1, senderId: 1 }); // для подсчёта непрочитанных
messageSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; }
});
const Message = mongoose.model('Message', messageSchema);

// Push-подписки для уведомлений
const pushSubSchema = new mongoose.Schema({
  _id:          { type: String, default: uuidv4 },
  userId:       { type: String, required: true, index: true },
  endpoint:     { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
  createdAt:    { type: Date, default: Date.now, expires: 2592000 }, // 30 дней, обновляется при re-subscribe
}, { _id: false });
pushSubSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
const PushSub = mongoose.model('PushSub', pushSubSchema);

// ── Multer ────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use('/static', express.static(STATIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Auth middleware ────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(h.slice(7), JWT_SECRET);
    req.user = { id: decoded.id, sid: decoded.sid || null };
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function sanitizeUser(u) {
  const obj = u.toJSON ? u.toJSON() : { ...u };
  delete obj.passwordHash;
  return obj;
}

// ── VAPID init (вызывается после подключения к MongoDB) ───────────────────
async function initVapid() {
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:shadow@mess.app', VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
    console.log('  🔑  VAPID ключи загружены из env');
    return;
  }
  // Попробуем достать из БД
  const stored = await Config.findById('vapid');
  if (stored?.value?.publicKey && stored?.value?.privateKey) {
    VAPID_PUBLIC  = stored.value.publicKey;
    VAPID_PRIVATE = stored.value.privateKey;
    webpush.setVapidDetails('mailto:shadow@mess.app', VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
    console.log('  🔑  VAPID ключи загружены из БД');
    return;
  }
  // Генерируем и сохраняем в БД
  const keys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC  = keys.publicKey;
  VAPID_PRIVATE = keys.privateKey;
  await Config.findOneAndUpdate(
    { _id: 'vapid' },
    { value: { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE } },
    { upsert: true }
  );
  webpush.setVapidDetails('mailto:shadow@mess.app', VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
  console.log('  🔑  VAPID ключи сгенерированы и сохранены в БД (автоматически!)');
}

// ── Online tracking ────────────────────────────────────────────────────────
const onlineUsers = new Map(); // userId → Set<socketId>

async function setUserOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
  const user = await User.findByIdAndUpdate(userId, { online: true }, { new: true });
  if (!user || user.settings?.privShowOnline !== false) {
    io.emit('user_online', { userId });
  }
}

async function setUserOffline(userId, socketId) {
  const sset = onlineUsers.get(userId);
  if (sset) {
    sset.delete(socketId);
    if (sset.size === 0) {
      onlineUsers.delete(userId);
      const user = await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() }, { new: true });
      if (!user || user.settings?.privShowOnline !== false) {
        const lastSeen = (user?.settings?.privShowLastSeen !== false) ? new Date().toISOString() : null;
        io.emit('user_offline', { userId, lastSeen });
      }
    }
  }
}

function isOnline(userId) { return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0; }

// ── Push notification helper ──────────────────────────────────────────────
async function sendPushToUser(userId, payload) {
  const subs = await PushSub.find({ userId });
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
      }, body);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await PushSub.deleteOne({ _id: sub._id });
      }
    }
  }
}

async function sendPushForMessage(msg, chat) {
  if (!vapidReady) return;
  // Отправляем пуш всем участникам кроме отправителя
  // (даже если online — приложение может быть свёрнуто)
  const recipients = (chat.members || []).filter(uid => uid !== msg.senderId);
  if (!recipients.length) return;
  const payload = {
    title: msg.senderName || 'Shadow Message',
    body: msg.text || (msg.type === 'image' ? '📷 Фото' : msg.type === 'voice' ? '🎤 Голосовое' : '📎 Файл'),
    icon: '/static/icons/icon-192.svg',
    tag: `chat-${msg.chatId}`,
    chatId: msg.chatId,
    url: '/'
  };
  await Promise.allSettled(recipients.map(uid => sendPushToUser(uid, payload)));
}

// =============================================================================
// REST API
// =============================================================================

// ── Root ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(STATIC_DIR, 'manifest.json')));
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(STATIC_DIR, 'sw.js'));
});

// ── Push subscription endpoints ───────────────────────────────────────────
app.get('/api/push/vapid', (req, res) => {
  if (!vapidReady || !VAPID_PUBLIC) return res.status(503).json({ error: 'VAPID not ready' });
  res.json({ publicKey: VAPID_PUBLIC });
});

app.post('/api/push/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      return res.status(400).json({ error: 'Invalid subscription' });

    // Remove duplicate endpoint for this user
    await PushSub.deleteMany({ userId: req.user.id, endpoint });

    await PushSub.create({
      userId:   req.user.id,
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/push/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSub.deleteMany({ userId: req.user.id, endpoint });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Управление БД (только через секретный ключ) ────────────────────────────
// Доступ только с admin.bat через заголовок X-Admin-Key
function adminKeyMiddleware(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(403).json({ error: 'Нет доступа' });
  next();
}

// Статистика БД
app.get('/api/admin/stats', adminKeyMiddleware, async (req, res) => {
  const [users, chats, messages, sessions, pushSubs] = await Promise.all([
    User.countDocuments(),
    Chat.countDocuments(),
    Message.countDocuments(),
    Session.countDocuments(),
    PushSub.countDocuments(),
  ]);
  res.json({ users, chats, messages, sessions, pushSubs });
});

// Очистка сообщений (всех или конкретного чата)
app.delete('/api/admin/messages', adminKeyMiddleware, async (req, res) => {
  const { chatId } = req.query;
  const filter = chatId ? { chatId } : {};
  const result = await Message.deleteMany(filter);
  res.json({ deleted: result.deletedCount });
});

// Очистка всех чатов и их сообщений
app.delete('/api/admin/chats', adminKeyMiddleware, async (req, res) => {
  const [msgs, chats] = await Promise.all([
    Message.deleteMany({}),
    Chat.deleteMany({}),
  ]);
  res.json({ deletedChats: chats.deletedCount, deletedMessages: msgs.deletedCount });
});

// Удаление всех пользователей
app.delete('/api/admin/users', adminKeyMiddleware, async (req, res) => {
  const result = await User.deleteMany({});
  await Session.deleteMany({});
  res.json({ deleted: result.deletedCount });
});

// Список пользователей (для admin panel)
app.get('/api/admin/users', adminKeyMiddleware, async (req, res) => {
  const users = await User.find({}, 'username displayName createdAt lastSeen bio').sort({ createdAt: -1 });
  res.json(users);
});

// Удаление конкретного пользователя + его данных
app.delete('/api/admin/users/:id', adminKeyMiddleware, async (req, res) => {
  const userId = req.params.id;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  // Удалить сессии
  const sessions = await Session.deleteMany({ userId });
  // Удалить push-подписки
  const pushSubs = await PushSub.deleteMany({ userId });
  // Удалить сообщения пользователя
  const messages = await Message.deleteMany({ senderId: userId });
  // Удалить пользователя из чатов и чистить пустые
  const chats = await Chat.find({ members: userId });
  let deletedChats = 0;
  for (const chat of chats) {
    chat.members = chat.members.filter(m => m !== userId);
    if (chat.members.length === 0) {
      await Message.deleteMany({ chatId: chat._id.toString() });
      await chat.deleteOne();
      deletedChats++;
    } else {
      await chat.save();
    }
  }
  await user.deleteOne();
  res.json({
    deleted: true,
    username: user.username,
    deletedSessions: sessions.deletedCount,
    deletedPushSubs: pushSubs.deletedCount,
    deletedMessages: messages.deletedCount,
    deletedChats,
  });
});

// Очистка сессий
app.delete('/api/admin/sessions', adminKeyMiddleware, async (req, res) => {
  const result = await Session.deleteMany({ active: false });
  res.json({ deleted: result.deletedCount });
});

// Очистка push-подписок
app.delete('/api/admin/pushsubs', adminKeyMiddleware, async (req, res) => {
  const result = await PushSub.deleteMany({});
  res.json({ deleted: result.deletedCount });
});

// Полный сброс — удаляет ВСЁ
app.delete('/api/admin/reset', adminKeyMiddleware, async (req, res) => {
  const [msgs, chats, sessions, pushSubs] = await Promise.all([
    Message.deleteMany({}),
    Chat.deleteMany({}),
    Session.deleteMany({}),
    PushSub.deleteMany({}),
  ]);
  const users = await User.deleteMany({});
  res.json({
    deletedMessages: msgs.deletedCount,
    deletedChats: chats.deletedCount,
    deletedUsers: users.deletedCount,
    deletedSessions: sessions.deletedCount,
    deletedPushSubs: pushSubs.deletedCount,
  });
});

// ── Register ──────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    if (!username || !displayName || !password)
      return res.status(400).json({ error: 'Заполните все поля' });
    if (username.length < 3)
      return res.status(400).json({ error: 'Логин минимум 3 символа' });
    if (password.length < 4)
      return res.status(400).json({ error: 'Пароль минимум 4 символа' });

    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Логин уже занят' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.toLowerCase().trim(),
      displayName: displayName.trim(),
      passwordHash,
    });

    const sessionId = uuidv4();
    const token = jwt.sign({ id: user._id, sid: sessionId }, JWT_SECRET, { expiresIn: '30d' });

    await Session.create({
      _id: sessionId,
      userId: user._id,
      device: req.headers['user-agent'] || 'Unknown',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
    });

    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Введите логин и пароль' });

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) return res.status(400).json({ error: 'Пользователь не найден' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Неверный пароль' });

    const sessionId = uuidv4();
    const token = jwt.sign({ id: user._id, sid: sessionId }, JWT_SECRET, { expiresIn: '30d' });

    await Session.create({
      _id: sessionId,
      userId: user._id,
      device: req.headers['user-agent'] || 'Unknown',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
    });

    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(user));
});

// ── Update Profile ────────────────────────────────────────────────────────
app.put('/api/me', authMiddleware, async (req, res) => {
  try {
    const { displayName, bio, settings, avatarColor, phone, username, firstName, lastName } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    if (username !== undefined) {
      const clean = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (clean.length < 3) return res.status(400).json({ error: 'Логин минимум 3 символа (a-z, 0-9, _)' });
      const taken = await User.findOne({ username: clean, _id: { $ne: req.user.id } });
      if (taken) return res.status(409).json({ error: 'Логин уже занят' });
      user.username = clean;
    }
    if (displayName !== undefined) user.displayName = displayName.trim();
    if (firstName   !== undefined) user.firstName   = firstName.trim();
    if (lastName    !== undefined) user.lastName     = lastName.trim();
    if (bio         !== undefined) user.bio          = bio;
    if (avatarColor !== undefined) user.avatarColor  = avatarColor;
    if (phone       !== undefined) user.phone        = phone;
    if (settings    !== undefined) {
      for (const [k, v] of Object.entries(settings)) {
        user.settings[k] = v;
      }
      user.markModified('settings');
    }

    await user.save();
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Update password ────────────────────────────────────────────────────────
app.put('/api/me/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Неверный текущий пароль' });
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Пароль минимум 4 символа' });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ ok: true });
});

// ── Upload avatar ─────────────────────────────────────────────────────────
app.post('/api/me/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const user = await User.findByIdAndUpdate(req.user.id, { avatar: `/uploads/${req.file.filename}` }, { new: true });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ avatar: user.avatar });
});

// ── Get sessions ──────────────────────────────────────────────────────────
app.get('/api/me/sessions', authMiddleware, async (req, res) => {
  const sessions = await Session.find({ userId: req.user.id, active: true }).lean();
  const currentSid = req.user.sid || null;
  const result = sessions.map(s => {
    const ua = s.device || '';
    let device = 'Неизвестное устройство';
    if (/Windows/i.test(ua)) device = 'Windows';
    else if (/Mac/i.test(ua)) device = 'macOS';
    else if (/Linux/i.test(ua)) device = 'Linux';
    else if (/Android/i.test(ua)) device = 'Android';
    else if (/iPhone|iPad/i.test(ua)) device = 'iOS';
    if (/Chrome/i.test(ua) && !/Edge/i.test(ua)) device += ' · Chrome';
    else if (/Firefox/i.test(ua)) device += ' · Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) device += ' · Safari';
    else if (/Edge/i.test(ua)) device += ' · Edge';

    return {
      id: s._id,
      device,
      ip: s.ip,
      createdAt: s.createdAt,
      current: s._id === currentSid
    };
  }).sort((a, b) => b.current ? 1 : -1);
  res.json(result);
});

// ── Revoke all other sessions ─────────────────────────────────────────────
app.post('/api/me/sessions/revoke', authMiddleware, async (req, res) => {
  const currentSid = req.user.sid || null;
  await Session.updateMany(
    { userId: req.user.id, _id: { $ne: currentSid } },
    { active: false }
  );

  const sset = onlineUsers.get(req.user.id);
  if (sset) {
    sset.forEach(sid => {
      const s = io.sockets.sockets.get(sid);
      if (s && s.user?.sid !== currentSid) {
        s.emit('session_revoked');
        s.disconnect(true);
      }
    });
  }

  res.json({ ok: true });
});

// ── Search users ──────────────────────────────────────────────────────────
app.get('/api/users/search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({
    _id: { $ne: req.user.id },
    $or: [{ username: regex }, { displayName: regex }]
  }).select('-passwordHash -__v').limit(20).lean();

  const results = users.map(u => {
    u.id = u._id;
    u.online = (u.settings?.privShowOnline !== false) ? isOnline(u._id) : false;
    if (u.settings?.privShowAvatar === false) u.avatar = null;
    return u;
  });
  res.json(results);
});

// ── Get user by id ────────────────────────────────────────────────────────
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.id = user._id;
  delete user.passwordHash; delete user.__v;
  if (user.settings?.privShowOnline === false) user.online = false;
  else user.online = isOnline(user._id);
  if (user.settings?.privShowAvatar === false) user.avatar = null;
  if (user.settings?.privShowLastSeen === false) user.lastSeen = null;
  res.json(user);
});

// ── Get chats (оптимизировано v2.7) ───────────────────────────────────────
app.get('/api/chats', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const chats = await Chat.find({ members: uid }).lean();
    if (!chats.length) return res.json([]);
    const chatIds = chats.map(c => c._id);

    // Агрегация: последнее сообщение + непрочитанные за один pipeline
    const [lastMsgAgg, unreadAgg, users] = await Promise.all([
      Message.aggregate([
        { $match: { chatId: { $in: chatIds } } },
        { $sort: { chatId: 1, timestamp: -1 } },
        { $group: { _id: '$chatId', doc: { $first: '$$ROOT' } } },
      ]),
      Message.aggregate([
        { $match: { chatId: { $in: chatIds }, senderId: { $ne: uid }, readBy: { $nin: [uid] } } },
        { $group: { _id: '$chatId', count: { $sum: 1 } } },
      ]),
      User.find({ _id: { $in: [...new Set(chats.flatMap(c => c.members))] } }).lean(),
    ]);

    const lastMsgMap = {};
    lastMsgAgg.forEach(a => { const d = a.doc; d.id = d._id; lastMsgMap[a._id] = d; });
    const unreadMap = {};
    unreadAgg.forEach(a => { unreadMap[a._id] = a.count; });
    const userMap = {};
    users.forEach(u => { u.id = u._id; userMap[u._id] = u; });

    const result = chats.map(c => {
      c.id = c._id;
      const lastMsg = lastMsgMap[c._id] || null;
      const unread = unreadMap[c._id] || 0;

      let displayName = c.name;
      let displayAvatar = c.avatar;
      let displayAvatarColor = c.avatarColor;
      let onlineStatus = false;

      if (c.type === 'private') {
        const otherId = c.members.find(id => id !== uid);
        const other = userMap[otherId];
        if (other) {
          displayName = other.displayName;
          displayAvatar = (other.settings?.privShowAvatar !== false) ? other.avatar : null;
          displayAvatarColor = other.avatarColor;
          onlineStatus = (other.settings?.privShowOnline !== false) ? isOnline(otherId) : false;
        }
      }

      return {
        ...c,
        displayName,
        displayAvatar,
        displayAvatarColor,
        online: onlineStatus,
        lastMessage: lastMsg,
        unreadCount: unread,
        membersInfo: c.type === 'group'
          ? c.members.map(mid => {
              const u = userMap[mid];
              return u ? { id: u._id, displayName: u.displayName, avatar: u.avatar, avatarColor: u.avatarColor, online: isOnline(u._id) } : null;
            }).filter(Boolean)
          : []
      };
    }).sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt);
      const tb = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt);
      return tb - ta;
    });

    res.json(result);
  } catch (err) {
    console.error('Get chats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Create private chat ───────────────────────────────────────────────────
app.post('/api/chats', authMiddleware, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const existing = await Chat.findOne({
    type: 'private',
    members: { $all: [req.user.id, userId], $size: 2 }
  });
  if (existing) return res.json(existing.toJSON());

  const chat = await Chat.create({
    type: 'private',
    members: [req.user.id, userId],
    createdBy: req.user.id
  });

  [req.user.id, userId].forEach(uid => {
    const sset = onlineUsers.get(uid);
    if (sset) sset.forEach(sid => {
      io.to(sid).emit('chat_created', chat.toJSON());
      const s = io.sockets.sockets.get(sid);
      if (s) s.join(chat._id);
    });
  });

  res.json(chat.toJSON());
});

// ── Create group / channel chat ──────────────────────────────────────────
app.post('/api/chats/group', authMiddleware, async (req, res) => {
  const { name, memberIds, type, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const chatType = type === 'channel' ? 'channel' : 'group';
  const allMembers = [...new Set([req.user.id, ...(memberIds || [])])];
  const chat = await Chat.create({
    type: chatType,
    members: allMembers,
    name: name.trim(),
    description: description || '',
    avatarColor: `hsl(${Math.floor(Math.random() * 360)},65%,55%)`,
    createdBy: req.user.id,
    admins: [req.user.id]
  });

  allMembers.forEach(uid => {
    const sset = onlineUsers.get(uid);
    if (sset) sset.forEach(sid => {
      io.to(sid).emit('chat_created', chat.toJSON());
      const s = io.sockets.sockets.get(sid);
      if (s) s.join(chat._id);
    });
  });

  res.json(chat.toJSON());
});

// ── Update chat ───────────────────────────────────────────────────────────
app.put('/api/chats/:id', authMiddleware, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (!chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const { name, pinned, muted, archived, pinnedMessage, description } = req.body;
  if (name         !== undefined) chat.name         = name.trim();
  if (description  !== undefined) chat.description  = description;
  if (pinned       !== undefined) chat.pinned       = pinned;
  if (muted        !== undefined) chat.muted        = muted;
  if (archived     !== undefined) chat.archived     = archived;
  if ('pinnedMessage' in req.body) chat.pinnedMessage = pinnedMessage;
  await chat.save();

  chat.members.forEach(uid => {
    const sset = onlineUsers.get(uid);
    if (sset) sset.forEach(sid => io.to(sid).emit('chat_updated', chat.toJSON()));
  });

  res.json(chat.toJSON());
});

// ── Add members to group ──────────────────────────────────────────────────
app.post('/api/chats/:id/members', authMiddleware, async (req, res) => {
  const { userIds } = req.body;
  const chat = await Chat.findOne({ _id: req.params.id, type: 'group' });
  if (!chat) return res.status(404).json({ error: 'Group not found' });
  if (!chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const added = [];
  for (const uid of userIds) {
    if (!chat.members.includes(uid)) {
      chat.members.push(uid);
      added.push(uid);
    }
  }
  await chat.save();

  chat.members.forEach(uid => {
    const sset = onlineUsers.get(uid);
    if (sset) sset.forEach(sid => io.to(sid).emit('chat_updated', chat.toJSON()));
  });

  res.json({ added });
});

// ── Leave / delete chat ───────────────────────────────────────────────────
app.delete('/api/chats/:id', authMiddleware, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  if (!chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const members = [...chat.members];

  if (chat.type === 'group') {
    chat.members = chat.members.filter(m => m !== req.user.id);
    if (chat.members.length === 0) {
      await Chat.findByIdAndDelete(req.params.id);
    } else {
      await chat.save();
    }
  } else {
    await Chat.findByIdAndDelete(req.params.id);
  }

  members.forEach(uid => {
    const sset = onlineUsers.get(uid);
    if (sset) sset.forEach(sid => io.to(sid).emit('chat_deleted', { chatId: req.params.id }));
  });

  res.json({ ok: true });
});

// ── Get messages ──────────────────────────────────────────────────────────
app.get('/api/chats/:id/messages', authMiddleware, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const limit  = parseInt(req.query.limit) || 50;
  const before = req.query.before || null;

  let query = { chatId: req.params.id };
  if (before) {
    const beforeMsg = await Message.findById(before);
    if (beforeMsg) {
      query.timestamp = { $lt: beforeMsg.timestamp };
    }
  }

  const messages = await Message.find(query).sort({ timestamp: -1 }).limit(limit).lean();
  messages.reverse();
  messages.forEach(m => { m.id = m._id; delete m.__v; });

  // Mark as read
  const result = await Message.updateMany(
    { chatId: req.params.id, senderId: { $ne: req.user.id }, readBy: { $nin: [req.user.id] } },
    { $addToSet: { readBy: req.user.id } }
  );
  if (result.modifiedCount > 0) {
    io.to(req.params.id).emit('messages_read', { chatId: req.params.id, userId: req.user.id });
  }

  res.json(messages);
});

// ── Send message ──────────────────────────────────────────────────────────
app.post('/api/chats/:id/messages', authMiddleware, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const { text, type, replyTo, forwardFrom } = req.body;
  if (!text && type !== 'file') return res.status(400).json({ error: 'Empty message' });

  const sender = await User.findById(req.user.id);

  const msg = await Message.create({
    chatId:       req.params.id,
    senderId:     req.user.id,
    senderName:   sender ? sender.displayName : '',
    senderAvatar: sender ? sender.avatar : null,
    senderAvatarColor: sender ? sender.avatarColor : null,
    type:         type || 'text',
    text:         text || '',
    replyTo:      replyTo || null,
    forwardFrom:  forwardFrom || null,
    readBy:       [req.user.id]
  });

  // Отправляем через сокет ТОЛЬКО другим участникам (не отправителю)
  const senderSockets = onlineUsers.get(req.user.id);
  if (senderSockets) {
    // broadcast to room except sender's sockets
    for (const sid of senderSockets) {
      io.sockets.sockets.get(sid)?.to(req.params.id).emit('new_message', msg.toJSON());
      break; // достаточно одного broadcast
    }
  } else {
    io.to(req.params.id).emit('new_message', msg.toJSON());
  }
  sendPushForMessage(msg, chat).catch(() => {});
  res.json(msg.toJSON());
});

// ── Upload file in chat ───────────────────────────────────────────────────
app.post('/api/chats/:id/upload', authMiddleware, (req, res, next) => {
  // Ensure uploads dir exists (Render ephemeral FS)
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'Ошибка загрузки файла: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Нет доступа к чату' });
    if (!req.file) return res.status(400).json({ error: 'Файл не прикреплён' });

    const sender = await User.findById(req.user.id);
    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');
    const isVoice = req.file.mimetype.startsWith('audio/') || (req.body.type === 'voice');
    let msgType = 'file';
    if (isVoice) msgType = 'voice';
    else if (isVideo) msgType = 'video';
    else if (isImage) msgType = 'image';

    const msgData = {
      chatId:       req.params.id,
      senderId:     req.user.id,
      senderName:   sender ? sender.displayName : '',
      senderAvatar: sender ? sender.avatar : null,
      senderAvatarColor: sender ? sender.avatarColor : null,
      type:         msgType,
      text:         '',
      fileName:     req.file.originalname,
      fileSize:     req.file.size,
      fileUrl:      `/uploads/${req.file.filename}`,
      fileMime:     req.file.mimetype,
      readBy:       [req.user.id]
    };
    if (req.body.duration) msgData.duration = parseFloat(req.body.duration);
    const msg = await Message.create(msgData);

    const senderSockets = onlineUsers.get(req.user.id);
    if (senderSockets) {
      for (const sid of senderSockets) {
        io.sockets.sockets.get(sid)?.to(req.params.id).emit('new_message', msg.toJSON());
        break;
      }
    } else {
      io.to(req.params.id).emit('new_message', msg.toJSON());
    }
    sendPushForMessage(msg, chat).catch(() => {});
    res.json(msg.toJSON());
  } catch (err) {
    console.error('Upload route error:', err);
    res.status(500).json({ error: 'Ошибка сервера при загрузке' });
  }
});

// ── Edit message ──────────────────────────────────────────────────────────
app.put('/api/messages/:id', authMiddleware, async (req, res) => {
  const { text } = req.body;
  const msg = await Message.findOneAndUpdate(
    { _id: req.params.id, senderId: req.user.id },
    { text, editedAt: new Date() },
    { new: true }
  );
  if (!msg) return res.status(404).json({ error: 'Not found' });

  io.to(msg.chatId).emit('message_edited', msg.toJSON());
  res.json(msg.toJSON());
});

// ── Delete message ────────────────────────────────────────────────────────
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  const msg = await Message.findOneAndDelete({ _id: req.params.id, senderId: req.user.id });
  if (!msg) return res.status(404).json({ error: 'Not found or forbidden' });

  io.to(msg.chatId).emit('message_deleted', { messageId: msg._id, chatId: msg.chatId });
  res.json({ ok: true });
});

// ── React to message ──────────────────────────────────────────────────────
app.post('/api/messages/:id/react', authMiddleware, async (req, res) => {
  const { emoji } = req.body;
  const msg = await Message.findById(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Not found' });

  if (!msg.reactions) msg.reactions = {};
  const r = msg.reactions;

  if (!r[emoji]) r[emoji] = [];
  const ui = r[emoji].indexOf(req.user.id);
  if (ui === -1) r[emoji].push(req.user.id);
  else           r[emoji].splice(ui, 1);
  if (r[emoji].length === 0) delete r[emoji];

  msg.markModified('reactions');
  await msg.save();

  io.to(msg.chatId).emit('message_reaction', { messageId: req.params.id, reactions: msg.reactions });
  res.json(msg.reactions);
});

// =============================================================================
// Socket.io
// =============================================================================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = { id: decoded.id, sid: decoded.sid || null };
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', async (socket) => {
  const userId = socket.user.id;
  await setUserOnline(userId, socket.id);

  // join all user's chat rooms (только _id)
  const chats = await Chat.find({ members: userId }).select('_id').lean();
  chats.forEach(c => socket.join(c._id));

  // ── Typing ──────────────────────────────────────────────────────────────
  socket.on('typing_start', ({ chatId }) => {
    socket.to(chatId).emit('user_typing', { userId, chatId });
  });
  socket.on('typing_stop', ({ chatId }) => {
    socket.to(chatId).emit('user_stopped_typing', { userId, chatId });
  });

  // ── Join new chat room ──────────────────────────────────────────────────
  socket.on('join_chat', ({ chatId }) => {
    socket.join(chatId);
  });

  // ── Mark read ───────────────────────────────────────────────────────────
  socket.on('mark_read', async ({ chatId }) => {
    const result = await Message.updateMany(
      { chatId, senderId: { $ne: userId }, readBy: { $nin: [userId] } },
      { $addToSet: { readBy: userId } }
    );
    if (result.modifiedCount > 0) {
      io.to(chatId).emit('messages_read', { chatId, userId });
    }
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────────────
  // --- Group call rooms ---
  // groupCallRooms: Map<chatId, Set<userId>>
  if (!global._groupCallRooms) global._groupCallRooms = new Map();
  const groupCallRooms = global._groupCallRooms;

  socket.on('call_offer', async ({ to, offer, callType, renegotiate }) => {
    const caller = await User.findById(userId);
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) {
      targetSockets.forEach(sid => {
        io.to(sid).emit(renegotiate ? 'call_renegotiate' : 'call_incoming', {
          from: userId,
          fromName: caller ? caller.displayName : '',
          fromAvatar: caller ? caller.avatar : null,
          fromAvatarColor: caller ? caller.avatarColor : null,
          offer,
          callType
        });
      });
    }
    // Send push notification for incoming call (user may have app closed)
    if (!renegotiate && vapidReady) {
      const callerName = caller ? caller.displayName : 'Кто-то';
      const callLabel = callType === 'video' ? '📹 Видеозвонок' : '📞 Звонок';
      sendPushToUser(to, {
        title: callerName,
        body: callLabel,
        icon: '/static/icons/icon-192.svg',
        tag: `call-${userId}`,
        type: 'call',
        url: '/'
      }).catch(() => {});
    }
  });

  socket.on('call_answer', ({ to, answer }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_answered', { from: userId, answer }));
  });

  // Мгновенный сигнал «принимаю» — останавливает гудки у звонящего до завершения WebRTC
  socket.on('call_accepting', ({ to }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_accepting', { from: userId }));
  });

  socket.on('call_ice', ({ to, candidate }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_ice', { from: userId, candidate }));
  });

  socket.on('call_reject', ({ to }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_rejected', { from: userId }));
  });

  socket.on('call_end', ({ to }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_ended', { from: userId }));
  });

  // Mic/cam status relay
  socket.on('call_status', ({ to, micMuted, camOff }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_status', { from: userId, micMuted, camOff }));
  });

  // --- Group call signaling ---
  socket.on('group_call_join', async ({ chatId }) => {
    if (!groupCallRooms.has(chatId)) groupCallRooms.set(chatId, new Set());
    const room = groupCallRooms.get(chatId);
    const existingMembers = [...room];
    room.add(userId);
    const caller = await User.findById(userId);
    const callerInfo = { id: userId, name: caller?.displayName || '', avatarColor: caller?.avatarColor || '#333' };
    // Уведомляем всех существующих участников о новом
    existingMembers.forEach(memberId => {
      const sockets = onlineUsers.get(memberId);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_user_joined', { chatId, user: callerInfo, existingMembers: [] }));
    });
    // Новому участнику — список всех кто уже в звонке
    const membersInfo = [];
    for (const mid of existingMembers) {
      const u = await User.findById(mid);
      membersInfo.push({ id: mid, name: u?.displayName || '', avatarColor: u?.avatarColor || '#333' });
    }
    socket.emit('group_call_joined', { chatId, members: membersInfo });
    // Обновляем список участников для всех
    const allInfo = [...membersInfo, callerInfo];
    room.forEach(mid => {
      const sockets = onlineUsers.get(mid);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_members', { chatId, members: allInfo }));
    });
  });

  socket.on('group_call_offer', ({ chatId, to, offer }) => {
    const sockets = onlineUsers.get(to);
    if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_offer', { chatId, from: userId, offer }));
  });

  socket.on('group_call_answer', ({ chatId, to, answer }) => {
    const sockets = onlineUsers.get(to);
    if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_answer', { chatId, from: userId, answer }));
  });

  socket.on('group_call_ice', ({ chatId, to, candidate }) => {
    const sockets = onlineUsers.get(to);
    if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_ice', { chatId, from: userId, candidate }));
  });

  socket.on('group_call_leave', ({ chatId }) => {
    const room = groupCallRooms.get(chatId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        groupCallRooms.delete(chatId);
      } else {
        room.forEach(mid => {
          const sockets = onlineUsers.get(mid);
          if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_user_left', { chatId, userId }));
        });
      }
    }
  });

  socket.on('group_call_toggle_mic', ({ chatId, muted }) => {
    const room = groupCallRooms.get(chatId);
    if (room) {
      room.forEach(mid => {
        if (mid !== userId) {
          const sockets = onlineUsers.get(mid);
          if (sockets) sockets.forEach(sid => io.to(sid).emit('group_call_mic_status', { chatId, userId, muted }));
        }
      });
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    setUserOffline(userId, socket.id);
  });
});

// =============================================================================
// Connect to MongoDB & Start Server
// =============================================================================
// Поддержка .env файла (без зависимости dotenv)
try { const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  envFile.split('\n').forEach(line => { const m = line.match(/^([A-Z_]+)\s*=\s*(.+)/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g,''); });
} catch {}
// Перечитываем MONGO_URI после .env
const FINAL_MONGO = process.env.MONGODB_URI || MONGO_URI;

const isLocal = FINAL_MONGO.includes('localhost') || FINAL_MONGO.includes('127.0.0.1');
console.log('  ⏳  Подключение к MongoDB...');
console.log('  URI:', FINAL_MONGO.replace(/\/\/.*@/, '//***:***@'));
console.log(`  Режим: ${isLocal ? '💻 Локальная БД (без ограничений)' : '☁️  Облачная БД'}`);

mongoose.connect(FINAL_MONGO, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
})
  .then(async () => {
    console.log('  ✅  MongoDB подключена');
    // Сброс online-статуса всех пользователей при старте сервера
    await User.updateMany({}, { online: false });
    console.log('  🔄  Онлайн-статусы сброшены');
    await initVapid();
    srv.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '═'.repeat(55));
      console.log('  🌑  Shadow Mess v2.0 — запущен!');
      console.log('═'.repeat(55));
      console.log(`  Порт:           ${PORT}`);
      console.log(`  MongoDB:        подключена`);
      console.log(`  VAPID:          ${vapidReady ? 'OK' : '❌'}`);
      console.log('═'.repeat(55) + '\n');
    });
  })
  .catch(err => {
    console.error('  ❌  Ошибка подключения к MongoDB:', err.message);
    console.error('  Проверь:');
    console.error('    1. MONGODB_URI правильный');
    console.error('    2. Network Access → Allow Access from Anywhere (0.0.0.0/0)');
    console.error('    3. Логин/пароль для БД верные');
    process.exit(1);
  });
