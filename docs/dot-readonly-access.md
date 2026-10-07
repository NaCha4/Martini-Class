# dot 신청 조회 전용 접근

2026-10-07 최초 요청은 코드 구현과 로컬 검증이었다. 이후 사용자가 커밋·푸시·배포를 승인했다. 실제 전용 계정 생성·인증 토큰 발급·지속 접근 권한 부여·운영 보안 설정 변경은 별도 행동 시점 승인 대상으로 유지한다. 작업 시작 상태는 `main`의 `03f4745`이며 미커밋 변경은 없었다. 기능 브랜치는 `feat/dot-readonly-session`이며, 후속 원격 변경 `a29921a`(비목록 행사 초대 링크 수정)를 보존하여 통합한다.

## 권한

- 고정 역할 `requestsViewer`(표시: `dot · 신청 조회 전용`)와 내부 조회 권한 `requestsRead`를 추가했다. 기존 관리자 배정 화면을 그대로 사용한다. 이 역할은 수정·삭제할 수 없고, 저장된 역할 문서의 추가 권한도 무시한다. 역할 정의 자체로 계정이 생성되거나 접근 권한이 부여되지는 않는다.
- 허용 API는 자기 `profile`, `clubRequests` 목록·상세 데이터와 자기 세션을 종료하는 `adminLogout`뿐이다. 허용 목록을 공개/개인 링크 API 분기보다 먼저 검사한다. 온더락, 일반 `read(settings)`, 회원 명부, 행사 참가자, 답변, 승인·반려, 삭제, 상태·설정·역할 변경 및 공개 접수 쓰기 API까지 차단한다. 공개 접수 API의 기존 비로그인 이용 조건은 바꾸지 않는다.
- `/admin/requests`의 기존 자료 범위인 외부인 출입, 문의, 보존 중인 과거 가입 신청을 읽는다. 행사 참가 신청 목록은 포함하지 않는다. 기존 `safeRequest` 필드 제한, 삭제·익명화 제외, 100건 단위 페이지 처리를 유지한다. 전화번호·인증 토큰·접근 해시·내부 대조값은 반환하지 않는다.
- UI는 신청 · 문의 메뉴와 상세 보기만 제공하며 처리·삭제 폼을 생성하지 않는다. `/admin`은 신청 · 문의로 이동하고 다른 관리 주소는 권한 없음으로 표시한다. 이 화면은 설정 데이터를 선조회하지 않는다.
- Firestore와 Storage의 클라이언트 직접 읽기·쓰기 전면 차단 규칙은 변경하지 않는다. 서버 Admin SDK 경로는 위 허용 목록으로 제한한다. 기존 `members` 권한의 조회·처리는 그대로 유지한다.

## 로그인 유지·만료·해제

- Firebase Authentication 이메일/비밀번호 로그인을 재사용한다. 로그인 화면에서 브라우저 유지 또는 탭 세션 유지를 선택한다. 명시적 로그인 직전에만 Firebase SDK의 `setPersistence`를 호출하며, 페이지 복원 때 저장 상태를 재설정하지 않는다. 기본 선택은 브라우저 유지다.
- 전용 역할은 **처음 로그인한 시각부터 7일**과 배정된 `expiresAt` 중 더 이른 시각까지 허용한다. `request.auth.token.auth_time`만 서버로 전달하며 요청 본문의 시각·UID·권한은 신뢰하지 않는다. ID 토큰 자동 갱신이나 조회는 기한을 연장하지 않는다. 기존 일반 임원의 만료 정책과 부원 라운지의 별도 세션은 유지한다.
- 전용 역할의 매 요청에서 Firebase Admin SDK `verifyIdToken(token, true)`로 계정 삭제·비활성화·토큰 해제를 확인한다. 인증 서버 장애는 접근을 허용하지 않고 재시도 가능한 연결 실패로 표시한다. App Check/IP/클라우드 환경을 인증 대체 수단으로 사용하지 않는다.
- 전용 역할의 로그아웃은 서버의 관리자 문서에 `sessionsRevokedThrough`를 기록한 다음 브라우저에서 Firebase `signOut`을 실행한다. 해당 계정에서 그 시각까지 로그인한 **다른 브라우저/탭 세션도 무효화**하며 이미 발급된 ID 토큰에도 적용한다. 초 단위 비교이므로 로그아웃과 같은 초에 다시 로그인하면 1초 이후 다시 로그인해야 할 수 있다.
- 기존 관리자 배정 화면에서 접근 허용을 해제하면 즉시 다음 서버 요청부터 차단한다. 이때 기록한 해제 시각은 접근을 다시 허용해도 보존하여 이전 토큰을 되살리지 않는다. 접근 종료일·관리자 배정 삭제도 매 요청 확인한다. 계정 삭제 후 같은 UID를 새로 배정하는 경우는 별도의 신규 접근 부여이므로 운영자가 다시 검토해야 한다.
- 화면은 열려 있는 동안 최대 60초 간격 및 창 복귀 시 자격을 확인한다. 만료·해제 확인, 사용자 변경, 로그아웃 시 상세 모달과 조회 캐시를 비운다. 서버는 화면 확인 주기와 무관하게 모든 요청에서 검사한다.
- 연결 장애로 서버 로그아웃을 확인하지 못해도 브라우저 로그아웃을 진행하고 경고를 표시한다. 이 경우 다른 기기/이미 복사된 토큰까지 해제했다고 보장하지 않는다. 운영자가 접근 허용을 해제할 수 있다.
- 소스·빌드에 실제 비밀번호, 관리자 키, 인증 토큰을 넣지 않는다. 정상 로그인 후 발급되는 인증 정보의 브라우저 저장·갱신은 Firebase SDK가 관리한다. 별도 토큰 쿠키나 임의 토큰 저장소를 만들지 않는다.

## 로그인 화면으로 반복 복귀하는 현상의 한계

Firebase 웹 인증은 원래 로컬 영속성을 기본 지원한다. 그러므로 기존 증상을 단순히 persistence 누락으로 진단하지 않는다. 기존 UI에는 최초 `profile` 호출 실패 후 `profile`이 비어 있으면 서버 검증을 재시도하지 않고 로그인 화면을 계속 표시하는 경로가 있었다. 이제 복원된 Firebase 사용자가 있으면 다시 `profile`을 검증하며 일시적 장애는 연결 오류와 재시도로 표시한다. 이것이 실제 dot 증상의 원인인지는 아직 확인되지 않았다.

같은 사이트 origin과 브라우저 프로필·저장소가 보존되어야 로그인 유지가 가능하다. 매번 새 클라우드 브라우저/프로필이 만들어지거나 사이트 데이터가 지워지면 이 변경만으로 로그인 상태를 이어갈 수 없다. 자동화 브라우저 저장소 연속성, 실제 계정의 `active`/`expiresAt`, 실제 오류 코드와 배포 버전을 각각 확인해야 한다.

현재 소스 `index.js`는 `enforceAppCheck:false`, 프런트엔드는 기본 App Check 초기화로 되어 있으며 과거 문서와 차이가 있다. 이번 작업은 이를 변경하지 않는다. 코드 배포 성공과 실제 dot 계정·브라우저의 로그인 성공은 별도로 검증해야 한다.

## 로컬 검증

Node.js 22.23.3, Java 21 계열, 설치된 일반 Chrome 및 Auth/Functions/Firestore 에뮬레이터를 사용한다. 모든 계정·데이터는 `demo-*` 가상 프로젝트다. 원래 시스템 Node 24 대신 `.local/node22`의 Node 22를 사용했다. 비밀 값을 포함할 수 있는 브라우저 인증 테스트의 trace는 저장하지 않는다.

- `npm test`: 신규 세션 테스트 포함, 최종 단위 검증 394개 통과. 최초 실행은 351개 통과와 UI 파일 로드 실패 1건이었다. 기존 UI 테스트의 인증 대역을 새 로그인 함수에 맞춰 보정한 뒤 해당 파일 43개를 재실행해 통과했다. 통과한 전체 묶음을 불필요하게 재실행하지 않았다.
- `npm run test:integration`: 140개 통과. 허용 조회, 모든 금지 API, 신뢰하지 않는 본문·IP, 7일 절대 만료, 권한 만료, 로그아웃·재활성화, 고정 역할 변조, 기존 임원 처리, 페이지/필드 제한, Firestore 직접 접근 차단을 포함한다.
- `playwright test tests/browser/requests-viewer.spec.js --project=desktop`: 최초 6개 통과 후, 늦은 응답의 캐시 재유입 방지와 기존 관리자 처리 2개를 추가하여 각각 통과했다. Chrome 종료·재실행 복원, 탭 한정 유지, 다른 탭 로그아웃, 토큰 갱신, 발급된 토큰 해제·Auth 비활성화, UI 접근 차단·캐시 제거, 일시적 연결 장애 복구, 기존 관리자 승인·반려·답변·삭제를 확인한다.
- 기존 `roles.spec.js`의 역할 배정·참가비 권한 부여/해제, `service.spec.js`의 부원 등록·관리 메뉴까지 2개 통과했다. 총 10개 고유 Chrome 시나리오가 통과했으며 조회 화면 스크린샷은 `.local/screenshots/dot-readonly.png`에 있다.
- 기존 `member-portal.spec.js`의 출입 신청 흐름은 처음에 `.member-account-bar`를 기다리며 실패했다. 변경 전 `HEAD`에서도 해당 HTML은 없고 CSS에만 남아 있는 오래된 선택자였다. 배포 승인 후 관련 헬퍼를 현재 계정 표시, 신청 탭·인라인 폼, 새로고침 흐름에 맞게 수정했다. 회원 신청 → 임원 승인 → 회원 승인 내용 확인 → 승인된 방문 취소 → 대기 중 방문 취소까지 Chrome에서 통과했다. 기존 업무 검증은 제거하거나 약화하지 않았다.
- `npm run check:syntax`, `npm run check:secrets`, `npm run build`: 통과. `build`는 무시된 `dist/`만 만들며 Pages 루트 산출물은 갱신하지 않는다.
- 별도 lint/TypeScript 검사 명령과 TypeScript 설정은 이 JavaScript 저장소에 없다. 이를 실행했다고 보고하지 않는다. Storage 규칙은 변경 없이 전면 차단을 확인했으며 Storage 에뮬레이터 통합 검사는 수행하지 않았다. 운영 인증·dot 클라우드 브라우저·배포 검증도 수행하지 않았다.

초기 검증 로그는 `.local/dot-unit.log`, `.local/dot-ui-unit.log`, `.local/dot-session-final.log`, `.local/dot-integration.log`, `.local/dot-browser.log`, `.local/dot-browser-race.log`, `.local/dot-final-regression.log`, `.local/dot-build.log`에 있다. 기존 회원 테스트의 초기 실패는 `.local/dot-admin-regression.log`, 수정 후 통과는 `.local/dot-release-member.log`에 보존한다. 원격 변경 통합 후의 재검증과 실제 배포 결과는 `.local/dot-release-*` 로그로 분리한다.

## 변경 파일

| 범위 | 파일 |
| --- | --- |
| 서버 권한·세션 | `functions/src/permissions.js`, `admin-session.js`(신규), `service.js`, `member-portal.js`, `index.js` |
| 로그인·관리 화면 | `web/src/firebase.js`, `admin-session.js`(신규), `admin.js`, `admin-forms.js`, `admin-requests.js`, `main.js` |
| 검증 | `tests/admin-session.test.mjs`, `tests/requests-viewer.test.mjs`, `tests/browser/requests-viewer.spec.js`(이상 신규), `tests/admin-retired-ui.test.mjs`, `tests/browser/member-portal.spec.js`, `package.json` |
| 설명 | `README.md`, `docs/dot-readonly-access.md`(신규) |

## 실제 사용 전 필요한 승인·작업

1. 승인된 코드 배포는 서버 Functions를 먼저 반영하고 클라이언트를 빌드·배포한다. 기존 관리자는 계속 사용 가능하다. 새 조회 역할은 서버가 먼저 준비되어야 한다. Firestore/Storage 규칙과 운영 인증 설정은 변경하지 않는다.
2. 승인된 별도 Firebase Authentication 계정을 준비하고, 정확한 UID에 `requestsViewer`, `active:true`, 명확한 `expiresAt`을 배정한다. 실제 계정 생성·토큰 발급·지속 접근 부여는 승인 전 실행하지 않는다. 코드에는 실제 UID·이메일·비밀번호를 추가하지 않는다.
3. 사용자가 신뢰하는 지속 브라우저 프로필에서 처음 정상 로그인하고 같은 프로필과 origin을 재사용한다. 브라우저 저장소 유지 여부와 서버 만료를 확인한다. IP나 dot 환경을 이유로 로그인을 우회하지 않는다.

참고: [Firebase 인증 상태 유지](https://firebase.google.com/docs/auth/web/auth-state-persistence), [Firebase 세션 해제 검증](https://firebase.google.com/docs/auth/admin/manage-sessions).
