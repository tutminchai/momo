import * as THREE from './vendor/three.module.js';

// CPU triangle rasterisation for devices where the browser disables WebGL.
// It renders the same geometry, camera, transforms and live skinned skeleton.
export class SoftwareRenderer {
  constructor() {
    this.isSoftwareRenderer = true;
    this.domElement = document.createElement('canvas');
    this.context = this.domElement.getContext('2d', { alpha: true });
    if (!this.context) throw new Error('瀏覽器無法建立 3D 預覽畫布。');
    this.shadowMap = {};
    this.xr = { enabled: false, isPresenting: false, setReferenceSpaceType() {}, getSession() { return null; } };
    this._pixelRatio = 1;
    this._width = this._height = 1;
    this._geometryCache = new WeakMap();
    this._project = new THREE.Matrix4();
    this._vertex = new THREE.Vector3();
    this._light = new THREE.Vector3(-0.35, 0.75, 0.65).normalize();
    this._fill = new THREE.Vector3(0.7, 0.3, -0.4).normalize();
    this._frameId = null;
    this._lastFrame = 0;
  }
  setPixelRatio(value) { this._pixelRatio = Math.min(Number(value) || 1, 1.5); }
  setClearColor(color, alpha = 0) { this._clearColor = new THREE.Color(color); this._clearAlpha = alpha; }
  setSize(width, height, updateStyle = true) {
    this._width = width;
    this._height = height;
    this.domElement.width = Math.max(1, Math.round(width * this._pixelRatio));
    this.domElement.height = Math.max(1, Math.round(height * this._pixelRatio));
    if (updateStyle) { this.domElement.style.width = `${width}px`; this.domElement.style.height = `${height}px`; }
  }
  setAnimationLoop(callback) {
    if (this._frameId !== null) cancelAnimationFrame(this._frameId);
    this._callback = callback;
    if (!callback) return;
    const tick = (time) => {
      if (!this._callback) return;
      this._frameId = requestAnimationFrame(tick);
      if (time - this._lastFrame < 1000 / 24) return;
      this._lastFrame = time;
      this._callback(time, null);
    };
    this._frameId = requestAnimationFrame(tick);
  }
  _cache(geometry) {
    let cache = this._geometryCache.get(geometry);
    if (cache) return cache;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const triangles = [];
    let groups = geometry.groups;
    if (!groups.length) groups = [{ start: 0, count, materialIndex: 0 }];
    for (const group of groups) {
      const end = Math.min(count, group.start + group.count);
      for (let i = group.start; i + 2 < end; i += 3) triangles.push([index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2, group.materialIndex]);
    }
    cache = { triangles, world: new Float64Array(position.count * 3), projected: new Float64Array(position.count * 3) };
    this._geometryCache.set(geometry, cache);
    return cache;
  }
  render(scene, camera) {
    const ctx = this.context;
    const w = this.domElement.width, h = this.domElement.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (this._clearAlpha) { ctx.globalAlpha = this._clearAlpha; ctx.fillStyle = this._clearColor.getStyle(); ctx.fillRect(0, 0, w, h); }
    ctx.globalAlpha = 1;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this._project.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const faces = [];
    const lines = [];
    scene.traverseVisible((object) => {
      if (!object.geometry || !object.material) return;
      if (object.isLineSegments) {
        lines.push(object);
        return;
      }
      if (!object.isMesh) return;
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');
      if (!positions) return;
      const cache = this._cache(geometry);
      const world = cache.world, projected = cache.projected;
      for (let i = 0; i < positions.count; i++) {
        const vertex = this._vertex.fromBufferAttribute(positions, i);
        if (object.isSkinnedMesh) object.applyBoneTransform(i, vertex);
        vertex.applyMatrix4(object.matrixWorld);
        const offset = i * 3;
        world[offset] = vertex.x; world[offset + 1] = vertex.y; world[offset + 2] = vertex.z;
        vertex.applyMatrix4(this._project);
        projected[offset] = (vertex.x * 0.5 + 0.5) * w;
        projected[offset + 1] = (-vertex.y * 0.5 + 0.5) * h;
        projected[offset + 2] = vertex.z;
      }
      for (const tri of cache.triangles) {
        const material = Array.isArray(object.material) ? object.material[tri[3]] : object.material;
        if (!material || material.visible === false || material.opacity <= 0 || material.isShadowMaterial) continue;
        const a = tri[0] * 3, b = tri[1] * 3, c = tri[2] * 3;
        const ax = projected[a], ay = projected[a + 1], az = projected[a + 2];
        const bx = projected[b], by = projected[b + 1], bz = projected[b + 2];
        const cx = projected[c], cy = projected[c + 1], cz = projected[c + 2];
        if (az < -1 || bz < -1 || cz < -1 || az > 1 || bz > 1 || cz > 1) continue;
        if (Math.max(ax, bx, cx) < 0 || Math.min(ax, bx, cx) > w || Math.max(ay, by, cy) < 0 || Math.min(ay, by, cy) > h) continue;
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(area) < 0.015) continue;
        if (material.side === THREE.FrontSide && area >= 0) continue;
        if (material.side === THREE.BackSide && area <= 0) continue;
        let brightness = 1;
        if (!material.isMeshBasicMaterial) {
          const ux = world[b] - world[a], uy = world[b + 1] - world[a + 1], uz = world[b + 2] - world[a + 2];
          const vx = world[c] - world[a], vy = world[c + 1] - world[a + 1], vz = world[c + 2] - world[a + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const length = Math.hypot(nx, ny, nz) || 1;
          const direction = area < 0 ? 1 : -1;
          nx = nx / length * direction; ny = ny / length * direction; nz = nz / length * direction;
          const lambert = Math.max(0, nx * this._light.x + ny * this._light.y + nz * this._light.z);
          const fill = Math.max(0, nx * this._fill.x + ny * this._fill.y + nz * this._fill.z);
          brightness = 0.67 + lambert * 0.37 + fill * 0.13;
        }
        const color = material.color || _white;
        const red = toSRGB(color.r * brightness), green = toSRGB(color.g * brightness), blue = toSRGB(color.b * brightness);
        faces.push({ ax, ay, bx, by, cx, cy, depth: (az + bz + cz) / 3, order: object.renderOrder || 0, color: `rgb(${red},${green},${blue})`, opacity: material.opacity ?? 1 });
      }
    });
    faces.sort((a, b) => a.order - b.order || b.depth - a.depth);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.45;
    for (const face of faces) {
      ctx.globalAlpha = face.opacity;
      ctx.fillStyle = face.color;
      ctx.beginPath();
      ctx.moveTo(face.ax, face.ay); ctx.lineTo(face.bx, face.by); ctx.lineTo(face.cx, face.cy); ctx.closePath();
      ctx.fill();
      // A subpixel same-colour edge closes canvas antialiasing seams.
      if (face.opacity > 0.99) { ctx.strokeStyle = face.color; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (const object of lines) {
      const positions = object.geometry.getAttribute('position');
      if (!positions) continue;
      ctx.lineWidth = 2 * this._pixelRatio;
      ctx.strokeStyle = object.isSkeletonHelper ? '#6d5acb' : (object.material.color?.getStyle() || '#6d5acb');
      ctx.globalAlpha = object.material.opacity ?? 1;
      for (let i = 0; i + 1 < positions.count; i += 2) {
        const a = this._vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).applyMatrix4(this._project);
        const ax = (a.x * 0.5 + 0.5) * w, ay = (-a.y * 0.5 + 0.5) * h, az = a.z;
        const b = this._vertex.fromBufferAttribute(positions, i + 1).applyMatrix4(object.matrixWorld).applyMatrix4(this._project);
        if (az < -1 || az > 1 || b.z < -1 || b.z > 1) continue;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo((b.x * 0.5 + 0.5) * w, (-b.y * 0.5 + 0.5) * h); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  dispose() { this.setAnimationLoop(null); this._geometryCache = new WeakMap(); }
}
const _white = new THREE.Color(0xffffff);
function toSRGB(linear) {
  const value = Math.max(0, Math.min(1, linear));
  return Math.round((value < 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055) * 255);
}
