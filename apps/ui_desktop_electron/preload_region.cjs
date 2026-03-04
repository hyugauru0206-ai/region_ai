const { ipcRenderer } = require("electron");

window.addEventListener("message", (event) => {
  const data = event && event.data ? event.data : {};
  if (!data || typeof data !== "object") return;
  if (data.type === "regionai:selected") {
    const payload = data.payload && typeof data.payload === "object" ? data.payload : null;
    if (!payload) return;
    ipcRenderer.send("bridge:selected_payload", payload);
    return;
  }
  if (data.type === "regionai:focusRole") {
    const role = String(data.role || "").trim().toLowerCase();
    if (!role) return;
    ipcRenderer.send("bridge:focus_role", { role });
  }
});
