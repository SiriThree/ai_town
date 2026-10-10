import type {World} from "./world";

export type Attendance={npcId:string;status:"accepted"|"declined"|"deferred"|"travelling"|"arrived"|"participated"|"missed"|"cancelled";reason:string;notifiedMinute:number;updatedMinute:number;arrivedMinute?:number;participatedMinute?:number;eventId?:number};
// Public content only. Visitor credentials and private acquaintance stay in SQL.
export type Gathering={id:string;worldId:string;kind:"gathering";content:string;location:"square";createdMinute:number;startMinute:number;endMinute:number;status:"scheduled"|"active"|"ended"|"cancelled";responses:Attendance[];result?:string};
export const activeGathering=(a:Gathering)=>a.status==="scheduled"||a.status==="active";
export function validateNotice(value:unknown,w:World):{content:string;startMinute:number;location:"square"}{
 const b=value as {content?:unknown;startMinute?:unknown;location?:unknown}|null;
 if(typeof b?.content!=="string"||!b.content.trim()||[...b.content.trim()].length>120||/[\u0000-\u001f]/.test(b.content))throw new Error("公告内容需为1–120字，不含控制字符。");
 if(b.location!=="square")throw new Error("目前只支持树荫广场聚会。");
 if(!Number.isSafeInteger(b.startMinute))throw new Error("请选择明确的世界日期和时间。");
 const start=b.startMinute as number;
 if(start<=w.minute)throw new Error("这个世界时间已经过去，请重新选择。");
 if(start<w.minute+30||start>w.minute+2880)throw new Error("请安排在30游戏分钟后至两天内。");
 return {content:b.content.trim(),startMinute:start,location:"square"};
}
