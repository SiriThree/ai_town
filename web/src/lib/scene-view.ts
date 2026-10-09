import { MAP, type Point } from "./world";
import type { SceneId } from "./player-scene";

export const RESIDENT_SCALE = 1.2;
export const HEAD_HEIGHT = 60 * RESIDENT_SCALE;
export type Viewport = { width: number; height: number };
export type Camera = { zoom: number; x: number; y: number };
export function sceneTransform(view: Viewport, camera: Camera, sceneId:SceneId="town") {
  // Frame the inhabited street, not all unused terrain. One transform drives canvas, hits and speech.
  const fit = Math.min(view.width / MAP.width, view.height / (sceneId==="town"?430:480));
  // 2 world units per raster pixel: half-unit desktop scales give integer screen pixels.
  // Small touch viewports retain fitting so both residents remain reachable.
  const base=view.width>=600?Math.max(.5,Math.round(fit*2)/2):fit;
  const scale=view.width>=600?Math.round(base*camera.zoom*2)/2:base*camera.zoom;
  return { scale, x: Math.round((view.width - MAP.width * scale) / 2 + camera.x), y: Math.round(view.height / 2 - (sceneId==="town"?270:310) * scale + camera.y) };
}
export function screenPoint(point: Point, view: Viewport, camera: Camera,sceneId:SceneId="town") {
  const t = sceneTransform(view, camera,sceneId);
  return { x: t.x + point.x * t.scale, y: t.y + point.y * t.scale };
}
// Keep part of the town reachable while allowing residents to leave the viewport.
export function boundedCamera(camera: Camera, view: Viewport): Camera {
  return { zoom: Math.max(1, Math.min(2, camera.zoom)), x: Math.max(-view.width / 2, Math.min(view.width / 2, camera.x)), y: Math.max(-view.height / 2, Math.min(view.height / 2, camera.y)) };
}
export function bubblePlacement(point: Point, view: Viewport, camera: Camera, bubble: Viewport,sceneId:SceneId="town") {
  const foot = screenPoint(point, view, camera,sceneId);
  const head = foot.y - HEAD_HEIGHT * sceneTransform(view, camera,sceneId).scale;
  if (foot.x < 12 || foot.x > view.width - 12 || head < 20 || foot.y > view.height) return null;
  const width = Math.min(bubble.width, view.width - 24);
  const left = Math.max(12, Math.min(view.width - width - 12, foot.x - width / 2));
  // At the upper edge, shorten the scrollable content rather than cover the actor.
  // Leave the desktop camera toolbar reachable when a resident reaches an upper corner.
  const topInset=view.width>=600?60:10;
  const height = Math.min(bubble.height, head - topInset - 10);
  if (height < 66) return null;
  return { left, top: head - height - 10, width, height, tail: foot.x - left };
}
