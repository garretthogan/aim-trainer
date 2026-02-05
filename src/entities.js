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
  // Slightly randomize size for moving targets
  const size = isMoving ? (1.7 + Math.random() * 0.6) : 2.0; // 1.7 to 2.3 for moving, 2.0 for stationary
  const geometry = new THREE.CircleGeometry(size, 32);
  const targetTexture = createTargetTexture(isMoving);
  
  // Create gradient map for cel shading
  const colors = new Uint8Array(4);
  colors[0] = 100;  // Dark
  colors[1] = 160;  // Medium-dark
  colors[2] = 220;  // Medium-light
  colors[3] = 255;  // Light
  
  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;
  
  const material = new THREE.MeshToonMaterial({
    map: targetTexture,
    gradientMap: gradientMap,
    emissive: 0xffffff, // White glow
    emissiveIntensity: 0.3,
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
  
  // Add outline for cel-shading effect using ring
  const outlineGeometry = new THREE.RingGeometry(size, size + 0.12, 32);
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide
  });
  const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
  outline.position.z = -0.001; // Slightly behind the target
  mesh.add(outline);
  
  scene.add(mesh);

  // Physics body - match the visual size
  const shape = new AmmoLib.btSphereShape(size);
  const transform = new AmmoLib.btTransform();
  transform.setIdentity();
  transform.setOrigin(new AmmoLib.btVector3(x, y, z));

  // Randomize mass for moving targets (affects fall speed)
  let mass = isMoving ? (0.5 + Math.random() * 2.0) : 0; // 0.5 to 2.5 for moving targets
  const localInertia = new AmmoLib.btVector3(0, 0, 0);
  
  if (mass > 0) {
    shape.calculateLocalInertia(mass, localInertia);
  }

  const motionState = new AmmoLib.btDefaultMotionState(transform);
  const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
  const body = new AmmoLib.btRigidBody(rbInfo);
  
  // Perfect elasticity - targets maintain bounce height forever
  const restitution = 1.0; // Perfect elastic collision
  body.setRestitution(restitution);
  body.setFriction(0.0); // Zero friction
  body.setRollingFriction(0.0); // Zero rolling friction
  
  // Disable damping so they don't lose energy over time
  body.setDamping(0.0, 0.0); // No linear or angular damping
  
  // Prevent deactivation (sleeping) so physics always runs
  body.setActivationState(4); // DISABLE_DEACTIVATION
  body.setSleepingThresholds(0.0, 0.0); // Never sleep
  
  // Ensure continuous collision detection for fast-moving objects
  body.setCcdMotionThreshold(0.1);
  body.setCcdSweptSphereRadius(size * 0.2);
  
  // Store physics properties for debugging/reference
  mesh.userData.mass = mass;
  mesh.userData.restitution = restitution;
  
  if (isMoving) {
    // All targets get UPWARD velocity to ensure they bounce
    // Different speeds = different bounce heights (maintained forever)
    const verticalSpeed = 8 + Math.random() * 12; // 8 to 20 (all positive = all rising)
    // v=8 bounces to ~1m height, v=20 bounces to ~6.7m height
    // Height = v² / (2 * gravity), gravity = 30
    
    // NO horizontal velocity - targets bounce straight up and down in place
    const velocity = new AmmoLib.btVector3(
      0, // No X movement
      verticalSpeed, // Only vertical movement
      0  // No Z movement
    );
    body.setLinearVelocity(velocity);
    
    // Add slow spin for visual interest - will maintain forever
    const spinSpeed = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    body.setAngularVelocity(new AmmoLib.btVector3(
      (Math.random() - 0.5) * spinSpeed,
      (Math.random() - 0.5) * spinSpeed,
      (Math.random() - 0.5) * spinSpeed
    ));
    
  }

  physicsWorld.addRigidBody(body);
  
  // Force activation immediately for moving targets
  if (isMoving) {
    body.activate(true);
    body.forceActivationState(4); // DISABLE_DEACTIVATION - ensure it stays active
  }

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
  
  // Create gradient map for cel shading
  const colors = new Uint8Array(3);
  colors[0] = 180;  // Dark
  colors[1] = 220;  // Medium
  colors[2] = 255;  // Light
  
  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;
  
  const material = new THREE.MeshToonMaterial({
    color: 0xffff00,
    gradientMap: gradientMap,
    emissive: 0xffff00,
    emissiveIntensity: 0.5
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(camera.position);
  
  // Add outline for cel-shading effect
  const outlineGeometry = new THREE.SphereGeometry(projectileSize + 0.08, 16, 16);
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide
  });
  const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
  mesh.add(outline);
  
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
