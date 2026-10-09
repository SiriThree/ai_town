import assert from "node:assert/strict";
import {readFile,readdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {parseEnv} from "node:util";
const env=parseEnv(await readFile(".env.local","utf8"));
const secret=env.AI_API_KEY;
assert.ok(secret?.length>12,"本机扫描需要本项目已配置密钥；不输出值");
async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await files(p));else if(e.isFile())result.push(p);}return result;}
const source=[...await files("src"),...await files("scripts"),...await files("tests"),...await files("public"),...await files("../docs"),...(await files("deploy")).filter(p=>!/(^|[\\/])(?:\.env(?!\.example$)|runtime\.env$)/.test(p)),"README.md",".env.example","deploy/.env.example","deploy/compose.yaml","deploy/Caddyfile","Dockerfile","package.json","package-lock.json","next.config.ts"];
const client=await files(".next/static");const matches=[];
for(const p of [...source,...client]){if((await readFile(p)).includes(Buffer.from(secret)))matches.push(p);}
assert.equal(matches.length,0,"存在包含密钥值的文件，禁止交付");
for(const p of client) assert.ok(!(await readFile(p)).includes(Buffer.from(env.DATABASE_URL)),"客户端包含数据库连接串");
const ignore=await readFile(".dockerignore","utf8");assert.ok(ignore.includes(".env*"));
const result={date:new Date().toISOString(),sourceFiles:source.length,clientBuildFiles:client.length,knownAIKeyMatches:0,clientDatabaseUrlMatches:0,envExamplesHaveNoRealKey:true,dockerExcludesEnv:true,scope:"本项目源码/示例/素材/交付文档与客户端构建；不是全部磁盘或Git历史扫描"};
await writeFile(`${process.env.EVIDENCE_DIR || "evidence/v5-1"}/secret-scan.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
