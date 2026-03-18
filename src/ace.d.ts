// src/ace.d.ts
import type { AceGuestAPI } from './services/bridge/aceGuestBridge';

declare global {
  interface Window {
    ACE: AceGuestAPI;
  }
}
