# 3D Aim Trainer

A physics-based aim trainer game built with Three.js and Ammo.js, inspired by Aimlabs.

## Features

- **Timed Challenge**: 60-second rounds to score as many points as possible
- **Physics-Based Shooting**: Fire physics-enabled projectiles using Ammo.js
- **Dynamic Targets**: Mix of stationary and moving targets
- **Target Spawning**: New targets automatically spawn when you hit one
- **Real-time Stats**: Track your time, score, accuracy, hits, and shots
- **Visual Effects**: Explosion particles, dynamic lighting, and shadows
- **Game Over Screen**: View your final stats and play again
- **Dynamic Scoring System**: 
  - **Base Score**: Stationary targets (50 pts) | Moving targets (100 pts)
  - **Accuracy Multiplier**: Bullseye (100%) → Edge hit (25%)
  - **Distance Multiplier**: Further targets = higher bonus (up to 3x)
    - 20m = 1x (base)
    - 45m = 2x multiplier
    - 70m+ = 3x multiplier
  - Visual score popup shows earned points, accuracy, and distance bonus

## Controls

- **Mouse**: Look around
- **Left Click**: Shoot
- **W**: Move forward
- **A**: Move left
- **S**: Move backward
- **D**: Move right

## Technologies

- **Three.js**: 3D graphics and rendering
- **Ammo.js**: Physics simulation (bullets and targets)
- **Vite**: Build tool and dev server

## Architecture

This project uses an **Entity Component System (ECS)** pattern for clean, modular code organization:

- **Entities**: Players, targets, and projectiles
- **Components**: Data containers (Mesh, Physics, Target, Projectile)
- **Systems**: Game logic (Physics, Collision, Rotation, Cleanup)

See [ECS_ARCHITECTURE.md](./ECS_ARCHITECTURE.md) for detailed documentation.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser and navigate to the local URL (usually `http://localhost:5173`)

4. Click on the screen to start playing!

## Game Mechanics

- **Timer**: You have 60 seconds to score as many points as possible
  - Timer turns red and pulses when 10 seconds remain
  - Game ends automatically when time runs out
- **Targets**: 5 targets are active at any time
  - 50% chance of being stationary (cyan/blue)
  - 50% chance of being moving (red/pink)
- **Physics**: All projectiles and moving targets use real physics simulation
- **Boundaries**: The game area is bounded by walls that reflect projectiles and targets
- **Projectile Lifetime**: Bullets automatically despawn after 5 seconds if they don't hit anything
- **Game Over**: When time runs out, view your stats and click "Play Again" to restart

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Preview Production Build

```bash
npm run preview
```
