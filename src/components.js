// Components for the ECS

export class MeshComponent {
  constructor(mesh) {
    this.mesh = mesh;
    this.entity = null;
  }
}

export class PhysicsComponent {
  constructor(body, rigidBodyInfo = null) {
    this.body = body;
    this.rigidBodyInfo = rigidBodyInfo;
    this.entity = null;
  }
}

export class TargetComponent {
  constructor(isMoving, size = 2) {
    this.isMoving = isMoving;
    this.size = size;
    this.entity = null;
  }
}

export class ProjectileComponent {
  constructor(createdAt, damage = 1) {
    this.createdAt = createdAt;
    this.damage = damage;
    this.lifetime = 5000; // 5 seconds
    this.entity = null;
  }
}

export class PlayerComponent {
  constructor(camera) {
    this.camera = camera;
    this.entity = null;
  }
}

export class TransformComponent {
  constructor(position, rotation = null) {
    this.position = position;
    this.rotation = rotation;
    this.entity = null;
  }
}

export class GameTimerComponent {
  constructor(duration = 60) {
    this.duration = duration; // Total duration in seconds
    this.timeRemaining = duration;
    this.isActive = false;
    this.entity = null;
  }

  start() {
    this.isActive = true;
    this.timeRemaining = this.duration;
  }

  stop() {
    this.isActive = false;
  }

  reset() {
    this.timeRemaining = this.duration;
    this.isActive = false;
  }
}

export class GameStateComponent {
  constructor() {
    this.state = 'menu'; // 'menu', 'playing', 'gameover'
    this.entity = null;
  }
}
