/** Optional one-time testing reset. DRY RUN unless --confirm. Never SQL-TRUNCATE storage.objects. */
import { createClient } from '@supabase/supabase-js';

const ref = 'cwmsqihdtxsfgmslavpk';
const endpoint = `https://${ref}.supabase.co`;
const key = process.env.LOVEBUG_ADMIN_KEY;
const confirm = process.argv.includes('--confirm');
const legacy = process.argv.includes('--include-legacy');
if (!key) throw new Error('Set LOVEBUG_ADMIN_KEY privately in your terminal. Do not commit or print it.');
if (confirm && process.env.LOVEBUG_RESET_CONFIRM !== ref)
  throw new Error(`For a destructive run, set LOVEBUG_RESET_CONFIRM=${ref} explicitly.`);
const db = createClient(endpoint,key,{ auth:{autoRefreshToken:false,persistSession:false} });
const buckets = ['lovebug-v6-private',...(legacy ? ['lovebug-private'] : [])];

async function allPaths(bucket, prefix = '') {
  const result=[];
  for (let offset=0;;offset+=100) {
    const {data,error}=await db.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw new Error(`${bucket}: cannot list objects (${error.message})`);
    if(!data?.length)break;
    for(const item of data){
      const path=prefix?`${prefix}/${item.name}`:item.name;
      if(item.id==null)result.push(...await allPaths(bucket,path));
      else result.push(path);
    }
    if(data.length<100)break;
  }
  return result;
}
async function allRows(table,selector='id') {
  const output=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from(table).select(selector).range(offset,offset+499);
    if(error)throw new Error(`${table}: ${error.message}`);
    output.push(...data);
    if(data.length<500)break;
  }
  return output;
}

const objects=[];
for(const bucket of buckets){
  const paths=await allPaths(bucket);
  objects.push({bucket,paths});
  console.log(`${bucket}: ${paths.length} Storage objects`);
}
const names=['lovebug_v6_removal_requests','lovebug_v6_photos','lovebug_v6_invites',
  'lovebug_v6_active_links','lovebug_v6_members','lovebug_v6_couples'];
const rows=[];
for(const table of names){
  const count=await allRows(table,'*');
  rows.push({table,count:count.length});
  console.log(`${table}: ${count.length} rows`);
}
if(legacy)console.log('Legacy Storage selected. Legacy prototype DB rows are NOT removed by this script.');
console.log('keep_alive_log, secrets, auth users, guest live rooms and browser IndexedDB are not selected.');
if(!confirm){console.log('DRY RUN. Nothing deleted. Re-run with --confirm and LOVEBUG_RESET_CONFIRM to erase selected cloud test data.');process.exit(0);}

for(const {bucket,paths} of objects){
  for(let i=0;i<paths.length;i+=100){
    const {error}=await db.storage.from(bucket).remove(paths.slice(i,i+100));
    if(error)throw new Error(`Stopped: Storage cleanup failed in ${bucket}: ${error.message}`);
  }
}
for(const {table} of rows){
  // Small, documented test tables only; fail closed on permission/foreign key errors.
  const column=table==='lovebug_v6_members'||table==='lovebug_v6_invites'?'couple_id':table==='lovebug_v6_active_links'?'user_id':'id';
  const {error}=await db.from(table).delete().not(column,'is',null);
  if(error)throw new Error(`Stopped: ${table} cleanup failed: ${error.message}`);
}
console.log('Test cloud photos and v6 connections cleared. Scheduler, secrets, auth and keep-alive are untouched.');
