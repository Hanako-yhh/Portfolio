import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  createVarietasPlanet,
  type VarietasPlanetRuntime,
} from './planets/VarietasPlanet';

export type GeometryExperiencePhase = 'overview' | 'focusing' | 'focused' | 'returning';

export interface GeometrySystemExperienceOptions {
  onPhaseChange?: (phase: GeometryExperiencePhase) => void;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

interface CameraTransition {
  startedAt: number;
  duration: number;
  direction: 'in' | 'out';
  from: CameraPose;
  to: CameraPose;
}

interface PlaceholderPlanet {
  root: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  spinSpeed: number;
}

const TAU = Math.PI * 2;
const VARIETAS_RADIUS = 6.4;

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function createOrbit(radius: number, color = 0x304357): THREE.LineLoop {
  const positions: THREE.Vector3[] = [];
  for (let index = 0; index < 256; index += 1) {
    const angle = (index / 256) * TAU;
    positions.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(positions),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      toneMapped: false,
    }),
  );
}

function createStarfield(mobile: boolean): THREE.Points {
  const count = mobile ? 820 : 1800;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  let seed = 0x4e6f7665;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let index = 0; index < count; index += 1) {
    const radius = 170 + random() * 250;
    const theta = random() * TAU;
    const cosine = random() * 2 - 1;
    const sine = Math.sqrt(1 - cosine * cosine);
    positions[index * 3] = Math.cos(theta) * sine * radius;
    positions[index * 3 + 1] = cosine * radius;
    positions[index * 3 + 2] = Math.sin(theta) * sine * radius;
    sizes[index] = 0.7 + random() * 1.8;
  }

  const material = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      attribute float size;
      uniform float uPixelRatio;
      varying float vBrightness;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float attenuation = clamp(230.0 / -viewPosition.z, 0.32, 1.7);
        gl_PointSize = size * uPixelRatio * attenuation;
        gl_Position = projectionMatrix * viewPosition;
        vBrightness = smoothstep(0.7, 2.5, size);
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float radius = length(point);
        float alpha = 1.0 - smoothstep(0.06, 0.5, radius);
        vec3 color = mix(vec3(0.48, 0.63, 0.82), vec3(0.92, 0.96, 1.0), vBrightness);
        gl_FragColor = vec4(color, alpha * (0.46 + vBrightness * 0.42));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  return new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)).setAttribute('size', new THREE.BufferAttribute(sizes, 1)), material);
}

function createProceduralStar(): {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
} {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPosition;
      varying vec3 vNormal;

      float hash(vec3 point) {
        point = fract(point * 0.3183099 + 0.1);
        point *= 17.0;
        return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
      }

      float noise(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(mix(hash(cell), hash(cell + vec3(1,0,0)), local.x), mix(hash(cell + vec3(0,1,0)), hash(cell + vec3(1,1,0)), local.x), local.y),
          mix(mix(hash(cell + vec3(0,0,1)), hash(cell + vec3(1,0,1)), local.x), mix(hash(cell + vec3(0,1,1)), hash(cell + vec3(1,1,1)), local.x), local.y),
          local.z
        );
      }

      void main() {
        vec3 flow = normalize(vPosition) * 6.2 + vec3(uTime * 0.055, -uTime * 0.027, uTime * 0.019);
        float plasma = noise(flow) * 0.58 + noise(flow * 2.13) * 0.29 + noise(flow * 4.37) * 0.13;
        float limb = pow(max(0.0, vNormal.z), 0.2);
        vec3 deep = vec3(1.0, 0.12, 0.008);
        vec3 hot = vec3(1.0, 0.75, 0.26);
        vec3 color = mix(deep, hot, smoothstep(0.2, 0.94, plasma));
        color *= 1.3 + limb * 0.45;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(8.2, 6), material));

  const haloMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vViewPosition))), 2.25);
        gl_FragColor = vec4(vec3(1.0, 0.29, 0.035) * 1.9, fresnel * 0.34);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(11.4, 5), haloMaterial));
  return { group, material };
}

export class GeometrySystemExperience {
  private readonly container: HTMLElement;
  private readonly options: GeometrySystemExperienceOptions;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(43, 1, 0.08, 900);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly controls: OrbitControls;
  private readonly bloomPass: UnrealBloomPass;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly system = new THREE.Group();
  private readonly placeholderPlanets: PlaceholderPlanet[] = [];
  private readonly varietas: VarietasPlanetRuntime;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly resizeObserver: ResizeObserver;
  private readonly mobile: boolean;

  private phase: GeometryExperiencePhase = 'overview';
  private transition: CameraTransition | null = null;
  private overviewPose: CameraPose | null = null;
  private animationFrame = 0;
  private previousFrameTime = performance.now();
  private systemElapsed = 0;
  private planetElapsed = 0;
  private disposed = false;
  private pointerDown = new THREE.Vector2();
  private pointerMoved = false;

  constructor(container: HTMLElement, options: GeometrySystemExperienceOptions = {}) {
    this.container = container;
    this.options = options;
    this.mobile = container.clientWidth < 768 || window.matchMedia('(pointer: coarse)').matches;

    this.scene.background = new THREE.Color(0x010307);
    this.scene.fog = new THREE.FogExp2(0x02050a, 0.0018);

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.35 : 1.75));
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, this.mobile ? 104 : 70, this.mobile ? 178 : 132);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = this.mobile ? 0.34 : 0.44;
    this.controls.zoomSpeed = 0.52;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(45);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
    const overviewDistance = this.camera.position.length();
    this.controls.minDistance = overviewDistance * 0.9;
    this.controls.maxDistance = overviewDistance * 1.1;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this.mobile ? 0.62 : 0.78, 0.58, 0.88);
    this.composer.addPass(this.bloomPass);

    this.scene.add(this.system);
    const proceduralStar = createProceduralStar();
    this.starMaterial = proceduralStar.material;
    this.system.add(proceduralStar.group);
    this.system.add(new THREE.PointLight(0xffd6a2, this.mobile ? 2700 : 3400, 280, 1.85));
    this.scene.add(new THREE.HemisphereLight(0x1f3858, 0x020205, 0.24));
    this.scene.add(createStarfield(this.mobile));

    [22, 40, 61, 84].forEach((radius) => this.system.add(createOrbit(radius)));
    this.buildPlaceholderPlanets();

    this.varietas = createVarietasPlanet({ radius: VARIETAS_RADIUS, mobile: this.mobile });
    this.varietas.group.position.set(Math.cos(1.02) * 40, 0, Math.sin(1.02) * 40);
    this.system.add(this.varietas.group);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.bindEvents();
    this.resize();
    this.options.onPhaseChange?.(this.phase);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  focusVarietas(): void {
    if (this.phase !== 'overview') return;

    this.overviewPose = this.capturePose();
    const worldPosition = this.varietas.group.getWorldPosition(new THREE.Vector3());
    const starwardDirection = worldPosition.clone().negate().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const orbitalTangent = new THREE.Vector3().crossVectors(worldUp, starwardDirection).normalize();
    const approachDirection = starwardDirection
      .multiplyScalar(0.58)
      .add(orbitalTangent.multiplyScalar(0.78))
      .addScaledVector(worldUp, 0.16)
      .normalize();
    const focusPosition = worldPosition.clone()
      .addScaledVector(approachDirection, this.mobile ? VARIETAS_RADIUS * 6.5 : VARIETAS_RADIUS * 4.2)
      .add(new THREE.Vector3(0, this.mobile ? VARIETAS_RADIUS * 0.82 : VARIETAS_RADIUS * 0.28, 0));
    const focusTarget = worldPosition.clone();
    if (this.mobile) {
      // Aim slightly below the planet so the body occupies the upper visual
      // field while remaining fully inside the viewport above the mobile panel.
      focusTarget.y -= VARIETAS_RADIUS * 1.1;
    } else {
      // Off-axis framing leaves the right side free for the information panel
      // without pushing the planet limb outside the render area.
      const horizontalOffset = VARIETAS_RADIUS * 1.25;
      let viewDirection = worldPosition.clone().sub(focusPosition).normalize();
      let cameraRight = new THREE.Vector3().crossVectors(viewDirection, worldUp).normalize();
      for (let iteration = 0; iteration < 4; iteration += 1) {
        focusTarget.copy(worldPosition).addScaledVector(cameraRight, horizontalOffset);
        viewDirection = focusTarget.clone().sub(focusPosition).normalize();
        cameraRight = new THREE.Vector3().crossVectors(viewDirection, worldUp).normalize();
      }
      focusTarget.copy(worldPosition).addScaledVector(cameraRight, horizontalOffset);
    }

    this.controls.enabled = false;
    this.setFocusEnvironmentHidden(true);
    this.varietas.setFocused(true);
    this.setPhase('focusing');
    this.transition = {
      startedAt: performance.now(),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 240 : 1250,
      direction: 'in',
      from: this.capturePose(),
      to: { position: focusPosition, target: focusTarget, fov: this.mobile ? 43 : 40 },
    };
  }

  returnToOverview(): void {
    if ((this.phase !== 'focusing' && this.phase !== 'focused') || !this.overviewPose) return;

    this.setPhase('returning');
    this.transition = {
      startedAt: performance.now(),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 1050,
      direction: 'out',
      from: this.capturePose(),
      to: this.overviewPose,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    window.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.controls.dispose();

    const varietasObjects = new Set<string>();
    this.varietas.group.traverse((object: THREE.Object3D) => varietasObjects.add(object.uuid));
    this.scene.traverse((object) => {
      if (varietasObjects.has(object.uuid)) return;
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.varietas.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildPlaceholderPlanets(): void {
    const definitions = [
      { radius: 22, size: 2.8, color: 0xa44824, phase: 2.68, orbitSpeed: 0.012, spinSpeed: 0.16 },
      { radius: 61, size: 8.4, color: 0xb78450, phase: 4.44, orbitSpeed: 0.0045, spinSpeed: 0.1 },
      { radius: 84, size: 5.2, color: 0x335fb4, phase: 5.56, orbitSpeed: 0.0032, spinSpeed: 0.075 },
    ];

    definitions.forEach((definition, index) => {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(definition.size, this.mobile ? 3 : 5),
        new THREE.MeshStandardMaterial({
          color: definition.color,
          roughness: index === 0 ? 0.96 : 0.82,
          metalness: 0,
          emissive: new THREE.Color(definition.color).multiplyScalar(0.025),
        }),
      );
      root.add(mesh);
      root.position.set(Math.cos(definition.phase) * definition.radius, 0, Math.sin(definition.phase) * definition.radius);
      this.system.add(root);
      this.placeholderPlanets.push({
        root,
        mesh,
        orbitRadius: definition.radius,
        orbitSpeed: definition.orbitSpeed,
        phase: definition.phase,
        spinSpeed: definition.spinSpeed,
      });
    });
  }

  private bindEvents(): void {
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private capturePose(): CameraPose {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this.camera.fov,
    };
  }

  private setPhase(phase: GeometryExperiencePhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.options.onPhaseChange?.(phase);
  }

  private updateSystem(delta: number): void {
    if (this.phase !== 'overview') return;
    this.systemElapsed += delta;
    this.starMaterial.uniforms.uTime.value = this.systemElapsed;

    this.placeholderPlanets.forEach((planet) => {
      planet.phase += delta * planet.orbitSpeed;
      planet.root.position.set(Math.cos(planet.phase) * planet.orbitRadius, 0, Math.sin(planet.phase) * planet.orbitRadius);
      planet.mesh.rotation.y += delta * planet.spinSpeed;
    });

    const varietasPhase = 1.02 + this.systemElapsed * 0.008;
    this.varietas.group.position.set(Math.cos(varietasPhase) * 40, 0, Math.sin(varietasPhase) * 40);
  }

  private updateTransition(now: number): void {
    if (!this.transition) return;
    const progress = THREE.MathUtils.clamp((now - this.transition.startedAt) / this.transition.duration, 0, 1);
    const eased = easeInOutCubic(progress);
    this.camera.position.lerpVectors(this.transition.from.position, this.transition.to.position, eased);
    this.controls.target.lerpVectors(this.transition.from.target, this.transition.to.target, eased);
    this.camera.fov = THREE.MathUtils.lerp(this.transition.from.fov, this.transition.to.fov, eased);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);

    if (progress < 1) return;
    const direction = this.transition.direction;
    this.transition = null;
    if (direction === 'in') {
      this.setPhase('focused');
    } else {
      this.setFocusEnvironmentHidden(false);
      this.varietas.setFocused(false);
      this.controls.enabled = true;
      this.controls.update();
      this.setPhase('overview');
    }
  }

  private readonly animate = (now: number): void => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min((now - this.previousFrameTime) / 1000, 0.05);
    this.previousFrameTime = now;
    this.planetElapsed += delta;

    this.updateSystem(delta);
    this.updateTransition(now);
    if (this.phase === 'overview') this.controls.update();
    this.varietas.update(delta, this.planetElapsed, this.phase === 'focused' || this.phase === 'focusing');
    this.composer.render();
  };

  private setFocusEnvironmentHidden(hidden: boolean): void {
    this.system.children.forEach((object) => {
      if (object !== this.varietas.group) object.visible = !hidden;
    });
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  };

  private updatePointer(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  private isVarietasHit(): boolean {
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.varietas.pickMesh, true).length > 0;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown.set(event.clientX, event.clientY);
    this.pointerMoved = false;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 7) this.pointerMoved = true;
    if (this.phase !== 'overview' || event.pointerType === 'touch') return;
    this.updatePointer(event);
    this.renderer.domElement.style.cursor = this.isVarietasHit() ? 'pointer' : 'grab';
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerMoved) return;
    this.updatePointer(event);
    if (this.phase === 'overview' && this.isVarietasHit()) this.focusVarietas();
  };

  private readonly handlePointerLeave = (): void => {
    this.pointerMoved = false;
    this.renderer.domElement.style.cursor = this.phase === 'overview' ? 'grab' : 'default';
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.returnToOverview();
    if (event.key.toLowerCase() === 'v') this.focusVarietas();
  };

  private readonly handleVisibilityChange = (): void => {
    this.previousFrameTime = performance.now();
  };
}
