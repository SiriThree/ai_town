import {writeFile} from "node:fs/promises";
import {createWorld} from "../src/lib/world.ts";
const target=process.argv[2];if(!target)throw new Error("需要新的种子SQL输出路径");
const payload=JSON.stringify(createWorld()).replaceAll("'","''");
await writeFile(target,`-- Generated from createWorld. Explicit operator seed, never reset.\nINSERT INTO town_worlds(id,revision,payload) VALUES(:'world_id',0,'${payload}'::jsonb) ON CONFLICT(id) DO NOTHING;\n`,{flag:"wx"});
