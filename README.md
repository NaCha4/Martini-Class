# Martini-Class

한양대학교 ERICA 중앙동아리 Martini의 공개 홈페이지, 관리자 페이지, 부원 페이지를 포함한 정적 웹 프로젝트입니다.

## 구성

| 경로 | 설명 |
| --- | --- |
| `index.html` | 공개 메인 페이지 |
| `about/` | 파트너, 시설 소개 페이지 |
| `activities/` | 클래스, 행사 소개 페이지 |
| `records/` | 칵테일, 갤러리 페이지 |
| `join/` | 가입 안내 페이지 |
| `contact/` | 문의처, 자주 묻는 질문 페이지 |
| `legal/` | 개인정보 처리방침 |
| `admin/` | 관리자 워크스페이스 |
| `member/` | 부원 전용 신청 페이지 |
| `assets/css/` | 공통 스타일 |
| `assets/js/firebase-config.js` | Firebase Web config, App Check 설정 |
| `assets/js/firebase-client.js` | Firebase 초기화, 로그인, 관리자 인증 감시(`watchAdminAuth`) |
| `assets/js/shared/` | 공용 유틸 모듈 (`common.js`) |
| `assets/js/public/` | 공개 페이지 공통 스크립트 |
| `assets/js/admin/` | 관리자 기능 스크립트 |
| `assets/js/member/` | 부원 페이지 스크립트 |
| `firestore.rules` | Firestore 보안 규칙 |
| `storage.rules` | Firebase Storage 보안 규칙 |

## 코드 구조

빌드 단계 없이 브라우저에서 ES 모듈을 직접 로드합니다. 페이지별 모듈은 아래 공용 모듈을 공유합니다.

- `assets/js/shared/common.js`
  - 날짜/시간 변환: `normalizeDateTimeValue`, `toDateTimeLocalValue`, `fromDateTimeLocalValue`, `formatDateTime`, `getTimestampMillis`
  - UI 헬퍼: `createStatusSetter` (상태 문구 표시), `createFirebaseErrorFormatter` (Firebase 오류 코드 → 한국어 메시지, 모듈별 문구는 overrides로 지정)
- `assets/js/firebase-client.js`
  - `getFirebaseServices`: Firebase App/Auth/Firestore/Storage 초기화 (App Check 포함)
  - `watchAdminAuth`: 관리자 계정 여부에 따라 `onAdmin`/`onDenied` 콜백 분기 — 관리자 모듈 공통 진입점
  - `signInAdmin`, `signInMemberWithCode`, `hashAccessCode`, `isAllowedAdminUser`

## Firebase 사용 범위

- Firebase Authentication
  - 관리자: 이메일/비밀번호 로그인
  - 부원: 로그인 코드 검증 후 Anonymous Auth 세션 생성
- Firestore
  - `members`: 부원 목록
  - `officerDepartments`: 임원 부서 및 배치
  - `classSchedules/weekly`: 정기 교육 일정과 신청자
  - `classApplications`: 정기 교육 신청 내역
  - `eventPosts`: 이벤트 게시글과 신청자
  - `eventApplications`: 이벤트 신청 내역
  - `membershipApplications`: 동아리 가입 신청 내역
  - `meetingMinuteTemplates`: 회의록 양식
  - `meetingMinutes`: 작성된 회의록
  - `faqEntries`: 자주 묻는 질문
  - `memberAccessCodes`: 부원 로그인 코드 해시
  - `memberAccessSessions`: 부원 코드 로그인 세션
- Firebase Storage
  - `event-thumbnails/`: 이벤트 썸네일
  - `meeting-minutes/template/`: 회의록 양식 파일
  - `meeting-minutes/completed/`: 작성된 회의록 파일

## 로컬·가상 환경 실행 (App Check 디버그 토큰)

정적 파일 기반 프로젝트라 별도 빌드 명령은 없습니다. VS Code Live Server 같은 정적 서버로 열 수 있습니다.

프로덕션 도메인이 아닌 환경(로컬 서버, VM, 샌드박스)에서는 reCAPTCHA 검증을 통과할 수 없어 App Check이 요청을 차단합니다. 이를 위해 App Check 디버그 토큰을 지원합니다.

1. `localhost`, `127.0.0.1`, `*.local`, `file:` 환경에서는 디버그 모드가 자동으로 켜집니다.
2. 페이지를 열면 브라우저 콘솔에 `App Check debug token: ...`이 출력됩니다.
3. 출력된 토큰을 Firebase Console > App Check > 앱 > **디버그 토큰 관리**에 등록하면 해당 브라우저에서 Firebase 요청이 허용됩니다.

호스트명이 로컬로 인식되지 않는 가상 환경에서는 아래 중 한 가지 방법으로 고정 디버그 토큰을 지정할 수 있습니다. (토큰은 Firebase Console에 먼저 등록)

- `assets/js/firebase-config.js`의 `appCheckDebugToken` 값 입력
- 브라우저 콘솔에서 `localStorage.setItem("MARTINI_APPCHECK_DEBUG_TOKEN", "<토큰>")` 실행

디버그 토큰은 개발용 우회 수단이므로 외부에 공유하거나 커밋 이력에 남기지 않도록 주의합니다.

로컬 임시 저장소와 로그인 우회 코드는 제거되어 있습니다. 로컬에서 기능을 테스트할 때도 실제 Firebase 프로젝트와 보안 규칙이 필요합니다.

## 배포 전 확인

1. `assets/js/firebase-config.js`에 Firebase Web config와 App Check site key가 설정되어 있는지 확인합니다.
2. Firebase Authentication에서 이메일/비밀번호 로그인과 익명 로그인을 활성화합니다.
3. 관리자 계정 이메일은 `assets/js/firebase-client.js`의 `ADMIN_EMAIL`과 `firestore.rules`, `storage.rules`의 `isAdmin()` 조건이 서로 일치해야 합니다.
4. Firestore Rules와 Storage Rules를 Firebase Console 또는 Firebase CLI로 반영합니다.
5. 관리자 페이지의 로그인 코드 메뉴에서 부원 로그인 코드를 활성화합니다.
6. 관리자 페이지에서 부원 목록을 먼저 등록해야 정기 클래스와 이벤트 신청 검증이 정상 동작합니다.
7. 배포용으로 등록했던 디버그 토큰 중 사용하지 않는 것은 Firebase Console에서 정리합니다.

## 보안 참고

- 실제 배포, Rules 반영, 프로덕션 데이터 삭제는 작업자가 직접 승인하고 수행해야 합니다.
- Firebase 설정 값이나 운영 계정 정보는 공개 문서에 붙여넣지 않습니다.
