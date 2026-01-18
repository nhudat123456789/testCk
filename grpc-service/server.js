import path from 'path';
import { fileURLToPath } from 'url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.GRPC_PORT || 50051);

// DB env (same as hub)
const DB_HOST = process.env.DB_HOST || 'mysql';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || 'password';
const DB_NAME = process.env.DB_NAME || 'chatbox_db';

const protoPath = path.join(__dirname, 'proto', 'netprog.proto');
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef);
const netprog = proto.netprog;

const db = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function roomStats(roomId) {
  const rid = Number(roomId);
  if (!rid || Number.isNaN(rid)) {
    return { room_id: String(roomId), message_count: '0', member_count: '0', last_message_at: '' };
  }

  const [[mc]] = await db.query('SELECT COUNT(*) AS c FROM messages WHERE room_id=?', [rid]);
  const [[mb]] = await db.query('SELECT COUNT(*) AS c FROM room_members WHERE room_id=?', [rid]);
  const [[lm]] = await db.query('SELECT created_at FROM messages WHERE room_id=? ORDER BY id DESC LIMIT 1', [rid]);

  return {
    room_id: String(rid),
    message_count: String(mc?.c || 0),
    member_count: String(mb?.c || 0),
    last_message_at: lm?.created_at ? String(lm.created_at) : '',
  };
}

const impl = {
  Ping: (call, cb) => {
    const msg = String(call.request?.message || '').trim();
    cb(null, {
      message: msg ? `PONG: ${msg}` : 'PONG',
      server_time_ms: String(Date.now()),
    });
  },

  RoomStats: async (call, cb) => {
    try {
      const rid = call.request?.room_id;
      const stats = await roomStats(rid);
      cb(null, stats);
    } catch (e) {
      cb({ code: grpc.status.INTERNAL, message: e?.message || 'RoomStats error' });
    }
  },
};

async function main() {
  // quick DB ping
  try {
    await db.query('SELECT 1');
    console.log('✅ gRPC service connected to MySQL');
  } catch (e) {
    console.warn('⚠️ gRPC service cannot connect to MySQL yet:', e?.message || e);
  }

  const server = new grpc.Server();
  server.addService(netprog.NetProgService.service, impl);

  const addr = `0.0.0.0:${PORT}`;
  server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) {
      console.error('❌ gRPC bind error:', err);
      process.exit(1);
    }
    server.start();
    console.log(`🚀 gRPC service running at ${addr}`);
  });
}

main();
