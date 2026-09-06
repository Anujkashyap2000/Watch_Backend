export class Participant {
  constructor({ id, username, socketId, role = "participant", avatar = null }) {
    this.id = String(id);
    this.username = username || "Anonymous";
    this.socketId = socketId;
    this.role = role; // "host" | "moderator" | "participant"
    this.avatar = avatar || null;
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      role: this.role,
      avatar: this.avatar,
    };
  }
}