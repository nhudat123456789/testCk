import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { createPoolFromEnv } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

const db = createPoolFromEnv();

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ---------- HTTP API ----------
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username/password" });

    const [rows] = await db.query("SELECT id FROM users WHERE username=?", [username]);
    if (rows.length) return res.status(409).json({ error: "Username exists" });

    const password_hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users(username, password_hash) VALUES(?,?)", [username, password_hash]);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username/password" });

    const [rows] = await db.query("SELECT id, password_hash FROM users WHERE username=?", [username]);
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ username });
    return res.json({ token, username });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------- Socket Auth ----------
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("NO_TOKEN"));
    const payload = verifyToken(token);
    socket.user = { username: payload.username };
    return next();
  } catch {
    return next(new Error("BAD_TOKEN"));
  }
});

// ---------- Socket Events ----------
io.on("connection", (socket) => {
  const username = socket.user.username;

  socket.on("join_room", async ({ room }) => {
    if (!room) return;
    socket.join(room);

    const [msgs] = await db.query(
      "SELECT room, sender, content, created_at FROM messages WHERE room=? ORDER BY id DESC LIMIT 20",
      [room]
    );

    socket.emit("history", msgs.reverse());
    io.to(room).emit("system", { room, message: `${username} joined` });
  });

  socket.on("send_message", async ({ room, content }) => {
    if (!room || !content) return;

    await db.query(
      "INSERT INTO messages(room, sender, content) VALUES(?,?,?)",
      [room, username, String(content)]
    );

    io.to(room).emit("message", {
      room,
      sender: username,
      content: String(content),
      at: new Date().toISOString(),
    });
  });
});

server.listen(PORT, () => {
  console.log(`✅ socketio-chat running at http://localhost:${PORT}`);
});
