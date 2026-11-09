// The schedule is authoritative even for older records still stored as open or closed.
// Reading an event never needs a background job or a database write.
export function eventStatus(event,now=Date.now()){
 if((event.status==='open'||event.status==='closed')&&Date.parse(event.endsAt)<=now)return 'completed';
 return event.status==='open'&&Date.parse(event.closesAt)<=now?'closed':event.status;
}
