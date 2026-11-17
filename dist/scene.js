import * as THREE from './vendor/three.module.js';
import { createCharacter } from './character.js';
import { SoftwareRenderer } from './software-renderer.js';

/** A real WebXR hit-test scene, with an independent desktop/mobile 3D preview. */
export class CompanionScene {
  constructor({ container, onStatus = () => {}, onModeChange = () => {} } = {}) {
    if (!container) throw new Error('找不到 3D 預覽區域。');
    this.container = container;
    this.onStatus = onStatus;
    this.onModeChange = onModeChange;
    this.mode = 'preview';
    this.placed = false;
    this.supportsAR = null;
    this.scale = 1;
    this.rotation = 0;
    this._placedYaw = 0;
    this._elapsed = 0;
    this._lastTime = null;
    this._disposed = false;
    this._pointers = new Map();
    this._yaw = 0;
    this._pitch = 0.13;
    this._distance = 1.55;
    this._cleanups = [];
    this._lastReady = false;
    this._showSkeleton = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 30);
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    } catch {
      this.renderer = new SoftwareRenderer();
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    this.renderer.domElement.setAttribute('aria-label', 'MOMO 可旋轉的 3D 角色預覽');
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cfec, 2.5));
    const key = new THREE.DirectionalLight(0xfff7ef, 3.7);
    key.position.set(-1.3, 2.5, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -1;
    key.shadow.camera.right = key.shadow.camera.top = 1;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 8;
    key.shadow.normalBias = 0.012;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 4;
    this.scene.add(key);
    key.target.position.set(0, 0.25, 0);
    this.scene.add(key.target);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight(0xe8e2ff, 1.7);
    fill.position.set(1.7, 1, -1.2);
    this.scene.add(fill);

    this.stage = new THREE.Group();
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.335, 0.038, 72),
      new THREE.MeshStandardMaterial({ color: 0xe5dcf5, roughness: 0.85, metalness: 0.02 })
    );
    pedestal.position.y = -0.022;
    pedestal.receiveShadow = true;
    this.stage.add(pedestal);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.309, 0.0035, 8, 80),
      new THREE.MeshStandardMaterial({ color: 0xf8f4ff, roughness: 0.65 })
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -0.004;
    this.stage.add(lip);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.54, 72),
      new THREE.MeshBasicMaterial({ color: 0xece7f4, transparent: true, opacity: 0.28, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.044;
    this.stage.add(ground);
    this.scene.add(this.stage);

    this.characterRoot = new THREE.Group();
    this.character = createCharacter({ lowpoly: this.renderer.isSoftwareRenderer });
    this.characterRoot.add(this.character.group);
    this.scene.add(this.characterRoot);
    this.arShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false })
    );
    this.arShadow.rotation.x = -Math.PI / 2;
    this.arShadow.position.y = 0.001;
    this.arShadow.receiveShadow = true;
    this.arShadow.visible = false;
    this.characterRoot.add(this.arShadow);

    this.sparkles = new THREE.Group();
    const starShape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 2 + i * Math.PI / 4;
      const r = i % 2 ? 0.0035 : 0.013;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) starShape.moveTo(x, y); else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const starGeometry = new THREE.ShapeGeometry(starShape);
    const starMaterial = new THREE.MeshBasicMaterial({ color: 0xb9a0db, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const sparklePositions = [[-0.29, 0.48, 0], [0.29, 0.56, -0.05], [-0.25, 0.2, 0.12], [0.25, 0.27, 0.06], [0.13, 0.7, -0.07]];
    sparklePositions.forEach((p, i) => {
      const mesh = new THREE.Mesh(starGeometry, starMaterial);
      mesh.position.set(...p);
      mesh.userData.baseY = p[1];
      mesh.userData.phase = i * 1.5;
      mesh.scale.setScalar(i === 1 ? 1.2 : 0.8);
      this.sparkles.add(mesh);
    });
    this.scene.add(this.sparkles);

    const reticleGeometry = new THREE.RingGeometry(0.09, 0.101, 64).rotateX(-Math.PI / 2);
    this.reticle = new THREE.Mesh(reticleGeometry, new THREE.MeshBasicMaterial({ color: 0xad91df, side: THREE.DoubleSide, depthTest: false }));
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.reticle.renderOrder = 10;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.009, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf6f0ff, side: THREE.DoubleSide, depthTest: false }));
    dot.position.y = 0.001;
    this.reticle.add(dot);
    this.scene.add(this.reticle);

    this.skeletonHelper = new THREE.SkeletonHelper(this.character.group);
    this.skeletonHelper.visible = false;
    this.skeletonHelper.material.depthTest = false;
    this.skeletonHelper.material.transparent = true;
    this.skeletonHelper.material.opacity = 0.85;
    this.skeletonHelper.renderOrder = 20;
    this.scene.add(this.skeletonHelper);

    this._bindPointers();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.container);
    this._resize();
    this._updateCamera();
    this.renderer.setAnimationLoop((time, frame) => this._render(time, frame));
    this._detectSupport();
  }

  async _detectSupport() {
    try {
      this.supportsAR = !this.renderer.isSoftwareRenderer && !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
    } catch { this.supportsAR = false; }
    if (!this._disposed && this.mode === 'preview') this.onStatus({ mode: 'preview', ready: true, placed: false, supported: this.supportsAR, renderer: this.renderer.isSoftwareRenderer ? 'software' : 'webgl', message: this.renderer.isSoftwareRenderer ? '省電 3D 預覽，拖曳轉個角度，和 MOMO 打聲招呼吧。' : '拖曳轉個角度，和 MOMO 打聲招呼吧。' });
  }

  _bindPointers() {
    const canvas = this.renderer.domElement;
    const overlay = document.getElementById('ar-overlay');
    const on = (target, event, listener, options) => {
      target.addEventListener(event, listener, options);
      this._cleanups.push(() => target.removeEventListener(event, listener, options));
    };
    const isControl = (target) => !!target?.closest?.('button,input,form,label,a,select,textarea,dialog,.ar-action-row,.ar-transform-controls');
    const bindSurface = (surface, ar) => {
      if (!surface) return;
      const active = () => ar ? this.mode === 'ar' && this.placed : this.mode === 'preview';
      on(surface, 'pointerdown', (e) => {
        if (!active() || isControl(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        try { surface.setPointerCapture(e.pointerId); } catch { /* Pointer capture is optional in XR overlays. */ }
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._pointers.size === 2) {
          const metrics = this._pointerMetrics();
          this._pinchDistance = metrics.distance;
          this._pinchAngle = metrics.angle;
        }
      }, { passive: false });
      on(surface, 'pointermove', (e) => {
        const previous = this._pointers.get(e.pointerId);
        if (!previous || !active()) return;
        e.preventDefault();
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._pointers.size >= 2) {
          const metrics = this._pointerMetrics();
          if (this._pinchDistance > 2 && metrics.distance > 2) {
            this.setScale(this.scale * metrics.distance / this._pinchDistance);
          }
          if (Number.isFinite(this._pinchAngle)) {
            const delta = Math.atan2(Math.sin(metrics.angle - this._pinchAngle), Math.cos(metrics.angle - this._pinchAngle));
            this.rotateCharacter(-delta);
          }
          this._pinchDistance = metrics.distance;
          this._pinchAngle = metrics.angle;
        } else if (ar) {
          // AR cameras remain physically tracked: rotate the model, never the camera.
          this.rotateCharacter((e.clientX - previous.x) * 0.009);
        } else {
          this._yaw -= (e.clientX - previous.x) * 0.008;
          this._pitch = THREE.MathUtils.clamp(this._pitch + (e.clientY - previous.y) * 0.005, -0.06, 0.7);
          this._updateCamera();
        }
      }, { passive: false });
      const release = (e) => {
        this._pointers.delete(e.pointerId);
        this._pinchDistance = 0;
        this._pinchAngle = undefined;
      };
      on(surface, 'pointerup', release);
      on(surface, 'pointercancel', release);
      on(surface, 'lostpointercapture', release);
    };
    bindSurface(canvas, false);
    bindSurface(overlay, true);
    if (overlay) {
      // Placement has an explicit DOM button. Prevent XR select from treating a
      // pinch, a rotation, or a UI tap as a second placement action.
      on(overlay, 'beforexrselect', (e) => { if (this.mode === 'ar') e.preventDefault(); });
    }
    on(canvas, 'wheel', (e) => {
      if (this.mode !== 'preview') return;
      e.preventDefault();
      this.setScale(this.scale * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  _pointerMetrics() {
    const p = [...this._pointers.values()];
    if (p.length < 2) return { distance: 0, angle: 0 };
    const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
    return { distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
  }

  _updateCamera() {
    if (this.mode === 'ar') return;
    const aspectFactor = this.camera.aspect < 0.85 ? 0.85 / Math.max(this.camera.aspect, 0.4) : 1;
    const r = this._distance * aspectFactor;
    const target = new THREE.Vector3(0, 0.31, 0);
    this.camera.position.set(Math.sin(this._yaw) * Math.cos(this._pitch) * r, target.y + Math.sin(this._pitch) * r, Math.cos(this._yaw) * Math.cos(this._pitch) * r);
    this.camera.lookAt(target);
  }

  _resize() {
    if (this._disposed || this.mode === 'ar') return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this._updateCamera();
  }

  _render(time, frame) {
    if (this._disposed) return;
    const dt = this._lastTime === null ? 0.016 : Math.min(0.05, Math.max(0, (time - this._lastTime) / 1000));
    this._lastTime = time;
    this._elapsed += dt;
    this.character.update(dt, this._elapsed);
    this.sparkles.children.forEach((mesh) => {
      mesh.position.y = mesh.userData.baseY + Math.sin(this._elapsed * 1.1 + mesh.userData.phase) * 0.015;
      mesh.rotation.y = Math.sin(this._elapsed * 0.5 + mesh.userData.phase) * 0.35;
      mesh.rotation.z = Math.sin(this._elapsed + mesh.userData.phase) * 0.12;
    });
    if (frame && this._hitTestSource && !this.placed) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(this._hitTestSource);
      let found = false;
      for (const hit of hits) {
        const pose = hit.getPose(referenceSpace);
        if (!pose) continue;
        const m = pose.transform.matrix;
        // Ignore walls and steep surfaces: the local Y axis is the surface normal.
        if (m[5] < 0.9) continue;
        this.reticle.matrix.fromArray(m);
        this.reticle.visible = true;
        found = true;
        break;
      }
      if (!found) this.reticle.visible = false;
      if (found !== this._lastReady) {
        this._lastReady = found;
        this.onStatus({ mode: 'ar', ready: found, placed: false, message: found ? '找到地面了！點「放在這裡」讓 MOMO 出現。' : '慢慢移動手機，掃描光線充足的地面。' });
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  setAction(action) { this.character.setAction(action); }
  setSpeaking(value) { this.character.setSpeaking(value); }
  setColor(color) { this.character.setColor(color); }
  setAccessory(name) { this.character.setAccessory(name); }
  setScale(value) {
    const requested = Number(value);
    this.scale = THREE.MathUtils.clamp(Number.isFinite(requested) ? requested : 1, 0.25, 3);
    this.character.group.scale.setScalar(this.scale);
    this._emitTransform();
  }
  setRotation(radians) {
    const requested = Number(radians);
    this.rotation = Number.isFinite(requested) ? Math.atan2(Math.sin(requested), Math.cos(requested)) : 0;
    this.characterRoot.rotation.y = this._placedYaw + this.rotation;
    this._emitTransform();
  }
  rotateCharacter(deltaRadians) { this.setRotation(this.rotation + (Number(deltaRadians) || 0)); }
  _emitTransform() {
    this.onStatus({ mode: this.mode, transformOnly: true, scale: this.scale, rotation: this.rotation });
  }
  toggleSkeleton(value) {
    this._showSkeleton = Boolean(value);
    this.skeletonHelper.visible = this._showSkeleton && (this.mode !== 'ar' || this.placed);
  }

  resetView() {
    if (this.mode === 'ar') {
      this.placed = false;
      this.characterRoot.visible = false;
      this.skeletonHelper.visible = false;
      this._pointers.clear();
      this.reticle.visible = false;
      this._lastReady = false;
      this.onStatus({ mode: 'ar', ready: false, placed: false, message: '重新選個位置，慢慢掃描地面。' });
      return;
    }
    this._yaw = 0;
    this._pitch = 0.13;
    this._distance = 1.55;
    this._updateCamera();
  }

  async enterAR() {
    if (this.renderer.isSoftwareRenderer) return { supported: false, reason: '目前瀏覽器未啟用 WebGL，已改用真正 3D 的相容預覽。AR 地面定位需要在具備 WebGL 與 ARCore 的 Android Chrome 直接開啟此網址。' };
    if (this.mode === 'ar' || this._startingAR) return { supported: this.mode === 'ar' };
    if (!navigator.xr) return { supported: false, reason: '目前瀏覽器沒有提供 WebXR 地面定位。請以支援 ARCore 的 Android 手機，在 Chrome 開啟；這裡仍可使用完整 3D 互動。' };
    this._startingAR = true;
    let session;
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      this.supportsAR = supported;
      if (!supported) return { supported: false, reason: '這台裝置目前不支援 WebXR 地面定位。您可以繼續使用 3D 模式，或改用支援 ARCore 的 Android 手機與 Chrome。' };
      const overlay = document.getElementById('ar-overlay');
      if (!overlay) return { supported: false, reason: 'AR 互動介面尚未載入，請重新整理頁面再試一次。' };
      const options = { requiredFeatures: ['hit-test', 'dom-overlay'], optionalFeatures: ['local-floor'] };
      if (overlay) options.domOverlay = { root: overlay };
      session = await navigator.xr.requestSession('immersive-ar', options);
      if (!session.domOverlayState) {
        await session.end();
        session = null;
        return { supported: false, reason: '這個瀏覽器沒有啟用 AR 互動介面，無法在 AR 中對話或操作角色。請在支援 ARCore 的 Android Chrome 直接開啟此網址。' };
      }
      this._session = session;
      session.addEventListener('end', () => this._onSessionEnd(), { once: true });
      await this.renderer.xr.setSession(session);
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this._hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      // DOM placement button is authoritative; gesture input never auto-places.
      this.mode = 'ar';
      this.placed = false;
      this._lastReady = false;
      this.stage.visible = false;
      this.sparkles.visible = false;
      this.characterRoot.visible = false;
      this.skeletonHelper.visible = false;
      this.arShadow.visible = true;
      this.reticle.visible = false;
      this._pointers.clear();
      this.onModeChange('ar');
      this.onStatus({ mode: 'ar', ready: false, placed: false, message: '慢慢移動手機，掃描光線充足的地面。' });
      return { supported: true };
    } catch (error) {
      if (session) {
        try { await session.end(); } catch { this._onSessionEnd(); }
      }
      const reason = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        ? '相機或 AR 權限尚未允許。請在瀏覽器設定允許後再試一次。'
        : error?.name === 'NotSupportedError'
          ? '這台裝置未提供地面定位或 AR 互動介面所需的 WebXR 功能。請改用支援 ARCore 的 Android Chrome。'
          : '無法啟動 AR。請在手機的 Chrome 瀏覽器直接開啟此網址，再試一次。';
      return { supported: false, reason };
    } finally {
      this._startingAR = false;
    }
  }

  placeAR() {
    if (this.mode !== 'ar' || !this.reticle.visible) return false;
    this.characterRoot.position.setFromMatrixPosition(this.reticle.matrix);
    const cameraPosition = new THREE.Vector3();
    this.renderer.xr.getCamera().getWorldPosition(cameraPosition);
    this._placedYaw = Math.atan2(cameraPosition.x - this.characterRoot.position.x, cameraPosition.z - this.characterRoot.position.z);
    this.rotation = 0;
    this.characterRoot.rotation.set(0, this._placedYaw, 0);
    this._pointers.clear();
    this._emitTransform();
    this.characterRoot.visible = true;
    this.keyLight.position.copy(this.characterRoot.position).add(new THREE.Vector3(-1.3, 2.5, 2.3));
    this.keyLight.target.position.copy(this.characterRoot.position).add(new THREE.Vector3(0, 0.25, 0));
    this.placed = true;
    this.skeletonHelper.visible = this._showSkeleton;
    this.reticle.visible = false;
    this.character.setAction('wave');
    this.onStatus({ mode: 'ar', ready: false, placed: true, message: 'MOMO 來到你的世界了。可以靠近看看，也能對話、跳舞和唱歌。' });
    return true;
  }

  async exitAR() {
    if (this._session) {
      try { await this._session.end(); } catch { this._onSessionEnd(); }
    }
  }

  _onSessionEnd() {
    if (this._hitTestSource) {
      try { this._hitTestSource.cancel(); } catch { /* Already released by the browser. */ }
    }
    this._hitTestSource = null;
    this._session = null;
    this.mode = 'preview';
    this.placed = false;
    this._lastReady = false;
    this.reticle.visible = false;
    this.stage.visible = true;
    this.sparkles.visible = true;
    this.characterRoot.visible = true;
    this.skeletonHelper.visible = this._showSkeleton;
    this.characterRoot.position.set(0, 0, 0);
    this._placedYaw = 0;
    this.characterRoot.rotation.set(0, this.rotation, 0);
    this._pointers.clear();
    this._emitTransform();
    this.arShadow.visible = false;
    this.keyLight.position.set(-1.3, 2.5, 2.3);
    this.keyLight.target.position.set(0, 0.25, 0);
    this.camera.quaternion.identity();
    this._resize();
    this._updateCamera();
    this.onModeChange('preview');
    this.onStatus({ mode: 'preview', ready: true, placed: false, message: '已回到 3D 小天地。' });
  }

  capture() {
    if (this.mode === 'ar') throw new Error('為保護相機畫面，AR 模式請使用手機的截圖功能。');
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this._disposed = true;
    if (this._session) this._session.end().catch(() => {});
    this.renderer.setAnimationLoop(null);
    this._resizeObserver.disconnect();
    this._cleanups.forEach((fn) => fn());
    this.character.dispose();
    const geometries = new Set();
    const materials = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m));
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
