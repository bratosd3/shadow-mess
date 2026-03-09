const { app, BrowserWindow, Menu, Tray, nativeImage, shell, Notification, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const SERVER_URL = 'https://shadow-mess.onrender.com';
let mainWindow = null;
let tray = null;
let isQuitting = false;

const ICON_PNG = path.join(__dirname, '..', '..', 'static', 'icons', 'icon-512.png');

/* ───────── Prevent multiple instances ───────── */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/* ───────── Window ───────── */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 400,
    minHeight: 600,
    title: 'Shadow Messenger',
    icon: ICON_PNG,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0c0c1d',
    show: false,
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  /* Grant media permissions for WebRTC calls & screen share */
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    const allowed = ['media', 'mediaKeySystem', 'notifications', 'fullscreen', 'display-capture'];
    cb(allowed.includes(permission));
  });

  /* Enable getDisplayMedia() — Electron requires explicit handler */
  const { desktopCapturer } = require('electron');
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    if (sources.length > 0) {
      callback({ video: sources[0] });
    } else {
      callback({});
    }
  });

  /* Open external links in default browser */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  /* Download handling */
  mainWindow.webContents.session.on('will-download', (_e, item) => {
    item.once('done', (_ev, state) => {
      if (state === 'completed' && mainWindow) {
        mainWindow.webContents.send('download-complete', item.getFilename());
      }
    });
  });

  /* Minimize to tray instead of closing */
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

/* ───────── Tray ───────── */
function createTray() {
  const icon = nativeImage.createFromPath(ICON_PNG).resize({ width: 24, height: 24 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть Shadow Messenger', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Перезагрузить', click: () => mainWindow && mainWindow.reload() },
    { label: 'Очистить кеш и перезагрузить', click: async () => {
      if (mainWindow) {
        await session.defaultSession.clearCache();
        mainWindow.reload();
      }
    }},
    { label: 'Проверить обновления', click: () => checkForUpdates() },
    { type: 'separator' },
    { label: 'Выход', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Shadow Messenger');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

/* ───────── IPC handlers ───────── */
ipcMain.on('show-notification', (_e, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, icon: ICON_PNG });
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    n.show();
  }
});

ipcMain.on('set-badge', (_e, count) => {
  if (mainWindow) {
    if (count > 0) {
      mainWindow.setTitle(`Shadow Messenger (${count})`);
      if (tray) tray.setToolTip(`Shadow Messenger — ${count} новых`);
    } else {
      mainWindow.setTitle('Shadow Messenger');
      if (tray) tray.setToolTip('Shadow Messenger');
    }
    // Flash taskbar when not focused
    if (count > 0 && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
    }
  }
});

ipcMain.handle('get-version', () => app.getVersion());

/* ───────── Auto-update check ───────── */
function checkForUpdates() {
  const url = `${SERVER_URL}/api/desktop-version`;
  const get = url.startsWith('https') ? https.get : http.get;
  get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const info = JSON.parse(data);
        const current = app.getVersion();
        if (info.version && info.version !== current && _isNewer(info.version, current)) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Доступно обновление',
            message: `Доступна новая версия Shadow Messenger v${info.version}\nТекущая: v${current}`,
            buttons: ['Скачать', 'Позже'],
            defaultId: 0,
          }).then(({ response }) => {
            if (response === 0 && info.downloadUrl) {
              shell.openExternal(info.downloadUrl);
            }
          });
        }
      } catch {}
    });
  }).on('error', () => {});
}

function _isNewer(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

/* ───────── App lifecycle ───────── */
app.whenReady().then(async () => {
  // Clear all caches including Service Worker to ensure latest web content
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] });
  createWindow();
  createTray();
  // Check for updates after a short delay
  setTimeout(checkForUpdates, 5000);
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
