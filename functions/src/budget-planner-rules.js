export function calculatePlan(plan){
 const expected=plan.items.reduce((total,item)=>total+item.amount,0);
 return {expected,remaining:plan.allocated-expected};
}

export function calculateBudget(board){
 const allocated=board.plans.reduce((total,plan)=>total+plan.allocated,0);
 const expected=board.plans.reduce((total,plan)=>total+calculatePlan(plan).expected,0);
 return {allocated,expected,unallocated:board.funds-allocated,remaining:board.funds-expected};
}
