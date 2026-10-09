import {describe,it,expect,afterEach,vi} from "vitest";
import {visitorSession,verifySession} from "../src/lib/visitor-session";
const secret="test-only-cookie-signing-key-32-bytes-minimum";
const request=(cookie?:string)=>new Request("https://town.example/api/npcs/aqing/chat",{headers:{host:"town.example",...(cookie?{cookie}:{})}});
afterEach(()=>vi.unstubAllEnvs());
describe("匿名会话",()=>{
  it("生产Cookie签名、作用域和浏览器保护",()=>{
    vi.stubEnv("PUBLIC_DEMO","true");vi.stubEnv("COOKIE_SIGNING_SECRET",secret);
    const a=visitorSession(request(),true),b=visitorSession(request(),true);
    expect(a.id).not.toBe(b.id);expect(a.cookie).toMatch(/^__Host-town_session=/);
    for(const flag of ["Path=/","HttpOnly","SameSite=Strict","Secure","Max-Age=2592000"])expect(a.cookie).toContain(flag);
    expect(a.cookie).not.toContain("Domain=");expect(visitorSession(request(a.cookie!)).id).toBe(a.id);
    const token=a.cookie!.split(";")[0].split("=")[1];
    expect(verifySession(token,secret,Date.now()+31*86400000)).toBeNull();
    expect(verifySession(token,secret+"rotated")).toBeNull();
    expect(()=>visitorSession(request(a.cookie!.replace(a.id,b.id)))).toThrow("失效");
    expect(()=>visitorSession(request())).toThrow("会话缺失");
  });
  it("公开环境未配置密钥必须失败关闭；非本地主机不能使用开发默认",()=>{
    vi.stubEnv("PUBLIC_DEMO","true");vi.stubEnv("COOKIE_SIGNING_SECRET","");
    expect(()=>visitorSession(request(),true)).toThrow("安全配置");
    vi.stubEnv("COOKIE_SIGNING_SECRET","REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES");expect(()=>visitorSession(request(),true)).toThrow("安全配置");
    vi.stubEnv("COOKIE_SIGNING_SECRET","");
    vi.stubEnv("PUBLIC_DEMO","false");expect(()=>visitorSession(request(),true)).toThrow("安全配置");
  });
  it("伪造、重复Cookie不被接受",()=>{
    vi.stubEnv("PUBLIC_DEMO","true");vi.stubEnv("COOKIE_SIGNING_SECRET",secret);
    const a=visitorSession(request(),true);const cookie=a.cookie!.split(";")[0];
    expect(()=>visitorSession(request(`${cookie}; ${cookie}`))).toThrow();
    for(const token of ["","a.b.c","x".repeat(200),"%00"])expect(verifySession(token,secret)).toBeNull();
  });
});
