# Entity Component System (ECS) Architecture

This project uses an Entity Component System pattern to organize game logic. This makes the code more modular, maintainable, and easier to extend.

## Overview

The ECS pattern separates **data** (Components) from **behavior** (Systems), with Entities acting as containers for Components.

```
Entity → Container with ID
  ├─ Component → Pure data (no logic)
  ├─ Component → Pure data
  └─ Component → Pure data

System → Logic that operates on entities with specific components
```

## File Structure

```
src/
├── ecs.js          # Core ECS framework (Entity, World, System base classes)
├── components.js   # Component definitions (data structures)
├── systems.js      # System implementations (game logic)
├── entities.js     # Entity factory functions (create entities with components)
└── main.js         # Game initialization and main loop
```

## Components

Components are pure data containers with no logic.

### MeshComponent
- **Data**: Three.js mesh
- **Purpose**: Visual representation of an entity

### PhysicsComponent
- **Data**: Ammo.js rigid body
- **Purpose**: Physics simulation data

### TargetComponent
- **Data**: `isMoving`, `size`
- **Purpose**: Target-specific properties

### ProjectileComponent
- **Data**: `createdAt`, `lifetime`, `damage`
- **Purpose**: Projectile-specific properties

### PlayerComponent
- **Data**: `camera` reference
- **Purpose**: Player-specific data

### GameTimerComponent
- **Data**: `duration`, `timeRemaining`, `isActive`
- **Purpose**: Tracks game timer and countdown
- **Methods**: `start()`, `stop()`, `reset()`

### GameStateComponent
- **Data**: `state` ('menu', 'playing', 'gameover')
- **Purpose**: Tracks overall game state

## Systems

Systems contain logic that operates on entities with specific components.

### PhysicsSystem
- **Components**: PhysicsComponent, MeshComponent
- **Purpose**: Steps physics simulation and syncs physics bodies with visual meshes
- **Update**: Every frame

### TargetRotationSystem
- **Components**: TargetComponent, MeshComponent
- **Purpose**: Makes targets always face the camera (billboard effect)
- **Update**: Every frame

### CollisionSystem
- **Components**: ProjectileComponent + TargetComponent with MeshComponent
- **Purpose**: Detects collisions between projectiles and targets
- **Update**: Every frame
- **Callback**: Triggers `onHit` with accuracy distance (from target center) and target distance (from player)
- **Scoring**: Calculates both accuracy and distance multipliers for dynamic scoring

### ProjectileCleanupSystem
- **Components**: ProjectileComponent, MeshComponent
- **Purpose**: Removes old projectiles after their lifetime expires
- **Update**: Every frame

### TargetBoundsSystem
- **Components**: TargetComponent (moving), PhysicsComponent
- **Purpose**: Keeps moving targets within game boundaries
- **Update**: Every frame

### TimerSystem
- **Components**: GameTimerComponent
- **Purpose**: Manages game countdown timer
- **Update**: Every frame
- **Callback**: Triggers `onTimeUp` when timer reaches zero
- **UI**: Updates timer display and adds warning styling when time is low

## Entities

Entities are created using factory functions that attach the appropriate components.

### Target Entity
```javascript
createTargetEntity(world, scene, physicsWorld, AmmoLib, camera, isMoving)
```
**Components:**
- MeshComponent (circular disk with bullseye texture)
- PhysicsComponent (sphere collider)
- TargetComponent (moving/stationary flag)

### Projectile Entity
```javascript
createProjectileEntity(world, scene, physicsWorld, AmmoLib, camera)
```
**Components:**
- MeshComponent (yellow sphere)
- PhysicsComponent (sphere with velocity)
- ProjectileComponent (creation timestamp)

### Player Entity
```javascript
createPlayerEntity(world, camera)
```
**Components:**
- PlayerComponent (camera reference)

### Game Timer Entity
Created directly in main.js:
```javascript
gameTimerEntity = world.createEntity();
gameTimerEntity.addComponent(new GameTimerComponent(60));
```
**Components:**
- GameTimerComponent (60-second duration)

### Game State Entity
Created directly in main.js:
```javascript
gameStateEntity = world.createEntity();
gameStateEntity.addComponent(new GameStateComponent());
```
**Components:**
- GameStateComponent (tracks menu/playing/gameover state)

## Scoring System

The game implements a multi-factor scoring system that rewards both accuracy and skill:

### Score Calculation
```javascript
finalScore = baseScore × accuracyMultiplier × distanceMultiplier
```

### Components
1. **Base Score**
   - Stationary targets: 50 points
   - Moving targets: 100 points

2. **Accuracy Multiplier** (0.25 - 1.0)
   - Based on how close projectile hits to target center
   - Bullseye (center): 1.0x (100%)
   - Edge hit: 0.25x (25%)
   - Formula: `1.0 - (normalizedDistance × 0.75)`

3. **Distance Multiplier** (1.0 - 3.0)
   - Based on distance from player to target
   - 20m (minimum): 1.0x (no bonus)
   - 70m+: 3.0x (maximum bonus)
   - Formula: `1.0 + min((distance - 20) / 50, 2.0)`

### Examples
- **Close stationary bullseye**: 50 × 1.0 × 1.0 = 50 points
- **Far moving bullseye**: 100 × 1.0 × 3.0 = 300 points
- **Close moving edge hit**: 100 × 0.25 × 1.0 = 25 points
- **Medium stationary good hit**: 50 × 0.7 × 1.5 = 53 points

### Implementation
The `CollisionSystem` calculates both distances and passes them to the `onHit` callback, which computes the multipliers and updates the score. Visual feedback is shown via score popups that display:
- Earned points
- Accuracy indicator (BULLSEYE!, colors)
- Distance bonus (shows meters and bonus text)

## Game Loop

```javascript
function animate() {
  requestAnimationFrame(animate);
  
  const delta = clock.getDelta();
  
  // Update all ECS systems
  world.update(delta);
  
  // Render
  renderer.render(scene, camera);
}
```

The `world.update()` call runs all systems in order:
1. PhysicsSystem - Update physics
2. TargetRotationSystem - Rotate targets to face player
3. CollisionSystem - Check for hits
4. ProjectileCleanupSystem - Remove old projectiles
5. TargetBoundsSystem - Keep targets in bounds
6. TimerSystem - Update game timer and check for time up

## Benefits of ECS

### 1. **Separation of Concerns**
- Components = data only
- Systems = logic only
- Entities = composition

### 2. **Easy to Extend**
Example: Add a health system
```javascript
// Add component
class HealthComponent {
  constructor(health) {
    this.health = health;
    this.maxHealth = health;
  }
}

// Add system
class HealthSystem extends System {
  update(deltaTime) {
    const entities = this.world.getEntitiesWith(HealthComponent);
    entities.forEach(entity => {
      const health = entity.getComponent(HealthComponent);
      if (health.health <= 0) {
        // Handle death
      }
    });
  }
}
```

### 3. **Performance**
Systems operate on groups of entities efficiently using component queries.

### 4. **Testability**
Each system can be tested in isolation with mock entities.

### 5. **Reusability**
Components and systems can be reused across different entity types.

## Example: Adding a New Feature

**Goal**: Add powerup entities that boost score multiplier

### Step 1: Define Component
```javascript
// components.js
export class PowerupComponent {
  constructor(type, duration) {
    this.type = type;
    this.duration = duration;
    this.entity = null;
  }
}
```

### Step 2: Create Entity Factory
```javascript
// entities.js
export function createPowerupEntity(world, scene, position) {
  const entity = world.createEntity();
  
  // Add mesh
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  scene.add(mesh);
  
  entity.addComponent(new MeshComponent(mesh));
  entity.addComponent(new PowerupComponent('score_boost', 10));
  
  return entity;
}
```

### Step 3: Create System
```javascript
// systems.js
export class PowerupCollectionSystem extends System {
  constructor(player) {
    super();
    this.player = player;
  }
  
  update(deltaTime) {
    const powerups = this.world.getEntitiesWith(PowerupComponent, MeshComponent);
    const playerPos = this.player.getComponent(PlayerComponent).camera.position;
    
    powerups.forEach(powerup => {
      const mesh = powerup.getComponent(MeshComponent);
      const distance = mesh.mesh.position.distanceTo(playerPos);
      
      if (distance < 2) {
        // Collect powerup
        this.onCollect(powerup);
        this.world.removeEntity(powerup);
      }
    });
  }
  
  onCollect(powerup) {
    const comp = powerup.getComponent(PowerupComponent);
    console.log(`Collected ${comp.type} powerup!`);
  }
}
```

### Step 4: Add to Game
```javascript
// main.js
world.addSystem(new PowerupCollectionSystem(playerEntity));

// Spawn powerups
createPowerupEntity(world, scene, new THREE.Vector3(10, 2, 10));
```

That's it! The new feature integrates cleanly without modifying existing code.
