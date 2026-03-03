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

const app  = express();
const srv  = http.createServer(app);
const io   = new Server(srv, { cors: { origin: '*', credentials: true } });

const PORT        = process.env.PORT || 5000;
const JWT_SECRET  = process.env.JWT_SECRET || 'shadow_mess_jwt_secret_v2_2026';
const MONGO_URI   = process.env.MONGODB_URI || 'mongodb://localhost:27017/shadowmess';
const STATIC_DIR  = path.join(__dirname, 'static');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ── Directories ────────────────────────────────────────────────────────────
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// =============================================================================
// Mongoose Models
// =============================================================================

const userSchema = new mongoose.Schema({
  _id:           { type: String, default: uuidv4 },
  username:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName:   { type: String, required: true, trim: true },
  passwordHash:  { type: String, required: true },
  avatar:        { type: String, default: null },
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
    secE2E:           { type: Boolean, default: false },
    sec2FA:           { type: Boolean, default: false },
    language:         { type: String, default: 'ru' },
    accentColor:      { type: String, default: '' },
    bubbleStyle:      { type: String, default: 'rounded' },
    compactMode:      { type: Boolean, default: false },
    chatWallpaper:    { type: String, default: 'dots' },
    sendByEnter:      { type: Boolean, default: true },
  }
}, { _id: false });
userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; }
});
const User = mongoose.model('User', userSchema);

const sessionSchema = new mongoose.Schema({
  _id:       { type: String, default: uuidv4 },
  userId:    { type: String, required: true, index: true },
  device:    { type: String, default: 'Unknown' },
  ip:        { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
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
  name:           { type: String, default: null },
  description:    { type: String, default: '' },
  avatar:         { type: String, default: null },
  avatarColor:    { type: String, default: null },
  createdAt:      { type: Date, default: Date.now },
  createdBy:      { type: String, default: null },
  admins:         [{ type: String }],
  pinned:         { type: Boolean, default: false },
  muted:          { type: Boolean, default: false },
  archived:       { type: Boolean, default: false },
  pinnedMessage:  { type: String, default: null },
}, { _id: false });
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
  senderAvatar:     { type: String, default: null },
  senderAvatarColor:{ type: String, default: null },
  type:             { type: String, default: 'text' },
  text:             { type: String, default: '' },
  fileName:         { type: String, default: null },
  fileSize:         { type: Number, default: null },
  fileUrl:          { type: String, default: null },
  fileMime:         { type: String, default: null },
  timestamp:        { type: Date, default: Date.now },
  editedAt:         { type: Date, default: null },
  replyTo:          { type: String, default: null },
  forwardFrom:      { type: String, default: null },
  reactions:        { type: mongoose.Schema.Types.Mixed, default: {} },
  readBy:           [{ type: String }],
}, { _id: false });
messageSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; }
});
const Message = mongoose.model('Message', messageSchema);

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

// =============================================================================
// REST API
// =============================================================================

// ── Root ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

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
  const sessions = await Session.find({ userId: req.user.id, active: true });
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
  }).limit(20);

  const results = users.map(u => {
    const r = sanitizeUser(u);
    r.online = (u.settings?.privShowOnline !== false) ? isOnline(u._id) : false;
    if (u.settings?.privShowAvatar === false) r.avatar = null;
    return r;
  });
  res.json(results);
});

// ── Get user by id ────────────────────────────────────────────────────────
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const result = sanitizeUser(user);
  if (user.settings?.privShowOnline === false) result.online = false;
  else result.online = isOnline(user._id);
  if (user.settings?.privShowAvatar === false) result.avatar = null;
  if (user.settings?.privShowLastSeen === false) result.lastSeen = null;
  res.json(result);
});

// ── Get chats ─────────────────────────────────────────────────────────────
app.get('/api/chats', authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ members: req.user.id });
    const chatIds = chats.map(c => c._id);

    const allMessages = await Message.find({ chatId: { $in: chatIds } }).sort({ timestamp: 1 });
    const userIds = [...new Set(chats.flatMap(c => c.members))];
    const users = await User.find({ _id: { $in: userIds } });
    const userMap = {};
    users.forEach(u => { userMap[u._id] = u; });

    const msgByChat = {};
    allMessages.forEach(m => {
      if (!msgByChat[m.chatId]) msgByChat[m.chatId] = [];
      msgByChat[m.chatId].push(m);
    });

    const result = chats.map(c => {
      const chatMsgs = msgByChat[c._id] || [];
      const lastMsg = chatMsgs.length ? chatMsgs[chatMsgs.length - 1] : null;
      const unread = chatMsgs.filter(m => m.senderId !== req.user.id && !(m.readBy || []).includes(req.user.id)).length;

      let displayName = c.name;
      let displayAvatar = c.avatar;
      let displayAvatarColor = c.avatarColor;
      let onlineStatus = false;

      if (c.type === 'private') {
        const otherId = c.members.find(id => id !== req.user.id);
        const other = userMap[otherId];
        if (other) {
          displayName = other.displayName;
          displayAvatar = (other.settings?.privShowAvatar !== false) ? other.avatar : null;
          displayAvatarColor = other.avatarColor;
          onlineStatus = (other.settings?.privShowOnline !== false) ? isOnline(otherId) : false;
        }
      }

      return {
        ...c.toJSON(),
        displayName,
        displayAvatar,
        displayAvatarColor,
        online: onlineStatus,
        lastMessage: lastMsg ? lastMsg.toJSON() : null,
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

  const messages = await Message.find(query).sort({ timestamp: -1 }).limit(limit);
  messages.reverse();

  // Mark as read
  const result = await Message.updateMany(
    { chatId: req.params.id, senderId: { $ne: req.user.id }, readBy: { $nin: [req.user.id] } },
    { $addToSet: { readBy: req.user.id } }
  );
  if (result.modifiedCount > 0) {
    io.to(req.params.id).emit('messages_read', { chatId: req.params.id, userId: req.user.id });
  }

  res.json(messages.map(m => m.toJSON()));
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

  io.to(req.params.id).emit('new_message', msg.toJSON());
  res.json(msg.toJSON());
});

// ── Upload file in chat ───────────────────────────────────────────────────
app.post('/api/chats/:id/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.members.includes(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const sender = await User.findById(req.user.id);
  const isImage = req.file.mimetype.startsWith('image/');
  const isVoice = req.file.mimetype.startsWith('audio/') || (req.body.type === 'voice');

  const msg = await Message.create({
    chatId:       req.params.id,
    senderId:     req.user.id,
    senderName:   sender ? sender.displayName : '',
    senderAvatar: sender ? sender.avatar : null,
    senderAvatarColor: sender ? sender.avatarColor : null,
    type:         isVoice ? 'voice' : isImage ? 'image' : 'file',
    text:         '',
    fileName:     req.file.originalname,
    fileSize:     req.file.size,
    fileUrl:      `/uploads/${req.file.filename}`,
    fileMime:     req.file.mimetype,
    readBy:       [req.user.id]
  });

  io.to(req.params.id).emit('new_message', msg.toJSON());
  res.json(msg.toJSON());
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

  // join all user's chat rooms
  const chats = await Chat.find({ members: userId });
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
  socket.on('call_offer', async ({ to, offer, callType }) => {
    const caller = await User.findById(userId);
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) {
      targetSockets.forEach(sid => {
        io.to(sid).emit('call_incoming', {
          from: userId,
          fromName: caller ? caller.displayName : '',
          fromAvatar: caller ? caller.avatar : null,
          fromAvatarColor: caller ? caller.avatarColor : null,
          offer,
          callType
        });
      });
    }
  });

  socket.on('call_answer', ({ to, answer }) => {
    const targetSockets = onlineUsers.get(to);
    if (targetSockets) targetSockets.forEach(sid => io.to(sid).emit('call_answered', { from: userId, answer }));
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

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    setUserOffline(userId, socket.id);
  });
});

// =============================================================================
// Connect to MongoDB & Start Server
// =============================================================================
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('  ✅  MongoDB подключена');
    srv.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '═'.repeat(55));
      console.log('  🌑  Shadow Mess v2.0 — запущен!');
      console.log('═'.repeat(55));
      console.log(`  Порт:           ${PORT}`);
      console.log(`  MongoDB:        подключена`);
      console.log('═'.repeat(55) + '\n');
    });
  })
  .catch(err => {
    console.error('  ❌  Ошибка подключения к MongoDB:', err.message);
    process.exit(1);
  });
