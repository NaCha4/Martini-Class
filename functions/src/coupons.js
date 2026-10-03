import { z } from 'zod';
import { fail, hash, idSchema, parse } from './domain.js';

const inputSchema=z.object({sessionKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const COUPON_CAPACITY=10;
const stampCount=z.number().int().min(0).max(COUPON_CAPACITY);
const revision=z.number().int().min(1);
const stateSchema=z.object({stampCount,revision}).strict();
const commandSchema=z.object({requestId:idSchema,expectedRevision:revision,amount:stampCount.min(1)}).strict();

export const validateCouponStampCount=value=>parse(stampCount,value);

// Pure preparation for a future transaction: read coupon and request documents first,
// then atomically persist the returned state and command. No runtime caller writes them.
export function planCouponStamp(stateValue,commandValue,previousCommandValue=null){
 const state=parse(stateSchema,stateValue),command=parse(commandSchema,commandValue);
 if(previousCommandValue!==null){
  const previous=parse(commandSchema,previousCommandValue);
  if(previous.requestId!==command.requestId)fail('invalid-argument','쿠폰 요청 번호를 확인해 주세요.');
  if(previous.expectedRevision!==command.expectedRevision||previous.amount!==command.amount)fail('already-exists','같은 요청 번호로 다른 적립을 처리할 수 없습니다.');
  return {state,command:previous,duplicate:true};
 }
 if(command.expectedRevision!==state.revision)fail('aborted','쿠폰 상태를 다시 확인해 주세요.');
 const nextCount=state.stampCount+command.amount;
 if(nextCount>COUPON_CAPACITY)fail('failed-precondition','쿠폰 한 장에는 스탬프를 10개까지 적립할 수 있습니다.');
 return {state:{stampCount:nextCount,revision:state.revision+1},command,duplicate:false};
}

// Preparation only. This domain has no coupon ledger, issuance, redemption, or QR writes.
export function createCoupons({db,authenticate,throttle}){
 return async function memberCoupons(data,ctx){
  const input=parse(inputSchema,data);
  await throttle(ctx,'member-coupons',200);
  await throttle({ip:hash(input.sessionKey)},'member-coupons-session',60);
  return db.runTransaction(async tx=>{
   const {expiresAt}=await authenticate(input.sessionKey,tx);
   return {status:'preparing',available:false,capacity:COUPON_CAPACITY,rewardStatus:'undecided',expiresAt};
  },{readOnly:true});
 };
}
