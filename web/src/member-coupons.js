import { icon } from './ui.js';

export function renderMemberCouponPreparation({ compact = false } = {}) {
  const description = '운영 정책과 이용 대상, 사용 방법, 유효기간은 확정되면 안내해 드릴게요.';
  const copy = '<div class="member-coupon-copy"><span class="member-coupon-status">준비 중</span><h2 class="member-coupon-title">' + (compact ? '필링파인 쿠폰' : '필링파인 쿠폰을 준비하고 있어요') + '</h2><p>' + description + '</p>';
  const preview = '<div class="member-coupon-preview"><div class="member-coupon-preview-heading"><h3>쿠폰 구성 미리보기</h3><span class="member-coupon-capacity">최대 10칸</span></div><p>아래 빈칸은 디자인 미리보기이며 내 적립 내역이 아닙니다.</p><div class="member-coupon-preview-grid" aria-hidden="true">' + Array.from({ length: 10 }, () => '<span class="member-coupon-slot"></span>').join('') + '</div></div>';
  const details = compact
    ? '<p class="member-coupon-capacity">최대 10칸 · 혜택·상품 추후 안내</p><a class="member-coupon-link" href="/members/coupons" data-nav>쿠폰 준비 안내 ' + icon('arrow-right') + '</a>'
    : preview + '<ul class="member-coupon-policy"><li>운영 정책 · 확정 후 안내</li><li>이용 대상 · 확정 후 안내</li><li>사용 방법 · 확정 후 안내</li><li>유효기간 · 확정 후 안내</li><li>혜택·상품 추후 안내</li></ul>';
  return '<section class="member-coupon-preparation' + (compact ? ' is-compact' : '') + '" aria-label="필링파인 쿠폰 준비 안내" data-coupon-state="PREPARING"><span class="member-coupon-icon" aria-hidden="true">' + icon('ticket') + '</span>' + copy + details + '</div></section>';
}
