import {it,expect} from 'vitest';
import {classifyFailure,nextSeq,replayOrder} from '../apps/web/src/offline.js';
import {ApiError} from '../apps/web/src/api.js';
it('replays offline edits in the order they were made, not by random ID',()=>{
 const first=nextSeq(1000),second=nextSeq(1000),third=nextSeq(999);
 expect(second).toBeGreaterThan(first);expect(third).toBeGreaterThan(second);
 expect(replayOrder([{id:'z',seq:second},{id:'a',seq:third},{id:'m',seq:first}]).map(e=>e.id)).toEqual(['m','z','a']);
});
it('parks refused edits without blocking the queue and keeps transient failures for later',()=>{
 expect(classifyFailure(new ApiError('changed',409))).toBe('conflict');
 expect(classifyFailure(new ApiError('Unknown family',400))).toBe('rejected');
 expect(classifyFailure(new ApiError('Access denied',403))).toBe('rejected');
 expect(classifyFailure(new ApiError('Sign in required',401))).toBe('signed-out');
 expect(classifyFailure(new ApiError('busy',503))).toBe('retry-later');
 expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('retry-later');
});
