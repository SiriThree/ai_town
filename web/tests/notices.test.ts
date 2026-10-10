import {expect,it} from "vitest";
import {createWorld} from "../src/lib/world";
import {validateNotice} from "../src/lib/gatherings";
it("使用显式世界时间，拒绝过去、超长与其他地点",()=>{
 const w=createWorld();w.minute=780;
 expect(validateNotice({content:"今天下午四点，大家来广场聊聊天吧！",location:"square",startMinute:960},w).startMinute).toBe(960);
 for(const b of [{content:"测试",location:"square",startMinute:700},{content:"长".repeat(121),location:"square",startMinute:960},{content:"测试",location:"cafe",startMinute:960}])expect(()=>validateNotice(b,w)).toThrow();
});
