import {describe,it,expect,vi} from "vitest";
import {buildMessages} from "../src/lib/chat-context";
import {createWorld} from "../src/lib/world";
import {modelReply, type AIConfig} from "../src/lib/chat-model";
import {readJson,failed} from "../src/lib/http";
const config:AIConfig={enabled:true,key:"dummy",baseUrl:"https://test.invalid/v1",model:"dummy",timeoutMs:100,testMode:false};
describe("交付安全与当前事实",()=>{
  it("历史咖啡馆回答不能成为当前事实，时间/版本明确区分",()=>{
    const world=createWorld();world.revision=8;
    const messages=buildMessages(world.npcs[0],world,[{id:"old",message:"你在哪",reply:"我现在在咖啡馆",source:"ai",minute:470,worldRevision:7,createdAt:"old"}],"你现在在哪？");
    const facts=JSON.parse(messages[0].content.split("世界事实：\n")[1]);
    expect(facts.location).toBe("树荫广场");expect(facts.historicalDialogue[0].worldRevision).toBe(7);
    expect(messages[1].content).toContain("当前位置「树荫广场」");
    expect(messages[1].content).toContain("过去须说");expect(messages[1].content).toContain("计划须说");
    expect(messages.filter(m=>m.role==="assistant")).toHaveLength(0);
  });
  it("预算用尽时不访问模型，仍提供本地回答；未配置不消耗预算",async()=>{
    const transport=vi.fn();const reserve=vi.fn(async()=>false);
    expect((await modelReply([],()=>"真实状态",config,transport,vi.fn(),reserve)).reason).toBe("budget_exhausted");
    expect(transport).not.toHaveBeenCalled();expect(reserve).toHaveBeenCalledTimes(1);
    await modelReply([],()=>"状态",{...config,key:""},transport,vi.fn(),reserve);
    expect(reserve).toHaveBeenCalledTimes(1);
  });
  it("不静默截断模型全文，异常过长响应明确降级",async()=>{
    const reply=await modelReply([],()=>"降级",config,async()=>Response.json({choices:[{message:{content:"文".repeat(4001)}}]}),vi.fn());
    expect(reply.reason).toBe("invalid_response");
  });
  it("无Content-Length的分块请求也限制4096字节",async()=>{
    const request=new Request("http://localhost",{method:"POST",body:'{"message":"'+"文".repeat(1500)+'"}'});
    await expect(readJson(request)).rejects.toThrow("请求过长");
    expect(await readJson(new Request("http://localhost",{method:"POST",body:'{"message":"你好"}'}))).toEqual({message:"你好"});
  });
  it("内部数据库错误不返回原始信息",async()=>{
    const response=failed(new Error("postgres://private:secret@internal"));
    expect(response.status).toBe(503);expect(await response.text()).not.toMatch(/secret|postgres|internal/);
  });
});
