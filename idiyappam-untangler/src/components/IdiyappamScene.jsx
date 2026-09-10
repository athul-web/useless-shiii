import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import Idiyappam from './Idiyappam';

const BACKGROUND_COLOR = '#faf3e0';

/**
 * Sets up the Three.js canvas, lighting rig, camera and orbit controls
 * around the centered Idiyappam mesh. This component owns everything
 * needed to view the idiyappam - actual untangling interaction is added
 * in a later phase.
 */
function IdiyappamScene() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 2.6, 3.6], fov: 40 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={[BACKGROUND_COLOR]} />

      {/* Warm-tinted (not pure white) ambient fill: with dense
          self-shadowing across hundreds of tangled strands, a neutral
          white ambient was filling the occluded gaps with grey light.
          Position/intensity of the key lights below are unchanged. */}
      <ambientLight intensity={0.58} color="#fff3e0" />
      <directionalLight
        castShadow
        position={[3, 5, 2]}
        intensity={1.4}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      <Suspense fallback={null}>
        <Idiyappam />
        <ContactShadows
          position={[0, -0.22, 0]}
          opacity={0.35}
          scale={6}
          blur={2.2}
          far={1.2}
        />
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.2}
        maxDistance={6}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 + 0.3}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

export default IdiyappamScene;
