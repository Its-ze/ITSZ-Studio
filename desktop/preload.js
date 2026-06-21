const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("itszUpdates", {
  getInfo: () => ipcRenderer.invoke("updates:get-info"),
  setAutoCheck: (autoCheck) => ipcRenderer.invoke("updates:set-auto-check", Boolean(autoCheck)),
  check: () => ipcRenderer.invoke("updates:check"),
  download: () => ipcRenderer.invoke("updates:download"),
  install: () => ipcRenderer.invoke("updates:install"),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  },
});

contextBridge.exposeInMainWorld("itszLibrary", {
  getInfo: () => ipcRenderer.invoke("library:get-info"),
  chooseHomeFolder: () => ipcRenderer.invoke("library:choose-home-folder"),
  openHomeFolder: () => ipcRenderer.invoke("library:open-home-folder"),
  loadHomeFolder: () => ipcRenderer.invoke("library:load-home-folder"),
  setDeleteOriginals: (deleteOriginals) => ipcRenderer.invoke("library:set-delete-originals", Boolean(deleteOriginals)),
  setAutoSort: (options) => ipcRenderer.invoke("library:set-auto-sort", {
    autoSortImports: Boolean(options?.autoSortImports),
    autoSortAsk: options?.autoSortAsk !== false,
  }),
  scanCameras: () => ipcRenderer.invoke("library:scan-cameras"),
  ignoreCamera: (deviceId) => ipcRenderer.invoke("library:ignore-camera", deviceId),
  importCamera: (options) => ipcRenderer.invoke("library:import-camera", {
    deviceId: options?.deviceId || "",
    deleteOriginals: Boolean(options?.deleteOriginals),
    autoSortApproved: Boolean(options?.autoSortApproved),
  }),
  onCameraDetected: (callback) => {
    const listener = (_event, camera) => callback(camera);
    ipcRenderer.on("library:camera-detected", listener);
    return () => ipcRenderer.removeListener("library:camera-detected", listener);
  },
});
