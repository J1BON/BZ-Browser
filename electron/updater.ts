import { app, ipcMain, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater';

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
}

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};

let getMainWindow: (() => BrowserWindow | null) | null = null;

function broadcast(): void {
  const win = getMainWindow?.();
  win?.webContents.send('update:status', state);
}

function setState(partial: Partial<UpdateState>): void {
  state = { ...state, ...partial };
  broadcast();
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;

  if (!app.isPackaged) {
    ipcMain.handle('update:check', () => ({ ...state, status: 'idle', error: 'Updates available only in installed app' }));
    ipcMain.handle('update:download', () => state);
    ipcMain.handle('update:install', () => state);
    ipcMain.handle('update:getState', () => state);
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const updateUrl = process.env.UPDATE_BASE_URL;
  if (updateUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
  }

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: undefined });
  });

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    setState({
      status: 'available',
      latestVersion: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available', latestVersion: undefined });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({ status: 'downloading', progress: progress.percent });
  });

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    setState({
      status: 'downloaded',
      latestVersion: info.version,
    });
  });

  autoUpdater.on('error', (err: Error) => {
    setState({ status: 'error', error: err.message });
  });

  ipcMain.handle('update:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return state;
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return state;
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
    return state;
  });

  ipcMain.handle('update:getState', () => state);

  // Background check 10s after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);
}

export function getUpdateState(): UpdateState {
  return state;
}
