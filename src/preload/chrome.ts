import { contextBridge, ipcRenderer } from "electron";
import type { BowvaneApi } from "../shared/ipc";

const api: BowvaneApi = {
  send: (c) => ipcRenderer.send("cmd", c),
  onSnapshot: (cb) => void ipcRenderer.on("snapshot", (_e, s) => cb(s)),
  onLittle: (cb) => void ipcRenderer.on("little", (_e, s) => cb(s)),
  onCommandResults: (cb) => void ipcRenderer.on("commandResults", (_e, r) => cb(r)),
  onFindResult: (cb) => void ipcRenderer.on("findResult", (_e, r) => cb(r)),
  panelData: () => ipcRenderer.invoke("panelData"),
};

contextBridge.exposeInMainWorld("bowvane", api);
contextBridge.exposeInMainWorld("bowvaneRename", (cb: (id: string) => void) => ipcRenderer.on("rename", (_e, id: string) => cb(id)));
