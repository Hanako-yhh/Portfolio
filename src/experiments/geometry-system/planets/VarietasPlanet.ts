import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface VarietasPlanetRuntime {
  group: THREE.Group;
  pickMesh: THREE.Mesh;
  update(delta: number, elapsed: number, focused: boolean): void;
  setFocused(focused: boolean): void;
  dispose(): void;
}

export interface VarietasPlanetOptions {
  radius: number;
  mobile: boolean;
}

const GLSL_NOISE = /* glsl */ `
  float hash31(vec3 point) {
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
        mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), local.x),
        mix(hash31(cell + vec3(0.0, 1.0, 0.0)), hash31(cell + vec3(1.0, 1.0, 0.0)), local.x),
        local.y
      ),
      mix(
        mix(hash31(cell + vec3(0.0, 0.0, 1.0)), hash31(cell + vec3(1.0, 0.0, 1.0)), local.x),
        mix(hash31(cell + vec3(0.0, 1.0, 1.0)), hash31(cell + vec3(1.0, 1.0, 1.0)), local.x),
        local.y
      ),
      local.z
    );
  }

  float fbm3(vec3 point) {
    float value = 0.0;
    float amplitude = 0.54;
    mat3 rotation = mat3(
      0.00, 0.80, 0.60,
      -0.80, 0.36, -0.48,
      -0.60, -0.48, 0.64
    );

    for (int octave = 0; octave < 5; octave++) {
      value += noise3(point) * amplitude;
      point = rotation * point * 2.03 + vec3(7.13, 3.71, 5.47);
      amplitude *= 0.49;
    }
    return value;
  }

  mat3 rotationY(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat3(
      cosine, 0.0, -sine,
      0.0, 1.0, 0.0,
      sine, 0.0, cosine
    );
  }
`;

function hash3(x: number, y: number, z: number): number {
  let value = Math.imul(x ^ 0x6c8e9cf5, 0x27d4eb2d);
  value = Math.imul(value ^ y, 0x165667b1);
  value = Math.imul(value ^ z, 0x1b873593);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function noise3(x: number, y: number, z: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const cellZ = Math.floor(z);
  const localX = fade(x - cellX);
  const localY = fade(y - cellY);
  const localZ = fade(z - cellZ);

  const x00 = lerp(hash3(cellX, cellY, cellZ), hash3(cellX + 1, cellY, cellZ), localX);
  const x10 = lerp(hash3(cellX, cellY + 1, cellZ), hash3(cellX + 1, cellY + 1, cellZ), localX);
  const x01 = lerp(hash3(cellX, cellY, cellZ + 1), hash3(cellX + 1, cellY, cellZ + 1), localX);
  const x11 = lerp(
    hash3(cellX, cellY + 1, cellZ + 1),
    hash3(cellX + 1, cellY + 1, cellZ + 1),
    localX,
  );
  return lerp(lerp(x00, x10, localY), lerp(x01, x11, localY), localZ);
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.54;
  let normalization = 0;
  let px = x;
  let py = y;
  let pz = z;

  for (let octave = 0; octave < octaves; octave += 1) {
    value += noise3(px, py, pz) * amplitude;
    normalization += amplitude;

    const nextX = py * 0.8 + pz * 0.6;
    const nextY = -px * 0.8 + py * 0.36 - pz * 0.48;
    const nextZ = -px * 0.6 - py * 0.48 + pz * 0.64;
    px = nextX * 2.03 + 7.13;
    py = nextY * 2.03 + 3.71;
    pz = nextZ * 2.03 + 5.47;
    amplitude *= 0.49;
  }

  return value / normalization;
}

/**
 * Returns a height in planet-radius units. Sampling Cartesian direction rather
 * than UV coordinates keeps continental forms continuous across every meridian.
 */
function sampleTerrainHeight(direction: THREE.Vector3): number {
  const x = direction.x;
  const y = direction.y;
  const z = direction.z;
  const continental =
    fbm3(x * 1.24 + 8.7, y * 1.24 - 3.1, z * 1.24 + 1.9, 5) * 0.79
    + fbm3(x * 2.61 - 4.2, y * 2.61 + 7.8, z * 2.61 - 5.4, 4) * 0.21;
  const signedContinent = continental - 0.505;
  const land = smoothstep(-0.025, 0.055, signedContinent);
  const shelf = smoothstep(-0.09, 0.015, signedContinent);

  const mountainNoise = fbm3(x * 5.8 + 2.7, y * 5.8 - 6.4, z * 5.8 + 4.1, 4);
  const ridges = Math.pow(1 - Math.abs(mountainNoise * 2 - 1), 3.2);
  const mountainMask = smoothstep(0.005, 0.105, signedContinent);
  const erosion = fbm3(x * 18.0 - 3.4, y * 18.0 + 8.1, z * 18.0 + 1.7, 3) - 0.5;

  const seaFloor = -0.021 + shelf * 0.016 + erosion * 0.0035;
  const plains = 0.003 + signedContinent * 0.105 + erosion * 0.0075;
  const mountains = ridges * mountainMask * (0.047 + Math.max(0, signedContinent) * 0.14);
  return lerp(seaFloor, plains + mountains, land);
}

function createTerrainGeometry(radius: number, widthSegments: number, heightSegments: number): THREE.BufferGeometry {
  const source = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const positions = source.getAttribute('position') as THREE.BufferAttribute;
  const elevation = new Float32Array(positions.count);
  const point = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).normalize();
    const height = sampleTerrainHeight(point);
    elevation[index] = height;
    point.multiplyScalar(radius * (1 + height));
    positions.setXYZ(index, point.x, point.y, point.z);
  }

  positions.needsUpdate = true;
  source.setAttribute('aElevation', new THREE.BufferAttribute(elevation, 1));
  source.deleteAttribute('uv');

  // Welding the duplicated longitude vertices gives normals a continuous
  // topology, even though no equirectangular UVs are used by this planet.
  const welded = mergeVertices(source, Math.max(1e-6, radius * 1e-7));
  source.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingSphere();
  return welded;
}

function createSurfaceMaterial(radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Varietas procedural terrain material',
    uniforms: {
      uRadius: { value: radius },
      uTime: { value: 0 },
      uFocus: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aElevation;
      varying float vElevation;
      varying float vSlope;
      varying vec3 vLocalDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 localDirection = normalize(position);
        vec3 localNormal = normalize(normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vElevation = aElevation;
        vSlope = clamp(1.0 - dot(localNormal, localDirection), 0.0, 1.0);
        vLocalDirection = localDirection;
        vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uRadius;
      uniform float uTime;
      uniform float uFocus;

      varying float vElevation;
      varying float vSlope;
      varying vec3 vLocalDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      ${GLSL_NOISE}

      float cloudField(vec3 direction) {
        vec3 movingDirection = rotationY(uTime * 0.0038) * direction;
        float broad = fbm3(movingDirection * 4.1 + vec3(3.7, -1.8, 7.1));
        float wisps = fbm3(movingDirection * 10.5 + vec3(-4.1, 6.3, 2.2));
        return smoothstep(0.58, 0.77, broad * 0.74 + wisps * 0.26);
      }

      void main() {
        vec3 direction = normalize(vLocalDirection);
        vec3 normal = normalize(vWorldNormal);
        vec3 lightDirection = normalize(-vWorldPosition + vec3(0.00001, 0.0, 0.0));
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

        float fine = fbm3(direction * mix(32.0, 58.0, uFocus) + vec3(11.7, 2.1, -7.4));
        float rock = fbm3(direction * 88.0 + vec3(-5.3, 13.9, 4.7));
        float latitude = abs(direction.y);
        float slope = smoothstep(0.008, 0.095, vSlope);

        vec3 seaFloor = mix(vec3(0.018, 0.060, 0.065), vec3(0.040, 0.100, 0.088), fine);
        vec3 coast = mix(vec3(0.25, 0.22, 0.12), vec3(0.43, 0.38, 0.23), fine);
        vec3 lowland = mix(vec3(0.035, 0.12, 0.055), vec3(0.11, 0.24, 0.08), fine);
        vec3 highland = mix(vec3(0.18, 0.15, 0.10), vec3(0.34, 0.28, 0.18), rock);
        vec3 bareRock = mix(vec3(0.18, 0.18, 0.17), vec3(0.38, 0.36, 0.32), rock);
        vec3 snow = mix(vec3(0.62, 0.68, 0.70), vec3(0.88, 0.92, 0.94), fine);

        float coastBand = smoothstep(-0.006, 0.002, vElevation);
        float vegetationBand = smoothstep(0.000, 0.012, vElevation);
        float highlandBand = smoothstep(0.021, 0.047, vElevation);
        float rockBand = max(smoothstep(0.045, 0.071, vElevation), slope);
        float polarSnow = smoothstep(0.66, 0.91, latitude) * smoothstep(0.018, 0.048, vElevation);
        float alpineSnow = smoothstep(0.078, 0.112, vElevation) * mix(0.58, 0.9, fine);
        float snowBand = clamp(max(polarSnow, alpineSnow), 0.0, 1.0);

        vec3 albedo = mix(seaFloor, coast, coastBand);
        albedo = mix(albedo, lowland, vegetationBand);
        albedo = mix(albedo, highland, highlandBand);
        albedo = mix(albedo, bareRock, rockBand * 0.82);
        albedo = mix(albedo, snow, snowBand);
        albedo *= mix(0.90, 1.08, fine) * mix(0.96, 1.035, rock);

        float diffuse = max(0.0, dot(normal, lightDirection));
        float wrappedLight = smoothstep(-0.18, 0.72, dot(normal, lightDirection));
        float halfLight = max(0.0, dot(normal, normalize(lightDirection + viewDirection)));
        float specular = pow(halfLight, 38.0) * (0.055 + snowBand * 0.16);
        float rim = pow(1.0 - max(0.0, dot(normal, viewDirection)), 4.2);
        float cloudShadow = cloudField(direction) * diffuse * 0.25;

        vec3 ambient = albedo * vec3(0.06, 0.085, 0.13);
        vec3 daylight = albedo * mix(vec3(0.42, 0.50, 0.62), vec3(0.92, 0.88, 0.79), diffuse);
        vec3 color = ambient + daylight * (wrappedLight * 0.42 + diffuse * 0.68 - cloudShadow);
        color += vec3(1.0, 0.91, 0.75) * specular;
        color += vec3(0.10, 0.24, 0.38) * rim * (0.08 + diffuse * 0.12);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthWrite: true,
    depthTest: true,
  });
}

function createOceanMaterial(radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Varietas procedural ocean material',
    uniforms: {
      uRadius: { value: radius },
      uTime: { value: 0 },
      uFocus: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uRadius;
      uniform float uTime;
      uniform float uFocus;
      varying float vWave;
      varying vec3 vLocalDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 direction = normalize(position);
        float time = uTime * 0.12;
        float primary = sin(dot(direction, normalize(vec3(0.81, 0.23, 0.54))) * 76.0 + time);
        float secondary = sin(dot(direction, normalize(vec3(-0.28, 0.71, 0.64))) * 119.0 - time * 1.37);
        float tertiary = sin(dot(direction, normalize(vec3(0.46, -0.31, 0.83))) * 181.0 + time * 0.73);
        vWave = primary * 0.52 + secondary * 0.31 + tertiary * 0.17;
        float displacement = uRadius * (0.0017 + vWave * mix(0.00016, 0.00032, uFocus));
        vec3 transformed = direction * (length(position) + displacement);
        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vLocalDirection = direction;
        vWorldNormal = normalize(mat3(modelMatrix) * normalize(normal + direction * vWave * 0.018));
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFocus;
      varying float vWave;
      varying vec3 vLocalDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      ${GLSL_NOISE}

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 lightDirection = normalize(-vWorldPosition + vec3(0.00001, 0.0, 0.0));
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 halfDirection = normalize(lightDirection + viewDirection);
        float diffuse = max(0.0, dot(normal, lightDirection));
        float fresnel = pow(1.0 - max(0.0, dot(normal, viewDirection)), 4.0);
        float fineWave = fbm3(normalize(vLocalDirection) * mix(26.0, 42.0, uFocus) + vec3(uTime * 0.01));
        float glint = pow(max(0.0, dot(normal, halfDirection)), mix(76.0, 124.0, uFocus));

        vec3 deepWater = vec3(0.004, 0.028, 0.072);
        vec3 shallowScatter = vec3(0.010, 0.12, 0.16);
        vec3 skyReflection = vec3(0.08, 0.18, 0.28);
        vec3 color = mix(deepWater, shallowScatter, diffuse * 0.48 + fineWave * 0.12 + vWave * 0.025);
        color += skyReflection * fresnel * 0.46;
        color += vec3(1.0, 0.91, 0.76) * glint * diffuse * 0.56;
        color *= 0.22 + diffuse * 0.92;
        gl_FragColor = vec4(color, 0.88);
      }
    `,
    transparent: true,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
  });
}

function createCloudMaterial(layer: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: `Varietas procedural cloud material ${layer}`,
    uniforms: {
      uTime: { value: 0 },
      uFocus: { value: 0 },
      uLayer: { value: layer },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uLayer;
      varying vec3 vLocalDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 direction = normalize(position);
        float billow = sin(direction.x * 41.0 + uTime * 0.045 + uLayer * 3.1)
          * sin(direction.z * 37.0 - uTime * 0.037) * 0.00065;
        vec3 transformed = position + direction * length(position) * billow;
        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vLocalDirection = direction;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFocus;
      uniform float uLayer;
      varying vec3 vLocalDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      ${GLSL_NOISE}

      void main() {
        vec3 localDirection = normalize(vLocalDirection);
        float directionOffset = (uLayer * 2.0 - 1.0) * uTime * 0.0024;
        vec3 movingDirection = rotationY(uTime * (0.0037 + uLayer * 0.0014) + directionOffset) * localDirection;
        float broad = fbm3(movingDirection * (3.9 + uLayer * 0.7) + vec3(3.7, -1.8, 7.1));
        float detail = fbm3(movingDirection * mix(11.0, 16.0, uFocus) + vec3(-4.1, 6.3, 2.2));
        float densitySignal = broad * 0.77 + detail * 0.23;
        float threshold = mix(0.635, 0.615, uFocus) + uLayer * 0.025;
        float density = smoothstep(threshold, threshold + 0.19, densitySignal);
        density *= mix(0.74, 1.0, detail);

        vec3 normal = normalize(vWorldNormal);
        vec3 lightDirection = normalize(-vWorldPosition + vec3(0.00001, 0.0, 0.0));
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float directLight = max(0.0, dot(normal, lightDirection));
        float horizon = pow(1.0 - max(0.0, dot(normal, viewDirection)), 3.0);
        float selfDepth = mix(0.72, 1.06, density);
        vec3 shadowColor = vec3(0.15, 0.20, 0.24);
        vec3 sunColor = vec3(1.0, 0.965, 0.90);
        vec3 cloudColor = mix(shadowColor, sunColor, 0.14 + directLight * 0.86) * selfDepth;
        cloudColor += vec3(0.18, 0.31, 0.45) * horizon * directLight * 0.28;

        float alpha = density * mix(0.34, 0.48, uFocus) * mix(1.0, 0.58, uLayer);
        alpha *= mix(0.48, 1.0, directLight);
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(cloudColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
  });
}

function createAtmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Varietas procedural atmosphere material',
    uniforms: {
      uFocus: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFocus;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 lightDirection = normalize(-vWorldPosition + vec3(0.00001, 0.0, 0.0));
        float viewRim = pow(1.0 - abs(dot(normal, viewDirection)), 2.25);
        float dayFacing = smoothstep(-0.25, 0.72, dot(normal, lightDirection));
        float forwardScatter = pow(max(0.0, dot(viewDirection, -lightDirection)), 8.0);
        vec3 nightBlue = vec3(0.025, 0.12, 0.28);
        vec3 dayBlue = vec3(0.12, 0.48, 0.88);
        vec3 sunset = vec3(1.0, 0.39, 0.12);
        vec3 color = mix(nightBlue, dayBlue, dayFacing);
        color = mix(color, sunset, forwardScatter * viewRim * 0.38);
        float alpha = viewRim * mix(0.23, 0.32, uFocus) * mix(0.42, 1.0, dayFacing);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}

function disposeObjectTree(group: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => materials.add(material));
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.clear();
}

export function createVarietasPlanet(options: VarietasPlanetOptions): VarietasPlanetRuntime {
  const { radius, mobile } = options;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('createVarietasPlanet requires a finite radius greater than zero.');
  }

  const lowSegments = mobile ? { width: 56, height: 40 } : { width: 88, height: 62 };
  const highSegments = mobile ? { width: 104, height: 74 } : { width: 280, height: 196 };
  const atmosphereSegments = mobile ? { width: 56, height: 40 } : { width: 96, height: 68 };
  const oceanSegments = mobile ? { width: 72, height: 52 } : { width: 144, height: 104 };

  const group = new THREE.Group();
  group.name = 'Varietas procedural planet';
  const body = new THREE.Group();
  body.name = 'Varietas rotating body';
  body.rotation.z = THREE.MathUtils.degToRad(23.2);
  group.add(body);

  const surfaceMaterial = createSurfaceMaterial(radius);
  const lowTerrain = new THREE.Mesh(
    createTerrainGeometry(radius, lowSegments.width, lowSegments.height),
    surfaceMaterial,
  );
  lowTerrain.name = 'Varietas terrain low LOD';
  lowTerrain.renderOrder = 1;
  body.add(lowTerrain);

  const highTerrain = new THREE.Mesh(
    createTerrainGeometry(radius, highSegments.width, highSegments.height),
    surfaceMaterial,
  );
  highTerrain.name = 'Varietas terrain focus LOD';
  highTerrain.visible = false;
  highTerrain.renderOrder = 1;
  body.add(highTerrain);

  const oceanMaterial = createOceanMaterial(radius);
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(radius, oceanSegments.width, oceanSegments.height),
    oceanMaterial,
  );
  ocean.name = 'Varietas geometric ocean';
  ocean.renderOrder = 2;
  body.add(ocean);

  const cloudGeometry = new THREE.SphereGeometry(
    radius * 1.026,
    atmosphereSegments.width,
    atmosphereSegments.height,
  );
  const lowerCloudMaterial = createCloudMaterial(0);
  const lowerClouds = new THREE.Mesh(cloudGeometry, lowerCloudMaterial);
  lowerClouds.name = 'Varietas lower procedural clouds';
  lowerClouds.renderOrder = 3;
  body.add(lowerClouds);

  const upperCloudMaterial = createCloudMaterial(1);
  const upperClouds = new THREE.Mesh(cloudGeometry.clone(), upperCloudMaterial);
  upperClouds.name = 'Varietas upper procedural clouds';
  upperClouds.scale.setScalar(1.011);
  upperClouds.rotation.y = 0.73;
  upperClouds.renderOrder = 4;
  body.add(upperClouds);

  const atmosphereMaterial = createAtmosphereMaterial();
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(
      radius * 1.085,
      atmosphereSegments.width,
      atmosphereSegments.height,
    ),
    atmosphereMaterial,
  );
  atmosphere.name = 'Varietas atmosphere scattering shell';
  atmosphere.renderOrder = 5;
  body.add(atmosphere);

  // A dedicated, colorless hit volume lets the caller raycast consistently
  // regardless of the active visual LOD or transparent atmosphere layers.
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const pickMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.075, mobile ? 24 : 32, mobile ? 16 : 22),
    pickMaterial,
  );
  pickMesh.name = 'Varietas interaction volume';
  pickMesh.userData.planetId = 'varietas';
  pickMesh.userData.isPlanetPickTarget = true;
  body.add(pickMesh);

  const focusUniformMaterials = [
    surfaceMaterial,
    oceanMaterial,
    lowerCloudMaterial,
    upperCloudMaterial,
    atmosphereMaterial,
  ];
  let targetFocus = 0;
  let focusMix = 0;
  let isFocused = false;
  let disposed = false;

  const setFocused = (focused: boolean): void => {
    if (disposed || focused === isFocused) return;
    isFocused = focused;
    targetFocus = focused ? 1 : 0;
    highTerrain.visible = focused;
    lowTerrain.visible = !focused;
  };

  return {
    group,
    pickMesh,
    setFocused,
    update(delta: number, elapsed: number, focused: boolean): void {
      if (disposed) return;
      if (focused !== isFocused) setFocused(focused);

      const safeDelta = THREE.MathUtils.clamp(delta, 0, 0.05);
      const response = 1 - Math.exp(-safeDelta * 5.5);
      focusMix = THREE.MathUtils.lerp(focusMix, targetFocus, response);
      body.rotation.y += safeDelta * (focused ? 0.027 : 0.009);
      lowerClouds.rotation.y += safeDelta * 0.0017;
      upperClouds.rotation.y -= safeDelta * 0.0011;

      focusUniformMaterials.forEach((material) => {
        if (material.uniforms.uTime) material.uniforms.uTime.value = elapsed;
        if (material.uniforms.uFocus) material.uniforms.uFocus.value = focusMix;
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      disposeObjectTree(group);
    },
  };
}
