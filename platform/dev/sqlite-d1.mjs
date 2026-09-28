/** Local adapter uses real SQLite and transactional batches. No remote service access. */
export function sqliteD1(sqlite) {
 class Statement {
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(column){const r=sqlite.prepare(this.sql).get(...this.values)||null;return column&&r?r[column]:r;}
  async all(){return {success:true,results:sqlite.prepare(this.sql).all(...this.values)};}
  async run(){const r=sqlite.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(r.changes)}};}
 }
 return {prepare:sql=>new Statement(sql),async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements){const r=await s.all();r.meta={changes:Number(sqlite.prepare('SELECT changes() n').get().n)};results.push(r);}sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
