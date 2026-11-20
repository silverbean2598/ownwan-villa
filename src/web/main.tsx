import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installStore } from "./install/install";
import "./theme.css";

// 설치 이벤트(beforeinstallprompt)는 화면보다 먼저 올 수 있어서 가장 먼저 듣는다
installStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
