// Entity factory functions
import * as THREE from 'three';
import { 
  MeshComponent, 
  PhysicsComponent, 
  TargetComponent, 
  ProjectileComponent,
  PlayerComponent 
} from './components.js';

export function createTargetTexture(isMoving) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  const centerX = size / 2;
  const centerY = size / 2;
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  
  const rings = [
    { radius: 1.0, color: isMoving ? '#ff4444' : '#ff0000' },
    { radius: 0.85, color: '#ffffff' },
    { radius: 0.65, color: isMoving ? '#ff6666' : '#ff3333' },
    { radius: 0.50, color: '#ffffff' },
    { radius: 0.35, color: isMoving ? '#ff8888' : '#ff6666' },
    { radius: 0.20, color: '#ffffff' },
    { radius: 0.08, color: isMoving ? '#ffff00' : '#ffcc00' }
  ];
  
  rings.forEach(ring => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.radius * (size / 2), 0, Math.PI * 2);
    ctx.fillStyle = ring.color;
    ctx.fill();
  });
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 20, centerY);
  ctx.lineTo(centerX + 20, centerY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - 20);
  ctx.lineTo(centerX, centerY + 20);
  ctx.stroke();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  return texture;
}

export function createTargetEntity(world, scene, physicsWorld, AmmoLib, camera, isMoving = Math.random() > 0.5) {
  const size = 2;
  const geometry = new THREE.CircleGeometry(size, 32);
  const targetTexture = createTargetTexture(isMoving);
  
  const material = new THREE.MeshStandardMaterial({
    map: targetTexture,
    emissive: isMoving ? 0x330000 : 0x000000,
    emissiveIntensity: isMoving ? 0.2 : 0,
    roughness: 0.7,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  
  // Random position at least 20 units from player
  let x, y, z, distance;
  const minDistance = 20;
  
  do {
    x = (Math.random() - 0.5) * 80;
    y = 2 + Math.random() * 15;
    z = (Math.random() - 0.5) * 80;
    
    distance = Math.sqrt(
      Math.pow(x - camera.position.x, 2) +
      Math.pow(y - camera.position.y, 2) +
      Math.pow(z - camera.position.z, 2)
    );
  } while (distance < minDistance);
  
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Physics body
  const shape = new AmmoLib.btSphereShape(size);
  const transform = new AmmoLib.btTransform();
  transform.setIdentity();
  transform.setOrigin(new AmmoLib.btVector3(x, y, z));

  const mass = isMoving ? 1 : 0;
  const localInertia = new AmmoLib.btVector3(0, 0, 0);
  
  if (mass > 0) {
    shape.calculateLocalInertia(mass, localInertia);
  }

  const motionState = new AmmoLib.btDefaultMotionState(transform);
  const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
  const body = new AmmoLib.btRigidBody(rbInfo);
  
  body.setRestitution(0.9);
  body.setFriction(0.5);
  
  if (isMoving) {
    const velocity = new AmmoLib.btVector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 10
    );
    body.setLinearVelocity(velocity);
    body.setAngularVelocity(new AmmoLib.btVector3(
      Math.random() * 2,
      Math.random() * 2,
      Math.random() * 2
    ));
  }

  physicsWorld.addRigidBody(body);

  // Create entity
  const entity = world.createEntity();
  entity.addComponent(new MeshComponent(mesh));
  entity.addComponent(new PhysicsComponent(body));
  entity.addComponent(new TargetComponent(isMoving, size));

  return entity;
}

export function createProjectileEntity(world, scene, physicsWorld, AmmoLib, camera) {
  const projectileSize = 0.3;
  const geometry = new THREE.SphereGeometry(projectileSize, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffff00,
    emissiveIntensity: 0.8
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(camera.position);
  scene.add(mesh);

  // Physics body
  const shape = new AmmoLib.btSphereShape(projectileSize);
  const transform = new AmmoLib.btTransform();
  transform.setIdentity();
  transform.setOrigin(new AmmoLib.btVector3(
    camera.position.x,
    camera.position.y,
    camera.position.z
  ));

  const mass = 0.5;
  const localInertia = new AmmoLib.btVector3(0, 0, 0);
  shape.calculateLocalInertia(mass, localInertia);

  const motionState = new AmmoLib.btDefaultMotionState(transform);
  const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
  const body = new AmmoLib.btRigidBody(rbInfo);
  
  // Calculate shooting direction
  const shootDirection = new THREE.Vector3(0, 0, -1);
  shootDirection.applyQuaternion(camera.quaternion);
  shootDirection.normalize();
  
  const shootSpeed = 80;
  const velocity = new AmmoLib.btVector3(
    shootDirection.x * shootSpeed,
    shootDirection.y * shootSpeed,
    shootDirection.z * shootSpeed
  );
  
  body.setLinearVelocity(velocity);
  body.setRestitution(0.8);
  
  physicsWorld.addRigidBody(body);

  // Create entity
  const entity = world.createEntity();
  entity.addComponent(new MeshComponent(mesh));
  entity.addComponent(new PhysicsComponent(body));
  entity.addComponent(new ProjectileComponent(Date.now()));

  return entity;
}

export function createPlayerEntity(world, camera) {
  const entity = world.createEntity();
  entity.addComponent(new PlayerComponent(camera));
  return entity;
}
