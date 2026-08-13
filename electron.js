const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let nextProcess = null;

function checkServerReady(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else if (Date.now() - start > timeout) {
          reject(new Error('Server timeout'));
        } else {
          setTimeout(check, 500);
        }
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Server error/timeout'));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

async function createWindow() {
  const PORT = process.env.PORT || 3000;
  const serverUrl = `http://localhost:${PORT}`;

  let isReady = await checkServerReady(serverUrl, 1000).catch(() => false);

  if (!isReady) {
    const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');

    // Setting ELECTRON_RUN_AS_NODE=1 allows the packaged Electron executable to act as Node.js
    nextProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
      cwd: __dirname,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(PORT),
      },
      stdio: 'ignore',
    });

    nextProcess.on('error', (err) => {
      console.error('Failed to start Next.js server child process:', err);
    });

    await checkServerReady(serverUrl, 30000).catch((err) => {
      console.error('Failed to connect to Next.js server:', err);
    });
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Marvel Comics",
    icon: path.join(__dirname, 'public/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(serverUrl);
  win.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (nextProcess) {
    try {
      nextProcess.kill();
    } catch (e) {}
  }
  if (process.platform !== 'darwin') app.quit();
});
