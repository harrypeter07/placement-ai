import dns from "node:dns";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

function applySrvDnsFix() {
  if (!MONGODB_URI?.startsWith("mongodb+srv://")) return;
  const extra = (process.env.MONGODB_DNS_SERVERS ?? "8.8.8.8,1.1.1.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  dns.setServers([...new Set([...extra, ...dns.getServers()])]);
}

applySrvDnsFix();

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

async function tryConnect(): Promise<typeof mongoose> {
  applySrvDnsFix();
  const dbName = process.env.MONGODB_DB_NAME || "placemint";
  return mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
    dbName,
    serverSelectionTimeoutMS: 20000,
    maxPoolSize: 10,
  });
}

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("Please define MONGODB_URI environment variable");
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (cached.conn && mongoose.connection.readyState !== 1) {
    cached.conn = null;
    cached.promise = null;
    await mongoose.disconnect().catch(() => undefined);
  }

  if (!cached.promise) {
    const maxAttempts = 3;
    cached.promise = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await tryConnect();
        } catch (err) {
          lastError = err;
          cached.conn = null;
          await mongoose.disconnect().catch(() => undefined);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
      }
      throw lastError;
    })();
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.conn = null;
    cached.promise = null;
    throw err;
  }
}
