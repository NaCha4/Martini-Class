// The deadline is authoritative even for older records still stored as open.
// Reading an event never needs a background job or a database write.
export function eventStatus(event,now=Date.now()){
 return event.status==='open'&&Date.parse(event.closesAt)<=now?'closed':event.status;
}
