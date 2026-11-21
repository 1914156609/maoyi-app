import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
export function openDatabase(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 const adapt=(sql,args=[])=>({bind(...values){return adapt(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},runSync(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)},success:true}},async run(){return this.runSync()}});
 return {prepare:adapt,async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements)out.push(s.runSync());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}},migrate(dir){db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()){if(db.prepare('SELECT name FROM _local_migrations WHERE name=?').get(name))continue;db.exec('BEGIN');try{db.exec(readFileSync(dir+'/'+name,'utf8'));db.prepare('INSERT INTO _local_migrations VALUES (?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}},close(){db.close()},raw:db};
}
