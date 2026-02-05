import './style.css'
import * as THREE from 'three'
import { World } from './ecs.js'
import { 
  PhysicsSystem, 
  TargetRotationSystem, 
  CollisionSystem, 
  ProjectileCleanupSystem,
  TargetBoundsSystem,
  TimerSystem
} from './systems.js'
import { 
  createTargetEntity, 
  createProjectileEntity, 
  createPlayerEntity 
} from './entities.js'
import { 
  TargetComponent, 
  MeshComponent, 
  GameTimerComponent,
  GameStateComponent,
  ProjectileComponent,
  PhysicsComponent
} from './components.js'

// Game state
let scene, camera, renderer;
let physicsWorld;
let tmpTrans;
let AmmoLib;
let world; // ECS World
let playerEntity;
let gameTimerEntity;
let gameStateEntity;

// Controls
let controls = {
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  PI_2: Math.PI / 2
};

// Game stats
let score = 0;
let hits = 0;
let shots = 0;
let gameStarted = false;

// Clock
const clock = new THREE.Clock();

// Load Ammo.js dynamically
async function loadAmmo() {
  const script = document.createElement('script');
  // Use Vite's base URL to ensure correct path for GitHub Pages
  script.src = import.meta.env.BASE_URL + 'ammo.js';
  
  return new Promise((resolve, reject) => {
    script.onload = () => {
      if (typeof Ammo === 'function') {
        Ammo().then(resolve).catch(reject);
      } else {
        setTimeout(() => {
          if (typeof Ammo === 'function') {
            Ammo().then(resolve).catch(reject);
          } else {
            reject(new Error('Ammo not loaded'));
          }
        }, 100);
      }
    };
    script.onerror = (error) => {
      console.error('Script load error:', error);
      reject(error);
    };
    document.head.appendChild(script);
  });
}

// Initialize Ammo.js and start the game
loadAmmo().then((Ammo) => {
  AmmoLib = Ammo;
  console.log('Ammo.js loaded successfully!');
  init();
  animate();
}).catch(error => {
  console.error('Failed to load Ammo.js:', error);
  document.getElementById('instructions').innerHTML = '<p>Failed to load physics engine</p><p>Please refresh the page</p>';
});

function init() {
  // Setup scene - solid color background for cel-shaded look
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue for cartoon style
  scene.fog = new THREE.Fog(0x87ceeb, 120, 300);

  // Setup camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 10);

  // Setup renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // Better for cel shading
  renderer.toneMappingExposure = 1.0;
  document.getElementById('game-container').appendChild(renderer.domElement);

  // Setup lights - much brighter
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  // Additional directional light from opposite side
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight2.position.set(-10, 15, -10);
  scene.add(directionalLight2);

  const pointLight1 = new THREE.PointLight(0x00ffff, 1.0, 80);
  pointLight1.position.set(-20, 10, -20);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xff00ff, 1.0, 80);
  pointLight2.position.set(20, 10, 20);
  scene.add(pointLight2);

  // Setup physics
  setupPhysicsWorld();

  // Create ECS World
  world = new World();

  // Add systems
  world.addSystem(new PhysicsSystem(physicsWorld, tmpTrans));
  world.addSystem(new TargetRotationSystem(camera));
  world.addSystem(new CollisionSystem(scene, physicsWorld, AmmoLib, camera, onTargetHit));
  world.addSystem(new ProjectileCleanupSystem(scene, physicsWorld));
  world.addSystem(new TargetBoundsSystem(AmmoLib));
  world.addSystem(new TimerSystem(onTimeUp));

  // Create game entities
  playerEntity = createPlayerEntity(world, camera);
  gameTimerEntity = world.createEntity();
  gameTimerEntity.addComponent(new GameTimerComponent(60));
  
  gameStateEntity = world.createEntity();
  gameStateEntity.addComponent(new GameStateComponent());

  // Create ground
  createGround();

  // Create walls
  createWalls();

  // Create initial targets
  for (let i = 0; i < 5; i++) {
    createTargetEntity(world, scene, physicsWorld, AmmoLib, camera);
  }

  // Setup controls
  setupControls();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  // Start game on click
  document.getElementById('instructions').addEventListener('click', startGame);
  
  // Restart game on button click
  document.getElementById('restart-button').addEventListener('click', restartGame);
}

function setupPhysicsWorld() {
  const collisionConfiguration = new AmmoLib.btDefaultCollisionConfiguration();
  const dispatcher = new AmmoLib.btCollisionDispatcher(collisionConfiguration);
  const overlappingPairCache = new AmmoLib.btDbvtBroadphase();
  const solver = new AmmoLib.btSequentialImpulseConstraintSolver();

  physicsWorld = new AmmoLib.btDiscreteDynamicsWorld(
    dispatcher,
    overlappingPairCache,
    solver,
    collisionConfiguration
  );

  physicsWorld.setGravity(new AmmoLib.btVector3(0, -30, 0));
  tmpTrans = new AmmoLib.btTransform();
}

function createGround() {
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  
  // Create gradient map for cel shading
  const colors = new Uint8Array(3);
  colors[0] = 100;  // Dark
  colors[1] = 180;  // Medium
  colors[2] = 255;  // Light
  
  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;
  
  const groundMaterial = new THREE.MeshToonMaterial({
    color: 0x4a7c59, // Green grass-like color for cartoon style
    gradientMap: gradientMap
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  
  // Add grid lines for cel-shading style
  const gridHelper = new THREE.GridHelper(100, 20, 0x000000, 0x000000);
  gridHelper.position.y = 0.01;
  gridHelper.material.opacity = 0.3;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);
  
  // Add outline edges to ground
  const groundEdgesGeometry = new THREE.EdgesGeometry(groundGeometry);
  const groundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 3 });
  const groundEdges = new THREE.LineSegments(groundEdgesGeometry, groundEdgesMaterial);
  ground.add(groundEdges);
  
  scene.add(ground);

  const groundShape = new AmmoLib.btBoxShape(new AmmoLib.btVector3(50, 0.5, 50));
  const groundTransform = new AmmoLib.btTransform();
  groundTransform.setIdentity();
  groundTransform.setOrigin(new AmmoLib.btVector3(0, -0.5, 0));

  const mass = 0;
  const localInertia = new AmmoLib.btVector3(0, 0, 0);
  const motionState = new AmmoLib.btDefaultMotionState(groundTransform);
  const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, groundShape, localInertia);
  const body = new AmmoLib.btRigidBody(rbInfo);
  
  // Perfect restitution so targets maintain bounce height
  body.setRestitution(1.0);
  body.setFriction(0.0);
  body.setRollingFriction(0.0);
  
  physicsWorld.addRigidBody(body);
}

function createWalls() {
  const wallPositions = [
    [0, 5, -50],
    [0, 5, 50],
    [-50, 5, 0],
    [50, 5, 0]
  ];

  const wallRotations = [
    [0, 0, 0],
    [0, 0, 0],
    [0, Math.PI / 2, 0],
    [0, Math.PI / 2, 0]
  ];

  // Create gradient map for cel shading
  const colors = new Uint8Array(4);
  colors[0] = 80;   // Dark
  colors[1] = 140;  // Medium-dark
  colors[2] = 200;  // Medium-light
  colors[3] = 255;  // Light
  
  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;

  wallPositions.forEach((pos, index) => {
    const wallGeometry = new THREE.PlaneGeometry(100, 10);
    const wallMaterial = new THREE.MeshToonMaterial({
      color: 0x6b5b95, // Purple walls for cartoon style
      gradientMap: gradientMap,
      side: THREE.DoubleSide
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(pos[0], pos[1], pos[2]);
    wall.rotation.set(...wallRotations[index]);
    wall.receiveShadow = true;
    
    // Add outline edges
    const edgesGeometry = new THREE.EdgesGeometry(wallGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    wall.add(edges);
    
    scene.add(wall);

    const wallShape = new AmmoLib.btBoxShape(new AmmoLib.btVector3(50, 5, 0.5));
    const wallTransform = new AmmoLib.btTransform();
    wallTransform.setIdentity();
    wallTransform.setOrigin(new AmmoLib.btVector3(pos[0], pos[1], pos[2]));
    
    if (wallRotations[index][1] !== 0) {
      const quaternion = new AmmoLib.btQuaternion();
      quaternion.setEulerZYX(0, wallRotations[index][1], 0);
      wallTransform.setRotation(quaternion);
    }

    const mass = 0;
    const localInertia = new AmmoLib.btVector3(0, 0, 0);
    const motionState = new AmmoLib.btDefaultMotionState(wallTransform);
    const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, wallShape, localInertia);
    const body = new AmmoLib.btRigidBody(rbInfo);
    
    // Perfect restitution so targets maintain bounce height
    body.setRestitution(1.0);
    body.setFriction(0.0);
    body.setRollingFriction(0.0);
    
    physicsWorld.addRigidBody(body);
  });
}

function onTargetHit(targetEntity, projectileEntity, normalizedDistance, targetDistance) {
  hits++;
  
  // Calculate accuracy multiplier (closer to center = higher score)
  const accuracyMultiplier = 1.0 - (normalizedDistance * 0.75);
  
  // Calculate distance multiplier (further targets = higher score)
  // Base distance is 20 units (minimum spawn distance)
  // Every 10 units beyond that adds 20% bonus, capped at 3x
  const distanceBonus = Math.min((targetDistance - 20) / 50, 2.0);
  const distanceMultiplier = 1.0 + distanceBonus;
  
  const targetComp = targetEntity.getComponent(TargetComponent);
  const baseScore = targetComp.isMoving ? 100 : 50;
  const earnedScore = Math.round(baseScore * accuracyMultiplier * distanceMultiplier);
  
  score += earnedScore;
  updateStats();
  
  // Visual feedback
  const meshComp = targetEntity.getComponent(MeshComponent);
  if (meshComp) {
    showScorePopup(meshComp.mesh.position, earnedScore, normalizedDistance, targetDistance, distanceMultiplier);
    createExplosion(meshComp.mesh.position);
  }
  
  // Spawn new target
  createTargetEntity(world, scene, physicsWorld, AmmoLib, camera);
}

function showScorePopup(position, earnedScore, normalizedDistance, targetDistance, distanceMultiplier) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  
  let color = '#ffff00';
  let mainText = `+${earnedScore}`;
  let subText = '';
  
  // Accuracy text
  if (normalizedDistance < 0.2) {
    color = '#ffff00';
    mainText += ' BULLSEYE!';
  } else if (normalizedDistance < 0.5) {
    color = '#00ff00';
  } else if (normalizedDistance < 0.8) {
    color = '#ff9900';
  } else {
    color = '#ffffff';
  }
  
  // Distance bonus text
  if (distanceMultiplier > 1.5) {
    subText = `${Math.round(targetDistance)}m - LONG SHOT!`;
  } else if (distanceMultiplier > 1.2) {
    subText = `${Math.round(targetDistance)}m - Distance Bonus!`;
  } else if (targetDistance > 25) {
    subText = `${Math.round(targetDistance)}m`;
  }
  
  ctx.fillStyle = color;
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(mainText, 256, 80);
  
  // Draw distance bonus text
  if (subText) {
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#00ddff';
    ctx.fillText(subText, 256, 130);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.position.y += 3;
  
  // Calculate distance from camera to maintain constant apparent size
  const distanceToCamera = camera.position.distanceTo(position);
  const scaleFactor = distanceToCamera * 0.15; // Adjust this to change perceived size
  sprite.scale.set(scaleFactor * 2, scaleFactor, 1);
  
  scene.add(sprite);
  
  const startTime = Date.now();
  const startY = sprite.position.y;
  
  const animatePopup = () => {
    const elapsed = (Date.now() - startTime) / 1000;
    
    if (elapsed < 1.5) {
      // Move upward relative to distance
      sprite.position.y = startY + (elapsed * distanceToCamera * 0.02);
      sprite.material.opacity = 1 - (elapsed / 1.5);
      
      // Recalculate scale based on current distance to maintain constant size
      const currentDistance = camera.position.distanceTo(sprite.position);
      const currentScale = currentDistance * 0.15;
      sprite.scale.set(currentScale * 2, currentScale, 1);
      
      requestAnimationFrame(animatePopup);
    } else {
      scene.remove(sprite);
    }
  };
  
  animatePopup();
}

function createExplosion(position) {
  const particleCount = 20;
  const particles = [];
  
  // Create gradient map for cel shading
  const colors = new Uint8Array(2);
  colors[0] = 150;  // Dark
  colors[1] = 255;  // Light
  
  const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  gradientMap.needsUpdate = true;
  
  for (let i = 0; i < particleCount; i++) {
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const particleColor = Math.random() > 0.5 ? 0xff6b6b : 0xffaa00;
    const material = new THREE.MeshToonMaterial({
      color: particleColor,
      gradientMap: gradientMap
    });
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 10,
      (Math.random() - 0.5) * 10
    );
    particle.userData.lifetime = 1.0;
    
    scene.add(particle);
    particles.push(particle);
  }
  
  const startTime = Date.now();
  const animateExplosion = () => {
    const elapsed = (Date.now() - startTime) / 1000;
    
    particles.forEach(particle => {
      particle.userData.velocity.y -= 9.8 * 0.016;
      particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.016));
      particle.material.opacity = 1 - (elapsed / particle.userData.lifetime);
    });
    
    if (elapsed < 1.0) {
      requestAnimationFrame(animateExplosion);
    } else {
      particles.forEach(particle => scene.remove(particle));
    }
  };
  
  animateExplosion();
}

function shootProjectile() {
  if (!gameStarted || document.pointerLockElement !== renderer.domElement) return;
  
  shots++;
  updateStats();
  
  createProjectileEntity(world, scene, physicsWorld, AmmoLib, camera);
}

function setupControls() {
  document.addEventListener('mousemove', (event) => {
    if (!gameStarted || document.pointerLockElement !== renderer.domElement) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    controls.euler.setFromQuaternion(camera.quaternion);
    controls.euler.y -= movementX * 0.002;
    controls.euler.x -= movementY * 0.002;
    controls.euler.x = Math.max(-controls.PI_2, Math.min(controls.PI_2, controls.euler.x));
    camera.quaternion.setFromEuler(controls.euler);
  });

  document.addEventListener('click', (event) => {
    if (gameStarted) {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      } else {
        shootProjectile();
      }
    }
  });
}

function startGame() {
  gameStarted = true;
  document.getElementById('instructions').classList.add('hidden');
  
  // Start timer
  const timer = gameTimerEntity.getComponent(GameTimerComponent);
  timer.start();
  
  // Update game state
  const gameState = gameStateEntity.getComponent(GameStateComponent);
  gameState.state = 'playing';
  
  renderer.domElement.requestPointerLock();
}

function onTimeUp() {
  gameStarted = false;
  
  // Update game state
  const gameState = gameStateEntity.getComponent(GameStateComponent);
  gameState.state = 'gameover';
  
  // Exit pointer lock
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  
  // Show game over modal with stats
  showGameOverModal();
}

function showGameOverModal() {
  const modal = document.getElementById('gameover-modal');
  modal.classList.remove('hidden');
  
  // Update final stats
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-accuracy').textContent = 
    shots > 0 ? Math.round((hits / shots) * 100) + '%' : '0%';
  document.getElementById('final-hits').textContent = hits;
  document.getElementById('final-shots').textContent = shots;
}

function restartGame() {
  // Hide modal
  document.getElementById('gameover-modal').classList.add('hidden');
  
  // Reset stats
  score = 0;
  hits = 0;
  shots = 0;
  updateStats();
  
  // Reset timer
  const timer = gameTimerEntity.getComponent(GameTimerComponent);
  timer.reset();
  
  // Clear all targets and projectiles
  clearAllEntities();
  
  // Create new targets
  for (let i = 0; i < 5; i++) {
    createTargetEntity(world, scene, physicsWorld, AmmoLib, camera);
  }
  
  // Update game state
  const gameState = gameStateEntity.getComponent(GameStateComponent);
  gameState.state = 'menu';
  
  // Show instructions again
  document.getElementById('instructions').classList.remove('hidden');
}

function clearAllEntities() {
  // Remove all targets
  const targets = world.getEntitiesWith(TargetComponent);
  targets.forEach(entity => {
    const meshComp = entity.getComponent(MeshComponent);
    if (meshComp) {
      scene.remove(meshComp.mesh);
    }
    const physicsComp = entity.getComponent(PhysicsComponent);
    if (physicsComp) {
      physicsWorld.removeRigidBody(physicsComp.body);
    }
    world.removeEntity(entity);
  });
  
  // Remove all projectiles
  const projectiles = world.getEntitiesWith(ProjectileComponent);
  projectiles.forEach(entity => {
    const meshComp = entity.getComponent(MeshComponent);
    if (meshComp) {
      scene.remove(meshComp.mesh);
    }
    const physicsComp = entity.getComponent(PhysicsComponent);
    if (physicsComp) {
      physicsWorld.removeRigidBody(physicsComp.body);
    }
    world.removeEntity(entity);
  });
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    document.getElementById('game-container').classList.add('playing');
  } else {
    document.getElementById('game-container').classList.remove('playing');
  }
});

document.addEventListener('pointerlockerror', () => {
  console.error('Pointer lock failed');
});

function updateStats() {
  document.getElementById('score').textContent = score;
  document.getElementById('hits').textContent = hits;
  document.getElementById('shots').textContent = shots;
  
  const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : 0;
  document.getElementById('accuracy').textContent = accuracy;
}

function updateMovement(delta) {
  // Movement disabled - player stays in fixed position
  return;
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Update ECS systems
  if (world) {
    world.update(delta);
  }

  updateMovement(delta);

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
