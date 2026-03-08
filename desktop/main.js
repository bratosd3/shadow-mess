const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');

const SERVER_URL = 'https://shadow-mess.onrender.com';
let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 400,
    minHeight: 600,
    title: 'Shadow Messenger',
    icon: path.join(__dirname, '..', 'static', 'icons', 'icon-512.svg'),
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'static', 'icons', 'icon-512.svg');
  tray = new Tray(nativeImage.createEmpty());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть Shadow Messenger',
      click: () => mainWindow && mainWindow.show(),
    },
    { type: 'separator' },
    {
      label: 'Перезагрузить',
      click: () => mainWindow && mainWindow.reload(),
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Shadow Messenger');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow && mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
