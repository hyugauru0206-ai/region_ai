const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  copyFor: (target, text) => ipcRenderer.invoke("bridge:copy_for", { target: String(target || ""), text: String(text || "") }),
  resolveTextFor: (target, text) => ipcRenderer.invoke("bridge:resolve_text", { target: String(target || ""), text: String(text || "") }),
  focus: (target) => ipcRenderer.invoke("bridge:focus", { target: String(target || "") }),
  pasteToChatGPT: () => ipcRenderer.invoke("bridge:paste_chatgpt"),
  sendToChatGPT: (text) => ipcRenderer.invoke("bridge:send_chatgpt", { text: String(text || "") }),
  captureLastAssistant: () => ipcRenderer.invoke("bridge:capture_last_assistant"),
  captureSelectionFromChatGPT: () => ipcRenderer.invoke("bridge:capture_selection"),
  setActiveRole: (role) => ipcRenderer.invoke("bridge:set_active_role", { role: String(role || "") }),
  getActiveRole: () => ipcRenderer.invoke("bridge:get_active_role"),
  setSelectedPayload: (payload) => ipcRenderer.invoke("bridge:set_selected_payload", payload && typeof payload === "object" ? payload : null),
  getSelectedPayload: () => ipcRenderer.invoke("bridge:get_selected_payload"),
  onSelectedPayload: (handler) => {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("bridge:selected_payload", listener);
    return () => ipcRenderer.removeListener("bridge:selected_payload", listener);
  },
  onActiveRoleChanged: (handler) => {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("bridge:active_role_changed", listener);
    return () => ipcRenderer.removeListener("bridge:active_role_changed", listener);
  },
});
