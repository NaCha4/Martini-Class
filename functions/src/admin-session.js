import { fail } from './domain.js';

export const REQUEST_VIEWER_SESSION_MS=7*24*60*60*1000;

// authTime comes only from the callable's verified auth_time claim.
export function requestViewerSessionExpiry(profile,authTime,now){
 if(!Number.isSafeInteger(authTime)||authTime<=0||authTime*1000>now+60000)fail('unauthenticated','로그인 시간을 확인할 수 없습니다. 다시 로그인해 주세요.');
 const expiry=Math.min(Date.parse(profile.expiresAt),authTime*1000+REQUEST_VIEWER_SESSION_MS);
 if(!Number.isFinite(expiry)||expiry<=now||authTime<=(profile.sessionsRevokedThrough||0))fail('unauthenticated','조회 세션이 만료되거나 해제되었습니다. 다시 로그인해 주세요.');
 return new Date(expiry).toISOString();
}
