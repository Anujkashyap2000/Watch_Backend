import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { registerSocketHandlers } from "./socket/handlers.js";
import { roomManager } from "./services/RoomManager.js";

app.get("/", (_, res) => res.json({ status: "Watch Party Server running" }));
app.get("/rooms", (_, res) => res.json(roomManager.getAllRooms()));

const server = createServer(app);

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Was silently allowing everything before — now actually enforced.
      // Flip back to `callback(null, true)` if you need permissive dev CORS.
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ---- Socket Authentication Middleware ----
io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    console.warn(`[Socket Auth] Rejected ${socket.id}: No token provided.`);
    return next(new Error("Authentication error: No token provided"));
  }

  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    console.error("[Socket Auth] ACCESS_TOKEN_SECRET is not set!");
    return next(new Error("Server configuration error"));
  }

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      console.warn(`[Socket Auth] Rejected ${socket.id}: Invalid/expired token.`);
      return next(new Error("Authentication error: Invalid token"));
    }

    // IMPORTANT: log this once and confirm which field your token actually
    // uses, then trim this list down to just that field. Leaving multiple
    // fallbacks in place is what caused the original bug — if none of these
    // match your real payload shape, socket.user.id silently becomes undefined.
    const resolvedId = decoded._id || decoded.id || decoded.$id || decoded.userId;

    if (!resolvedId) {
      console.error(
        "[Socket Auth] Could not resolve a user id from JWT payload:",
        decoded
      );
      return next(new Error("Authentication error: Malformed token payload"));
    }

    socket.user = {
      id: String(resolvedId),
      username: decoded.username || decoded.name || decoded.email || "Anonymous",
      ...decoded,
    };

    next();
  });
});

io.on("connection", (socket) => {
  console.log(`[Socket Connected] ${socket.id} | User: ${socket.user?.id}`);

  try {
    registerSocketHandlers(io, socket);
  } catch (err) {
    console.error(`[Socket Handler Registration Error] ${socket.id}:`, err);
    socket.emit("error", { message: "Internal server error" });
    socket.disconnect(true);
  }

  socket.on("disconnect", (reason) => {
    console.log(`[Socket Disconnected] ${socket.id} | Reason: ${reason}`);
  });
});

const PORT = process.env.PORT || 8080;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server is running at Port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed!:", error);
    process.exit(1);
  });