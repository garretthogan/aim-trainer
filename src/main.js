import './style.css'
import * as THREE from 'three'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { getCapsuleConfig, setCapsuleConfig, DEFAULTS } from './capsuleConfig.js'
import { getGameSettings, setGameSettings, DEFAULTS as GameDefaults } from './gameSettings.js'
import { World } from './ecs.js'
import { 
  PhysicsSystem, 
  TargetRotationSystem, 
  CollisionSystem, 
  ProjectileCleanupSystem,
  TargetBoundsSystem,
  CapsuleMovementSystem,
  TimerSystem
} from './systems.js'
import { 
  createTargetEntity, 
  createCapsuleTargetEntity,
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
/** Main directional light (casts shadows). Toggled off in VR to avoid Quest overload. */
let mainDirectionalLight = null;
/** Ground grid (hidden in VR to avoid "white streaks" at floor level). */
let groundGridHelper = null;
/** Group containing ground, walls, targets, projectiles; offset down in VR so floor is below the head. */
let gameContentGroup = null;
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
let gamePaused = false;
let gamePausedWhenLeftForSettings = false;
/** When true, we re-enter fullscreen on fullscreenchange (browser may exit fullscreen when pointer lock is released). */
let reenterFullscreenWhenPaused = false;
let hadPointerLock = false;
let isVRActive = false;
let vrSession = null;
/** Set when WebXR immersive-vr is supported; fullscreen button then enters VR on VR devices. */
let vrSupported = false;
let xrReferenceSpace = null;
const vrControllerPosition = new THREE.Vector3();
const vrControllerQuaternion = new THREE.Quaternion();
const vrControllerDirection = new THREE.Vector3(0, 0, -1);
const vrControllerPositionLeft = new THREE.Vector3();
/** Viewer pose in VR (for game logic only). Three.js XR manager drives the actual camera. */
const vrViewerPosition = new THREE.Vector3();
const vrViewerQuaternion = new THREE.Quaternion();
let vrReticle = null;
let vrTriggerPressedLastFrame = false;
/** Simple spheres drawn at controller positions in world space (no room-scale / model loading). */
let vrControllerSphereLeft = null;
let vrControllerSphereRight = null;
/** Set after first animate() run. Enter VR is deferred until true so Quest gets a "warm" context and can replace its loading UI. */
let hasRenderedOnce = false;

// Clock
const clock = new THREE.Clock();

// Path-based routing: /settings shows settings (no # in URL)
// Use History API for in-app navigation so "Back to game" never triggers a new request (avoids 404 on deploy)
const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || ''
let gameInitialized = false
let settingsPageInitialized = false
let previousRouteWasSettings = false

// Sound: init theme song early so route() and tryStartThemeOnLoad() can use it (avoid TDZ)
const soundBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const themeSongUrl = soundBase + 'sounds/themesong.wav';
let themeSong = new Audio(themeSongUrl);

function getIsSettingsRoute() {
  const path = base ? window.location.pathname.replace(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '') || '/' : window.location.pathname
  const normalized = path.replace(/\/$/, '') || '/'
  return normalized === '/settings' || normalized === 'settings'
}

function route() {
  const isSettings = getIsSettingsRoute()
  const gameContainer = document.getElementById('game-container')
  const settingsPage = document.getElementById('settings-page')
  if (isSettings) {
    previousRouteWasSettings = true
    if (gamePaused) gamePausedWhenLeftForSettings = true
    stopThemeSong()
    if (gameContainer) gameContainer.classList.add('hidden')
    if (settingsPage) settingsPage.classList.remove('hidden')
    if (!settingsPageInitialized) {
      settingsPageInitialized = true
      initSettingsPage()
    }
  } else {
    if (settingsPage) settingsPage.classList.add('hidden')
    if (gameContainer) gameContainer.classList.remove('hidden')
    if (!gameInitialized) {
      gameInitialized = true
      runGame()
    } else if (previousRouteWasSettings) {
      if (gamePausedWhenLeftForSettings) {
        gamePausedWhenLeftForSettings = false
        showPauseMenu()
        startThemeSong()
      } else {
        resetStage()
        startThemeSong()
      }
    }
    previousRouteWasSettings = false
  }
}

function navigateTo(path) {
  const url = base ? `${base}${path}` : path
  history.pushState(null, '', url)
  route()
}

document.body.addEventListener('click', (e) => {
  const link = e.target.closest('a')
  if (!link) return
  if (link.id === 'settings-back') {
    e.preventDefault()
    e.stopPropagation()
    navigateTo('/')
    return
  }
  if (link.classList.contains('settings-link')) {
    e.preventDefault()
    e.stopPropagation()
    navigateTo('/settings')
    return
  }
}, true)

window.addEventListener('popstate', route)

route()

function initSettingsPage() {
  const form = document.getElementById('capsule-settings-form')
  const msgEl = document.getElementById('settings-message')
  const backLink = document.getElementById('settings-back')
  if (backLink) backLink.href = base ? `${base}/` : '/'
  // Navigation is handled by document click listener (History API) to avoid 404 on deploy

  function showMessage(text) {
    if (!msgEl) return
    msgEl.textContent = text
    msgEl.classList.remove('hidden')
    setTimeout(() => msgEl.classList.add('hidden'), 2500)
  }

  function loadForm() {
    const config = getCapsuleConfig()
    const game = getGameSettings()
    const r = document.getElementById('capsule-radius')
    const h = document.getElementById('capsule-height')
    const s = document.getElementById('capsule-speed')
    if (r) r.value = config.radius
    if (h) h.value = config.height
    if (s) s.value = config.movementSpeed
    const difficultyEl = document.getElementById('game-difficulty')
    if (difficultyEl) difficultyEl.value = game.difficulty
    const lookEl = document.getElementById('game-look-sensitivity')
    const lookValEl = document.getElementById('look-sensitivity-value')
    if (lookEl) {
      lookEl.value = Math.round((game.lookSensitivity ?? 1) * 100)
      if (lookValEl) lookValEl.textContent = Math.round((game.lookSensitivity ?? 1) * 100) + '%'
    }
  }

  loadForm()

  const lookEl = document.getElementById('game-look-sensitivity')
  const lookValEl = document.getElementById('look-sensitivity-value')
  if (lookEl && lookValEl) {
    lookEl.addEventListener('input', () => {
      lookValEl.textContent = lookEl.value + '%'
    })
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      setCapsuleConfig({
        radius: form.radius?.value,
        height: form.height?.value,
        movementSpeed: form.movementSpeed?.value,
      })
      setGameSettings({
        difficulty: form.difficulty?.value,
        lookSensitivity: parseInt(form.lookSensitivity?.value, 10) / 100,
      })
      showMessage('Settings saved.')
      loadForm()
    })
  }

  const resetBtn = document.getElementById('settings-reset')
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      setCapsuleConfig(DEFAULTS)
      setGameSettings(GameDefaults)
      loadForm()
      showMessage('Reset to defaults.')
    })
  }
}

function runGame() {
  // Start scene and render loop immediately so the canvas is drawing from frame 1 (Quest can then show our layer when entering VR)
  initSceneAndRenderer();
  loadAmmo().then((Ammo) => {
    AmmoLib = Ammo;
    console.log('Ammo.js loaded successfully!');
    initGameContent();
  }).catch(error => {
    console.error('Failed to load Ammo.js:', error);
    document.getElementById('instructions').innerHTML = '<p>Failed to load physics engine</p><p>Please refresh the page</p>';
  });
}

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


function initGameContent() {
  // Group for play area so we can offset it in VR (floor below head)
  gameContentGroup = new THREE.Group();
  scene.add(gameContentGroup);
  // Setup physics (scene, camera, renderer, lights already created in initSceneAndRenderer)
  setupPhysicsWorld();

  // Create ECS World
  world = new World();

  // Add systems
  world.addSystem(new PhysicsSystem(physicsWorld, tmpTrans));
  world.addSystem(new CapsuleMovementSystem(camera, () => gameStarted && !gamePaused));
  world.addSystem(new TargetRotationSystem(camera));
  world.addSystem(new CollisionSystem(scene, physicsWorld, AmmoLib, camera, onTargetHit));
  world.addSystem(new ProjectileCleanupSystem(scene, physicsWorld));
  world.addSystem(new TargetBoundsSystem(AmmoLib));
  world.addSystem(new TimerSystem(onTimeUp, () => gamePaused));

  // Create game entities
  playerEntity = createPlayerEntity(world, camera);
  gameTimerEntity = world.createEntity();
  const initialDuration = getGameSettings().timerDuration;
  gameTimerEntity.addComponent(new GameTimerComponent(initialDuration));
  const timerElInit = document.getElementById('timer');
  if (timerElInit) timerElInit.textContent = initialDuration;
  const instructionsTimerEl = document.getElementById('instructions-timer');
  if (instructionsTimerEl) instructionsTimerEl.textContent = initialDuration;

  gameStateEntity = world.createEntity();
  gameStateEntity.addComponent(new GameStateComponent());

  // Create ground
  createGround();

  // Create walls
  createWalls();

  // Setup controls
  setupControls();

  // Start game on click
  document.getElementById('instructions').addEventListener('click', startGame);

  // Restart game on button click
  document.getElementById('restart-button').addEventListener('click', restartGame);

  // Audio: theme song, mute, volume (listener already attached at load so first click starts theme)
  initAudioControls();
  startThemeSong(); // may be blocked until user interacts
}

/** Creates scene, camera, renderer, lights, and starts the animation loop. Called before Ammo loads. */
function initSceneAndRenderer() {
  // Setup scene - solid color background for cel-shaded look
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue for cartoon style
  scene.fog = new THREE.Fog(0x87ceeb, 120, 300);

  // Setup camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 10);

  // Default renderer (match working Three.js examples – no custom context)
  const gameContainer = document.getElementById('game-container');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.xr.enabled = true;
  // 'local' = stationary; no room-scale or floor boundary required
  renderer.xr.setReferenceSpaceType('local');
  gameContainer.appendChild(renderer.domElement);
  const vrButton = VRButton.createButton(renderer);
  vrButton.id = 'VRButton';
  gameContainer.appendChild(vrButton);
  renderer.xr.addEventListener('sessionstart', onVRSessionStart);
  renderer.xr.addEventListener('sessionend', onVRSessionEnd);

  // Lights so the first frames draw something
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  mainDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainDirectionalLight.position.set(10, 20, 10);
  mainDirectionalLight.castShadow = true;
  mainDirectionalLight.shadow.camera.left = -50;
  mainDirectionalLight.shadow.camera.right = 50;
  mainDirectionalLight.shadow.camera.top = 50;
  mainDirectionalLight.shadow.camera.bottom = -50;
  mainDirectionalLight.shadow.mapSize.width = 2048;
  mainDirectionalLight.shadow.mapSize.height = 2048;
  scene.add(mainDirectionalLight);
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight2.position.set(-10, 15, -10);
  scene.add(directionalLight2);
  const pointLight1 = new THREE.PointLight(0x00ffff, 1.0, 80);
  pointLight1.position.set(-20, 10, -20);
  scene.add(pointLight1);
  const pointLight2 = new THREE.PointLight(0xff00ff, 1.0, 80);
  pointLight2.position.set(20, 10, 20);
  scene.add(pointLight2);

  window.addEventListener('resize', onWindowResize);
  initVR();
}

function onFirstUserGestureStartTheme() {
  const start = () => {
    if (getIsSettingsRoute()) return;
    startThemeSong();
    resumeAudioContext();
    document.removeEventListener('click', start);
    document.removeEventListener('keydown', start);
    document.removeEventListener('touchstart', start);
  };
  document.addEventListener('click', start, { once: true, capture: true });
  document.addEventListener('keydown', start, { once: true, capture: true });
  document.addEventListener('touchstart', start, { once: true, capture: true });
}

function initAudioControls() {
  if (!themeSong) themeSong = new Audio(themeSongUrl);
  applySoundSettings();

  const audioControls = document.getElementById('audio-controls');
  if (audioControls) {
    audioControls.addEventListener('mousedown', () => {
      if (document.pointerLockElement) document.exitPointerLock();
    });
  }

  const muteBtn = document.getElementById('sound-mute');
  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const state = getSoundState();
      const nextMuted = !state.muted;
      setSoundState(nextMuted, state.volume);
      applySoundSettings();
    });
  }

  const volSlider = document.getElementById('sound-volume');
  if (volSlider) {
    volSlider.addEventListener('input', () => {
      const v = Math.max(0, Math.min(1, parseInt(volSlider.value, 10) / 100));
      const state = getSoundState();
      setSoundState(state.muted, v);
      applySoundSettings();
    });
  }

  const fullscreenBtn = document.getElementById('fullscreen-btn');
  function updateFullscreenVRButtonLabel() {
    if (!fullscreenBtn) return;
    if (isVRActive) {
      fullscreenBtn.textContent = '✕';
      fullscreenBtn.title = 'Exit VR';
    } else if (document.fullscreenElement) {
      fullscreenBtn.textContent = '✕';
      fullscreenBtn.title = 'Exit full screen';
    } else {
      fullscreenBtn.textContent = '⛶';
      fullscreenBtn.title = vrSupported ? 'Enter VR (360° immersive)' : 'Full screen';
    }
  }
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // On VR-capable devices, fullscreen = enter/exit WebXR immersive-vr (360° view)
      if (isVRActive && vrSession) {
        vrSession.end();
        return;
      }
      if (vrSupported) {
        enterVR();
        return;
      }
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        document.documentElement.requestFullscreen?.();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      updateFullscreenVRButtonLabel();
      // Re-enter fullscreen if the browser exited it when we released pointer lock on pause
      if (!document.fullscreenElement && gamePaused && reenterFullscreenWhenPaused) {
        reenterFullscreenWhenPaused = false;
        document.documentElement.requestFullscreen?.();
      }
    });
    // Expose so enterVR / onVRSessionEnd can update the button when VR state changes
    window.__updateFullscreenVRButtonLabel = updateFullscreenVRButtonLabel;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'm' && e.key !== 'M') return;
    if (e.target.closest('input, textarea, select')) return;
    const state = getSoundState();
    setSoundState(!state.muted, state.volume);
    applySoundSettings();
  });
}

function initVR() {
  const vrHintEl = document.getElementById('vr-hint');
  const enterVrBtn = document.getElementById('enter-vr-btn');

  function setVRUnavailable(reason) {
    if (vrHintEl) {
      vrHintEl.textContent = reason;
      vrHintEl.classList.remove('hidden');
    }
    console.warn('WebXR VR not available:', reason);
  }

  if (!window.isSecureContext) {
    setVRUnavailable('VR requires HTTPS or localhost. Open this page via https:// or http://localhost');
    return;
  }
  if (!navigator.xr) {
    setVRUnavailable('VR not supported in this browser. Try Chrome with a VR headset.');
    return;
  }

  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) {
      setVRUnavailable('No VR display detected. Use HTTPS, connect a headset, or try the browser\'s Enter VR button.');
      return;
    }
    vrSupported = true;
    if (vrHintEl) vrHintEl.classList.add('hidden');
    if (enterVrBtn) {
      enterVrBtn.classList.remove('hidden');
      enterVrBtn.addEventListener('click', (e) => { e.stopPropagation(); enterVR(); });
    }
    window.addEventListener('vrdisplayactivate', onBrowserEnterVR);
    if (typeof window.__updateFullscreenVRButtonLabel === 'function') window.__updateFullscreenVRButtonLabel();
  }).catch((err) => {
    setVRUnavailable('VR check failed. Use HTTPS or localhost.');
    console.warn('WebXR isSessionSupported failed:', err);
  });
}

function onBrowserEnterVR() {
  if (vrSupported && !vrSession) enterVR();
}

/** Enter VR by triggering the official VRButton (session created by Three.js so headset receives render). */
function enterVR() {
  if (vrSession) return;
  // Defer until we've drawn at least one frame so Quest has a "warm" WebGL context and can replace its loading UI (black + dots/streaks) with our scene
  if (!hasRenderedOnce) {
    requestAnimationFrame(enterVR);
    return;
  }
  document.getElementById('VRButton')?.click();
}

/** Called by renderer.xr when the XR session starts (after VRButton has called setSession). */
function onVRSessionStart() {
  vrSession = renderer.xr.getSession();
  if (!vrSession) return;
  isVRActive = true;
  // Defer all scene/state changes to next frame so the first XR frame runs like the minimal test (fixes black screen on Quest)
  requestAnimationFrame(function doVRSessionSetup() {
    if (!vrSession) return;
    gamePaused = false;
    hidePauseMenu();
    renderer.shadowMap.enabled = false;
  if (mainDirectionalLight) mainDirectionalLight.castShadow = false;
  scene.traverse((obj) => {
    if (obj.castShadow !== undefined) obj.castShadow = false;
    if (obj.receiveShadow !== undefined) obj.receiveShadow = false;
  });
  xrReferenceSpace = renderer.xr.getReferenceSpace?.() || null;
  if (groundGridHelper) groundGridHelper.visible = false;
  // Hide all line/edge geometry in VR so they don’t appear as floating dots or streaks
  scene.traverse((obj) => {
    if (obj.type === 'LineSegments' || obj.type === 'Line' || (obj.isLineSegments)) obj.visible = false;
  });
  createVRReticle();
  // Offset play area down so floor is below head (local space = head at origin)
  if (gameContentGroup) gameContentGroup.position.y = -1.6;
  // Simple spheres at controller positions – use grip space, larger size so they’re visible
  const sphereGeo = new THREE.SphereGeometry(0.08, 16, 16);
  vrControllerSphereLeft = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0x2288ff, depthTest: true }));
  vrControllerSphereRight = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xff4422, depthTest: true }));
  vrControllerSphereLeft.position.set(0, -2, 0);
  vrControllerSphereRight.position.set(0, -2, 0);
  scene.add(vrControllerSphereLeft);
  scene.add(vrControllerSphereRight);
  const crosshairEl = document.getElementById('crosshair');
  if (crosshairEl) crosshairEl.style.visibility = 'hidden';
  document.getElementById('instructions').classList.add('hidden');
  vrSession.addEventListener('selectstart', onVRSelectStart);
  vrSession.addEventListener('selectend', onVRSelectEnd);
  if (typeof window.__updateFullscreenVRButtonLabel === 'function') window.__updateFullscreenVRButtonLabel();
  if (!gameStarted) startGame();
  });
}

function createVRReticle() {
  if (vrReticle) return;
  const size = 0.08;
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
  const g1 = new THREE.PlaneGeometry(size, size * 0.2);
  const g2 = new THREE.PlaneGeometry(size * 0.2, size);
  const cross1 = new THREE.Mesh(g1, mat);
  const cross2 = new THREE.Mesh(g2, mat);
  cross1.rotation.y = Math.PI / 2;
  cross2.rotation.y = Math.PI / 2;
  vrReticle = new THREE.Group();
  vrReticle.add(cross1);
  vrReticle.add(cross2);
  vrReticle.visible = false;
  scene.add(vrReticle);
}

function onVRSessionEnd() {
  if (vrSession) {
    vrSession.removeEventListener('selectstart', onVRSelectStart);
    vrSession.removeEventListener('selectend', onVRSelectEnd);
  }
  vrSession = null;
  xrReferenceSpace = null;
  isVRActive = false;
  vrTriggerPressedLastFrame = false;
  if (vrReticle && scene) scene.remove(vrReticle);
  vrReticle = null;
  if (gameContentGroup) gameContentGroup.position.y = 0;
  if (vrControllerSphereLeft && scene) scene.remove(vrControllerSphereLeft);
  if (vrControllerSphereRight && scene) scene.remove(vrControllerSphereRight);
  vrControllerSphereLeft = null;
  vrControllerSphereRight = null;
  if (groundGridHelper) groundGridHelper.visible = true;
  scene.traverse((obj) => {
    if (obj.type === 'LineSegments' || obj.type === 'Line' || (obj.isLineSegments)) obj.visible = true;
  });
  // Restore shadows for desktop
  renderer.shadowMap.enabled = true;
  if (mainDirectionalLight) mainDirectionalLight.castShadow = true;
  scene.traverse((obj) => {
    if (obj.castShadow !== undefined) obj.castShadow = true;
    if (obj.receiveShadow !== undefined) obj.receiveShadow = true;
  });
  const crosshairEl = document.getElementById('crosshair');
  if (crosshairEl) crosshairEl.style.visibility = '';
  // Loop stays setAnimationLoop(animate); no need to restart
  // Reset camera so desktop view isn't stuck at VR head pose (on ground, tilted)
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  if (scene.background) renderer.setClearColor(scene.background);
  if (typeof window.__updateFullscreenVRButtonLabel === 'function') window.__updateFullscreenVRButtonLabel();
}

let vrTriggerDown = false;

function onVRSelectStart() {
  vrTriggerDown = true;
  if (!gameStarted) {
    startGame();
  } else if (!gamePaused && (document.pointerLockElement === renderer.domElement || isVRActive)) {
    shootProjectile();
  }
}

function onVRSelectEnd() {
  vrTriggerDown = false;
}

function updateVRFromFrame(xrFrame) {
  if (!xrReferenceSpace || !xrFrame) return;

  // Don't set camera.position/quaternion here — Three.js WebXR manager updates the camera
  // for the headset view (cameraAutoUpdate). We only store the viewer pose for game logic.
  const viewerPose = xrFrame.getViewerPose(xrReferenceSpace);
  if (viewerPose && viewerPose.transform) {
    const t = viewerPose.transform;
    const y = Math.max(t.position.y, 0.5);
    vrViewerPosition.set(t.position.x, y, t.position.z);
    vrViewerQuaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
  }

  // Left controller: use gripSpace for sphere position (where you hold it)
  const leftInput = vrSession?.inputSources?.find((s) => s.handedness === 'left');
  if (leftInput?.gripSpace) {
    const pose = xrFrame.getPose(leftInput.gripSpace, xrReferenceSpace);
    if (pose?.transform && vrControllerSphereLeft) {
      const t = pose.transform;
      vrControllerPositionLeft.set(t.position.x, t.position.y, t.position.z);
      vrControllerSphereLeft.position.copy(vrControllerPositionLeft);
    }
  }

  // Right controller: gripSpace for sphere, targetRaySpace for reticle and shooting
  const rightInput = vrSession?.inputSources?.find((s) => s.handedness === 'right');
  if (rightInput?.targetRaySpace) {
    const rayPose = xrFrame.getPose(rightInput.targetRaySpace, xrReferenceSpace);
    if (rayPose?.transform) {
      const t = rayPose.transform;
      vrControllerPosition.set(t.position.x, t.position.y, t.position.z);
      vrControllerQuaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      vrControllerDirection.set(0, 0, -1).applyQuaternion(vrControllerQuaternion);
      if (vrReticle) {
        vrReticle.visible = true;
        vrReticle.position.copy(vrControllerPosition).add(vrControllerDirection.clone().multiplyScalar(0.5));
        vrReticle.quaternion.copy(vrControllerQuaternion);
        vrReticle.lookAt(vrViewerPosition);
      }
    }
  }
  if (rightInput?.gripSpace && vrControllerSphereRight) {
    const gripPose = xrFrame.getPose(rightInput.gripSpace, xrReferenceSpace);
    if (gripPose?.transform) {
      const t = gripPose.transform;
      vrControllerSphereRight.position.set(t.position.x, t.position.y, t.position.z);
    }
  }

  const triggerPressed = rightInput?.gamepad?.buttons?.[0]?.pressed || rightInput?.gamepad?.buttons?.[1]?.pressed;
  if (triggerPressed && !vrTriggerPressedLastFrame && gameStarted && !gamePaused) {
    shootProjectile();
  }
  vrTriggerPressedLastFrame = !!triggerPressed;
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
  groundGridHelper = new THREE.GridHelper(100, 20, 0x000000, 0x000000);
  groundGridHelper.position.y = 0.01;
  groundGridHelper.material.opacity = 0.3;
  groundGridHelper.material.transparent = true;
  (gameContentGroup || scene).add(groundGridHelper);

  // Add outline edges to ground
  const groundEdgesGeometry = new THREE.EdgesGeometry(groundGeometry);
  const groundEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 3 });
  const groundEdges = new THREE.LineSegments(groundEdgesGeometry, groundEdgesMaterial);
  ground.add(groundEdges);
  (gameContentGroup || scene).add(ground);

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
    (gameContentGroup || scene).add(wall);

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

const impactSoundUrl = soundBase + 'sounds/impact.wav';

const SOUND_MUTED_KEY = 'aim-trainer-sound-muted';
const SOUND_VOLUME_KEY = 'aim-trainer-sound-volume';
/** Music level relative to SFX; keep music well under impact */
const MUSIC_VOLUME_RATIO = 0.14;

let audioContext = null;
let masterGainNode = null;
let impactSoundBuffer = null;
let impactSoundLoadPromise = null;
const _listenerForward = new THREE.Vector3();
const _listenerUp = new THREE.Vector3(0, 1, 0);

function getSoundState() {
  try {
    const muted = localStorage.getItem(SOUND_MUTED_KEY);
    const volume = localStorage.getItem(SOUND_VOLUME_KEY);
    return {
      muted: muted === 'true',
      volume: volume != null ? Math.max(0, Math.min(1, parseFloat(volume))) : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

function setSoundState(muted, volume) {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, String(muted));
    localStorage.setItem(SOUND_VOLUME_KEY, String(volume));
  } catch (_) {}
}

function applySoundSettings() {
  const { muted, volume } = getSoundState();
  const effectiveVolume = muted ? 0 : volume;
  if (masterGainNode && audioContext) {
    masterGainNode.gain.setValueAtTime(effectiveVolume, audioContext.currentTime);
  }
  if (themeSong) {
    themeSong.muted = muted;
    themeSong.volume = volume * MUSIC_VOLUME_RATIO;
    if (!muted) {
      themeSong.loop = true;
      themeSong.play().catch(() => {});
    } else {
      themeSong.pause();
    }
  }
  const muteBtn = document.getElementById('sound-mute');
  if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
  const volSlider = document.getElementById('sound-volume');
  if (volSlider) volSlider.value = Math.round(volume * 100);
  return { muted, volume };
}

function startThemeSong() {
  if (!themeSong) return;
  const { muted } = getSoundState();
  if (muted) return;
  themeSong.loop = true;
  themeSong.volume = getSoundState().volume * MUSIC_VOLUME_RATIO;
  themeSong.play().catch(() => {});
}

function stopThemeSong() {
  if (themeSong) themeSong.pause();
}

/** Try to start theme on load when unmuted; may be blocked by browser autoplay policy. */
function tryStartThemeOnLoad() {
  if (getIsSettingsRoute()) return;
  const { muted } = getSoundState();
  if (muted) return;
  if (!themeSong) return;
  themeSong.loop = true;
  themeSong.volume = getSoundState().volume * MUSIC_VOLUME_RATIO;
  themeSong.play().catch(() => {});
}

function resumeAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

function ensureImpactSoundReady() {
  if (impactSoundBuffer) return Promise.resolve();
  if (impactSoundLoadPromise) return impactSoundLoadPromise;
  impactSoundLoadPromise = (async () => {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (!masterGainNode) {
        masterGainNode = audioContext.createGain();
        masterGainNode.connect(audioContext.destination);
        const { muted, volume } = getSoundState();
        masterGainNode.gain.setValueAtTime(muted ? 0 : volume, audioContext.currentTime);
      }
      const res = await fetch(impactSoundUrl);
      const arrayBuffer = await res.arrayBuffer();
      impactSoundBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (_) {}
  })();
  return impactSoundLoadPromise;
}

function updateSpatialAudioListener(cam) {
  if (!audioContext || !impactSoundBuffer) return;
  const l = audioContext.listener;
  if (l.positionX) {
    l.positionX.setValueAtTime(cam.position.x, audioContext.currentTime);
    l.positionY.setValueAtTime(cam.position.y, audioContext.currentTime);
    l.positionZ.setValueAtTime(cam.position.z, audioContext.currentTime);
    cam.getWorldDirection(_listenerForward);
    l.forwardX.setValueAtTime(_listenerForward.x, audioContext.currentTime);
    l.forwardY.setValueAtTime(_listenerForward.y, audioContext.currentTime);
    l.forwardZ.setValueAtTime(_listenerForward.z, audioContext.currentTime);
    l.upX.setValueAtTime(_listenerUp.x, audioContext.currentTime);
    l.upY.setValueAtTime(_listenerUp.y, audioContext.currentTime);
    l.upZ.setValueAtTime(_listenerUp.z, audioContext.currentTime);
  }
}

function updateSpatialAudioListenerVR(position, quaternion) {
  if (!audioContext || !impactSoundBuffer) return;
  const l = audioContext.listener;
  if (l.positionX) {
    l.positionX.setValueAtTime(position.x, audioContext.currentTime);
    l.positionY.setValueAtTime(position.y, audioContext.currentTime);
    l.positionZ.setValueAtTime(position.z, audioContext.currentTime);
    _listenerForward.set(0, 0, -1).applyQuaternion(quaternion);
    l.forwardX.setValueAtTime(_listenerForward.x, audioContext.currentTime);
    l.forwardY.setValueAtTime(_listenerForward.y, audioContext.currentTime);
    l.forwardZ.setValueAtTime(_listenerForward.z, audioContext.currentTime);
    l.upX.setValueAtTime(_listenerUp.x, audioContext.currentTime);
    l.upY.setValueAtTime(_listenerUp.y, audioContext.currentTime);
    l.upZ.setValueAtTime(_listenerUp.z, audioContext.currentTime);
  }
}

function playSpatialImpact(worldPosition) {
  if (!audioContext || !impactSoundBuffer) return;
  const source = audioContext.createBufferSource();
  source.buffer = impactSoundBuffer;
  const panner = audioContext.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.maxDistance = 500;
  panner.rolloffFactor = 0.4;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  if (panner.positionX) {
    panner.positionX.setValueAtTime(worldPosition.x, audioContext.currentTime);
    panner.positionY.setValueAtTime(worldPosition.y, audioContext.currentTime);
    panner.positionZ.setValueAtTime(worldPosition.z, audioContext.currentTime);
  }
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(1.4, audioContext.currentTime);
  source.connect(panner);
  panner.connect(gain);
  gain.connect(masterGainNode || audioContext.destination);
  source.start(0);
}

function onTargetHit(targetEntity, projectileEntity, normalizedDistance, targetDistance) {
  hits++;
  const meshComp = targetEntity.getComponent(MeshComponent);
  const hitPosition = meshComp?.mesh?.position ? meshComp.mesh.position.clone() : null;
  ensureImpactSoundReady().then(() => {
    if (hitPosition && impactSoundBuffer) {
      resumeAudioContext();
      updateSpatialAudioListener(camera);
      playSpatialImpact(hitPosition);
    }
  });

  // Calculate accuracy multiplier (closer to center = higher score)
  const accuracyMultiplier = 1.0 - (normalizedDistance * 0.75);
  
  const targetComp = targetEntity.getComponent(TargetComponent);
  // Capsule: much stronger distance bonus (further = many more points)
  let distanceMultiplier;
  if (targetComp.isCapsule) {
    const distanceBonus = Math.min((targetDistance - 20) / 20, 4.0);
    distanceMultiplier = 1.0 + distanceBonus;
  } else {
    // Every 10 units beyond 20 adds 20% bonus, capped at 3x
    const distanceBonus = Math.min((targetDistance - 20) / 50, 2.0);
    distanceMultiplier = 1.0 + distanceBonus;
  }
  let baseScore = targetComp.isMoving ? 100 : 50;
  if (targetComp.isCapsule) {
    baseScore = 60;
  }
  const earnedScore = Math.round(baseScore * accuracyMultiplier * distanceMultiplier);
  
  score += earnedScore;
  updateStats();
  
  // Visual feedback
  if (hitPosition) {
    showScorePopup(hitPosition, earnedScore, normalizedDistance, targetDistance, distanceMultiplier);
    createExplosion(hitPosition);
  }
  
  const game = getGameSettings();
  const targets = world.getEntitiesWith(TargetComponent);
  const capsuleCount = targets.filter(e => e.getComponent(TargetComponent).isCapsule).length;
  const targetCount = targets.filter(e => !e.getComponent(TargetComponent).isCapsule).length;

  if (targetComp.isCapsule) {
    if (capsuleCount <= game.maxCapsules) {
      createCapsuleTargetEntity(world, gameContentGroup || scene, camera);
    }
  } else {
    if (targetCount <= game.maxTargets) {
      createTargetEntity(world, gameContentGroup || scene, physicsWorld, AmmoLib, camera);
    }
  }
}

function showScorePopup(position, earnedScore, normalizedDistance, targetDistance, distanceMultiplier) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
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
  
  // Draw main text with cel-shaded outline
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Black outline (cel-shading effect)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.strokeText(mainText, 384, 100);
  
  // Colored fill
  ctx.fillStyle = color;
  ctx.fillText(mainText, 384, 100);
  
  // Draw distance bonus text with outline
  if (subText) {
    ctx.font = 'bold 40px Arial';
    
    // Black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeText(subText, 384, 170);
    
    // Orange fill
    ctx.fillStyle = '#ff6600'; // Bright orange - stands out against blue sky
    ctx.fillText(subText, 384, 170);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.position.y += 3;
  
  // Calculate distance from camera to maintain constant apparent size
  const distanceToCamera = camera.position.distanceTo(position);
  const scaleFactor = distanceToCamera * 0.18; // Larger scale for bigger text
  sprite.scale.set(scaleFactor * 2, scaleFactor, 1);
  
  (gameContentGroup || scene).add(sprite);
  
  const startTime = Date.now();
  const startY = sprite.position.y;
  const duration = 2.5; // Stay visible for 2.5 seconds (was 1.5)
  
  const animatePopup = () => {
    const elapsed = (Date.now() - startTime) / 1000;
    
    if (elapsed < duration) {
      // Move upward relative to distance
      sprite.position.y = startY + (elapsed * distanceToCamera * 0.015);
      
      // Fade out in the last 0.5 seconds
      if (elapsed > duration - 0.5) {
        sprite.material.opacity = (duration - elapsed) / 0.5;
      }
      
      // Recalculate scale based on current distance to maintain constant size
      const currentDistance = camera.position.distanceTo(sprite.position);
      const currentScale = currentDistance * 0.18;
      sprite.scale.set(currentScale * 2, currentScale, 1);
      
      requestAnimationFrame(animatePopup);
    } else if (sprite.parent) {
      sprite.parent.remove(sprite);
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
    
    (gameContentGroup || scene).add(particle);
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
      particles.forEach(particle => { if (particle.parent) particle.parent.remove(particle); });
    }
  };
  
  animateExplosion();
}

const swingSoundUrl = soundBase + 'sounds/swing.wav';

function shootProjectile() {
  if (!gameStarted) return;
  if (document.pointerLockElement !== renderer.domElement && !isVRActive) return;
  
  const { muted, volume } = getSoundState();
  if (muted) { /* skip swing when muted */ } else {
    resumeAudioContext();
    try {
      const swing = new Audio(swingSoundUrl);
      swing.volume = volume * 0.5;
      swing.play().catch(() => {});
    } catch (_) {}
  }
  
  shots++;
  updateStats();
  
  if (isVRActive) {
    const origin = vrControllerPosition.clone();
    const dir = vrControllerDirection.clone();
    createProjectileEntity(world, gameContentGroup || scene, physicsWorld, AmmoLib, camera, origin, dir);
  } else {
    createProjectileEntity(world, gameContentGroup || scene, physicsWorld, AmmoLib, camera);
  }
}

function setupControls() {
  document.addEventListener('mousemove', (event) => {
    if (isVRActive) return;
    if (!gameStarted || document.pointerLockElement !== renderer.domElement) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;
    const sensitivity = getGameSettings().lookSensitivity ?? 1;
    const factor = 0.002 * sensitivity;

    controls.euler.setFromQuaternion(camera.quaternion);
    controls.euler.y -= movementX * factor;
    controls.euler.x -= movementY * factor;
    controls.euler.x = Math.max(-controls.PI_2, Math.min(controls.PI_2, controls.euler.x));
    camera.quaternion.setFromEuler(controls.euler);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#settings-page')) return;
    if (event.target.closest('#audio-controls')) return;
    if (event.target.closest('#pause-menu')) return;
    if (gameStarted) {
      if (isVRActive) {
        shootProjectile();
      } else if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      } else {
        shootProjectile();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!gameStarted) return;
    const gameState = gameStateEntity.getComponent(GameStateComponent);
    if (gameState.state === 'gameover') return;
    if (gamePaused) {
      hidePauseMenu();
      gamePaused = false;
      reenterFullscreenWhenPaused = false;
      renderer.domElement.requestPointerLock();
    } else {
      gamePaused = true;
      const wasFullscreen = !!document.fullscreenElement;
      reenterFullscreenWhenPaused = wasFullscreen;
      if (document.pointerLockElement) document.exitPointerLock();
      showPauseMenu();
      // Re-enter fullscreen in same user gesture if browser already exited (some do so when releasing pointer lock)
      if (wasFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.();
    }
  });

  const pauseResumeBtn = document.getElementById('pause-resume');
  if (pauseResumeBtn) {
    pauseResumeBtn.addEventListener('click', () => {
      hidePauseMenu();
      gamePaused = false;
      reenterFullscreenWhenPaused = false;
      renderer.domElement.requestPointerLock();
    });
  }
}

function showPauseMenu() {
  const el = document.getElementById('pause-menu');
  if (el) el.classList.remove('hidden');
}

function hidePauseMenu() {
  const el = document.getElementById('pause-menu');
  if (el) el.classList.add('hidden');
}

/** Returns a random count in [min, max] from settings (0 when both are 0). */
function initialCountFromSettings(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const range = hi - lo + 1;
  return range <= 0 ? 0 : lo + Math.floor(Math.random() * range);
}

function startGame() {
  gameStarted = true;
  gamePaused = false;
  document.getElementById('instructions').classList.add('hidden');

  const game = getGameSettings();
  const timer = gameTimerEntity.getComponent(GameTimerComponent);
  timer.duration = game.timerDuration;
  timer.reset();
  timer.start();

  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = game.timerDuration;

  const gameState = gameStateEntity.getComponent(GameStateComponent);
  gameState.state = 'playing';

  ensureImpactSoundReady().then(() => resumeAudioContext());

  // In VR, defer spawn to next frame so camera has been updated by XR and targets spawn around the player
  function doSpawn() {
    clearAllEntities();
    const numTargets = initialCountFromSettings(game.minTargets, game.maxTargets);
    const numCapsules = initialCountFromSettings(game.minCapsules, game.maxCapsules);
    for (let i = 0; i < numTargets; i++) {
      createTargetEntity(world, gameContentGroup || scene, physicsWorld, AmmoLib, camera);
    }
    for (let i = 0; i < numCapsules; i++) {
      createCapsuleTargetEntity(world, gameContentGroup || scene, camera);
    }
  }
  if (isVRActive) {
    requestAnimationFrame(doSpawn);
  } else {
    doSpawn();
  }

  if (!isVRActive) renderer.domElement.requestPointerLock();
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
  document.getElementById('gameover-modal').classList.add('hidden');
  
  score = 0;
  hits = 0;
  shots = 0;
  updateStats();
  
  const game = getGameSettings();
  const timer = gameTimerEntity.getComponent(GameTimerComponent);
  timer.duration = game.timerDuration;
  timer.reset();
  
  clearAllEntities();

  const numTargets = initialCountFromSettings(game.minTargets, game.maxTargets);
  const numCapsules = initialCountFromSettings(game.minCapsules, game.maxCapsules);
  for (let i = 0; i < numTargets; i++) {
    createTargetEntity(world, gameContentGroup || scene, physicsWorld, AmmoLib, camera);
  }
  for (let i = 0; i < numCapsules; i++) {
    createCapsuleTargetEntity(world, gameContentGroup || scene, camera);
  }
  
  const gameState = gameStateEntity.getComponent(GameStateComponent);
  gameState.state = 'menu';
  const instructionsEl = document.getElementById('instructions');
  if (instructionsEl) instructionsEl.classList.remove('hidden');
  const instructionsTimerEl = document.getElementById('instructions-timer');
  if (instructionsTimerEl) instructionsTimerEl.textContent = game.timerDuration;
}

function clearAllEntities() {
  // Remove all targets
  const targets = world.getEntitiesWith(TargetComponent);
  targets.forEach(entity => {
    const meshComp = entity.getComponent(MeshComponent);
    if (meshComp?.mesh?.parent) {
      meshComp.mesh.parent.remove(meshComp.mesh);
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
    if (meshComp?.mesh?.parent) {
      meshComp.mesh.parent.remove(meshComp.mesh);
    }
    const physicsComp = entity.getComponent(PhysicsComponent);
    if (physicsComp) {
      physicsWorld.removeRigidBody(physicsComp.body);
    }
    world.removeEntity(entity);
  });
}

function resetStage() {
  if (!world || !scene || !physicsWorld || !camera) return
  clearAllEntities()
  const game = getGameSettings()
  const timer = gameTimerEntity.getComponent(GameTimerComponent)
  if (timer) {
    timer.duration = game.timerDuration
    timer.reset()
  }
  const timerEl = document.getElementById('timer')
  if (timerEl) timerEl.textContent = game.timerDuration
  const instructionsTimerEl = document.getElementById('instructions-timer')
  if (instructionsTimerEl) instructionsTimerEl.textContent = game.timerDuration
  const numTargets = initialCountFromSettings(game.minTargets, game.maxTargets)
  const numCapsules = initialCountFromSettings(game.minCapsules, game.maxCapsules)
  for (let i = 0; i < numTargets; i++) {
    createTargetEntity(world, gameContentGroup || scene, physicsWorld, AmmoLib, camera)
  }
  for (let i = 0; i < numCapsules; i++) {
    createCapsuleTargetEntity(world, gameContentGroup || scene, camera)
  }
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    hadPointerLock = true;
    document.getElementById('game-container').classList.add('playing');
  } else {
    document.getElementById('game-container').classList.remove('playing');
    // Don't auto-pause when pointer lock is lost due to entering VR
    if (hadPointerLock && gameStarted && !gamePaused && gameStateEntity && !isVRActive) {
      const state = gameStateEntity.getComponent(GameStateComponent);
      if (state && state.state !== 'gameover') {
        gamePaused = true;
        reenterFullscreenWhenPaused = !!document.fullscreenElement;
        showPauseMenu();
      }
    }
    hadPointerLock = false;
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

function animate(time, xrFrame) {
  if (!hasRenderedOnce) hasRenderedOnce = true;
  const delta = clock.getDelta();

  if (xrFrame && isVRActive) {
    updateVRFromFrame(xrFrame);
  }

  // Update ECS systems
  if (world) {
    world.update(delta);
  }

  if (audioContext) {
    if (isVRActive) {
      updateSpatialAudioListenerVR(vrViewerPosition, vrViewerQuaternion);
    } else if (camera) {
      updateSpatialAudioListener(camera);
    }
  }

  updateMovement(delta);

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Run after all sound vars/functions are defined (avoid TDZ)
tryStartThemeOnLoad();
onFirstUserGestureStartTheme();
