import { icon } from './ui.js';

export function renderMemberCouponPreparation({ compact = false } = {}) {
  return '<section class="member-coupon-preparation' + (compact ? ' is-compact' : '') + '" aria-label="필링파인 쿠폰 준비 안내" data-coupon-state="PREPARING"><span class="member-coupon-icon" aria-hidden="true">' + icon('ticket') + '</span><div class="member-coupon-copy"><h2 class="member-coupon-title">필링파인 쿠폰</h2><span class="member-coupon-status">준비 중</span><p>사용할 수 있게 되면 안내해 드릴게요.</p></div></section>';
}
