import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles/globals.css";

// 自动注册 Service Worker，新版本可用时提示刷新
registerSW({
  onNeedRefresh() {
    if (confirm("有新版本可用，是否立即刷新？")) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.info("[PWA] 应用已缓存，可离线打开");
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
