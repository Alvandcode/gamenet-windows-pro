const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Gamenet Manager Pro',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true  // Set to false for production
        },
        show: false,
        backgroundColor: '#0f0c29'
    });

    mainWindow.loadFile('index.html');

    // Remove default menu (optional)
    // mainWindow.removeMenu();

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // mainWindow.maximize(); // Optional: start maximized
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
