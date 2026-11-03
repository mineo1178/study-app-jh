/* global process */
import { vi } from 'vitest';
const trace = vi.hoisted(() => ({ events: [], operations: [], nextId: 0, hooks: null }));
vi.mock('firebase/firestore', async importOriginal => {
  const actual = await importOriginal();
  const { appendFileSync } = await import('node:fs');
  const record = (kind, values) => {
    const event = { seq:trace.events.length+1,time:new Date().toISOString(),kind,...values };
    trace.events.push(event);
    if(process.env.AUDIT_TRACE_PATH) appendFileSync(process.env.AUDIT_TRACE_PATH,JSON.stringify(event)+'\n');
  };
  return { ...actual, runTransaction: async (db, update, options) => {
    if(!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:8086')) throw Error('AUDIT_EMULATOR_REQUIRED');
    const operation = { id:++trace.nextId, attempts:0, paths:new Set() };
    trace.operations.push(operation);
    try {
      const result = await actual.runTransaction(db, async transaction => {
        const attempt=++operation.attempts, id=operation.id;
        record('attempt.start',{id,attempt});
        const wrapped = {
          get:async ref=> {
            operation.paths.add(ref.path);
            record('get.start',{id,attempt,path:ref.path});
            if(trace.hooks?.beforeGet) await trace.hooks.beforeGet({id,attempt,path:ref.path});
            const snapshot=await transaction.get(ref);
            record('get.done',{id,attempt,path:ref.path,exists:snapshot.exists(),data:snapshot.exists()?snapshot.data():null});
            if(trace.hooks?.afterGet) await trace.hooks.afterGet({id,attempt,path:ref.path,snapshot});
            return snapshot;
          },
          set:(ref,data,...args)=> { record('write.set',{id,attempt,path:ref.path,data}); return transaction.set(ref,data,...args); },
          update:(ref,data,...args)=> { record('write.update',{id,attempt,path:ref.path,data}); return transaction.update(ref,data,...args); },
          delete:ref=>transaction.delete(ref),
        };
        try { const value=await update(wrapped);record('callback.return',{id,attempt,result:value});return value; }
        catch(error) { record('callback.throw',{id,attempt,error:error.code||error.message});throw error; }
      },options);
      record('transaction.resolved',{id:operation.id,attempts:operation.attempts,result});
      return result;
    } catch(error) { record('transaction.rejected',{id:operation.id,attempts:operation.attempts,error:error.code||error.message});
      if(error.code==='PENDING_CORRECTION_INVALID') for(const path of operation.paths) {
        const snapshot=await actual.getDoc(actual.doc(db,path));
        record('state.afterReject',{id:operation.id,path,data:snapshot.exists()?snapshot.data():null});
      }
      throw error; }
  } };
});

export { trace };
