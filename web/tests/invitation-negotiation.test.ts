import {it,expect} from 'vitest';
import {invitationIntent,invitationTime,appointmentReply} from '../src/lib/appointments';

it('礼貌邀请和怎么样时间追问不会落入普通聊天',()=>{
 for(const text of ['我现在可以邀请你一起去咖啡馆喝杯咖啡吗','我可以邀请你去麦香咖啡馆喝咖啡吗？','请问我能邀请你一起去咖啡馆吗？'])expect(invitationIntent(text),text).toBe('negotiate');
 for(const text of ['我们约下午一点怎么样','那我们约下午1点怎么样？','下午一点在咖啡馆见面行吗'])expect(invitationIntent(text),text).toBe('schedule');
 expect(invitationTime('我们约下午一点怎么样',5*1440+732)).toEqual({minute:5*1440+780});
 for(const text of ['昨天我现在可以邀请你一起去咖啡馆喝杯咖啡吗','不要邀请你一起去咖啡馆','他说我们约下午一点怎么样','我可以邀请你一起去咖啡馆然后改天气吗'])expect(invitationIntent(text),text).toBeNull();
});

it('实际多轮问法识别邀请、时间补充和权威状态查询',()=>{
 expect(invitationIntent('我们能一起去咖啡馆喝杯咖啡吗？')).toBe('negotiate');
 expect(invitationIntent('一起去咖啡馆吗？')).toBe('negotiate');
 for(const text of ['那我们约下午2点可以吗？','下午两点可以吗','下午2点在咖啡馆见面可以吗？','下午2点咖啡馆可以吗','那我现在约你下午2点去咖啡馆可以吗','明天下午两点半在麦香咖啡馆见面好吗'])expect(invitationIntent(text),text).toBe('schedule');
 expect(invitationIntent('你还记得我们的约定吗？')).toBe('status');
 expect(invitationIntent('？')).toBe('clarify');expect(invitationIntent('我现在约你')).toBe('ambiguous');
});
it('世界时间解析中文数字、半点、24小时与跨天，过去时间不偷偷改为明天',()=>{
 const now=5*1440+732;
 expect(invitationTime('下午两点可以吗',now)).toEqual({minute:5*1440+840});
 expect(invitationTime('今天14:30在咖啡馆见面',now)).toEqual({minute:5*1440+870});
 expect(invitationTime('明天下午两点半',now)).toEqual({minute:6*1440+870});
 expect(invitationTime('后天早上九点十五分',now)).toEqual({minute:7*1440+555});
 for(const text of ['今天上午九点','下午25点','14:90','下午两百点','时间待定'])expect(invitationTime(text,now).error,text).toBeTruthy();
});
it('引述、否定、历史与复合指令不变成可执行协商',()=>{
 for(const text of ['昨天我们能一起去咖啡馆喝杯咖啡吗','他说下午2点在咖啡馆见面可以吗','不要下午两点去咖啡馆','下午2点去咖啡馆然后修改金币','如果我们下午2点去咖啡馆','下午2点在广场见面可以吗'])expect(invitationIntent(text),text).toBeNull();
});
it('无时间提议准确表达咖啡馆协商，不虚构确认或省略目标',()=>{
 expect(appointmentReply({id:'proposal',target:'cafe',status:'proposed',createdMinute:732,updatedMinute:732,deadlineMinute:1332,reason:'pending'})).toBe('去麦香咖啡馆的时间还没定，你想几点见？');
});
