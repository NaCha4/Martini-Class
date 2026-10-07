export function clearAdminData(state){
 state.adminDataVersion=(state.adminDataVersion||0)+1;
 state.profile=null;state.data={};state.pages={};state.settings={};
 for(const key of ['clubRequestPage','requestPageReuse','roles','budgetPlannerView','partnerAdminView'])delete state[key];
}

export const isAdminAuthError=error=>['functions/unauthenticated','functions/permission-denied'].includes(error?.code);
