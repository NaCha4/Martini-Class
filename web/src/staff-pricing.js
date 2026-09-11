import { esc } from './ui.js';

export const hasStaffFee=event=>Number.isInteger(event.staffFee)&&event.staffFee>=0;
export function staffCheckbox(application,event,{detail=false}={}){
 const editable=!application.anonymizedAt&&event.status!=='cancelled'&&['registered','waiting','offered'].includes(application.status);
 const disabled=!editable||!hasStaffFee(event)&&!application.isStaff;
 return '<label class="staff-checkbox"><input type="checkbox" data-staff-id="'+esc(application.id)+'" data-staff-checked="'+!!application.isStaff+'" data-pricing-revision="'+(application.pricingRevision||0)+'" data-staff-fee-revision="'+(event.staffFeeRevision||0)+'"'+(detail?' data-staff-detail':'')+' aria-label="'+esc(application.name)+' 관리인원"'+(application.isStaff?' checked':'')+(disabled?' disabled':'')+'><span>관리인원</span></label>';
}
