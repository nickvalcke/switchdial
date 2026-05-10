const { contextBridge, ipcRenderer } = require("electron");

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld("wheelAPI", {
  // Wheel runtime
  onOpened: (cb) => listen("wheel:opened", cb),
  onCursor: (cb) => listen("wheel:cursor", cb),
  onCommit: (cb) => listen("wheel:commit", cb),
  hide: () => ipcRenderer.send("wheel:hide"),
  launch: (appName) => ipcRenderer.send("wheel:launch", appName),
  getIcon: (appName) => ipcRenderer.invoke("wheel:get-icon", appName),

  // Config + settings UI
  getConfig: () => ipcRenderer.invoke("wheel:get-config"),
  setConfig: (config) => ipcRenderer.send("wheel:set-config", config),
  onConfigChanged: (cb) => listen("wheel:config-changed", cb),
  listApps: () => ipcRenderer.invoke("wheel:list-apps"),
});
