import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { computeCentroid } from './strandUtils';
import { playDepositSound, playSelectSound } from '../utils/sound';

const TUBE_RADIAL_SEGMENTS = 6;
const TUBE_SEGMENTS = 170; // built once - see performance note below
const DISPOSE_DURATION = 0.65; // seconds, strand-into-bin flight time

const ORIGIN = new THREE.Vector3(0, 0, 0);

/**
 * Scales the (screen-space) suction radius down a bit on narrow
 * viewports so the invisible catch zone stays proportionate to the
 * on-screen bin size instead of feeling oversized on phones.
 */
function getResponsiveSuctionRadius(baseRadiusPx) {
  if (typeof window === 'undefined') return baseRadiusPx;
  const w = window.innerWidth;
  if (w < 420) return baseRadiusPx * 0.7;
  if (w < 700) return baseRadiusPx * 0.85;
  return baseRadiusPx;
}

/**
 * A single interactive rice strand for Phase 3.
 *
 * Visually this is still the same "tube built from a Catmull-Rom curve
 * through procedurally generated points" as before - same material, same
 * tube parameters, same tangled base shape. The interaction model:
 *
 * - The strand's own curve points never change. The whole strand is
 *   wrapped in a <group> and dragged as a rigid body by moving that
 *   group's position (`offsetRef`), so the geometry is built exactly once
 *   and only translated while dragging.
 * - The offset persists across grabs: releasing leaves it exactly where
 *   dropped, and grabbing again continues from that offset. There is no
 *   click-to-reset behavior anywhere in this component.
 *
 * Bin interaction is entirely screen-space, because the bin itself is now
 * a fixed HTML overlay (BinUI.jsx) rather than a 3D object:
 *
 * - Every drag frame, this strand's current world position (centroid +
 *   offset - i.e. the strand's approximate middle, not its start point)
 *   is projected to on-screen pixel coordinates via the active camera,
 *   and compared against `binRectRef.current` (the bin's live bounding
 *   box, kept fresh by BinUI) to decide "near" (lid opens). The instant
 *   it comes within the bin's small invisible suction radius, the drag
 *   is torn down automatically and treated as a drop - the user never
 *   has to release at a precise point.
 * - On a successful catch the strand is locked (no further dragging) and
 *   enters a dedicated `disposing` animation: each frame it re-projects
 *   the bin's on-screen center back into a 3D world point (a ray from the
 *   camera through that screen point, intersected with the plane through
 *   the idiyappam's origin) and eases toward that point while shrinking.
 *   Recomputing this every frame - rather than once at drop time - keeps
 *   the flight visually correct even if the camera moves slightly during
 *   the animation, since the bin's actual anchor is its fixed screen
 *   position, not a fixed 3D point.
 * - Only once that animation finishes does the mesh get hidden and
 *   `onDisposed` fire, so progress advances exactly when the strand
 *   visibly reaches the bin - never at release time.
 */
const InteractiveStrand = forwardRef(function InteractiveStrand(
  {
    id,
    basePoints,
    colorVariant,
    isSelected,
    onSelect,
    onDisposed,
    onDropped,
    onDragStateChange,
    onNearBinChange,
    binRectRef,
    binSuctionRadiusPx,
  },
  ref
) {
  const { camera, gl } = useThree();
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [disposed, setDisposed] = useState(false);

  const [strandRadius] = useState(() => 0.011 + Math.random() * 0.007);
  const centroid = useMemo(() => computeCentroid(basePoints), [basePoints]);

  const baseGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(basePoints, false, 'catmullrom', 0.45);
    return new THREE.TubeGeometry(curve, TUBE_SEGMENTS, strandRadius, TUBE_RADIAL_SEGMENTS, false);
  }, [basePoints, strandRadius]);

  // idle -> dragging -> (released near bin) -> disposing -> removed
  // "idle"/"dragging" are tracked via draggingRef; "disposing"/"removed"
  // via disposingRef + the `disposed` state below.
  const offsetRef = useRef(new THREE.Vector3());
  const dragStartOffsetRef = useRef(new THREE.Vector3());
  const dragStartHitRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(new THREE.Plane());
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerNdcRef = useRef(new THREE.Vector2());
  const draggingRef = useRef(false);
  const wasNearBinRef = useRef(false);

  // Held while a drag is in progress so the suction check (in useFrame)
  // can tear the drag down itself - removing the window listeners and
  // releasing pointer capture - the moment the strand's center enters
  // the bin's suction zone, instead of waiting for pointerup.
  const activeMoveHandlerRef = useRef(null);
  const activeUpHandlerRef = useRef(null);
  const activePointerIdRef = useRef(null);

  const disposingRef = useRef(false);
  const disposeStartRef = useRef(0);
  const disposeFromRef = useRef(new THREE.Vector3());
  const disposeToRef = useRef(new THREE.Vector3());

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        draggingRef.current = false;
        disposingRef.current = false;
        wasNearBinRef.current = false;
        offsetRef.current.set(0, 0, 0);
        if (groupRef.current) {
          groupRef.current.position.set(0, 0, 0);
          groupRef.current.scale.setScalar(1);
          groupRef.current.visible = true;
        }
        setDisposed(false);
        setHovered(false);
      },
    }),
    []
  );

  /** Projects a world-space point to CSS pixel coordinates on the page. */
  const worldToScreen = useCallback(
    (worldPoint) => {
      const ndc = worldPoint.clone().project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return {
        x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (1 - (ndc.y * 0.5 + 0.5)) * rect.height,
      };
    },
    [camera, gl]
  );

  /**
   * Unprojects the bin's fixed on-screen center back into a 3D world
   * point (on the plane through the idiyappam's origin facing the
   * camera), so the disposal animation always flies toward wherever the
   * bin actually is on screen right now.
   */
  const binScreenCenterToWorld = useCallback(
    (rect) => {
      const canvasRect = gl.domElement.getBoundingClientRect();
      if (canvasRect.width === 0 || canvasRect.height === 0) return null;

      const ndcX = ((rect.centerX - canvasRect.left) / canvasRect.width) * 2 - 1;
      const ndcY = -(((rect.centerY - canvasRect.top) / canvasRect.height) * 2 - 1);

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      dragPlaneRef.current.setFromNormalAndCoplanarPoint(direction, ORIGIN);

      raycasterRef.current.setFromCamera({ x: ndcX, y: ndcY }, camera);
      const hitPoint = new THREE.Vector3();
      const hit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, hitPoint);
      return hit ? hitPoint : null;
    },
    [camera, gl]
  );

  /**
   * Called mid-drag the instant the strand's center enters the bin's
   * invisible suction zone. Tears down the manual drag (removes the
   * window pointer listeners, releases pointer capture) and hands off
   * to the same fly-into-bin `disposing` animation used on a precise
   * drop, so the user never has to release at an exact point - getting
   * moderately close is enough.
   */
  const triggerSuction = useCallback(() => {
    if (disposingRef.current) return;

    draggingRef.current = false;
    onDragStateChange(false);

    if (activeMoveHandlerRef.current) {
      window.removeEventListener('pointermove', activeMoveHandlerRef.current);
    }
    if (activeUpHandlerRef.current) {
      window.removeEventListener('pointerup', activeUpHandlerRef.current);
    }
    activeMoveHandlerRef.current = null;
    activeUpHandlerRef.current = null;

    if (activePointerIdRef.current != null) {
      try {
        gl.domElement.releasePointerCapture?.(activePointerIdRef.current);
      } catch {
        // Best-effort - ignore if capture was already released.
      }
      activePointerIdRef.current = null;
    }

    wasNearBinRef.current = false;
    onNearBinChange(false);

    disposeFromRef.current.copy(offsetRef.current);
    disposeToRef.current.copy(offsetRef.current); // safe fallback until first frame recomputes it
    disposeStartRef.current = performance.now() / 1000;
    disposingRef.current = true;
    playDepositSound();
    onDropped?.(id);
  }, [gl, id, onDragStateChange, onNearBinChange, onDropped]);

  // Per-frame work: idle strands cost nothing. Only the strand currently
  // being dragged (translated) or mid-disposal (animated into the bin)
  // does any work here.
  useFrame(() => {
    if (disposingRef.current) {
      const elapsed = performance.now() / 1000 - disposeStartRef.current;
      const t = Math.min(1, elapsed / DISPOSE_DURATION);
      const eased = 1 - (1 - t) ** 3;

      const rect = binRectRef?.current;
      if (rect && rect.width > 0) {
        const worldTarget = binScreenCenterToWorld(rect);
        if (worldTarget) {
          disposeToRef.current.copy(worldTarget).sub(centroid);
        }
      }

      if (groupRef.current) {
        groupRef.current.position.lerpVectors(disposeFromRef.current, disposeToRef.current, eased);
        groupRef.current.scale.setScalar(Math.max(0.001, 1 - eased));
      }

      if (t >= 1) {
        disposingRef.current = false;
        if (groupRef.current) groupRef.current.visible = false;
        setDisposed(true);
        onDisposed(id);
      }
      return;
    }

    if (!draggingRef.current) return;

    raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);
    const hit = new THREE.Vector3();
    const hitFound = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, hit);
    if (!hitFound) return;

    const delta = hit.clone().sub(dragStartHitRef.current);
    const nextOffset = dragStartOffsetRef.current.clone().add(delta);
    offsetRef.current.copy(nextOffset);
    if (groupRef.current) groupRef.current.position.copy(nextOffset);

    const rect = binRectRef?.current;
    if (rect && rect.width > 0) {
      // Distance from the dragged strand's approximate middle (its
      // centroid, offset by the current drag delta) to the bin's live
      // screen-space center - not the strand's start point, and not
      // requiring pixel-perfect alignment with the bin.
      const worldPos = centroid.clone().add(nextOffset);
      const screenPos = worldToScreen(worldPos);
      const dx = screenPos.x - rect.centerX;
      const dy = screenPos.y - rect.centerY;
      const distPx = Math.sqrt(dx * dx + dy * dy);
      const suctionRadius = getResponsiveSuctionRadius(binSuctionRadiusPx);
      const isNear = distPx <= suctionRadius;

      if (isNear && !wasNearBinRef.current) {
        wasNearBinRef.current = true;
        onNearBinChange(true);
        // Caught: lock the strand and let the disposing animation
        // (below) carry it the rest of the way into the bin.
        triggerSuction();
        return;
      }
      if (!isNear && wasNearBinRef.current) {
        wasNearBinRef.current = false;
        onNearBinChange(false);
      }
    }
  });

  const handlePointerDown = useCallback(
    (e) => {
      if (disposed || disposingRef.current) return;
      e.stopPropagation();
      const mesh = meshRef.current;
      if (!mesh) return;

      dragStartOffsetRef.current.copy(offsetRef.current);
      dragStartHitRef.current.copy(e.point);

      // Drag plane faces the camera and passes through the grab point, so
      // pointer movement maps to a stable 3D offset instead of jumping in
      // depth.
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      dragPlaneRef.current.setFromNormalAndCoplanarPoint(normal, e.point);

      const rect = gl.domElement.getBoundingClientRect();
      pointerNdcRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      draggingRef.current = true;
      onSelect(id);
      onDragStateChange(true);
      playSelectSound();

      try {
        gl.domElement.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }

      function onMove(ev) {
        const r = gl.domElement.getBoundingClientRect();
        pointerNdcRef.current.set(
          ((ev.clientX - r.left) / r.width) * 2 - 1,
          -((ev.clientY - r.top) / r.height) * 2 + 1
        );
      }

      function onUp() {
        if (!draggingRef.current) return; // already handled by mid-drag suction
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        activeMoveHandlerRef.current = null;
        activeUpHandlerRef.current = null;

        // Normal per-frame suction (in useFrame, above) is what usually
        // catches the strand while it's still moving. This is just a
        // safety net for the rare case where the pointer is released on
        // the exact same frame it entered the zone, using that same
        // radius - never a smaller/separate "precise drop" target.
        const binRect = binRectRef?.current;
        let droppedInBin = false;
        if (binRect && binRect.width > 0) {
          const worldPos = centroid.clone().add(offsetRef.current);
          const screenPos = worldToScreen(worldPos);
          const dx = screenPos.x - binRect.centerX;
          const dy = screenPos.y - binRect.centerY;
          const distPx = Math.sqrt(dx * dx + dy * dy);
          droppedInBin = distPx <= getResponsiveSuctionRadius(binSuctionRadiusPx);
        }

        if (droppedInBin) {
          triggerSuction();
          return;
        }

        draggingRef.current = false;
        onDragStateChange(false);
        activePointerIdRef.current = null;
        if (wasNearBinRef.current) {
          wasNearBinRef.current = false;
          onNearBinChange(false);
        }
        // Released outside the suction zone: offsetRef already holds the
        // drop position, nothing else to do - the strand simply stays
        // there and can be grabbed again from this same spot.
      }

      activeMoveHandlerRef.current = onMove;
      activeUpHandlerRef.current = onUp;
      activePointerIdRef.current = e.pointerId;

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [
      disposed,
      camera,
      gl,
      id,
      onSelect,
      onDragStateChange,
      onNearBinChange,
      centroid,
      binRectRef,
      binSuctionRadiusPx,
      worldToScreen,
      triggerSuction,
    ]
  );

  const emissiveColor = isSelected ? '#caa15a' : '#3d2e1a';
  const emissiveIntensity = isSelected ? 0.12 : hovered ? 0.075 : 0.045;

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        geometry={baseGeometry}
        visible={!disposed}
        castShadow
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!disposed) setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={colorVariant}
          roughness={0.62}
          metalness={0}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
    </group>
  );
});

export default InteractiveStrand;
