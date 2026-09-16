import { contextBridge, ipcRenderer } from 'electron'
import { createRealmFlowApi } from './preload-api'

contextBridge.exposeInMainWorld(
  'realmflow',
  createRealmFlowApi(ipcRenderer, process.platform)
)
