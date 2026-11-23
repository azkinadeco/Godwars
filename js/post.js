// =========================================================================
// GOD WARS POST FX — HDR scene target, soft bloom, ACES filmic tone map,
// colour grade (contrast / saturation / split-tone), vignette and dithering.
// Self-contained (no three/examples dependency). Desktop / WebGL2 only;
// phones keep the direct ACES render path for frame-rate.
// =========================================================================
(function () {
  const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  const BRIGHT = `
    uniform sampler2D tSrc; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
    void main(){
      // 4-tap box downsample + soft-knee threshold
      vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2( 1.0,-1.0)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb
             + texture2D(tSrc, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
      c *= 0.25;
      float l = max(c.r, max(c.g, c.b));
      float knee = uThreshold * 0.5;
      float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
      soft = soft * soft / (4.0 * knee + 1e-4);
      float w = max(soft, l - uThreshold) / max(l, 1e-4);
      gl_FragColor = vec4(min(c * w, vec3(24.0)), 1.0);
    }`;

  const BLUR = `
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
      c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
      c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`;

  const COMPOSITE = `
    uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
    uniform float uExposure; uniform float uBloom; uniform float uSat; uniform float uContrast;
    uniform float uVignette; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform vec2 uTexel;
    uniform float uSharpen;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 ACES(vec3 color){
      const mat3 inM = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 outM = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      color *= uExposure / 0.6;
      color = inM * color; color = RRTAndODTFit(color); color = outM * color;
      return clamp(color, 0.0, 1.0);
    }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 hdr = texture2D(tScene, vUv).rgb;
      // light unsharp mask (recovers crispness lost to MSAA resolve / low DPR)
      vec3 nb = texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb
              + texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb;
      hdr = max(hdr + (hdr - nb * 0.25) * uSharpen, 0.0);
      vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.8;
      hdr += bloom * uBloom;
      vec3 c = ACES(hdr);
      // split tone: cool shadows, warm highlights
      float L = luma(c);
      c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.75, L));
      // contrast (around mid grey in display-ish space) + saturation
      vec3 d = toSRGB(clamp(c, 0.0, 1.0));
      d = (d - 0.5) * uContrast + 0.5;
      float dl = luma(d);
      d = mix(vec3(dl), d, uSat);
      // vignette
      vec2 q = vUv - 0.5;
      float v = 1.0 - uVignette * smoothstep(0.18, 0.75, dot(q, q) * 1.9);
      d *= v;
      d += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(d, 0.0, 1.0), 1.0);
    }`;

  // Shared uniform for raw ShaderMaterials (sky domes) that write display-space colour:
  // when the HDR pipeline is on they must output linear radiance instead.
  window.GW_LINEAR_OUT = window.GW_LINEAR_OUT || { value: 0 };

  class PostFX {
    constructor(renderer) {
      this.renderer = renderer;
      this.enabled = false;
      this.supported = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
      this.params = { exposure: 0.92, bloom: 0.55, threshold: 1.05, sat: 1.1, contrast: 1.07, vignette: 0.32, sharpen: 0.18 };
      if (!this.supported) return;
      const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
      this.sceneRT = THREE.WebGLMultisampleRenderTarget
        ? new THREE.WebGLMultisampleRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
        : new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });
      if (this.sceneRT.samples !== undefined) this.sceneRT.samples = 4;
      this.brightRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      this.a1 = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      this.a2 = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      this.b1 = new THREE.WebGLRenderTarget(1, 1, rtOpts);
      this.b2 = new THREE.WebGLRenderTarget(1, 1, rtOpts);

      const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
      this.brightMat = mk(BRIGHT, { tSrc: { value: null }, uThreshold: { value: 1 }, uTexel: { value: new THREE.Vector2() } });
      this.blurMat = mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
      this.compMat = mk(COMPOSITE, {
        tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
        uExposure: { value: 1 }, uBloom: { value: 0.5 }, uSat: { value: 1.1 }, uContrast: { value: 1.06 },
        uVignette: { value: 0.3 }, uSharpen: { value: 0.18 }, uTexel: { value: new THREE.Vector2() },
        uShadowTint: { value: new THREE.Vector3(0.97, 1.0, 1.05) },
        uHighTint: { value: new THREE.Vector3(1.012, 1.0, 0.988) }
      });
      this.quadScene = new THREE.Scene();
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.brightMat);
      this.quad.frustumCulled = false;
      this.quadScene.add(this.quad);
      this.w = 0; this.h = 0;
    }

    setEnabled(on) {
      on = Boolean(on) && this.supported;
      if (on === this.enabled) return;
      this.enabled = on;
      window.GW_LINEAR_OUT.value = on ? 1 : 0;
      // HDR target holds linear scene radiance; tone mapping moves into the composite.
      this.renderer.toneMapping = on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    }

    _resize() {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const w = Math.max(1, size.x | 0), h = Math.max(1, size.y | 0);
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h;
      this.sceneRT.setSize(w, h);
      const hw = Math.max(1, w >> 2), hh = Math.max(1, h >> 2);
      this.brightRT.setSize(hw, hh);
      this.a1.setSize(hw, hh); this.a2.setSize(hw, hh);
      const qw = Math.max(1, w >> 3), qh = Math.max(1, h >> 3);
      this.b1.setSize(qw, qh); this.b2.setSize(qw, qh);
    }

    _pass(mat, target) {
      this.quad.material = mat;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.quadScene, this.quadCam);
    }

    render(scene, camera) {
      const r = this.renderer;
      if (!this.enabled) { r.render(scene, camera); return; }
      this._resize();
      const P = this.params;
      r.setRenderTarget(this.sceneRT);
      r.render(scene, camera);

      // bright pass at 1/4 res
      this.brightMat.uniforms.tSrc.value = this.sceneRT.texture;
      this.brightMat.uniforms.uThreshold.value = P.threshold;
      this.brightMat.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
      this._pass(this.brightMat, this.brightRT);
      // blur A (1/4)
      const bu = this.blurMat.uniforms;
      bu.tSrc.value = this.brightRT.texture; bu.uDir.value.set(1 / this.brightRT.width, 0); this._pass(this.blurMat, this.a1);
      bu.tSrc.value = this.a1.texture; bu.uDir.value.set(0, 1 / this.a1.height); this._pass(this.blurMat, this.a2);
      // blur B (1/8, wider)
      bu.tSrc.value = this.a2.texture; bu.uDir.value.set(1.5 / this.b1.width, 0); this._pass(this.blurMat, this.b1);
      bu.tSrc.value = this.b1.texture; bu.uDir.value.set(0, 1.5 / this.b1.height); this._pass(this.blurMat, this.b2);

      const cu = this.compMat.uniforms;
      cu.tScene.value = this.sceneRT.texture;
      cu.tBloomA.value = this.a2.texture;
      cu.tBloomB.value = this.b2.texture;
      cu.uExposure.value = P.exposure;
      cu.uBloom.value = P.bloom;
      cu.uSat.value = P.sat;
      cu.uContrast.value = P.contrast;
      cu.uVignette.value = P.vignette;
      cu.uSharpen.value = P.sharpen;
      cu.uTexel.value.set(1 / this.w, 1 / this.h);
      this._pass(this.compMat, null);
    }
  }

  window.PostFX = PostFX;
})();
