import { roomManager } from "../socket/handlers.json";

export function registerSocketHandlers(io, socket) {
  
  const getIdentity = (payload = {}) => {
    const id = socket.user?.id;
    if (!id) {
      throw new Error("Not authenticated: missing user id");
    }
    const username =
      payload.username || socket.user?.username || "Anonymous";
    const avatar = payload.avatar || socket.user?.avatar || null;
    return { id, username, avatar };
  };

  // ---------- CREATE / JOIN ----------
  socket.on("create_room", (payload = {}, callback) => {
    try {
      const identity = getIdentity(payload);

      const { room, host } = roomManager.createRoom(
        identity.username,
        socket.id,
        identity.id,
        identity.avatar
      );

      socket.join(room.id);
      socket.data = {
        roomId: room.id,
        userId: host.id,
        username: host.username,
      };

      callback?.({
        success: true,
        roomId: room.id,
        user: typeof host.toJSON === "function" ? host.toJSON() : host,
        participants: room.getParticipantsArray(),
        syncState: room.getSyncState(),
      });
    } catch (err) {
      console.error("[Socket create_room Error]:", err.message);
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on("join_room", (payload = {}, callback) => {
    try {
      const { roomId } = payload;
      if (!roomId) {
        return callback?.({ success: false, error: "Room ID is required" });
      }

      const identity = getIdentity(payload);

      const { room, participant } = roomManager.joinRoom(
        roomId,
        identity.username,
        socket.id,
        identity.id,
        identity.avatar
      );

      socket.join(roomId);
      socket.data = {
        roomId,
        userId: participant.id,
        username: participant.username,
      };

      socket.to(roomId).emit("user_joined", {
        user: typeof participant.toJSON === "function" ? participant.toJSON() : participant,
        participants: room.getParticipantsArray(),
      });

      callback?.({
        success: true,
        roomId,
        user: typeof participant.toJSON === "function" ? participant.toJSON() : participant,
        participants: room.getParticipantsArray(),
        syncState: room.getSyncState(),
      });
    } catch (err) {
      console.error("[Socket join_room Error]:", err.message);
      callback?.({ success: false, error: err.message });
    }
  });

  // ---------- PLAYBACK PERMISSION CHECKER ----------
  const requireControl = () => {
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;

    if (!roomId || !userId) {
      throw new Error("Not joined to a room on this connection");
    }

    const room = roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");

    if (!room.canControl(userId)) {
      throw new Error("Only Host or Moderator can control playback");
    }

    return room;
  };

  socket.on("play", () => {
    try {
      const room = requireControl();
      room.updateVideoState({ playState: "playing" });
      io.to(room.id).emit("sync_state", room.getSyncState());
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("pause", () => {
    try {
      const room = requireControl();
      room.updateVideoState({ playState: "paused" });
      io.to(room.id).emit("sync_state", room.getSyncState());
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("seek", (payload = {}) => {
    try {
      const room = requireControl();
      const time = typeof payload === "object" ? payload.time : 0;
      room.updateVideoState({ currentTime: time });
      io.to(room.id).emit("sync_state", room.getSyncState());
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  const isValidVideoId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id);

socket.on("change_video", (payload = {}) => {
  try {
    const room = requireControl();

    if (!isValidVideoId(payload.videoId)) {
      throw new Error("Invalid or missing YouTube video ID");
    }

    room.updateVideoState({
      videoId: payload.videoId,
      playState: "paused",
      currentTime: 0,
    });
    io.to(room.id).emit("sync_state", room.getSyncState());
  } catch (err) {
    socket.emit("error", { message: err.message });
  }
});

  // ---------- ROLES ----------
  socket.on("assign_role", (payload = {}, callback) => {
    try {
      const roomId = socket.data?.roomId;
      const requesterId = socket.data?.userId;
      const { userId, role } = payload;

      if (!roomId || !requesterId) {
        throw new Error("Not joined to a room on this connection");
      }

      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error("Room not found");

      const participants = room.assignRole(userId, role, requesterId);
      io.to(roomId).emit("role_assigned", {
        userId,
        role,
        participants,
        hostId: room.hostId,
      });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("remove_participant", (payload = {}, callback) => {
    try {
      const roomId = socket.data?.roomId;
      const requesterId = socket.data?.userId;
      const { userId } = payload;

      if (!roomId || !requesterId) {
        throw new Error("Not joined to a room on this connection");
      }

      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error("Room not found");

      const participants = room.removeUser(userId, requesterId);
      io.to(roomId).emit("participant_removed", { userId, participants });

      const target = [...io.sockets.sockets.values()].find(
        (s) => s.data?.userId === userId
      );
      if (target) {
        target.emit("kicked");
        target.leave(roomId);
      }

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ---------- LEAVE / DISCONNECT ----------
  const handleLeave = () => {
    const roomId = socket.data?.roomId;
    if (!roomId) return;

    const result = roomManager.leaveRoom(roomId, socket.id);
    if (!result) return;

    if (!result.roomDeleted) {
      io.to(roomId).emit("user_left", {
        userId: result.leftUser?.id,
        username: result.leftUser?.username,
        participants: result.participants,
        newHostId: result.newHostId,
      });
    }
  };

  socket.on("leave_room", handleLeave);
  socket.on("disconnect", handleLeave);
}