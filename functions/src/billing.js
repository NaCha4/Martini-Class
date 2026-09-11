export const billingFee=a=>a.isStaff&&Number.isInteger(a.staffFee)&&a.staffFee>=0?a.staffFee:a.fee;
