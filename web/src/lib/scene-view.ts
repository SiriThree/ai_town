import { MAP, type Point } from "./world";
import { SCENES, type SceneId } from "./scene-data";

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
// Bounds come from actual content dimensions; the old street remains the default camera anchor.
export function boundedCamera(camera: Camera, view: Viewport,sceneId:SceneId="town"): Camera {
  const minimumZoom=.5/sceneTransform(view,{zoom:1,x:0,y:0},sceneId).scale;
  const zoom=Math.max(minimumZoom,Math.min(2.5,camera.zoom)),t=sceneTransform(view,{zoom,x:0,y:0},sceneId),size=SCENES[sceneId].size;
  return {zoom,x:Math.max(Math.min(0,view.width*.7-t.x-size.width*t.scale),Math.min(Math.max(0,view.width*.3-t.x),camera.x)),
    y:Math.max(Math.min(0,view.height*.7-t.y-size.height*t.scale),Math.min(Math.max(0,view.height*.3-t.y),camera.y))};
}
export function overviewCamera(view:Viewport,sceneId:SceneId):Camera {
  const size=SCENES[sceneId].size,base=sceneTransform(view,{zoom:1,x:0,y:0},sceneId).scale;
  const scale=Math.max(.5,Math.floor(Math.min(view.width/size.width,view.height/size.height)*2)/2);
  return {zoom:scale/base,x:(MAP.width-size.width)*scale/2,y:((sceneId==="town"?270:310)-size.height/2)*scale};
}
export function followPlayer(point:Point,view:Viewport,camera:Camera,sceneId:SceneId):Camera {
  const screen=screenPoint(point,view,camera,sceneId),marginX=Math.min(240,view.width/3),marginY=Math.min(160,view.height/3);
  const dx=screen.x<marginX?marginX-screen.x:screen.x>view.width-marginX?view.width-marginX-screen.x:0;
  const dy=screen.y<marginY?marginY-screen.y:screen.y>view.height-marginY?view.height-marginY-screen.y:0;
  return dx||dy?boundedCamera({...camera,x:camera.x+dx,y:camera.y+dy},view,sceneId):camera;
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
