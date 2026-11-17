import * as THREE from './vendor/three.module.js';

// Original procedural character. Every colored body part is weighted to a real
// THREE.Skeleton; face details are children of the head bone.
export function createCharacter(options = {}) {
  const lowPoly = options.lowPoly === true || options.lowpoly === true;
  const group = new THREE.Group();
  group.name = 'Momo — rigged little companion';
  const bones = {};
  const boneList = [];
  const restPositions = {};
  const materials = [];
  const geometries = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function bone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    const absolute = V(x, y, z);
    b.position.copy(parent ? absolute.clone().sub(restPositions[parent]) : absolute);
    if (parent) bones[parent].add(b);
    bones[name] = b;
    restPositions[name] = absolute;
    boneList.push(b);
    return b;
  }
  bone('root', null, 0, 0, 0);
  bone('hips', 'root', 0, 0.132, 0);
  bone('spine', 'hips', 0, 0.229, 0);
  bone('chest', 'spine', 0, 0.286, 0);
  bone('head', 'chest', 0, 0.374, 0);
  bone('earL', 'head', -0.085, 0.485, 0);
  bone('earR', 'head', 0.085, 0.485, 0);
  bone('upperArmL', 'chest', -0.132, 0.271, 0);
  bone('forearmL', 'upperArmL', -0.174, 0.214, 0.008);
  bone('handL', 'forearmL', -0.184, 0.166, 0.025);
  bone('upperArmR', 'chest', 0.132, 0.271, 0);
  bone('forearmR', 'upperArmR', 0.174, 0.214, 0.008);
  bone('handR', 'forearmR', 0.184, 0.166, 0.025);
  bone('upperLegL', 'hips', -0.067, 0.125, 0);
  bone('lowerLegL', 'upperLegL', -0.073, 0.073, 0.004);
  bone('footL', 'lowerLegL', -0.075, 0.034, 0.023);
  bone('upperLegR', 'hips', 0.067, 0.125, 0);
  bone('lowerLegR', 'upperLegR', 0.073, 0.073, 0.004);
  bone('footR', 'lowerLegR', 0.075, 0.034, 0.023);
  const boneIndex = Object.fromEntries(boneList.map((b, i) => [b.name, i]));
  function mat(color, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.73, metalness: 0, ...extra });
    materials.push(m);
    return m;
  }
  const lavender = mat(options.color || '#d3c2f2');
  const cream = mat('#fff6e8');
  const pink = mat('#f8b3b7');
  const dark = mat('#3c344a', { roughness: 0.3 });
  const white = mat('#ffffff', { roughness: 0.22 });
  const mint = mat('#8fcbb2');
  const stemMaterial = mat('#76ad8c');
  const blush = mat('#ee9caa');
  const mouthMaterial = mat('#9b4860');
  const skinParts = [];
  function ellipsoid(position, scale, name, material = lavender, quaternion = null, weights = null) {
    const geom = new THREE.SphereGeometry(1, lowPoly ? 12 : 28, lowPoly ? 8 : 20).toNonIndexed();
    geom.scale(...scale);
    if (quaternion) geom.applyQuaternion(quaternion);
    geom.translate(...position);
    skinParts.push({ geom, name, material, weights });
  }
  function limb(a, b, radius, name) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const center = start.clone().add(end).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), end.clone().sub(start).normalize());
    ellipsoid(center.toArray(), [radius, start.distanceTo(end) / 2 + radius * 0.57, radius], name, lavender, q);
  }
  ellipsoid([0, 0.218, 0], [0.126, 0.139, 0.095], 'spine', lavender, null, (v) => {
    if (v.y < 0.205) {
      const w = THREE.MathUtils.clamp((v.y - 0.13) / 0.075, 0, 1);
      return [boneIndex.hips, boneIndex.spine, 1 - w, w];
    }
    const w = THREE.MathUtils.clamp((v.y - 0.235) / 0.085, 0, 1);
    return [boneIndex.spine, boneIndex.chest, 1 - w, w];
  });
  ellipsoid([0, 0.374, 0.003], [0.157, 0.144, 0.124], 'head');
  ellipsoid([-0.085, 0.527, -0.006], [0.04, 0.077, 0.033], 'earL', lavender, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.16)));
  ellipsoid([0.085, 0.527, -0.006], [0.04, 0.077, 0.033], 'earR', lavender, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.16)));
  ellipsoid([-0.085, 0.532, 0.023], [0.022, 0.05, 0.009], 'earL', pink, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.16)));
  ellipsoid([0.085, 0.532, 0.023], [0.022, 0.05, 0.009], 'earR', pink, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.16)));
  limb([-0.132, 0.271, 0], [-0.174, 0.214, 0.008], 0.032, 'upperArmL');
  limb([-0.174, 0.214, 0.008], [-0.184, 0.166, 0.025], 0.029, 'forearmL');
  limb([0.132, 0.271, 0], [0.174, 0.214, 0.008], 0.032, 'upperArmR');
  limb([0.174, 0.214, 0.008], [0.184, 0.166, 0.025], 0.029, 'forearmR');
  ellipsoid([-0.184, 0.161, 0.027], [0.033, 0.035, 0.032], 'handL');
  ellipsoid([0.184, 0.161, 0.027], [0.033, 0.035, 0.032], 'handR');
  limb([-0.067, 0.125, 0], [-0.073, 0.073, 0.004], 0.036, 'upperLegL');
  limb([0.067, 0.125, 0], [0.073, 0.073, 0.004], 0.036, 'upperLegR');
  limb([-0.073, 0.073, 0.004], [-0.075, 0.034, 0.023], 0.033, 'lowerLegL');
  limb([0.073, 0.073, 0.004], [0.075, 0.034, 0.023], 0.033, 'lowerLegR');
  ellipsoid([-0.075, 0.032, 0.041], [0.047, 0.032, 0.059], 'footL', cream);
  ellipsoid([0.075, 0.032, 0.041], [0.047, 0.032, 0.059], 'footR', cream);
  ellipsoid([0, 0.205, 0.085], [0.081, 0.085, 0.017], 'spine', cream);
  ellipsoid([0, 0.182, -0.093], [0.043, 0.043, 0.041], 'hips', cream);
  const positions = [], normals = [], indices = [], weights = [];
  const merged = new THREE.BufferGeometry();
  let offset = 0;
  const skinMaterials = [...new Set(skinParts.map(p => p.material))];
  const vertex = new THREE.Vector3();
  skinParts.sort((a, b) => skinMaterials.indexOf(a.material) - skinMaterials.indexOf(b.material));
  for (const p of skinParts) {
    const pos = p.geom.getAttribute('position');
    const normal = p.geom.getAttribute('normal');
    const materialIndex = skinMaterials.indexOf(p.material);
    const previousGroup = merged.groups.at(-1);
    if (previousGroup && previousGroup.materialIndex === materialIndex) previousGroup.count += pos.count;
    else merged.addGroup(offset, pos.count, materialIndex);
    for (let i = 0; i < pos.count; i++) {
      vertex.fromBufferAttribute(pos, i);
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      const w = p.weights ? p.weights(vertex) : [boneIndex[p.name], 0, 1, 0];
      indices.push(w[0], w[1], 0, 0);
      weights.push(w[2], w[3], 0, 0);
    }
    offset += pos.count;
    p.geom.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  merged.computeBoundingSphere();
  geometries.push(merged);
  const mesh = new THREE.SkinnedMesh(merged, skinMaterials);
  mesh.name = 'Momo skinned body';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(bones.root);
  group.add(mesh);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  mesh.bind(skeleton);
  const face = new THREE.Group();
  bones.head.add(face);
  function detail(parent, geometry, material, position, scale) {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...position);
    if (scale) m.scale.set(...scale);
    parent.add(m);
    return m;
  }
  const sphere = (w = 20, h = 14) => new THREE.SphereGeometry(1, lowPoly ? Math.min(w, 10) : w, lowPoly ? Math.min(h, 7) : h);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = detail(face, sphere(), dark, [side * 0.052, 0.01, 0.116], [0.014, 0.02, 0.009]);
    eyes.push(eye);
    detail(eye, sphere(12, 8), white, [-0.25, 0.36, 0.76], [0.28, 0.23, 0.26]);
    detail(face, sphere(), blush, [side * 0.093, -0.02, 0.102], [0.023, 0.012, 0.006]);
  }
  detail(face, sphere(), pink, [0, -0.004, 0.129], [0.009, 0.006, 0.005]);
  const smileGeometry = new THREE.TorusGeometry(0.016, 0.0031, lowPoly ? 4 : 7, lowPoly ? 12 : 24, Math.PI * 0.86);
  const smile = detail(face, smileGeometry, dark, [0, -0.021, 0.126]);
  smile.rotation.z = Math.PI * 1.07;
  const openMouth = detail(face, sphere(), mouthMaterial, [0, -0.03, 0.127], [0.012, 0.014, 0.004]);
  openMouth.visible = false;
  const tongue = detail(openMouth, sphere(14, 10), pink, [0, -0.4, 0.35], [0.65, 0.36, 0.65]);
  const sprout = new THREE.Group();
  sprout.position.set(0, 0.139, -0.002);
  bones.head.add(sprout);
  const stalk = detail(sprout, new THREE.CylinderGeometry(0.003, 0.0035, 0.039, lowPoly ? 6 : 10), stemMaterial, [0, 0.018, 0]);
  stalk.rotation.z = -0.1;
  const leafL = detail(sprout, sphere(), mint, [-0.018, 0.036, 0], [0.027, 0.011, 0.012]);
  leafL.rotation.z = -0.5;
  const leafR = detail(sprout, sphere(), mint, [0.019, 0.041, 0], [0.028, 0.011, 0.012]);
  leafR.rotation.z = 0.55;
  const flower = new THREE.Group();
  flower.position.set(0.12, 0.09, 0.059);
  flower.rotation.z = -0.2;
  bones.head.add(flower);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    detail(flower, sphere(14, 10), cream, [Math.cos(a) * 0.015, Math.sin(a) * 0.015, 0], [0.011, 0.011, 0.006]);
  }
  detail(flower, sphere(14, 10), mat('#f2ce72'), [0, 0, 0.007], [0.008, 0.008, 0.006]);
  flower.visible = false;
  // Tiny heart badge on the belly.
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.012);
  heart.bezierCurveTo(-0.034, 0.008, -0.015, 0.026, 0, 0.012);
  heart.bezierCurveTo(0.015, 0.026, 0.034, 0.008, 0, -0.012);
  detail(bones.spine, new THREE.ShapeGeometry(heart), pink, [0, -0.01, 0.104], [0.6, 0.6, 0.6]);

  let action = 'idle', speaking = false, actionAge = 0, lastElapsed = 0;
  const targets = Object.fromEntries(boneList.map(b => [b.name, new THREE.Euler()]));
  let currentBounce = 0;
  function setAction(next) {
    action = ['idle', 'wave', 'dance', 'sing', 'happy'].includes(next) ? next : 'idle';
    actionAge = 0;
  }
  function setSpeaking(value) { speaking = !!value; }
  function setColor(color) { lavender.color.set(color); }
  function setAccessory(name) {
    sprout.visible = name !== 'none' && name !== 'flower';
    flower.visible = name === 'flower';
  }
  function update(dt = 0.016, elapsed) {
    dt = Math.min(Math.max(dt, 0), 0.08);
    const t = Number.isFinite(elapsed) ? elapsed : lastElapsed + dt;
    lastElapsed = t;
    actionAge += dt;
    for (const target of Object.values(targets)) target.set(0, 0, 0);
    const sway = Math.sin(t * 1.65);
    targets.spine.z = sway * 0.026;
    targets.head.z = Math.sin(t * 1.4 + 0.8) * 0.038;
    targets.head.y = Math.sin(t * 0.7) * 0.06;
    targets.earL.z = Math.sin(t * 2.1) * 0.04;
    targets.earR.z = Math.sin(t * 2.1 + 1) * 0.04;
    targets.upperArmL.z = Math.sin(t * 1.65 + 0.5) * 0.025;
    targets.upperArmR.z = Math.sin(t * 1.65 - 0.5) * 0.025;
    let bounce = Math.sin(t * 2.4) * 0.002;
    if (action === 'wave') {
      targets.upperArmR.z = 2.05;
      targets.upperArmR.x = -0.22;
      targets.forearmR.z = 0.35 + Math.sin(t * 8) * 0.45;
      targets.handR.z = Math.sin(t * 8) * 0.2;
      targets.head.z = -0.11;
      targets.spine.z = -0.04;
    } else if (action === 'dance') {
      const beat = t * 7.2;
      targets.hips.y = Math.sin(beat * 0.5) * 0.2;
      targets.spine.z = Math.sin(beat) * 0.13;
      targets.chest.y = Math.sin(beat) * 0.14;
      targets.head.z = -Math.sin(beat) * 0.1;
      targets.upperArmL.z = -0.8 - Math.sin(beat) * 0.5;
      targets.upperArmR.z = 0.8 - Math.sin(beat) * 0.5;
      targets.upperArmL.x = Math.sin(beat + 1) * 0.35;
      targets.upperArmR.x = -Math.sin(beat + 1) * 0.35;
      targets.forearmL.z = -0.45 - Math.cos(beat) * 0.35;
      targets.forearmR.z = 0.45 + Math.cos(beat) * 0.35;
      targets.upperLegL.x = Math.max(0, Math.sin(beat)) * -0.38;
      targets.upperLegR.x = Math.max(0, -Math.sin(beat)) * -0.38;
      targets.lowerLegL.x = Math.max(0, Math.sin(beat)) * 0.4;
      targets.lowerLegR.x = Math.max(0, -Math.sin(beat)) * 0.4;
      targets.earL.z = Math.sin(beat - 0.5) * 0.14;
      targets.earR.z = Math.sin(beat - 0.7) * 0.14;
      bounce = Math.abs(Math.sin(beat)) * 0.018;
    } else if (action === 'sing') {
      targets.head.z = Math.sin(t * 2.5) * 0.1;
      targets.head.x = -0.08;
      targets.upperArmL.z = -0.6;
      targets.upperArmR.z = 0.65 + Math.sin(t * 2.5) * 0.17;
      targets.forearmL.x = -0.6;
      targets.forearmR.x = -0.35;
      targets.spine.z = Math.sin(t * 2.5) * 0.045;
      bounce = Math.sin(t * 5) * 0.003;
    } else if (action === 'happy') {
      targets.upperArmL.z = -2.3;
      targets.upperArmR.z = 2.3;
      targets.head.z = Math.sin(t * 7) * 0.08;
      targets.earL.z = -0.13;
      targets.earR.z = 0.13;
      bounce = Math.abs(Math.sin(t * 6.5)) * 0.045;
    }
    const blend = 1 - Math.exp(-dt * 12);
    for (const b of boneList) {
      const target = targets[b.name];
      b.rotation.x = THREE.MathUtils.lerp(b.rotation.x, target.x, blend);
      b.rotation.y = THREE.MathUtils.lerp(b.rotation.y, target.y, blend);
      b.rotation.z = THREE.MathUtils.lerp(b.rotation.z, target.z, blend);
    }
    currentBounce = THREE.MathUtils.lerp(currentBounce, bounce, blend);
    bones.root.position.y = currentBounce;
    const blinkCycle = t % 4.7;
    const blink = blinkCycle > 4.48 ? Math.max(0.08, Math.abs((blinkCycle - 4.59) / 0.11)) : 1;
    eyes.forEach(eye => eye.scale.y = 0.02 * Math.min(1, blink));
    const vocal = speaking || action === 'sing';
    openMouth.visible = vocal;
    smile.visible = !vocal;
    if (vocal) {
      openMouth.scale.y = 0.006 + (0.5 + Math.sin(t * 15) * 0.3 + Math.sin(t * 23) * 0.2) * 0.014;
      openMouth.scale.x = 0.011 + Math.sin(t * 11) * 0.002;
    }
    sprout.rotation.z = Math.sin(t * 2) * 0.065;
    return action;
  }
  function dispose() {
    for (const g of new Set(geometries)) g.dispose();
    for (const m of new Set(materials)) m.dispose();
    skeleton.dispose();
  }
  group.userData = { rigged: true, boneCount: boneList.length, height: 0.61, lowPoly, originalCharacter: true };
  return { group, bones, skeleton, mesh, setAction, setSpeaking, setColor, setAccessory, update, dispose,
    get action() { return action; } };
}
