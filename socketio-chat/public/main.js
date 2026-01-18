let token = null;
let socket = null;
let currentRoom = null;

const logEl = document.getElementById("log");
const log = (x) => (logEl.textContent += x + "\n");

async function post(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

document.getElementById("btnRegister").onclick = async () => {
  const username = document.getElementById("u").value.trim();
  const password = document.getElementById("p").value.trim();
  const r = await post("/api/register", { username, password });
  log(r.ok ? "✅ Registered" : "❌ Register failed: " + (r.data.error || ""));
};

document.getElementById("btnLogin").onclick = async () => {
  const username = document.getElementById("u").value.trim();
  const password = document.getElementById("p").value.trim();
  const r = await post("/api/login", { username, password });
  if (!r.ok) return log("❌ Login failed: " + (r.data.error || ""));
  token = r.data.token;
  log("✅ Logged in, token ready");

  socket = io({ auth: { token } });

  socket.on("connect", () => log("🔌 socket connected: " + socket.id));
  socket.on("connect_error", (e) => log("❌ socket error: " + e.message));
  socket.on("system", (m) => log("[SYSTEM] " + m.message));
  socket.on("history", (arr) => {
    log("---- HISTORY ----");
    arr.forEach((m) => log(`[${m.room}] ${m.sender}: ${m.content}`));
    log("-----------------");
  });
  socket.on("message", (m) => log(`[${m.room}] ${m.sender}: ${m.content}`));
};

document.getElementById("btnJoin").onclick = () => {
  if (!socket) return log("❌ Login trước");
  currentRoom = document.getElementById("room").value.trim();
  socket.emit("join_room", { room: currentRoom });
};

document.getElementById("btnSend").onclick = () => {
  if (!socket || !currentRoom) return log("❌ Join room trước");
  const content = document.getElementById("msg").value;
  socket.emit("send_message", { room: currentRoom, content });
  document.getElementById("msg").value = "";
};
