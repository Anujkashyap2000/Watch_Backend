export class Room {
  constructor(id, host) {
    this.id = String(id);
    this.hostId = String(host.id);
    this.participants = new Map();
    this.videoId = null;
    this.playState = "paused";
    this.currentTime = 0;
    this.lastUpdated = Date.now();

    this.addParticipant(host);
  }

  addParticipant(participant) {
    if (!participant || !participant.id) return;
    this.participants.set(String(participant.id), participant);
  }

  removeParticipant(userId) {
    this.participants.delete(String(userId));
  }

  getParticipant(userId) {
    return this.participants.get(String(userId));
  }

  getParticipantsArray() {
    return Array.from(this.participants.values()).map((p) =>
      typeof p.toJSON === "function" ? p.toJSON() : p
    );
  }

  isHost(userId) {
    return String(this.hostId) === String(userId);
  }

  canControl(userId) {
    const p = this.getParticipant(userId);
    return Boolean(p && (p.role === "host" || p.role === "moderator"));
  }

  assignRole(targetId, newRole, requesterId) {
    if (!this.isHost(requesterId)) {
      throw new Error("Only host can assign roles");
    }
    if (!["host", "moderator", "participant"].includes(newRole)) {
      throw new Error("Invalid role");
    }

    const target = this.getParticipant(targetId);
    if (!target) throw new Error("Participant not found");

    if (newRole === "host") {
      const oldHost = this.getParticipant(this.hostId);
      if (oldHost) oldHost.role = "participant";
      this.hostId = String(targetId);
    }

    target.role = newRole;
    return this.getParticipantsArray();
  }

  transferHost(newHostId, requesterId) {
    return this.assignRole(newHostId, "host", requesterId);
  }

  removeUser(targetId, requesterId) {
    if (!this.isHost(requesterId)) {
      throw new Error("Only host can remove participants");
    }
    if (String(targetId) === String(this.hostId)) {
      throw new Error("Cannot remove the host");
    }
    this.removeParticipant(targetId);
    return this.getParticipantsArray();
  }

  autoTransferHost() {
    const remaining = this.getParticipantsArray();
    if (remaining.length === 0) return null;

    const next = remaining.find((p) => p.role === "moderator") || remaining[0];

    const oldHost = this.getParticipant(this.hostId);
    if (oldHost) oldHost.role = "participant";

    this.hostId = String(next.id);
    const newHost = this.getParticipant(next.id);
    if (newHost) newHost.role = "host";

    return next.id;
  }

  updateVideoState({ playState, currentTime, videoId }) {
    if (playState !== undefined) this.playState = playState;
    if (currentTime !== undefined) this.currentTime = currentTime;
    if (videoId !== undefined) this.videoId = videoId;
    this.lastUpdated = Date.now();
  }

  getSyncState() {
    return {
      playState: this.playState,
      currentTime: this.currentTime,
      videoId: this.videoId,
      hostId: this.hostId,
    };
  }
}