const {
    app,
    dialog,
    BrowserWindow,
    Menu,
    ipcMain,
    globalShortcut
} = require("electron");
const electronLocalshortcut = require("electron-localshortcut");
const path = require("path");
const fs = require("fs");
const pify = require("pify");
const debounce = require("debounce");
const fileUrl = require("file-url");
const argv = require("minimist")(process.argv.slice(2));

const readFile = pify(fs.readFile);

// Keep a global reference of the window object, if you don"t, the window will
// be closed automatically when the JavaScript object is garbage collected.
// let win
const windows = {};

ipcMain.on("editorReady", function (event, info) {
    const {
        windowID
    } = info;
    const {
        window,
        filePath
    } = windows[windowID];
    if (filePath) {
        readFile(filePath, "utf8")
            .then(contents => {
                window.webContents.send("setContents", {
                    filename: path.basename(filePath),
                    contents
                });
            });
    }
});

ipcMain.on("save", function (event, info) {
    const {
        contents,
        windowID
    } = info;
    const {
        filePath,
        window
    } = windows[windowID];
    if (filePath) {
        fs.writeFileSync(filePath, contents, "utf8");
        windows[windowID].dirty = false;
        window.webContents.send("setDirty", {
            dirty: false
        });
    } else {
        dialog.showSaveDialog(window, {
            title: "Save new markdown file"
        }, function (filename) {
            if (filename) {
                windows[windowID].filePath = filename;
                fs.writeFileSync(filename, contents, "utf8");
                windows[windowID].dirty = false;
                window.webContents.send("setDirty", {
                    dirty: false
                });
                window.webContents.send("setFilename", {
                    filename: path.basename(filename)
                });
            }
        });
    }
});

ipcMain.on("edit", function (event, info) {
    const {
        contents,
        windowID
    } = info;
    checkDirty(windowID, contents);
});

function checkDirty(windowID, contents) {
    const {
        dirty,
        filePath,
        window
    } = windows[windowID];
    if (filePath) {
        const dirtyCheck = windows[windowID].dirtyCheck || debounce(() => {
            readFile(filePath, "utf8").then(readContents => {
                const isNowDirty = (readContents !== contents);
                if (isNowDirty !== dirty) {
                    // update
                    windows[windowID].dirty = isNowDirty;
                    window.webContents.send("setDirty", {
                        dirty: isNowDirty
                    });
                }
            });
        }, 1000);
        dirtyCheck();
    }
}

function createWindow(filePath = null) {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 800,
        height: 600
    });
    setMenu();
    const winID = `win:${Math.random()}`;

    // and load the index.html of the app.
    const url = fileUrl(path.resolve(__dirname, "../renderer/index.html"));
    win.loadURL(`${url}?id=${winID}`);

    electronLocalshortcut.register(win, "CmdOrCtrl+S", () => {
        saveCurrent();
    });
    electronLocalshortcut.register(win, "CmdOrCtrl+N", () => {
        createWindow();
    });

    // Open the DevTools.
    win.webContents.openDevTools()

    // Emitted when the window is closed.
    win.on("closed", () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        // win = null
        delete windows[winID];
    });

    windows[winID] = {
        window: win,
        dirty: false,
        filePath: filePath ? path.resolve(process.cwd(), filePath) : null
    };
}

function saveCurrent() {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const windowKey = Object.keys(windows).find(key => windows[key].window === focusedWindow);
    if (windowKey) {
        focusedWindow.webContents.send("saveNow");
    }
}

function setMenu() {
    const menuTemplate = [{
        label: "File",
        submenu: [{
                label: "New",
                click: () => createWindow()
            },
            {
                label: "Save",
                click: saveCurrent
            }
        ]
    }];
    if (process.platform === "darwin") {
        menuTemplate.unshift({
            label: app.getName(),
            submenu: [{
                    role: "about"
                },
                {
                    role: "quit"
                }
            ]
        })
    }
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
    const filename = argv._[0] || null;
    createWindow(filename);
});

// Quit when all windows are closed.
app.on("window-all-closed", () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    // if (process.platform !== "darwin") {
    app.quit()
    // }
})

// app.on("activate", () => {
//   // On macOS it"s common to re-create a window in the app when the
//   // dock icon is clicked and there are no other windows open.
//   if (win === null) {
//     createWindow()
//   }
// })

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
