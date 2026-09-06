import { v4 as uuidv4 } from "uuid";
import { Room } from "../models/Room.js";
import { Participant } from "../models/Participant.js";

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.cleanupTimeouts = new Map();
  }

  createRoom(username, socketId, persistentUserId = null, avatar = null) {
    const roomId = uuidv4().slice(0, 8);
    const resolvedUserId = persistentUserId || uuidv4();

    const host = new Participant({
      id: resolvedUserId,
      username: username || "Host",
      socketId,
      role: "host",
      avatar: avatar || null,
    });

    const room = new Room(roomId, host);
    this.rooms.set(roomId, room);
    return { room, host };
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, username, socketId, persistentUserId = null, avatar = null) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("Room not found");

    if (this.cleanupTimeouts.has(roomId)) {
      clearTimeout(this.cleanupTimeouts.get(roomId));
      this.cleanupTimeouts.delete(roomId);
      console.log(`[RoomManager] Deletion cancelled for room: ${roomId}`);
    }

    const resolvedUserId = persistentUserId || uuidv4();

    let participant =
      room.getParticipant(resolvedUserId) ||
      [...room.participants.values()].find((p) => p.username === username);

    if (participant) {
      participant.socketId = socketId;
      if (avatar) participant.avatar = avatar;
      if (username) participant.username = username;
    } else {
      const isFirstParticipant = room.participants.size === 0;

      participant = new Participant({
        id: resolvedUserId,
        username: username || "Guest",
        socketId,
        role: isFirstParticipant ? "host" : "participant",
        avatar: avatar || null,
      });

      room.addParticipant(participant);

      if (isFirstParticipant) {
        room.hostId = String(participant.id);
      }
    }

    return { room, participant };
  }

  leaveRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const participant = [...room.participants.values()].find(
      (p) => p.socketId === socketId
    );
    if (!participant) return null;

    const wasHost = room.isHost(participant.id);

    room.removeParticipant(participant.id);

    let newHostId = null;
    if (wasHost && room.participants.size > 0) {
      newHostId = room.autoTransferHost();
    }

    if (room.participants.size === 0) {
      if (this.cleanupTimeouts.has(roomId)) {
        clearTimeout(this.cleanupTimeouts.get(roomId));
      }

      console.log(`[RoomManager] Room ${roomId} is empty. Scheduling removal in 60s...`);
      const timer = setTimeout(() => {
        const currentRoom = this.rooms.get(roomId);
        if (currentRoom && currentRoom.participants.size === 0) {
          console.log(`[RoomManager] Grace period expired. Deleting room: ${roomId}`);
          this.rooms.delete(roomId);
        }
        this.cleanupTimeouts.delete(roomId);
      }, 60000);

      this.cleanupTimeouts.set(roomId, timer);
    }

    return {
      leftUser: participant,
      newHostId,
      participants: room.getParticipantsArray(),
      roomDeleted: false,
    };
  }

  getAllRooms() {
    return Array.from(this.rooms.entries()).map(([id, room]) => ({
      id,
      roomId: id,
      hostId: room.hostId,
      participantCount: room.participants ? room.participants.size : 0,
      videoId: room.videoId || room.syncState?.videoId || null,
    }));
  }
}

export const roomManager = new RoomManager();