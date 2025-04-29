import * as THREE from "https://esm.sh/three@0.174.0";

import { OrbitControls } from "https://esm.sh/three@0.174.0/addons/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.174.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://esm.sh/three@0.174.0/examples/jsm/loaders/DRACOLoader";
import { RGBELoader } from "https://esm.sh/three@0.174.0/examples/jsm/loaders/RGBELoader";
//
// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c0a0a);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 3.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

camera.position.set(0, 0, 15);
window.camera = camera;

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Draco Loader setup
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

function createSakuraTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "#A80086"); // Magenta
  gradient.addColorStop(0.4, "#B9707B"); // Light pink

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Load HDRI for lighting only
const rgbeLoader = new RGBELoader();
rgbeLoader.setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/");
rgbeLoader.load("pink_sunrise_1k.hdr", function (texture) {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});

// Store sakura instances and their properties
let sakuraInstances = null;
const rotationSpeeds = [];
const floatingSakura = [];
const FLOAT_SPEED = 0.02;
const FADE_SPEED = 0.02;
const REGENERATE_INTERVAL = 600; // falling sakura delay
let lastRegenerateTime = 0;
let modelBounds = null;
let hitareaPositions = null;

// Load Bonsai model
// console.log("loading");
gltfLoader.load("https://assets.codepen.io/262181/bonsai2.glb", (gltf) => {
  const numSakuras = 1999;
  const model = gltf.scene;
  let hitareaMesh = null;
  let sakuraMesh = null;

  // Calculate model bounds
  const box = new THREE.Box3().setFromObject(model);
  modelBounds = { min: box.min, max: box.max };

  // traverse mesh
  model.traverse((child) => {
    if (child.isMesh) {
      if (child.name === "hitarea") {
        hitareaMesh = child;
        child.visible = false;

        hitareaPositions = hitareaMesh.geometry.attributes.position.array;
      }
      if (child.name === "sakura") {
        sakuraMesh = child;
        child.visible = false;
      }
      if (child.name !== "hitarea" && child.name !== "sakura") {
        const material = child.material;
        if (material) {
          const originalColor = material.color.clone();

          const newMaterial = material.clone();
          newMaterial.color = originalColor;
          newMaterial.metalness = 0.8;
          newMaterial.roughness = 0.32;
          // newMaterial.envMapIntensity = 1.0;

          child.material = newMaterial;
        }
      }

      if (child.name == "tree") {
        const material = child.material;
        if (material) {
          const originalColor = material.color.clone();

          const newMaterial = material.clone();
          newMaterial.color = new THREE.Color(0x1c0a0a);
          newMaterial.metalness = 0.4;
          newMaterial.roughness = 0.4;

          child.material = newMaterial;
        }
      }
    }
  });

  if (sakuraMesh) {
    const sakuraTexture = createSakuraTexture();
    const sakuraMaterial = new THREE.MeshStandardMaterial({
      map: sakuraTexture,
      emissive: new THREE.Color(0xa80086),
      emissiveMap: sakuraTexture,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });

    const hitareaGeometry = hitareaMesh.geometry;
    const positions = hitareaGeometry.attributes.position.array;
    const normals = hitareaGeometry.attributes.normal.array;
    const indices = hitareaGeometry.index ? hitareaGeometry.index.array : null;

    // Create sakura instances
    sakuraInstances = new THREE.InstancedMesh(
      sakuraMesh.geometry,
      sakuraMaterial,
      numSakuras
    );

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const tempVec = new THREE.Vector3();

    for (let i = 0; i < numSakuras; i++) {
      let vertexIndex;
      if (indices) {
        const triangleIndex =
          Math.floor(Math.random() * (indices.length / 3)) * 3;
        const v1 = new THREE.Vector3(
          positions[indices[triangleIndex] * 3],
          positions[indices[triangleIndex] * 3 + 1],
          positions[indices[triangleIndex] * 3 + 2]
        );
        const v2 = new THREE.Vector3(
          positions[indices[triangleIndex + 1] * 3],
          positions[indices[triangleIndex + 1] * 3 + 1],
          positions[indices[triangleIndex + 1] * 3 + 2]
        );
        const v3 = new THREE.Vector3(
          positions[indices[triangleIndex + 2] * 3],
          positions[indices[triangleIndex + 2] * 3 + 1],
          positions[indices[triangleIndex + 2] * 3 + 2]
        );

        const r1 = Math.random();
        const r2 = Math.random();
        const r3 = 1 - r1 - r2;

        position
          .copy(v1)
          .multiplyScalar(r1)
          .add(v2.clone().multiplyScalar(r2))
          .add(v3.clone().multiplyScalar(r3));

        normal.crossVectors(v2.clone().sub(v1), v3.clone().sub(v1)).normalize();

        position.add(normal.clone().multiplyScalar(Math.random() * 0.1));
      } else {
        vertexIndex = Math.floor(Math.random() * (positions.length / 3)) * 3;
        position.set(
          positions[vertexIndex],
          positions[vertexIndex + 1],
          positions[vertexIndex + 2]
        );
        normal.set(
          normals[vertexIndex],
          normals[vertexIndex + 1],
          normals[vertexIndex + 2]
        );
        position.add(normal.clone().multiplyScalar(Math.random() * 0.1));
      }

      quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const xRotation = ((Math.random() - 0.5) * Math.PI) / 3; // ±30 degrees
      const zRotation = ((Math.random() - 0.5) * Math.PI) / 3; // ±30 degrees

      const xQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        xRotation
      );
      const zQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        zRotation
      );
      const yQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, Math.random() * Math.PI * 2, 0)
      );

      quaternion.multiply(xQuat).multiply(zQuat).multiply(yQuat);

      const scale = 1.4 + Math.random() * 1.0;

      matrix.compose(
        position,
        quaternion,
        new THREE.Vector3(scale, scale, scale)
      );
      sakuraInstances.setMatrixAt(i, matrix);

      rotationSpeeds[i] = (Math.random() * 0.5 + 0.1) * 0.01;

      floatingSakura[i] = {
        isFloating: false,
        opacity: 0.9,
        originalPosition: position.clone(),
        floatOffset: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          0,
          (Math.random() - 0.5) * 0.1
        ),
        floatSpeed: FLOAT_SPEED * (0.5 + Math.random() * 0.5),
        currentScale: 0,
        targetScale: 0.5 + Math.random() * 0.5,
        scaleSpeed: 0.05,
        noiseOffset: Math.random() * 1000,
        noiseScale: 0.2 + Math.random() * 0.3,
        swayAmount: 0.005 + Math.random() * 0.01,
        swaySpeed: 0.3 + Math.random() * 0.7,
        rotationSpeed:
          (Math.random() * 0.5 + 0.1) * 0.01 * (3 + Math.random() * 2)
      };
    }

    sakuraInstances.instanceMatrix.needsUpdate = true;
    scene.add(sakuraInstances);
  }

  scene.add(model);
});

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const rotationMatrix = new THREE.Matrix4();
const currentTime = { value: 0 };

function animate() {
  requestAnimationFrame(animate);
  currentTime.value += 15;

  if (sakuraInstances && modelBounds && hitareaPositions) {
    // Check if it's time to regenerate some sakura
    if (currentTime.value - lastRegenerateTime > REGENERATE_INTERVAL) {
      const numToFloat = Math.floor(Math.random() * 3) + 1; // 1-3 sakura
      for (let i = 0; i < numToFloat; i++) {
        const randomIndex = Math.floor(Math.random() * sakuraInstances.count);
        if (!floatingSakura[randomIndex].isFloating) {
          floatingSakura[randomIndex].isFloating = true;
          floatingSakura[randomIndex].opacity = 0.9;
        }
      }
      lastRegenerateTime = currentTime.value;
    }

    for (let i = 0; i < sakuraInstances.count; i++) {
      sakuraInstances.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);

      if (floatingSakura[i].isFloating) {
        const noiseX =
          Math.sin(
            currentTime.value * 0.001 * floatingSakura[i].swaySpeed +
              floatingSakura[i].noiseOffset
          ) * floatingSakura[i].swayAmount;
        const noiseZ =
          Math.cos(
            currentTime.value * 0.001 * floatingSakura[i].swaySpeed +
              floatingSakura[i].noiseOffset * 1.5
          ) * floatingSakura[i].swayAmount;

        position.y -= floatingSakura[i].floatSpeed;
        position.x += noiseX * floatingSakura[i].noiseScale;
        position.z += noiseZ * floatingSakura[i].noiseScale;

        // Fade out when near bottom
        if (position.y < modelBounds.min.y + 1) {
          floatingSakura[i].opacity -= FADE_SPEED;
          if (floatingSakura[i].opacity <= 0) {
            // Reset sakura to new random position on hitarea
            const vertexIndex =
              Math.floor(Math.random() * (hitareaPositions.length / 3)) * 3;
            position.set(
              hitareaPositions[vertexIndex],
              hitareaPositions[vertexIndex + 1],
              hitareaPositions[vertexIndex + 2]
            );
            floatingSakura[i].isFloating = false;
            floatingSakura[i].opacity = 0.9;
            floatingSakura[i].currentScale = 0;
            floatingSakura[i].targetScale = 0.5 + Math.random() * 0.5;

            floatingSakura[i].noiseOffset = Math.random() * 1000;
            floatingSakura[i].noiseScale = 0.2 + Math.random() * 0.3;
            floatingSakura[i].swayAmount = 0.005 + Math.random() * 0.01;
            floatingSakura[i].swaySpeed = 0.3 + Math.random() * 0.7;
            floatingSakura[i].rotationSpeed =
              (Math.random() * 0.5 + 0.1) * 0.01 * (3 + Math.random() * 2);
          }
        }

        if (
          !floatingSakura[i].isFloating &&
          floatingSakura[i].currentScale < floatingSakura[i].targetScale
        ) {
          floatingSakura[i].currentScale += floatingSakura[i].scaleSpeed;
          if (floatingSakura[i].currentScale > floatingSakura[i].targetScale) {
            floatingSakura[i].currentScale = floatingSakura[i].targetScale;
          }
          scale.set(
            floatingSakura[i].currentScale,
            floatingSakura[i].currentScale,
            floatingSakura[i].currentScale
          );
        }

        rotationMatrix.makeRotationY(floatingSakura[i].rotationSpeed * 5);
      } else {
        // Normal rotation speed when not floating
        rotationMatrix.makeRotationY(rotationSpeeds[i]);
      }

      matrix.compose(position, quaternion, scale);
      matrix.multiply(rotationMatrix);

      sakuraInstances.setMatrixAt(i, matrix);
    }
    sakuraInstances.instanceMatrix.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();