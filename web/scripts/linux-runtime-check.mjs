import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
const release=process.env.LINUX_RELEASE_DIR,nodeBinary=process.env.LINUX_NODE_BINARY,archive=process.env.LINUX_RELEASE_ARCHIVE;
if(!release||!nodeBinary||!archive)throw new Error("提供本轮Linux构建目录与Linux Node二进制路径，禁止Windows产物");
assert.equal(JSON.parse(await readFile(path.join(release,"release.json"),"utf8")).platform,"linux");
const name=`ai-town-v52-check-${randomUUID().slice(0,8)}`,base="http://127.0.0.1:3111",dir=process.env.EVIDENCE_DIR||"evidence/v5-2/linux-runtime";
await mkdir(dir,{recursive:true});let created=false,browser;const checks=[];
function docker(args,input){const r=spawnSync("docker",args,{encoding:"utf8",input,windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});if(r.status!==0)throw new Error(`Docker test command ${args[0]} failed: ${r.stderr||r.error||r.stdout}`);return r.stdout.trim();}
const exec=(args,input)=>docker(["exec",...(input?["-i"]:[]),name,...args],input);
const sql=(query,db="ai_town_mvp")=>exec(["psql","-XAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",db,"-c",query]);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function launch(){docker(["exec","-d","--user","postgres","-e","DATABASE_URL=postgresql://town_app:test-only-runtime-password@127.0.0.1:5432/ai_town_mvp","-e","WORLD_ID=linux-check","-e","PUBLIC_DEMO=true","-e","COOKIE_SIGNING_SECRET=isolated-linux-test-key-52-not-a-real-production-key","-e","AI_ENABLED=false","-e","AI_API_KEY=","-e","HOSTNAME=0.0.0.0","-e","PORT=3100",name,"sh","-c","echo $$ > /tmp/town-app.pid; exec /usr/bin/node /srv/ai-town/releases/test52/server.js > /tmp/town-app.log 2>&1"]);}
async function ready(){for(let i=0;i<60;i++){try{if((await fetch(base+"/api/health")).ok)return;}catch{}await pause(500);}throw new Error("Linux runtime health timeout");}
try{
  docker(["run","-d","--pull=never","--name",name,"--memory=2g","--cpus=2","--tmpfs","/var/lib/postgresql/data:rw,size=512m","-p","127.0.0.1:3111:3100","-e","POSTGRES_PASSWORD=isolated-test-admin-password","postgres:17"]);created=true;
  for(let i=0;i<60;i++){const r=spawnSync("docker",["exec",name,"pg_isready","-U","postgres"],{windowsHide:true,stdio:"ignore"});if(r.status===0)break;await pause(500);}
  exec(["mkdir","-p","/srv/ai-town/releases/test52","/opt/town-ops","/var/backups/ai-town"]);
  docker(["cp",nodeBinary,`${name}:/usr/bin/node`]);exec(["chmod","755","/usr/bin/node"]);
  docker(["cp",archive,`${name}:/tmp/release.tar.gz`]);
  exec(["tar","-xzf","/tmp/release.tar.gz","-C","/srv/ai-town/releases/test52"]);
  // docker cp source/. semantics; refuse nesting/missing entry rather than guess a different root.
  exec(["test","-f","/srv/ai-town/releases/test52/server.js"]);
  docker(["cp",path.resolve("deploy/linux/.")+path.sep+".",`${name}:/opt/town-ops`]);
  exec(["chown","-R","root:root","/srv/ai-town/releases/test52"]);
  exec(["chown","postgres:postgres","/var/backups/ai-town"]);
  exec(["psql","-X","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],await readFile("deploy/linux/roles.sql","utf8"));
  sql("ALTER ROLE town_app PASSWORD 'test-only-runtime-password'");
  docker(["exec","--user","postgres",name,"bash","/opt/town-ops/prepare-db.sh","/srv/ai-town/releases/test52","linux-check"]);
  checks.push("原生Linux产物+Linux Node运行；生产roles/schema/seed/grants脚本在新建临时PG集群执行");
  launch();await ready();process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve(".browsers");const {chromium,expect}=await import("@playwright/test");browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  await page.goto(base+"/?npc=aqing");await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-ready","true");
  await page.getByRole("button",{name:"推进一步"}).click();await expect(page.getByTestId("revision")).toHaveText("存档版本 1");
  await page.getByRole("textbox").fill("Linux验收：你现在在哪？");await page.getByRole("textbox").press("Enter");await expect(page.getByTestId("reply-source")).toContainText("未配置模型");
  await expect(page.getByTestId("npc-aqing")).toHaveAttribute("data-motion","idle");await page.screenshot({path:`${dir}/01-linux-standalone.png`,fullPage:true});
  const world=await(await fetch(base+"/api/world")).json(),history=await(await context.request.get(base+"/api/npcs/aqing/chat")).json();
  assert.equal(history.turns.length,1);assert.equal((await fetch(base+"/api/world/init",{method:"POST"})).status,403);
  checks.push("最小权限运行账号提供真实HTTP/Pixi静态资源、推进及私聊Fallback；公网初始化关闭");
  const appPid=exec(["cat","/tmp/town-app.pid"]);assert.match(appPid,/^\d+$/);exec(["kill","-TERM",appPid]);await pause(500);launch();await ready();
  assert.deepEqual(await(await fetch(base+"/api/world")).json(),world);assert.deepEqual(await(await context.request.get(base+"/api/npcs/aqing/chat")).json(),history);
  checks.push("Linux应用进程重启后世界及签名会话私聊一致；不是systemd异常重启验收");
  const backupOutput=docker(["exec","--user","postgres",name,"bash","/opt/town-ops/backup.sh"]);
  const dump=backupOutput.match(/Backup created: (\/var\/backups\/ai-town\/[^\s]+)/)?.[1];assert.ok(dump);
  const restored=docker(["exec","--user","postgres",name,"bash","/opt/town-ops/restore-test.sh",dump]);
  const restoredDb=restored.match(/Restored into isolated (ai_town_restore_\w+)/)?.[1];assert.ok(restoredDb);
  assert.equal(sql("SELECT md5(payload::text) FROM town_worlds WHERE id='linux-check'",restoredDb),sql("SELECT md5(payload::text) FROM town_worlds WHERE id='linux-check'"));
  assert.equal(sql("SELECT md5(turns::text) FROM town_private_chats",restoredDb),sql("SELECT md5(turns::text) FROM town_private_chats"));
  assert.equal(sql("SELECT md5(jsonb_agg(t ORDER BY kind)::text) FROM town_chat_limits t",restoredDb),sql("SELECT md5(jsonb_agg(t ORDER BY kind)::text) FROM town_chat_limits t"));
  checks.push("实际backup.sh/restore-test.sh恢复到新隔离库，世界、私聊和用量哈希相等，原库未覆盖");
  const stats=docker(["stats","--no-stream","--format","{{json .}}",name]);
  await writeFile(`${dir}/result.json`,JSON.stringify({date:new Date().toISOString(),checks,container:name,stats:JSON.parse(stats),platform:"Linux x64 in fresh cached postgres:17 test container, not production",realAI:false,systemd:"not tested here",restoredDb},null,2));console.log(`${checks.length} Linux runtime/backup groups passed`);
}catch(error){if(created)await writeFile(`${dir}/container.log`,docker(["logs",name])+"\nAPP:\n"+exec(["cat","/tmp/town-app.log"]));throw error;}
finally{await browser?.close();if(created){docker(["stop",name]);docker(["rm",name]);}}
