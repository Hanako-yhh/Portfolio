import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  mapOrbitRadius,
  mapPlanetRadius,
  planets,
  visualOrbitPeriod,
  type PlanetData,
} from '../data/system';

export type ExperiencePhase = 'overview' | 'focusing' | 'focused' | 'returning';

export interface ExperienceSnapshot {
  phase: ExperiencePhase;
  focusedPlanet: PlanetData | null;
  elapsedSeconds: number;
}

export interface PlanetScreenGuide {
  id: string;
  name: string;
  conceptLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  labelSide: 'left' | 'right';
}

interface PlanetRuntime {
  data: PlanetData;
  root: THREE.Group;
  mesh: THREE.Mesh;
  clouds?: THREE.Mesh;
  climateMaterial?: THREE.ShaderMaterial;
  climateElapsed: number;
  focusOnlyClimate: boolean;
  ringSystem?: THREE.Group;
  hoverOutline: THREE.Mesh;
  orbit: THREE.Line;
  visualRadius: number;
  orbitRadius: number;
  phase: number;
  frozen: boolean;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

interface CameraTransition {
  startedAt: number;
  duration: number;
  from: CameraPose;
  to: CameraPose;
  direction: 'in' | 'out';
  targetPlanet: PlanetRuntime;
}

const TAU = Math.PI * 2;

function easeOutQuint(value: number): number {
  return 1 - (1 - value) ** 5;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function createRadialTexture(inner: string, middle: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.38, middle);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCoronaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.4, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.48, 'rgba(255,226,148,0.64)');
  gradient.addColorStop(0.62, 'rgba(255,119,22,0.27)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlanetTexture(data: PlanetData): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, data.palette[0]);
  gradient.addColorStop(0.5, data.palette[1]);
  gradient.addColorStop(1, data.palette[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let seed = data.name.length * 971;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  if (data.kind === 'gas-giant' || data.kind === 'ice-giant') {
    for (let index = 0; index < 46; index += 1) {
      const y = random() * canvas.height;
      const height = 2 + random() * 18;
      context.fillStyle = `${data.palette[index % data.palette.length]}${Math.floor(35 + random() * 80)
        .toString(16)
        .padStart(2, '0')}`;
      context.fillRect(0, y, canvas.width, height);
    }
  } else {
    for (let index = 0; index < 180; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 2 + random() * 34;
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fillStyle = `${data.palette[index % data.palette.length]}${Math.floor(24 + random() * 52)
        .toString(16)
        .padStart(2, '0')}`;
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createSeamlessEquirectangularTexture(source: THREE.Texture): THREE.CanvasTexture {
  const image = source.image as HTMLImageElement;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const original = new Uint8ClampedArray(pixels);
  const seamWidth = Math.max(24, Math.min(96, Math.round(width * 0.045)));

  for (let y = 0; y < height; y += 1) {
    for (let offset = 0; offset < seamWidth; offset += 1) {
      const progress = offset / seamWidth;
      const eased = progress * progress * (3 - 2 * progress);
      const crossfade = 0.5 * (1 - eased);
      const leftPixel = (y * width + offset) * 4;
      const rightPixel = (y * width + (width - 1 - offset)) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const left = original[leftPixel + channel];
        const right = original[rightPixel + channel];
        pixels[leftPixel + channel] = Math.round(left * (1 - crossfade) + right * crossfade);
        pixels[rightPixel + channel] = Math.round(right * (1 - crossfade) + left * crossfade);
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = source.colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = source.wrapT;
  texture.anisotropy = source.anisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createPelagosSurfaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d')!;

  const atmosphere = context.createLinearGradient(0, 0, 0, canvas.height);
  atmosphere.addColorStop(0, '#071746');
  atmosphere.addColorStop(0.12, '#0b2b76');
  atmosphere.addColorStop(0.34, '#1449b5');
  atmosphere.addColorStop(0.54, '#1857d1');
  atmosphere.addColorStop(0.76, '#103c9f');
  atmosphere.addColorStop(1, '#06143e');
  context.fillStyle = atmosphere;
  context.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 7481;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  context.save();
  context.filter = 'blur(18px)';
  for (let index = 0; index < 22; index += 1) {
    const centerY = 70 + random() * (canvas.height - 140);
    const halfHeight = 12 + random() * 48;
    const band = context.createLinearGradient(0, centerY - halfHeight, 0, centerY + halfHeight);
    band.addColorStop(0, 'rgba(110,160,255,0)');
    band.addColorStop(0.5, `rgba(94,151,255,${0.018 + random() * 0.032})`);
    band.addColorStop(1, 'rgba(40,83,190,0)');
    context.fillStyle = band;
    context.fillRect(0, centerY - halfHeight, canvas.width, halfHeight * 2);
  }
  context.restore();

  context.save();
  context.filter = 'blur(8px)';
  context.lineCap = 'round';
  for (let index = 0; index < 34; index += 1) {
    const y = 110 + random() * 810;
    const lift = (random() - 0.5) * 64;
    context.beginPath();
    context.moveTo(-180, y);
    context.bezierCurveTo(460, y + lift, 1260, y - lift * 0.7, canvas.width + 180, y + lift * 0.25);
    context.strokeStyle = `rgba(130,181,255,${0.014 + random() * 0.035})`;
    context.lineWidth = 3 + random() * 14;
    context.stroke();
  }
  context.restore();

  context.save();
  context.translate(780, 590);
  context.scale(1.35, 0.78);
  context.filter = 'blur(52px)';
  const darkSpot = context.createRadialGradient(0, 0, 4, 0, 0, 116);
  darkSpot.addColorStop(0, 'rgba(3,13,66,0.2)');
  darkSpot.addColorStop(0.48, 'rgba(7,24,95,0.1)');
  darkSpot.addColorStop(1, 'rgba(12,47,139,0)');
  context.fillStyle = darkSpot;
  context.beginPath();
  context.arc(0, 0, 138, 0, TAU);
  context.fill();
  context.restore();

  context.save();
  context.filter = 'blur(15px)';
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(560, 520);
  context.bezierCurveTo(705, 486, 890, 486, 1044, 524);
  context.strokeStyle = 'rgba(188,220,255,0.12)';
  context.lineWidth = 11;
  context.stroke();
  context.beginPath();
  context.moveTo(628, 610);
  context.bezierCurveTo(770, 640, 930, 625, 1090, 580);
  context.strokeStyle = 'rgba(148,198,255,0.08)';
  context.lineWidth = 8;
  context.stroke();
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createHavenClimateMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCloudMap: { value: null },
      uClimateTime: { value: 0 },
      uFocus: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uCloudMap;
      uniform float uClimateTime;
      uniform float uFocus;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
          local.y
        );
      }

      float cloudDensity(vec2 sampleUv) {
        sampleUv.x = fract(sampleUv.x);
        sampleUv.y = clamp(sampleUv.y, 0.004, 0.996);
        vec3 cloud = texture2D(uCloudMap, sampleUv).rgb;
        return smoothstep(0.025, 0.52, dot(cloud, vec3(0.2126, 0.7152, 0.0722)));
      }

      void main() {
        float latitude = (vUv.y - 0.5) * 3.14159265;
        float latitudeSpeed = 0.55 + 0.6 * pow(abs(cos(latitude)), 1.4);
        float time = uClimateTime;
        float wave = sin(latitude * 7.0 + time * 0.035) * 0.0035 * uFocus;

        vec2 primaryUv = vec2(
          vUv.x + time * 0.00155 * latitudeSpeed * uFocus + wave,
          vUv.y + sin(vUv.x * 18.0 + time * 0.018) * 0.0022 * uFocus
        );

        float primaryClouds = cloudDensity(primaryUv);
        float evolvingNoise = noise(vec2(vUv.x * 22.0 - time * 0.004, vUv.y * 13.0 + time * 0.002));
        float activeClouds = primaryClouds;
        activeClouds *= mix(1.0, mix(0.9, 1.14, evolvingNoise), uFocus);
        activeClouds = pow(clamp(activeClouds, 0.0, 1.0), 0.72);
        float density = activeClouds;

        vec3 normal = normalize(vWorldNormal);
        vec3 lightDirection = normalize(-vWorldPosition);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float directLight = max(0.0, dot(normal, lightDirection));
        float horizon = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.0);
        float illumination = 0.1 + directLight * 0.9;

        vec3 daylight = mix(vec3(0.8, 0.87, 0.93), vec3(0.97, 0.985, 1.0), directLight);
        float cloudDepth = mix(0.84, 1.06, smoothstep(0.26, 0.9, density));
        vec3 cloudColor = daylight * illumination * cloudDepth
          + vec3(0.12, 0.24, 0.34) * horizon * directLight * 0.34;
        float alpha = density * mix(0.42, 0.76, uFocus);
        alpha *= mix(0.52, 1.0, directLight);
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(cloudColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

function createProceduralClimateMaterial(data: PlanetData): THREE.ShaderMaterial {
  const variants = {
    cinder: {
      mode: 0,
      lowColor: 0x6f2413,
      highColor: 0xf19a58,
      opacity: 0.28,
      speed: 0.026,
    },
    aurelia: {
      mode: 1,
      lowColor: 0x7b5433,
      highColor: 0xead0a6,
      opacity: 0.26,
      speed: 0.017,
    },
    pelagos: {
      mode: 2,
      lowColor: 0x5577bc,
      highColor: 0x91aadd,
      opacity: 0.28,
      speed: 0.016,
    },
  } as const;
  const variant = variants[data.id as keyof typeof variants] ?? variants.pelagos;

  return new THREE.ShaderMaterial({
    uniforms: {
      uClimateTime: { value: 0 },
      uFocus: { value: 0 },
      uLowColor: { value: new THREE.Color(variant.lowColor) },
      uHighColor: { value: new THREE.Color(variant.highColor) },
      uOpacity: { value: variant.opacity },
      uSpeed: { value: variant.speed },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vLocalNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vLocalNormal = normalize(normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      #define CLIMATE_MODE ${variant.mode}

      uniform float uClimateTime;
      uniform float uFocus;
      uniform vec3 uLowColor;
      uniform vec3 uHighColor;
      uniform float uOpacity;
      uniform float uSpeed;

      varying vec2 vUv;
      varying vec3 vLocalNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      float hash3(vec3 point) {
        point = fract(point * 0.1031);
        point += dot(point, point.yzx + 33.33);
        return fract((point.x + point.y) * point.z);
      }

      float noise3(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(
            mix(hash3(cell), hash3(cell + vec3(1.0, 0.0, 0.0)), local.x),
            mix(hash3(cell + vec3(0.0, 1.0, 0.0)), hash3(cell + vec3(1.0, 1.0, 0.0)), local.x),
            local.y
          ),
          mix(
            mix(hash3(cell + vec3(0.0, 0.0, 1.0)), hash3(cell + vec3(1.0, 0.0, 1.0)), local.x),
            mix(hash3(cell + vec3(0.0, 1.0, 1.0)), hash3(cell + vec3(1.0, 1.0, 1.0)), local.x),
            local.y
          ),
          local.z
        );
      }

      float fbm3(vec3 point) {
        float value = 0.0;
        float amplitude = 0.56;
        for (int octave = 0; octave < 3; octave += 1) {
          value += noise3(point) * amplitude;
          point = point * 2.03 + vec3(7.1, 3.7, 5.9);
          amplitude *= 0.48;
        }
        return value;
      }

      vec3 rotateAroundY(vec3 point, float angle) {
        float sine = sin(angle);
        float cosine = cos(angle);
        point.xz = mat2(cosine, -sine, sine, cosine) * point.xz;
        return point;
      }

      void main() {
        vec3 samplePosition = rotateAroundY(normalize(vLocalNormal), uClimateTime * uSpeed);
        float density;
        float textureMix;
        float darkFeature = 0.0;
        float brightFeature = 0.0;

        #if CLIMATE_MODE == 0
          vec3 dustPosition = samplePosition * vec3(6.8, 3.4, 6.8);
          float broadDust = fbm3(dustPosition + vec3(uClimateTime * 0.018, 0.0, -uClimateTime * 0.012));
          float dustDetail = fbm3(dustPosition * 1.9 - vec3(0.0, uClimateTime * 0.025, 0.0));
          density = smoothstep(0.53, 0.78, broadDust * 0.72 + dustDetail * 0.28);
          density *= 0.62 + 0.38 * smoothstep(0.15, 0.95, 1.0 - abs(samplePosition.y));
          textureMix = dustDetail;
        #elif CLIMATE_MODE == 1
          vec3 convectionPosition = samplePosition * vec3(4.4, 4.9, 4.4);
          vec3 warp = vec3(
            fbm3(convectionPosition + vec3(2.7, 0.0, uClimateTime * 0.01)),
            fbm3(convectionPosition + vec3(0.0, 5.3, -uClimateTime * 0.008)),
            fbm3(convectionPosition + vec3(-4.1, 1.9, 0.0))
          ) - 0.5;
          float convection = fbm3(convectionPosition + warp * 1.35);
          float turbulentDetail = fbm3(convectionPosition * 2.15 - warp * 0.7);
          density = smoothstep(0.55, 0.79, convection * 0.74 + turbulentDetail * 0.26);
          textureMix = turbulentDetail;
        #else
          vec3 slowHazePosition = samplePosition * vec3(3.0, 4.6, 3.0)
            + vec3(uClimateTime * 0.005, -uClimateTime * 0.002, uClimateTime * 0.003);
          float broadHaze = fbm3(slowHazePosition);
          float middleHaze = fbm3(
            samplePosition * vec3(6.2, 7.8, 6.2)
            + vec3(-uClimateTime * 0.007, 3.4, uClimateTime * 0.004)
          );
          float fineHaze = fbm3(
            samplePosition * vec3(13.0, 15.0, 13.0)
            + vec3(uClimateTime * 0.009, -2.1, -uClimateTime * 0.006)
          );
          float frostedField = broadHaze * 0.58 + middleHaze * 0.31 + fineHaze * 0.11;
          float frostedVariation = smoothstep(0.3, 0.76, frostedField);
          float latitude = asin(clamp(samplePosition.y, -1.0, 1.0));
          float broadBand = 0.5 + 0.5 * sin(latitude * 9.0 + (broadHaze - 0.5) * 2.8);

          vec2 stormCenter = vec2(fract(0.36 + uClimateTime * 0.00018), 0.62);
          vec2 stormCoordinates = vUv - stormCenter;
          stormCoordinates.x -= floor(stormCoordinates.x + 0.5);
          stormCoordinates.x *= 2.0;
          float stormDistance = length(vec2(stormCoordinates.x * 0.64, stormCoordinates.y * 1.5));
          darkFeature = smoothstep(0.24, 0.035, stormDistance) * mix(0.64, 0.86, middleHaze);

          float stormAngle = atan(stormCoordinates.y, stormCoordinates.x);
          float stormArc = 0.5 + 0.5 * sin(stormAngle * 2.4 - stormDistance * 34.0 + uClimateTime * 0.026);
          float stormEnvelope = smoothstep(0.3, 0.04, stormDistance) * smoothstep(0.025, 0.075, stormDistance);
          brightFeature = smoothstep(0.56, 0.88, stormArc)
            * stormEnvelope
            * smoothstep(0.3, 0.78, middleHaze);

          vec2 secondaryStormCenter = vec2(fract(0.8 - uClimateTime * 0.00012), 0.48);
          vec2 secondaryCoordinates = vUv - secondaryStormCenter;
          secondaryCoordinates.x -= floor(secondaryCoordinates.x + 0.5);
          secondaryCoordinates.x *= 2.0;
          float secondaryDistance = length(vec2(secondaryCoordinates.x * 0.7, secondaryCoordinates.y * 1.6));
          float secondaryDark = smoothstep(0.2, 0.03, secondaryDistance) * mix(0.62, 0.84, broadHaze);
          float secondaryAngle = atan(secondaryCoordinates.y, secondaryCoordinates.x);
          float secondaryArc = 0.5 + 0.5 * sin(
            secondaryAngle * 2.15 + secondaryDistance * 31.0 - uClimateTime * 0.02
          );
          float secondaryEnvelope = smoothstep(0.26, 0.035, secondaryDistance)
            * smoothstep(0.03, 0.075, secondaryDistance);
          float secondaryBright = smoothstep(0.58, 0.9, secondaryArc)
            * secondaryEnvelope
            * smoothstep(0.34, 0.8, middleHaze);
          darkFeature = max(darkFeature, secondaryDark * 0.48);
          brightFeature = max(brightFeature, secondaryBright * 0.46);

          density = mix(0.5, 0.68, frostedVariation);
          density += (broadBand - 0.5) * mix(0.035, 0.06, middleHaze);
          density = clamp(density + darkFeature * 0.045 + brightFeature * 0.1, 0.0, 1.0);
          textureMix = mix(
            0.34,
            0.64,
            smoothstep(0.22, 0.82, middleHaze * 0.7 + broadHaze * 0.3)
          );
          textureMix = clamp(textureMix + brightFeature * 0.12, 0.0, 1.0);
        #endif

        density = clamp(density, 0.0, 1.0);
        vec3 normal = normalize(vWorldNormal);
        vec3 lightDirection = normalize(-vWorldPosition);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float directLight = max(0.0, dot(normal, lightDirection));
        float horizon = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.0);
        float illumination = 0.075 + directLight * 0.925;
        vec3 climateColor = mix(uLowColor, uHighColor, smoothstep(0.26, 0.88, textureMix));
        climateColor *= illumination;
        climateColor += uHighColor * horizon * directLight * 0.12;
        #if CLIMATE_MODE == 2
          vec3 darkStormColor = vec3(0.018, 0.055, 0.24) * (0.18 + directLight * 0.82);
          climateColor = mix(climateColor, darkStormColor, darkFeature * 0.2);
          climateColor = mix(climateColor, uHighColor * illumination * 1.05, brightFeature * 0.34);
        #endif

        float alpha = density * uOpacity * uFocus;
        alpha *= mix(0.4, 1.0, directLight);
        #if CLIMATE_MODE == 2
          alpha *= 0.92 + horizon * 0.28;
        #endif
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(climateColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

function createDebrisRing(planetRadius: number): THREE.Group {
  const ring = new THREE.Group();
  ring.name = 'Aurelia debris ring';
  const rockCount = window.innerWidth < 768 ? 820 : 1500;
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
    emissive: 0x2b2117,
    emissiveIntensity: 0.52,
  });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
  const dummy = new THREE.Object3D();
  const rockColor = new THREE.Color();
  const rockPalette = [0x554a3f, 0x72614e, 0x90795d, 0xb09672, 0xc9b18d];
  const lanes = [0.03, 0.1, 0.18, 0.31, 0.39, 0.54, 0.68, 0.76, 0.9, 0.97];
  let seed = 8263;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const innerRadius = planetRadius * 1.55;
  const outerRadius = planetRadius * 1.93;
  const ringWidth = outerRadius - innerRadius;

  for (let index = 0; index < rockCount; index += 1) {
    const angle = random() * TAU;
    const lane = lanes[Math.floor(random() * lanes.length)];
    const radius = innerRadius + lane * ringWidth + (random() - 0.5) * ringWidth * 0.035;
    const size = planetRadius * (0.012 + random() ** 5 * 0.052) * 0.2;
    dummy.position.set(Math.cos(angle) * radius, (random() - 0.5) * planetRadius * 0.075, Math.sin(angle) * radius);
    dummy.rotation.set(random() * TAU, random() * TAU, random() * TAU);
    dummy.scale.set(
      size * (0.58 + random() * 0.85),
      size * (0.34 + random() * 0.48),
      size * (0.58 + random() * 0.92),
    );
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
    rockColor.setHex(rockPalette[Math.floor(random() * rockPalette.length)]).offsetHSL(0, (random() - 0.5) * 0.08, (random() - 0.5) * 0.08);
    rocks.setColorAt(index, rockColor);
  }
  rocks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  ring.add(rocks);

  const dustCount = window.innerWidth < 768 ? 2200 : 4200;
  const dustGeometry = new THREE.TetrahedronGeometry(1, 0);
  const dustMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
    emissive: 0x21180f,
    emissiveIntensity: 0.38,
  });
  const dust = new THREE.InstancedMesh(dustGeometry, dustMaterial, dustCount);
  const dustPointPositions = new Float32Array(dustCount * 3);
  const dustPointColors = new Float32Array(dustCount * 3);
  for (let index = 0; index < dustCount; index += 1) {
    const angle = random() * TAU;
    const lane = lanes[Math.floor(random() * lanes.length)];
    const radius = innerRadius + lane * ringWidth + (random() - 0.5) * ringWidth * 0.06;
    const size = planetRadius * (0.0035 + random() * 0.0085);
    dummy.position.set(Math.cos(angle) * radius, (random() - 0.5) * planetRadius * 0.055, Math.sin(angle) * radius);
    dustPointPositions[index * 3] = dummy.position.x;
    dustPointPositions[index * 3 + 1] = dummy.position.y;
    dustPointPositions[index * 3 + 2] = dummy.position.z;
    dummy.rotation.set(random() * TAU, random() * TAU, random() * TAU);
    dummy.scale.set(size * (0.55 + random() * 0.7), size * (0.35 + random() * 0.5), size * (0.55 + random() * 0.8));
    dummy.updateMatrix();
    dust.setMatrixAt(index, dummy.matrix);
    rockColor.setHex(rockPalette[1 + Math.floor(random() * (rockPalette.length - 1))]);
    dust.setColorAt(index, rockColor);
    dustPointColors[index * 3] = rockColor.r;
    dustPointColors[index * 3 + 1] = rockColor.g;
    dustPointColors[index * 3 + 2] = rockColor.b;
  }
  dust.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  if (dust.instanceColor) dust.instanceColor.needsUpdate = true;
  ring.add(dust);

  const dustPointGeometry = new THREE.BufferGeometry();
  dustPointGeometry.setAttribute('position', new THREE.BufferAttribute(dustPointPositions, 3));
  dustPointGeometry.setAttribute('color', new THREE.BufferAttribute(dustPointColors, 3));
  const dustPointMaterial = new THREE.ShaderMaterial({
    vertexColors: true,
    vertexShader: `
      varying vec3 vColor;
      varying float vLight;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec3 radialDirection = normalize(mat3(modelMatrix) * position);
        vec3 lightDirection = normalize(-worldPosition.xyz);
        vLight = 0.2 + 0.8 * max(0.0, dot(radialDirection, lightDirection));
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(220.0 / max(1.0, -viewPosition.z), 1.0, 2.6);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vLight;
      void main() {
        float distanceToCenter = length(gl_PointCoord - vec2(0.5));
        float alpha = 1.0 - smoothstep(0.22, 0.5, distanceToCenter);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor * vLight, alpha * 0.72);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  ring.add(new THREE.Points(dustPointGeometry, dustPointMaterial));
  return ring;
}

function createOrbit(radius: number, eccentricity: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  const semiMinor = radius * Math.sqrt(1 - eccentricity ** 2);
  const focusOffset = radius * eccentricity;
  for (let index = 0; index <= 180; index += 1) {
    const angle = (index / 180) * TAU;
    points.push(new THREE.Vector3(Math.cos(angle) * radius - focusOffset, 0, Math.sin(angle) * semiMinor));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x6c8093,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  return new THREE.Line(geometry, material);
}

function createStarfield(): THREE.Points {
  const count = window.innerWidth < 768 ? 1800 : 4200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    // Keep the random shell outside the overview camera's zoom range. Points
    // that can approach the camera turn into oversized screen-space blocks.
    const radius = 320 + Math.random() * 96;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    color.setHSL(0.55 + (Math.random() - 0.5) * 0.12, 0.35, 0.68 + Math.random() * 0.26);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.76 },
    },
    vertexShader: `
      varying vec3 vColor;
      #include <fog_pars_vertex>
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(175.0 / max(1.0, -mvPosition.z), 0.72, 2.25);
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      #include <fog_pars_fragment>
      void main() {
        float radialDistance = length(gl_PointCoord - vec2(0.5));
        float halo = 1.0 - smoothstep(0.18, 0.5, radialDistance);
        float core = 1.0 - smoothstep(0.0, 0.24, radialDistance);
        float alpha = (halo * 0.54 + core * 0.46) * uOpacity;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <fog_fragment>
      }
    `,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

export class NoventureExperience {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly planetRuntimes: PlanetRuntime[] = [];
  private readonly loadedTextures = new Set<THREE.Texture>();
  private starfield: THREE.Points | null = null;
  private systemDust: THREE.Points | null = null;
  private backgroundNebula: THREE.Mesh | null = null;
  private readonly listeners = new Set<(snapshot: ExperienceSnapshot) => void>();
  private animationFrame = 0;
  private phase: ExperiencePhase = 'overview';
  private focusedPlanet: PlanetRuntime | null = null;
  private transition: CameraTransition | null = null;
  private overviewPose: CameraPose | null = null;
  private elapsedSeconds = 0;
  private pointerStart = { x: 0, y: 0, time: 0 };
  private hoveredPlanet: PlanetRuntime | null = null;
  private interactionGuideActive = false;
  private disposed = false;
  private lastFrameTime = performance.now();
  private readonly overviewDirection = new THREE.Vector3(0, 72, 132).normalize();

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.25 : 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.domElement.setAttribute('aria-label', 'Noventure 交互式恒星系');
    this.renderer.domElement.className = 'noventure-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x010207);
    this.scene.fog = new THREE.FogExp2(0x010207, 0.0018);

    const initialAspect = container.clientWidth / Math.max(1, container.clientHeight);
    if (initialAspect < 1) this.camera.fov = 48;
    this.camera.position.copy(this.overviewDirection).multiplyScalar(150);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = window.matchMedia('(pointer: coarse)').matches ? 0.32 : 0.42;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(52);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    const distance = this.camera.position.length();
    this.controls.minDistance = distance * 0.9;
    this.controls.maxDistance = distance * 1.1;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.72, 0.42, 1.08);
    this.composer.addPass(bloom);

    this.buildScene();
    this.bindEvents();
    this.resize();
    this.frameWholeSystem();
    this.animate();
  }

  subscribe(listener: (snapshot: ExperienceSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  focusPlanetById(id: string): void {
    if (this.interactionGuideActive) return;
    const planet = this.planetRuntimes.find((candidate) => candidate.data.id === id);
    if (planet && this.phase === 'overview') this.startFocus(planet);
  }

  setInteractionGuideActive(active: boolean): void {
    this.interactionGuideActive = active;
    if (active && this.phase === 'overview') this.frameWholeSystem();
    this.controls.enabled = !active && this.phase === 'overview';
    if (active) this.setHoveredPlanet(null);
    this.lastFrameTime = performance.now();
  }

  getPlanetScreenGuides(): PlanetScreenGuide[] {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    return this.planetRuntimes.map((planet) => {
      const worldCenter = planet.root.getWorldPosition(new THREE.Vector3());
      const projectedCenter = worldCenter.clone().project(this.camera);
      const projectedEdge = worldCenter
        .clone()
        .addScaledVector(cameraRight, planet.visualRadius * 1.25)
        .project(this.camera);
      const x = (projectedCenter.x * 0.5 + 0.5) * bounds.width;
      const y = (-projectedCenter.y * 0.5 + 0.5) * bounds.height;
      const projectedRadius = Math.abs(projectedEdge.x - projectedCenter.x) * bounds.width * 0.5;
      const diameter = THREE.MathUtils.clamp(projectedRadius * 2 + 16, 30, 118);
      const width = diameter * (planet.data.hasRings ? 1.5 : 1);
      const height = diameter * (planet.data.hasRings ? 1.16 : 1);
      const visible = projectedCenter.z > -1
        && projectedCenter.z < 1
        && x + width * 0.5 > 0
        && x - width * 0.5 < bounds.width
        && y + height * 0.5 > 0
        && y - height * 0.5 < bounds.height;

      return {
        id: planet.data.id,
        name: planet.data.name,
        conceptLabel: planet.data.conceptLabel,
        x,
        y,
        width,
        height,
        visible,
        labelSide: x > bounds.width * 0.7 ? 'left' : 'right',
      };
    });
  }

  returnToOverview(): void {
    if ((this.phase !== 'focused' && this.phase !== 'focusing') || !this.focusedPlanet || !this.overviewPose) return;
    const currentPose = this.capturePose();
    this.phase = 'returning';
    this.transition = {
      startedAt: performance.now(),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 900,
      from: currentPose,
      to: this.overviewPose,
      direction: 'out',
      targetPlanet: this.focusedPlanet,
    };
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          const textured = material as THREE.Material & { map?: THREE.Texture };
          textured.map?.dispose();
          material.dispose();
        });
      }
    });
    this.loadedTextures.forEach((texture) => texture.dispose());
    this.loadedTextures.clear();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildScene(): void {
    this.starfield = createStarfield();
    this.scene.add(this.starfield);

    const starMapMaterial = new THREE.MeshBasicMaterial({
      color: 0x36465c,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const starMap = new THREE.Mesh(new THREE.SphereGeometry(430, 64, 40), starMapMaterial);
    this.scene.add(starMap);
    const starMapTexturePath = window.innerWidth < 768
      ? '/assets/backgrounds/deep-star-map-2020-hd-v1-mobile.jpg'
      : '/assets/backgrounds/deep-star-map-2020-hd-v1-web.jpg';
    this.loadTexture(starMapTexturePath, (texture) => {
      const seamlessTexture = createSeamlessEquirectangularTexture(texture);
      this.loadedTextures.delete(texture);
      texture.dispose();
      this.loadedTextures.add(seamlessTexture);
      starMapMaterial.map = seamlessTexture;
      starMapMaterial.color.set(0x899bb1);
      starMapMaterial.needsUpdate = true;
    });

    const nebulaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: createRadialTexture('rgba(58,76,111,0.25)', 'rgba(28,25,56,0.08)', 'rgba(0,0,0,0)') },
        uOpacity: { value: 0.052 },
      },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying vec2 vUv;
        void main(){
          vec4 sampleColor=texture2D(uMap,vUv);
          float edge=1.0-smoothstep(0.5,1.0,length(vUv*2.0-1.0));
          float luminance=dot(sampleColor.rgb,vec3(0.2126,0.7152,0.0722));
          float alpha=edge*uOpacity*smoothstep(0.018,0.48,luminance);
          gl_FragColor=vec4(sampleColor.rgb*0.38,alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const nebula = new THREE.Mesh(new THREE.PlaneGeometry(255, 198), nebulaMaterial);
    nebula.position.set(-88, 36, -250);
    nebula.renderOrder = -1;
    this.backgroundNebula = nebula;
    this.scene.add(nebula);
    this.loadTexture('/assets/backgrounds/ldn-483.jpg', (texture) => {
      nebulaMaterial.uniforms.uMap.value = texture;
    });

    const system = new THREE.Group();
    system.rotation.x = THREE.MathUtils.degToRad(24);
    system.rotation.y = THREE.MathUtils.degToRad(-14);
    this.scene.add(system);

    const starGeometry = new THREE.SphereGeometry(8, 72, 48);
    const fallbackStarTexture = createPlanetTexture({
      ...planets[0],
      name: 'Noventure A',
      palette: ['#5f1305', '#f06a12', '#ffd58a'],
    });
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: fallbackStarTexture } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalW;
        void main() {
          vUv = uv;
          vNormalW = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vNormalW;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
        }
        void main() {
          vec2 flow = vUv * vec2(14.0, 7.0) + vec2(uTime * 0.035, -uTime * 0.018);
          float n = noise(flow) * .62 + noise(flow * 2.17) * .25 + noise(flow * 4.31) * .13;
          vec3 solar = texture2D(uMap, vec2(fract(vUv.x + uTime * .0008), vUv.y)).rgb;
          float limb = pow(max(0.0, dot(normalize(vNormalW), vec3(0.,0.,1.))), .22);
          vec3 mappedSolar = pow(solar, vec3(.9));
          vec3 baseColor = vec3(1.0, .6, .18);
          vec3 surface = mix(baseColor, mappedSolar, .1) * 1.35;
          vec3 color = surface * (.84 + limb * .12) + vec3(.24,.04,.004) * n * .025;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    starMesh.name = 'Noventure A';
    system.add(starMesh);
    this.loadTexture('/assets/textures/sun.jpg', (texture) => {
      starMaterial.uniforms.uMap.value = texture;
      fallbackStarTexture.dispose();
    });

    const glowMaterial = new THREE.SpriteMaterial({
      map: createCoronaTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(34, 34, 1);
    system.add(glow);

    const pointLight = new THREE.PointLight(0xffdfbd, 3600, 260, 2);
    system.add(pointLight);
    system.add(new THREE.AmbientLight(0x25364d, 0.68));

    planets.forEach((data) => {
      const orbitRadius = mapOrbitRadius(data.semiMajorAxisAu);
      const visualRadius = mapPlanetRadius(data.radiusEarth);
      const orbit = createOrbit(orbitRadius, data.eccentricity);
      orbit.rotation.z = THREE.MathUtils.degToRad(data.inclinationDeg);
      system.add(orbit);

      const root = new THREE.Group();
      root.rotation.z = THREE.MathUtils.degToRad(data.obliquityDeg);
      system.add(root);

      const isCinder = data.id === 'cinder';
      const isHaven = data.id === 'haven';
      const isGasGiant = data.kind === 'gas-giant';
      const isIceGiant = data.kind === 'ice-giant';
      const surfaceTexture = isIceGiant ? createPelagosSurfaceTexture() : createPlanetTexture(data);
      surfaceTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.MeshPhysicalMaterial({
        map: surfaceTexture,
        color: '#ffffff',
        emissive: isIceGiant ? new THREE.Color(0x5279ff) : new THREE.Color(0x000000),
        emissiveMap: isIceGiant ? surfaceTexture : null,
        emissiveIntensity: isIceGiant ? 0.42 : 0,
        roughness: isCinder ? 0.98 : isHaven ? 0.84 : isGasGiant ? 0.86 : 0.68,
        metalness: 0,
        specularIntensity: isHaven ? 0.18 : 1,
        clearcoat: isHaven ? 0 : isIceGiant ? 0.3 : 0,
        clearcoatRoughness: isIceGiant ? 0.4 : 0.56,
        sheen: isGasGiant ? 0.3 : isIceGiant ? 0.26 : 0,
        sheenColor: new THREE.Color(data.palette[2]),
        sheenRoughness: isGasGiant ? 0.76 : 0.64,
      });
      if (isIceGiant) {
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vNovWorldPosition;\nvarying vec3 vNovWorldNormal;',
            )
            .replace(
              '#include <normal_vertex>',
              '#include <normal_vertex>\nvNovWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
            )
            .replace(
              '#include <project_vertex>',
              '#include <project_vertex>\nvNovWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vNovWorldPosition;\nvarying vec3 vNovWorldNormal;',
            )
            .replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
              vec3 novStarDirection = normalize(-vNovWorldPosition);
              float novLightFacing = dot(normalize(vNovWorldNormal), novStarDirection);
              float novDayMask = smoothstep(-0.42, 0.62, novLightFacing);
              novDayMask = pow(novDayMask, 1.18);
              totalEmissiveRadiance *= novDayMask;`,
            );
        };
        material.customProgramCacheKey = () => 'ratio-day-side-emissive-mask-v4-soft-terminator';
      }
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(visualRadius, 64, 40), material);
      mesh.userData.planetId = data.id;
      root.add(mesh);

      const outlineColor = new THREE.Color(data.palette[1]).lerp(new THREE.Color(data.palette[2]), 0.68).offsetHSL(0, 0.1, 0.05);
      const hoverOutline = new THREE.Mesh(
        new THREE.SphereGeometry(visualRadius * 1.055, 64, 40),
        new THREE.MeshBasicMaterial({
          color: outlineColor,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.82,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      hoverOutline.visible = false;
      root.add(hoverOutline);

      this.loadTexture(data.texturePath, (texture) => {
        const resolvedTexture = isHaven || isIceGiant
          ? createSeamlessEquirectangularTexture(texture)
          : texture;
        if (resolvedTexture !== texture) {
          this.loadedTextures.delete(texture);
          texture.dispose();
          this.loadedTextures.add(resolvedTexture);
        }
        const fallbackTexture = material.map;
        material.map = resolvedTexture;
        if (isIceGiant) material.emissiveMap = resolvedTexture;
        if (isCinder || isHaven) {
          material.bumpMap = resolvedTexture;
          material.bumpScale = isCinder ? 0.18 : 0.035;
        }
        fallbackTexture?.dispose();
        material.needsUpdate = true;
      });

      let clouds: THREE.Mesh | undefined;
      let climateMaterial: THREE.ShaderMaterial | undefined;
      const focusOnlyClimate = !isHaven;
      const cloudMaterial = isHaven ? createHavenClimateMaterial() : createProceduralClimateMaterial(data);
      if (cloudMaterial) {
        climateMaterial = cloudMaterial;
        const cloudAltitudeScale = isHaven ? 1.026 : isCinder ? 1.018 : isGasGiant ? 1.014 : 1.02;
        clouds = new THREE.Mesh(new THREE.SphereGeometry(visualRadius * cloudAltitudeScale, 64, 40), cloudMaterial);
        clouds.name = `${data.name} climate layer`;
        clouds.visible = !focusOnlyClimate;
        root.add(clouds);
        if (data.cloudTexturePath) {
          this.loadTexture(data.cloudTexturePath, (texture) => {
            const resolvedTexture = isHaven ? createSeamlessEquirectangularTexture(texture) : texture;
            if (resolvedTexture !== texture) {
              this.loadedTextures.delete(texture);
              texture.dispose();
              this.loadedTextures.add(resolvedTexture);
            }
            cloudMaterial.uniforms.uCloudMap.value = resolvedTexture;
            cloudMaterial.needsUpdate = true;
          });
        }
      }

      let ringSystem: THREE.Group | undefined;
      if (data.hasRings) {
        ringSystem = createDebrisRing(visualRadius);
        root.add(ringSystem);
      }

      const runtime: PlanetRuntime = {
        data,
        root,
        mesh,
        clouds,
        climateMaterial,
        climateElapsed: 0,
        focusOnlyClimate,
        ringSystem,
        hoverOutline,
        orbit,
        visualRadius,
        orbitRadius,
        phase: data.initialPhase,
        frozen: false,
      };
      this.planetRuntimes.push(runtime);
      this.updatePlanetPosition(runtime);
    });

    const dustGeometry = new THREE.BufferGeometry();
    const dustCount = window.innerWidth < 768 ? 520 : 1200;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let index = 0; index < dustCount; index += 1) {
      const radius = 9 + Math.random() * 85;
      const angle = Math.random() * TAU;
      dustPositions[index * 3] = Math.cos(angle) * radius;
      dustPositions[index * 3 + 1] = (Math.random() - 0.5) * 5;
      dustPositions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.systemDust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({ color: 0xc5d7e8, size: 0.12, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    system.add(this.systemDust);
  }

  private loadTexture(path: string, onLoad: (texture: THREE.Texture) => void): void {
    new THREE.TextureLoader().load(
      path,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.loadedTextures.add(texture);
        onLoad(texture);
      },
      undefined,
      () => console.warn(`Texture failed to load: ${path}`),
    );
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
  }

  private readonly resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 768 ? 1.25 : 1.5));
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    if (this.interactionGuideActive && this.phase === 'overview') this.frameWholeSystem();
  };

  private frameWholeSystem(): void {
    if (this.phase !== 'overview' || this.planetRuntimes.length === 0) return;

    const systemRadius = Math.max(
      17,
      ...this.planetRuntimes.map((planet) => {
        const orbitalExtent = planet.orbitRadius * (1 + planet.data.eccentricity);
        const bodyExtent = planet.visualRadius * (planet.data.hasRings ? 2.08 : 1.4);
        return orbitalExtent + bodyExtent;
      }),
    );
    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.camera.aspect);
    const limitingHalfFov = Math.max(
      THREE.MathUtils.degToRad(8),
      Math.min(verticalHalfFov, horizontalHalfFov),
    );
    const distance = (systemRadius * 1.1) / Math.sin(limitingHalfFov);

    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(this.overviewDirection).multiplyScalar(distance);
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld(true);
    this.controls.minDistance = distance * 0.9;
    this.controls.maxDistance = distance * 1.1;
    this.controls.update();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.interactionGuideActive) return;
    if (event.key === 'Escape') this.returnToOverview();
    if (this.phase !== 'overview') return;
    const number = Number(event.key);
    if (number >= 1 && number <= planets.length) this.focusPlanetById(planets[number - 1].id);
  };

  private readonly handleVisibilityChange = (): void => {
    if (!document.hidden) this.lastFrameTime = performance.now();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.interactionGuideActive || this.phase !== 'overview') {
      this.setHoveredPlanet(null);
      return;
    }
    const hit = this.pickPlanet(event.clientX, event.clientY);
    this.setHoveredPlanet(hit);
  };

  private readonly handlePointerLeave = (): void => {
    this.setHoveredPlanet(null);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.interactionGuideActive) return;
    const distance = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    const duration = performance.now() - this.pointerStart.time;
    if (distance >= 6 || duration >= 350) return;
    if (this.phase === 'focused') {
      this.returnToOverview();
      return;
    }
    if (this.phase !== 'overview') return;
    const hit = this.pickPlanet(event.clientX, event.clientY);
    if (hit) this.startFocus(hit);
  };

  private pickPlanet(clientX: number, clientY: number): PlanetRuntime | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.planetRuntimes.map((planet) => planet.mesh), false);
    if (!intersections.length) return null;
    const id = intersections[0].object.userData.planetId;
    return this.planetRuntimes.find((planet) => planet.data.id === id) ?? null;
  }

  private setHoveredPlanet(planet: PlanetRuntime | null): void {
    if (planet === this.hoveredPlanet) return;
    if (this.hoveredPlanet) this.hoveredPlanet.hoverOutline.visible = false;
    this.hoveredPlanet = planet;
    if (planet) planet.hoverOutline.visible = true;
    this.renderer.domElement.style.cursor = planet ? 'pointer' : 'grab';
  }

  private startFocus(planet: PlanetRuntime): void {
    this.overviewPose = this.capturePose();
    this.focusedPlanet = planet;
    planet.frozen = true;
    if (this.starfield) this.starfield.visible = false;
    if (this.systemDust) this.systemDust.visible = false;
    this.planetRuntimes.forEach((runtime) => {
      runtime.orbit.visible = false;
    });
    if (planet.focusOnlyClimate && planet.clouds) planet.clouds.visible = true;
    this.controls.enabled = false;
    this.setHoveredPlanet(null);
    const planetPosition = planet.root.getWorldPosition(new THREE.Vector3());
    const observerDirection = this.camera.position.clone().sub(planetPosition).normalize();
    const starwardDirection = planetPosition.clone().negate().normalize();
    const approachDirection = observerDirection.multiplyScalar(0.62).add(starwardDirection.multiplyScalar(0.38)).normalize();
    const distance = Math.max(planet.visualRadius * 5.1, 13);
    const endPosition = planetPosition.clone().addScaledVector(approachDirection, distance);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const isMobileFocus = window.innerWidth < 768;
    const horizontalOffset = isMobileFocus ? 0 : planet.visualRadius * 1.15;
    let finalViewDirection = planetPosition.clone().sub(endPosition).normalize();
    let finalCameraRight = new THREE.Vector3().crossVectors(finalViewDirection, worldUp).normalize();
    const target = new THREE.Vector3();
    for (let iteration = 0; iteration < 4; iteration += 1) {
      target.copy(planetPosition).addScaledVector(finalCameraRight, horizontalOffset);
      finalViewDirection = target.clone().sub(endPosition).normalize();
      finalCameraRight = new THREE.Vector3().crossVectors(finalViewDirection, worldUp).normalize();
    }
    target.copy(planetPosition).addScaledVector(finalCameraRight, horizontalOffset);
    if (isMobileFocus) {
      finalViewDirection = target.clone().sub(endPosition).normalize();
      const finalCameraUp = new THREE.Vector3().crossVectors(finalCameraRight, finalViewDirection).normalize();
      const verticalShift = planet.data.id === 'cinder' ? 2.25 : 1.15;
      target.addScaledVector(finalCameraUp, -planet.visualRadius * verticalShift);
    }
    this.phase = 'focusing';
    this.transition = {
      startedAt: performance.now(),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 1050,
      from: this.capturePose(),
      to: { position: endPosition, target, fov: isMobileFocus ? 45 : 36 },
      direction: 'in',
      targetPlanet: planet,
    };
    this.emit();
  }

  private capturePose(): CameraPose {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this.camera.fov,
    };
  }

  private updateTransition(now: number): void {
    if (!this.transition) return;
    const raw = Math.min(1, (now - this.transition.startedAt) / this.transition.duration);
    const eased = this.transition.direction === 'in' ? easeOutQuint(raw) : easeInOutCubic(raw);
    this.camera.position.lerpVectors(this.transition.from.position, this.transition.to.position, eased);
    this.controls.target.lerpVectors(this.transition.from.target, this.transition.to.target, eased);
    this.camera.fov = THREE.MathUtils.lerp(this.transition.from.fov, this.transition.to.fov, eased);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);

    if (raw < 1) return;
    const completed = this.transition;
    this.transition = null;
    if (completed.direction === 'in') {
      this.phase = 'focused';
    } else {
      completed.targetPlanet.frozen = false;
      if (completed.targetPlanet.focusOnlyClimate && completed.targetPlanet.clouds) {
        completed.targetPlanet.clouds.visible = false;
      }
      this.focusedPlanet = null;
      this.phase = 'overview';
      if (this.starfield) this.starfield.visible = true;
      if (this.systemDust) this.systemDust.visible = true;
      this.planetRuntimes.forEach((planet) => {
        planet.orbit.visible = true;
      });
      this.controls.enabled = true;
      this.controls.update();
    }
    this.emit();
  }

  private updatePlanetPosition(planet: PlanetRuntime): void {
    const eccentricity = planet.data.eccentricity;
    const semiMinor = planet.orbitRadius * Math.sqrt(1 - eccentricity ** 2);
    const focusOffset = planet.orbitRadius * eccentricity;
    planet.root.position.set(
      Math.cos(planet.phase) * planet.orbitRadius - focusOffset,
      0,
      Math.sin(planet.phase) * semiMinor,
    );
  }

  private readonly animate = (): void => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;
    const motionDelta = this.interactionGuideActive ? 0 : delta;
    this.elapsedSeconds += motionDelta;

    const systemMotionPaused = this.interactionGuideActive || this.phase !== 'overview';
    const orbitGuidesVisible = this.phase === 'overview';

    this.planetRuntimes.forEach((planet) => {
      // Keep orbit guides out of every focus frame. A guide passing in front of
      // the globe is broken into dots by the film scanlines and reads as a
      // diagonal surface seam.
      planet.orbit.visible = orbitGuidesVisible;
      const climateActive = planet === this.focusedPlanet && (this.phase === 'focusing' || this.phase === 'focused');
      if (planet.climateMaterial) {
        if (climateActive) planet.climateElapsed += motionDelta;
        planet.climateMaterial.uniforms.uClimateTime.value = planet.climateElapsed;
        planet.climateMaterial.uniforms.uFocus.value = THREE.MathUtils.damp(
          planet.climateMaterial.uniforms.uFocus.value,
          climateActive ? 1 : 0,
          3.8,
          motionDelta,
        );
      }
      if (!systemMotionPaused) {
        planet.phase = (planet.phase + (motionDelta / visualOrbitPeriod(planet.data.orbitalPeriodDays)) * TAU) % TAU;
        this.updatePlanetPosition(planet);
        const overviewRotationSpeed = TAU / Math.min(55, Math.max(18, planet.data.rotationHours * 0.45));
        planet.mesh.rotation.y += overviewRotationSpeed * motionDelta;
        if (planet.clouds) planet.clouds.rotation.y += overviewRotationSpeed * motionDelta * 1.07;
        if (planet.ringSystem) planet.ringSystem.rotation.y += overviewRotationSpeed * motionDelta * 0.2;
      } else if (planet === this.focusedPlanet) {
        const focusRotationSpeed = TAU / 180;
        planet.mesh.rotation.y += focusRotationSpeed * delta;
        if (planet.clouds) planet.clouds.rotation.y += focusRotationSpeed * delta * 1.07;
        if (planet.ringSystem) planet.ringSystem.rotation.y += focusRotationSpeed * delta * 0.2;
      }
    });

    if (this.backgroundNebula) this.backgroundNebula.quaternion.copy(this.camera.quaternion);

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === 'Noventure A' && object.material instanceof THREE.ShaderMaterial) {
        object.material.uniforms.uTime.value = this.elapsedSeconds;
      }
    });

    if (!this.interactionGuideActive) this.updateTransition(now);
    if (this.phase === 'overview' && !this.interactionGuideActive) this.controls.update();
    this.composer.render();
    if (motionDelta > 0 && Math.floor(this.elapsedSeconds * 4) !== Math.floor((this.elapsedSeconds - motionDelta) * 4)) this.emit();
  };

  private snapshot(): ExperienceSnapshot {
    return {
      phase: this.phase,
      focusedPlanet: this.focusedPlanet?.data ?? null,
      elapsedSeconds: this.elapsedSeconds,
    };
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
