# Martini-Class

한양대학교 ERICA 중앙동아리 Martini의 공개 홈페이지, 관리자 페이지, 부원 페이지를 포함한 정적 웹 프로젝트입니다.

## 구성

| 경로 | 설명 |
| --- | --- |
| `index.html` | 공개 메인 페이지 |
| `about/` | 연혁, 파트너, 시설 소개 페이지 |
| `activities/` | 클래스, 행사 소개 페이지 |
| `records/` | 칵테일, 갤러리 페이지 |
| `join/` | 가입 안내 페이지 |
| `contact/` | 문의처, 자주 묻는 질문 페이지 |
| `legal/` | 개인정보 처리방침 |
| `admin/` | 관리자 워크스페이스 |
| `member/` | 부원 전용 신청 페이지 |
| `assets/css/` | 공통 스타일 |
| `assets/js/public/` | 공개 페이지 공통 스크립트 |
| `assets/js/admin/` | 관리자 기능 스크립트 |
| `assets/js/member/` | 부원 페이지 스크립트 |
| `firestore.rules` | Firestore 보안 규칙 |
| `storage.rules` | Firebase Storage 보안 규칙 |

## Firebase 사용 범위

이 프로젝트는 빌드 단계 없이 브라우저에서 Firebase Web SDK를 직접 사용합니다.

- Firebase Authentication
  - 관리자: 이메일/비밀번호 로그인
  - 부원: 로그인 코드 검증 후 Anonymous Auth 세션 생성
- Firestore
  - `members`: 부원 목록
  - `officerDepartments`: 임원 부서 및 배치
  - `classSchedules/weekly`: 정기 교육 일정과 신청자
  - `eventPosts`: 이벤트 게시글과 신청자
  - `meetingMinuteTemplates`: 회의록 양식
  - `meetingMinutes`: 작성된 회의록
  - `historyEntries`: 연혁
  - `faqEntries`: 자주 묻는 질문
  - `memberAccessCodes`: 부원 로그인 코드 해시
  - `memberAccessSessions`: 부원 코드 로그인 세션
- Firebase Storage
  - `event-thumbnails/`: 이벤트 썸네일
  - `meeting-minutes/template/`: 회의록 양식 파일
  - `meeting-minutes/completed/`: 작성된 회의록 파일

## 배포 전 확인

1. `assets/js/firebase-config.js`에 Firebase Web config와 App Check site key가 설정되어 있는지 확인합니다.
2. Firebase Authentication에서 이메일/비밀번호 로그인과 익명 로그인을 활성화합니다.
3. 관리자 계정 이메일은 `assets/js/firebase-client.js`의 `ADMIN_EMAIL`과 `firestore.rules`, `storage.rules`의 `isAdmin()` 조건이 서로 일치해야 합니다.
4. Firestore Rules와 Storage Rules를 Firebase Console 또는 Firebase CLI로 반영합니다.
5. 관리자 페이지의 로그인 코드 메뉴에서 부원 로그인 코드를 활성화합니다.
6. 관리자 페이지에서 부원 목록을 먼저 등록해야 정기 클래스와 이벤트 신청 검증이 정상 동작합니다.

## 로컬 실행

정적 파일 기반 프로젝트라 별도 빌드 명령은 없습니다. VS Code Live Server 같은 정적 서버로 열 수 있습니다.

로컬 임시 저장소와 로그인 우회 코드는 제거되어 있습니다. 로컬에서 기능을 테스트할 때도 실제 Firebase 프로젝트와 보안 규칙이 필요합니다.

## 보안 참고

- 실제 배포, Rules 반영, 프로덕션 데이터 삭제는 작업자가 직접 승인하고 수행해야 합니다.
- Firebase 설정 값이나 운영 계정 정보는 공개 문서에 붙여넣지 않습니다.
- `FIREBASE_RULES_PASTE.md`에는 현재 Rules 파일을 Firebase Console에 붙여넣기 쉽도록 정리한 내용이 있습니다.
