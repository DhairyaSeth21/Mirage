import { useEffect, useRef } from "react";
import * as THREE from "three";

const MirageScene = () => {
    const mountRef = useRef(null);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const width  = mount.clientWidth;
        const height = mount.clientHeight;

        // ---------- Scene / camera / renderer ----------
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#060606");
        scene.fog = new THREE.FogExp2("#060606", 0.11);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 0, 5.2);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.95;
        mount.appendChild(renderer.domElement);

        // ---------- Procedural neutral gradient cube env map ----------
        const makeGradientFace = (top, bottom) => {
            const c = document.createElement("canvas");
            c.width = 64; c.height = 64;
            const ctx = c.getContext("2d");
            const g = ctx.createLinearGradient(0, 0, 0, 64);
            g.addColorStop(0, top); g.addColorStop(1, bottom);
            ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
            return c;
        };
        const envFaces = [
            makeGradientFace("#1a1a1a", "#050505"),
            makeGradientFace("#1a1a1a", "#050505"),
            makeGradientFace("#222222", "#0a0a0a"),
            makeGradientFace("#020202", "#010101"),
            makeGradientFace("#1a1a1a", "#050505"),
            makeGradientFace("#1a1a1a", "#050505"),
        ];
        const envTexture = new THREE.CubeTexture(envFaces);
        envTexture.needsUpdate = true;
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envRT = pmrem.fromCubemap(envTexture);
        scene.environment = envRT.texture;

        // ---------- Radial glow sprite texture ----------
        const makeGlowTexture = () => {
            const size = 256;
            const c = document.createElement("canvas");
            c.width = size; c.height = size;
            const ctx = c.getContext("2d");
            const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
            grad.addColorStop(0,    "rgba(255,255,255,0.7)");
            grad.addColorStop(0.25, "rgba(220,220,220,0.25)");
            grad.addColorStop(0.55, "rgba(180,180,180,0.08)");
            grad.addColorStop(1,    "rgba(0,0,0,0)");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        };
        const glowTex = makeGlowTexture();

        // ---------- Backlit halo ----------
        const haloMat = new THREE.SpriteMaterial({
            map: glowTex, color: 0xdddddd,
            transparent: true, opacity: 0.45,
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const halo = new THREE.Sprite(haloMat);
        halo.scale.set(7, 7, 1);
        halo.position.set(0.2, 0.1, -1.2);
        scene.add(halo);

        // ---------- Volumetric fog glows ----------
        const fogGlows = [];
        for (let i = 0; i < 8; i++) {
            const m = new THREE.SpriteMaterial({
                map: glowTex, color: 0xbbbbbb,
                transparent: true,
                opacity: 0.10 + Math.random() * 0.10,
                depthWrite: false, blending: THREE.AdditiveBlending,
            });
            const s = new THREE.Sprite(m);
            const scale = 2.5 + Math.random() * 4;
            s.scale.set(scale, scale, 1);
            s.position.set(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 5,
                -2 - Math.random() * 3
            );
            scene.add(s);
            fogGlows.push({
                sprite: s,
                phase: Math.random() * Math.PI * 2,
                speed: 0.15 + Math.random() * 0.2,
                baseOpacity: m.opacity,
                baseX: s.position.x,
                baseY: s.position.y,
            });
        }

        // ---------- The Sphere ----------
        const geometry = new THREE.IcosahedronGeometry(1.4, 6);
        const originalPositions = new Float32Array(geometry.attributes.position.array);
        const normals = geometry.attributes.normal.array;

        const material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color("#0a0a0a"),
            metalness: 1.0, roughness: 0.18,
            clearcoat: 1.0, clearcoatRoughness: 0.06,
            reflectivity: 0.6, envMapIntensity: 0.85,
        });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        // ---------- Lighting ----------
        scene.add(new THREE.AmbientLight("#1a1a1a", 0.4));
        const keyLight = new THREE.DirectionalLight("#e8e8e8", 0.75);
        keyLight.position.set(4, 5, 3); scene.add(keyLight);

        const irisLight = new THREE.PointLight("#ffffff", 1.4, 8, 1.6);
        irisLight.position.set(0, 0, 3); scene.add(irisLight);

        const rimLight = new THREE.PointLight("#aaaaaa", 0.35, 16, 2);
        rimLight.position.set(-3, -1, -2); scene.add(rimLight);

        // ---------- Dust particles ----------
        const dustCount = 260;
        const dustPos = new Float32Array(dustCount * 3);
        const dustSpeed = new Float32Array(dustCount);
        for (let i = 0; i < dustCount; i++) {
            dustPos[i*3]   = (Math.random() - 0.5) * 9;
            dustPos[i*3+1] = (Math.random() - 0.5) * 6;
            dustPos[i*3+2] = (Math.random() - 0.5) * 4 - 0.5;
            dustSpeed[i]   = 0.0012 + Math.random() * 0.003;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
        const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
            color: "#cfcfcf", size: 0.011,
            transparent: true, opacity: 0.45,
            sizeAttenuation: true, depthWrite: false,
        }));
        scene.add(dust);

        // ---------- Mouse tracking ----------
        const mouseNDC = new THREE.Vector2(0, 0);
        const mouseTarget = new THREE.Vector2(0, 0);
        const mouseDir = new THREE.Vector3(0, 0, 1);
        const tmpDir = new THREE.Vector3();
        const handlePointerMove = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouseTarget.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            mouseTarget.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        };
        window.addEventListener("pointermove", handlePointerMove);

        // ---------- Animation ----------
        const positionAttr = geometry.attributes.position;
        const vertexCount = positionAttr.count;
        const clock = new THREE.Clock();
        let raf;
        const animate = () => {
            const t = clock.getElapsedTime();

            mouseNDC.x += (mouseTarget.x - mouseNDC.x) * 0.04;
            mouseNDC.y += (mouseTarget.y - mouseNDC.y) * 0.04;

            tmpDir.set(mouseNDC.x, mouseNDC.y, 0.5).unproject(camera);
            tmpDir.sub(sphere.position).normalize();
            mouseDir.copy(tmpDir);

            const pos = positionAttr.array;
            for (let i = 0; i < vertexCount; i++) {
                const ix = i * 3;
                const ox = originalPositions[ix], oy = originalPositions[ix+1], oz = originalPositions[ix+2];
                const nx = normals[ix], ny = normals[ix+1], nz = normals[ix+2];

                const w1 = Math.sin(ox * 1.6 + t * 0.7) * 0.035;
                const w2 = Math.sin(oy * 2.1 + t * 0.9 + 1.3) * 0.03;
                const w3 = Math.sin(oz * 2.7 + t * 1.1 + 2.6) * 0.025;
                let disp = w1 + w2 + w3;

                const facing = nx*mouseDir.x + ny*mouseDir.y + nz*mouseDir.z;
                const bulge = Math.max(0, facing);
                disp += Math.pow(bulge, 3.5) * 0.18;

                pos[ix]   = ox + nx * disp;
                pos[ix+1] = oy + ny * disp;
                pos[ix+2] = oz + nz * disp;
            }
            positionAttr.needsUpdate = true;

            sphere.rotation.y = t * 0.08;
            sphere.rotation.x = Math.sin(t * 0.15) * 0.06;

            const irisX = mouseNDC.x * 2.2;
            const irisY = mouseNDC.y * 1.6;
            irisLight.position.set(irisX, irisY, 2.5);
            const blink = Math.sin(t * 7.3) + Math.sin(t * 13.1) * 0.4;
            const baseIntensity = 1.4 + Math.sin(t * 0.6) * 0.15;
            irisLight.intensity = blink < -1.2 ? baseIntensity * 0.25 : baseIntensity;

            const haloPulse = 0.38 + Math.sin(t * 0.7) * 0.08;
            const flicker = Math.sin(t * 11.7) < -0.985 ? 0.1 : 1;
            haloMat.opacity = haloPulse * flicker;

            fogGlows.forEach(g => {
                const tt = t * g.speed + g.phase;
                g.sprite.position.x = g.baseX + Math.sin(tt) * 0.6;
                g.sprite.position.y = g.baseY + Math.cos(tt * 0.8) * 0.4;
                g.sprite.material.opacity =
                    g.baseOpacity * (0.55 + 0.45 * (Math.sin(tt * 1.3) * 0.5 + 0.5));
            });

            const dPos = dust.geometry.attributes.position.array;
            for (let i = 0; i < dustCount; i++) {
                dPos[i*3+1] += dustSpeed[i];
                dPos[i*3]   += Math.sin(t * 0.3 + i) * 0.0004;
                if (dPos[i*3+1] > 3.5) {
                    dPos[i*3+1] = -3.5;
                    dPos[i*3]   = (Math.random() - 0.5) * 9;
                }
            }
            dust.geometry.attributes.position.needsUpdate = true;

            camera.position.x += (mouseNDC.x * 0.25 - camera.position.x) * 0.03;
            camera.position.y += (mouseNDC.y * 0.18 - camera.position.y) * 0.03;
            camera.lookAt(0, 0, 0);

            renderer.render(scene, camera);
            raf = requestAnimationFrame(animate);
        };
        animate();

        // ---------- Resize ----------
        const onResize = () => {
            const w = mount.clientWidth, h = mount.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", onResize);

        // ---------- Cleanup ----------
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("pointermove", handlePointerMove);
            geometry.dispose(); material.dispose();
            dust.geometry.dispose(); dust.material.dispose();
            haloMat.dispose();
            fogGlows.forEach(g => g.sprite.material.dispose());
            glowTex.dispose();
            envRT.dispose(); envTexture.dispose(); pmrem.dispose();
            renderer.dispose();
            if (renderer.domElement && renderer.domElement.parentNode === mount) {
                mount.removeChild(renderer.domElement);
            }
        };
    }, []);

    return (
        <div
            ref={mountRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
    );
};

export default MirageScene;
