// Systems for the ECS
import { System } from './ecs.js';
import { 
  MeshComponent, 
  PhysicsComponent, 
  TargetComponent, 
  ProjectileComponent,
  PlayerComponent,
  GameTimerComponent,
  GameStateComponent,
  CapsuleMovementComponent
} from './components.js';
import * as THREE from 'three';

const _up = new THREE.Vector3(0, 1, 0);
const _toPlayer = new THREE.Vector3();
const _perpendicular = new THREE.Vector3();

export class PhysicsSystem extends System {
  constructor(physicsWorld, tmpTrans) {
    super();
    this.physicsWorld = physicsWorld;
    this.tmpTrans = tmpTrans;
  }

  update(deltaTime) {
    // Step physics simulation
    this.physicsWorld.stepSimulation(deltaTime, 10);

    // Update all entities with physics and mesh
    const entities = this.world.getEntitiesWith(PhysicsComponent, MeshComponent);
    
    entities.forEach(entity => {
      const physics = entity.getComponent(PhysicsComponent);
      const mesh = entity.getComponent(MeshComponent);
      
      const ms = physics.body.getMotionState();
      if (ms) {
        ms.getWorldTransform(this.tmpTrans);
        const p = this.tmpTrans.getOrigin();
        const q = this.tmpTrans.getRotation();
        mesh.mesh.position.set(p.x(), p.y(), p.z());
        mesh.mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
      }
    });
  }
}

export class TargetRotationSystem extends System {
  constructor(camera) {
    super();
    this.camera = camera;
  }

  update(deltaTime) {
    // Make flat targets face the camera (skip 3D capsule so it stays volumetric)
    const targets = this.world.getEntitiesWith(TargetComponent, MeshComponent);
    
    targets.forEach(entity => {
      const target = entity.getComponent(TargetComponent);
      if (target.isCapsule) return;
      const mesh = entity.getComponent(MeshComponent);
      mesh.mesh.lookAt(this.camera.position);
    });
  }
}

const MIN_CAPSULE_DISTANCE = 10;

export class CapsuleMovementSystem extends System {
  constructor(camera, isActive = () => true) {
    super();
    this.camera = camera;
    this.isActive = isActive;
  }

  update(deltaTime) {
    if (!this.isActive()) return;
    const dt = Math.min(deltaTime, 0.1);
    const capsules = this.world.getEntitiesWith(
      CapsuleMovementComponent,
      MeshComponent,
      TargetComponent
    );
    const cam = this.camera.position;
    capsules.forEach(entity => {
      const movement = entity.getComponent(CapsuleMovementComponent);
      const meshComp = entity.getComponent(MeshComponent);
      const root = meshComp.mesh;
      if (movement.stopped) return;
      const pos = root.position;
      _toPlayer.set(cam.x - pos.x, 0, cam.z - pos.z);
      const distance = _toPlayer.length();
      if (distance <= movement.minDistance) {
        movement.stopped = true;
        return;
      }
      _toPlayer.normalize();
      const step = movement.approachSpeed * dt;
      const bound = 44;
      let nx = Math.max(-bound, Math.min(bound, pos.x + _toPlayer.x * step));
      let nz = Math.max(-bound, Math.min(bound, pos.z + _toPlayer.z * step));
      for (let pass = 0; pass < 3; pass++) {
        capsules.forEach(other => {
          if (other === entity) return;
          const otherRoot = other.getComponent(MeshComponent).mesh;
          const ox = otherRoot.position.x, oz = otherRoot.position.z;
          const dx = nx - ox, dz = nz - oz;
          const distSq = dx * dx + dz * dz;
          if (distSq < MIN_CAPSULE_DISTANCE * MIN_CAPSULE_DISTANCE && distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const push = (MIN_CAPSULE_DISTANCE - dist) / dist;
            nx += dx * push;
            nz += dz * push;
          }
        });
      }
      root.position.x = Math.max(-bound, Math.min(bound, nx));
      root.position.y = movement.groundHeight;
      root.position.z = Math.max(-bound, Math.min(bound, nz));
    });
  }
}

export class CollisionSystem extends System {
  constructor(scene, physicsWorld, AmmoLib, camera, onHit) {
    super();
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.AmmoLib = AmmoLib;
    this.camera = camera;
    this.onHit = onHit;
  }

  update(deltaTime) {
    const projectiles = this.world.getEntitiesWith(ProjectileComponent, MeshComponent);
    const targets = this.world.getEntitiesWith(TargetComponent, MeshComponent);

    projectiles.forEach(projectileEntity => {
      const projectileMesh = projectileEntity.getComponent(MeshComponent);
      const projectileComp = projectileEntity.getComponent(ProjectileComponent);
      
      targets.forEach(targetEntity => {
        const targetMesh = targetEntity.getComponent(MeshComponent);
        const targetComp = targetEntity.getComponent(TargetComponent);
        
        const collisionDistance = projectileMesh.mesh.position.distanceTo(targetMesh.mesh.position);
        
        if (collisionDistance < targetComp.size + 0.5) {
          // Hit detected!
          const normalizedDistance = Math.min(collisionDistance / targetComp.size, 1.0);
          
          // Calculate distance from player to target for distance bonus
          const targetDistance = this.camera.position.distanceTo(targetMesh.mesh.position);
          
          // Notify hit callback with both accuracy and distance
          this.onHit(targetEntity, projectileEntity, normalizedDistance, targetDistance);
          
          // Mark entities for removal
          this.removeEntity(projectileEntity);
          this.removeEntity(targetEntity);
        }
      });
    });
  }

  removeEntity(entity) {
    // Remove mesh from its parent (scene or gameContentGroup)
    const meshComp = entity.getComponent(MeshComponent);
    if (meshComp?.mesh?.parent) {
      meshComp.mesh.parent.remove(meshComp.mesh);
    }

    // Remove physics body if present (capsules have no physics)
    const physicsComp = entity.getComponent(PhysicsComponent);
    if (physicsComp) {
      this.physicsWorld.removeRigidBody(physicsComp.body);
    }

    // Remove from world
    this.world.removeEntity(entity);
  }
}

export class ProjectileCleanupSystem extends System {
  constructor(scene, physicsWorld) {
    super();
    this.scene = scene;
    this.physicsWorld = physicsWorld;
  }

  update(deltaTime) {
    const projectiles = this.world.getEntitiesWith(ProjectileComponent, MeshComponent);
    const now = Date.now();

    projectiles.forEach(entity => {
      const projectile = entity.getComponent(ProjectileComponent);
      
      if (now - projectile.createdAt > projectile.lifetime) {
        // Remove old projectile from its parent (scene or gameContentGroup)
        const meshComp = entity.getComponent(MeshComponent);
        if (meshComp?.mesh?.parent) {
          meshComp.mesh.parent.remove(meshComp.mesh);
        }

        const physicsComp = entity.getComponent(PhysicsComponent);
        if (physicsComp) {
          this.physicsWorld.removeRigidBody(physicsComp.body);
        }

        this.world.removeEntity(entity);
      }
    });
  }
}

export class TargetBoundsSystem extends System {
  constructor(AmmoLib) {
    super();
    this.AmmoLib = AmmoLib;
  }

  update(deltaTime) {
    const targets = this.world.getEntitiesWith(TargetComponent, MeshComponent, PhysicsComponent);

    targets.forEach(entity => {
      const target = entity.getComponent(TargetComponent);
      const mesh = entity.getComponent(MeshComponent);
      const physics = entity.getComponent(PhysicsComponent);

      if (target.isMoving) {
        const pos = mesh.mesh.position;
        
        // Keep within bounds
        if (Math.abs(pos.x) > 45 || Math.abs(pos.z) > 45 || pos.y < 2 || pos.y > 20) {
          const body = physics.body;
          const vel = body.getLinearVelocity();
          body.setLinearVelocity(
            new this.AmmoLib.btVector3(-vel.x() * 0.8, -vel.y() * 0.8, -vel.z() * 0.8)
          );
        }
      }
    });
  }
}

export class TimerSystem extends System {
  constructor(onTimeUp, getIsPaused = () => false) {
    super();
    this.onTimeUp = onTimeUp;
    this.getIsPaused = getIsPaused;
  }

  update(deltaTime) {
    if (this.getIsPaused && this.getIsPaused()) return;
    const timers = this.world.getEntitiesWith(GameTimerComponent);

    timers.forEach(entity => {
      const timer = entity.getComponent(GameTimerComponent);

      if (timer.isActive) {
        timer.timeRemaining -= deltaTime;

        // Update UI
        const timerElement = document.getElementById('timer');
        if (timerElement) {
          const seconds = Math.max(0, Math.ceil(timer.timeRemaining));
          timerElement.textContent = seconds;

          // Add warning class when time is low
          if (seconds <= 10) {
            timerElement.classList.add('warning');
          } else {
            timerElement.classList.remove('warning');
          }
        }

        if (timer.timeRemaining <= 0) {
          timer.stop();
          timer.pendingGameOver = true;
        }
      }

      if (timer.pendingGameOver) {
        const projectiles = this.world.getEntitiesWith(ProjectileComponent);
        if (projectiles.length === 0) {
          timer.pendingGameOver = false;
          if (this.onTimeUp) this.onTimeUp();
        }
      }
    });
  }
}
