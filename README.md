# Martini

한양대학교 ERICA 중앙동아리 Martini의 공개 홈페이지입니다.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | 공개 메인 홈페이지 |
| `history.html` | 동아리 연혁 |
| `classes.html` | 정기 클래스, 개인 클래스 소개 |
| `events.html` | MT, 개강총회, 종강총회 소개 |
| `partners.html` | 협찬 및 제휴 파트너 소개 |
| `privacy.html` | 개인정보 처리방침 |

## Structure

```text
.
├─ assets/
│  ├─ css/
│  │  ├─ fonts.css
│  │  └─ public.css
│  ├─ fonts/
│  ├─ images/
│  └─ js/
│     └─ public/
│        ├─ login-modal.js
│        └─ topbar.js
└─ *.html
```

## Notes

- 공개 홈페이지 상단바는 `assets/js/public/topbar.js`에서 공통으로 생성합니다.
- 공개 페이지의 로그인 팝업 열림/닫힘은 `assets/js/public/login-modal.js`가 담당합니다.
- 현재 저장소에는 공개 홈페이지 화면 구현에 필요한 HTML, CSS, JS만 남겨두었습니다.
