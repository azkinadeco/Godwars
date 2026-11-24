const { chromium } = require('playwright');
const fs=require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e=>console.log('PAGEERR', e.message));
  await p.goto('file:///Users/apple/Documents/CODING/God%20Wars/index.html', {waitUntil:'domcontentloaded'});
  await p.waitForTimeout(5000);
  await p.evaluate(() => document.getElementById('btn-instant-drop').click());
  await p.waitForTimeout(30000);
  const data = await p.evaluate(async () => {
    const G = window.GAME, R = G.renderer, S = G.scene;
    G.matchActive = false; // freeze loop rendering (lobby branch renders lobby; we render after)
    const rad = G.world.islandRadius * 1.18;
    const cam = new THREE.OrthographicCamera(-rad, rad, rad, -rad, 1, 2000);
    cam.position.set(0, 900, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
    const hidden = [];
    S.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius >= 300) { o.visible = false; hidden.push(o); } });
    [G.player && G.player.mesh, G.viewmodelHolder].forEach(o=>{ if(o) o.visible=false; });
    (G.bots||[]).forEach(bt=>{ if(bt.mesh) bt.mesh.visible=false; });
    if (G.dropship) G.dropship.visible = false;
    if (G.world.ringMesh) G.world.ringMesh.visible = false;
    S.traverse(o => { if (o.name && /ring|storm|wall/i.test(o.name)) o.visible = false; });
    const fog = S.fog; S.fog = null;
    const bg = S.background; S.background = new THREE.Color(0x0b1220);
    if (G.post) G.post.setEnabled(false);
    R.setPixelRatio(1); R.setSize(1024, 1024, false); R.toneMappingExposure = 0.5; S.traverse(o=>{ if(o.isHemisphereLight||o.isAmbientLight) o.intensity*=0.6; });
    if (G.world.sunLight) { G.world.sunLight.position.set(120, 300, 160); G.world.sunLight.target.position.set(0,0,0); G.world.sunLight.target.updateMatrixWorld(); const sc=G.world.sunLight.shadow.camera; sc.left=-rad; sc.right=rad; sc.top=rad; sc.bottom=-rad; sc.far=900; sc.updateProjectionMatrix(); }
    await new Promise(r => setTimeout(r, 12000));
    R.setSize(1024, 1024, false);
    R.render(S, cam); R.render(S, cam);
    const url = R.domElement.toDataURL('image/webp', 0.85);
    return { url, rad: G.world.islandRadius };
  });
  console.log('islandRadius', data.rad);
  fs.writeFileSync('/Users/apple/Documents/CODING/God Wars/assets/ui/map_island.webp', Buffer.from(data.url.split(',')[1], 'base64'));
  await b.close();
})();
