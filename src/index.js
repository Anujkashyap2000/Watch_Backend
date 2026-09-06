import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import connectDB from "./db/index.js";
import { app } from "./app.js";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import { registerSocketHandlers } from "./socket/handlers.js";
import { roomManager } from "./Services/RoomManager.js";

// --------------------------------------------------
// Basic HTTP routes
// --------------------------------------------------

app.get("/", (_, res) => {
  res.json({
    status: "Watch Party Server running",
  });
});

app.get("/rooms", (_, res) => {
  res.json(roomManager.getAllRooms());
});

// --------------------------------------------------
// HTTP Server
// --------------------------------------------------

const server = createServer(app);

// --------------------------------------------------
// Socket.IO CORS
// --------------------------------------------------

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Requests without an Origin header
      // are allowed (Postman, server-to-server, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(
        `[Socket CORS] Blocked origin: ${origin}`
      );

      return callback(
        new Error("Not allowed by Socket.IO CORS")
      );
    },

    methods: ["GET", "POST"],

    credentials: true,
  },
});

// --------------------------------------------------
// Socket Authentication Middleware
// --------------------------------------------------

io.use((socket, next) => {
  try {
    /*
     * The frontend should send:
     *
     * io(SOCKET_URL, {
     *   auth: {
     *     token: accessToken
     *   }
     * })
     */

    let token = socket.handshake.auth?.token;

    // Optional fallback for Authorization header
    if (!token) {
      const authorization =
        socket.handshake.headers?.authorization;

      if (authorization) {
        token = authorization.replace(
          /^Bearer\s+/i,
          ""
        );
      }
    }

    // ----------------------------------------------
    // No token
    // ----------------------------------------------

    if (!token) {
      console.warn(
        `[Socket Auth] Rejected ${socket.id}: No token provided`
      );

      return next(
        new Error(
          "Authentication error: No token provided"
        )
      );
    }

    // ----------------------------------------------
    // JWT secret
    // ----------------------------------------------

    const secret =
      process.env.ACCESS_TOKEN_SECRET;

    if (!secret) {
      console.error(
        "[Socket Auth] ACCESS_TOKEN_SECRET is not set!"
      );

      return next(
        new Error(
          "Server configuration error"
        )
      );
    }

    // ----------------------------------------------
    // Verify JWT
    // ----------------------------------------------

    jwt.verify(
      token,
      secret,
      (err, decoded) => {
        if (err) {
          /*
           * IMPORTANT:
           * Do not hide the actual JWT error while debugging.
           *
           * Possible errors:
           *
           * TokenExpiredError
           * JsonWebTokenError
           * NotBeforeError
           */

          console.error(
            `[Socket Auth] JWT verification failed for ${socket.id}`
          );

          console.error(
            `[Socket Auth] Error name: ${err.name}`
          );

          console.error(
            `[Socket Auth] Error message: ${err.message}`
          );

          if (err.name === "TokenExpiredError") {
            return next(
              new Error(
                "Authentication error: Access token expired"
              )
            );
          }

          if (err.name === "JsonWebTokenError") {
            return next(
              new Error(
                "Authentication error: Invalid token signature or malformed token"
              )
            );
          }

          return next(
            new Error(
              "Authentication error: Invalid token"
            )
          );
        }

        // ------------------------------------------
        // Verify decoded payload
        // ------------------------------------------

        if (!decoded || typeof decoded !== "object") {
          console.error(
            "[Socket Auth] JWT decoded payload is invalid:",
            decoded
          );

          return next(
            new Error(
              "Authentication error: Malformed token payload"
            )
          );
        }

        /*
         * Your JWT may use any one of these IDs.
         *
         * Ideally, once you show me your JWT-generation
         * code, we can reduce this to exactly one field.
         */

        const resolvedId =
          decoded._id ||
          decoded.id ||
          decoded.$id ||
          decoded.userId;

        if (!resolvedId) {
          console.error(
            "[Socket Auth] Could not resolve user ID from JWT payload:",
            decoded
          );

          return next(
            new Error(
              "Authentication error: User ID missing from token"
            )
          );
        }

        // ------------------------------------------
        // Attach authenticated user to socket
        // ------------------------------------------

        socket.user = {
          ...decoded,

          id: String(resolvedId),

          username:
            decoded.username ||
            decoded.name ||
            decoded.email ||
            "Anonymous",

          avatar:
            decoded.avatar || null,
        };

        console.log(
          `[Socket Auth] Authenticated ${socket.id} | User: ${socket.user.id}`
        );

        next();
      }
    );
  } catch (error) {
    console.error(
      "[Socket Auth] Unexpected authentication error:",
      error
    );

    return next(
      new Error(
        "Authentication error: Server error"
      )
    );
  }
});

// --------------------------------------------------
// Socket Connection
// --------------------------------------------------

io.on("connection", (socket) => {
  console.log(
    `[Socket Connected] ${socket.id} | User: ${socket.user?.id}`
  );

  try {
    registerSocketHandlers(io, socket);
  } catch (err) {
    console.error(
      `[Socket Handler Registration Error] ${socket.id}:`,
      err
    );

    socket.emit("error", {
      message: "Internal server error",
    });

    socket.disconnect(true);

    return;
  }

  // ----------------------------------------------
  // Disconnect
  // ----------------------------------------------

  socket.on("disconnect", (reason) => {
    console.log(
      `[Socket Disconnected] ${socket.id} | Reason: ${reason}`
    );
  });
});

// --------------------------------------------------
// Start Server
// --------------------------------------------------

const PORT = process.env.PORT || 8080;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(
        `Server is running at Port: ${PORT}`
      );

      console.log(
        `[Socket] Allowed origins:`,
        allowedOrigins
      );

      console.log(
        `[Socket] JWT secret configured:`,
        Boolean(process.env.ACCESS_TOKEN_SECRET)
      );
    });
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed!:",
      error
    );

    process.exit(1);
  });
