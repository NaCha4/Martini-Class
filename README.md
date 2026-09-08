# Martini · 마티니 운영 시스템

한양대학교 ERICA 칵테일 동아리의 소개 홈페이지, 행사 신청, 임원 운영실을 하나의 도메인에서 운영한다. 사용자 기획서 21장의 답변과 이후 요청을 기준으로 구현했다.

- 홈페이지: https://hyu-martini.site/
- 운영실: https://hyu-martini.site/admin/
- 공개 화면은 GitHub Pages, 인증·데이터는 Firebase 프로젝트 martini-class-d4d69를 사용한다.

## 사용할 수 있는 기능

- 소개·활동·공지·가입 안내와 기존 가입 신청서 연결
- 일반 부원 로그인 없이 행사 링크로 신청, 개인 확인 링크로 조회·취소·입금 확인 요청
- 선착순 정원, 대기 접수, 승급 제안·수락·거절, 수기 출석, 참가비·환불 기록
- 부원 명부와 학기 회비 자격, 부서별 임원 권한·임기
- 주류·재료·도구 재고, 입출고·개봉·10% 잔량·실사·위치 이동·이력
- 수입·지출·회비 장부, 중복 처리와 과다 납부·환불 방지
- 회의·안건·논의·결정·담당 업무를 Firestore에 저장하고 수정 버전 보관
- 학기말 개인정보 정리 대상 조회, 미정산 차단, 처리 전 재확인
- 공개 콘텐츠 관리, CSV 내보내기, 변경 이력

송금·계좌 조회는 자동 실행하지 않는다. 기존 구글폼 입력과 명부 등록, 출석 호명은 운영진이 진행한다.

## 처음 운영할 때

1. 비밀번호 설정 메일에서 운영자 비밀번호를 설정하고 운영실에 로그인한다.
2. **학기 · 운영 설정**에서 학기, 회비, 문의처, 개인정보 안내, 가입 신청서 URL을 입력한다.
3. 실제 부원 명부와 회비 납부 상태를 등록한다.
4. 재고 품목을 만든 뒤 입고 또는 실사로 현재 수량을 입력한다.
5. 교육·총회를 만들고 신청 기간·정원·취소 정책을 확인한 뒤 모집 상태로 바꾼다.
6. 생성된 행사 링크를 부원 공지 채널에 전달한다.

최초 owner는 기존 Firebase CLI 로그인 이메일로 생성했다. 비밀번호·메일 주소는 소스에 저장하지 않는다. 초기 임기는 2027-02-28 23:59:59 KST이며, 그 전에 후임 운영자를 지정하거나 임기를 조정한다. 신규 임원은 Firebase Authentication에서 이메일 계정을 만든 뒤 **임원 권한**에 UID·부서·임기를 등록한다.

실제 명부·재고·금액을 가상 데이터로 채우지 않는다. 개발 예시 데이터는 로컬 에뮬레이터에만 존재한다.

## 소스와 공개 파일

| 경로 | 용도 |
| --- | --- |
| web/index.html, web/src/ | 수정할 프런트엔드 소스 |
| public/assets/ | 배경·로고·기존 Pretendard 글꼴 원본 |
| functions/src/ | 입력 검증, 권한, 트랜잭션, 개인정보 정리 |
| scripts/build.mjs | 빌드와 기존 GitHub Pages용 파일 준비 |
| 루트 index.html, assets/, 각 경로 index.html | 생성된 공개 산출물, 직접 수정하지 않음 |
| tests/ | 단위·통합·브라우저·HTTP 검증 |
| docs/기획서.md | 사용자가 작성한 원문 |
| docs/구현-운영.md | 기능 결정과 인수인계 |
| docs/검증-보안-보고서.md | 검증 및 배포 상태 |

docs의 배경·로고 파일은 public/assets/background.png, logo.png, wordmark.png로 이동했다. 공개 산출물의 assets는 빌드가 만드는 복사본이다.

## 로컬 실행

Node.js 22, Java 21 이상을 사용한다.

~~~sh
npm ci
npm ci --prefix functions
npm run emulators
~~~

다른 터미널에서:

~~~sh
npm run seed:local
npm run dev
~~~

http://127.0.0.1:5173 에 접속한다. 로컬 운영실의 **가상 임원으로 확인하기**는 개발 환경에만 표시된다. 개발 서버는 항상 demo-martini에 연결한다.

Emulator는 운영 함수의 동시성을 그대로 재현하지 않고 기본적으로 최대 50개 별도 프로세스를 실행한다. 시작 스크립트는 FUNCTIONS_EMULATOR_PARALLEL=1을 기본값으로 사용해 로컬 자원 고갈을 방지한다. 에뮬레이터 재시작 시 가상 데이터가 초기화된다. Windows에서 Java를 찾지 못하면 설치된 Java의 bin을 터미널 PATH에 추가한다.

## 검증

~~~sh
npm test
npm run test:integration
npm run test:browser
npm run test:http
npm run test:load
npm run check:secrets
npm run build:pages
~~~

통합 테스트는 demo-martini-tests와 demo-martini-rules만 초기화한다. 브라우저와 HTTP 부하 테스트는 demo-martini 가상 데이터만 사용한다. Windows에서는 설치된 Chrome, 다른 환경에서는 Playwright Chromium을 설치해 사용한다.

## 공개 업데이트

기존 GitHub Pages 설정은 **main / 루트**이다. 소스만 올리지 않고 반드시 다음 순서를 지킨다.

1. web/src 수정, 필요한 검증 실행
2. npm run build:pages
3. 생성 파일과 .pages-assets.json, CNAME 검토
4. 승인된 main push

서버 코드 변경은 별도로 Firebase Functions 배포가 필요하다. 배포 명령과 운영 자료 변경은 [보안 기준](SECURITY.md)의 승인 범위를 따른다. 프런트엔드 변경만으로 함수가 배포되지 않는다.

## 인증과 링크

프로덕션 App Check는 기본 활성화되어 있으며 기존 reCAPTCHA Enterprise 등록을 사용한다. 허용된 도메인은 hyu-martini.site이다. localhost에서는 항상 Emulator를 사용한다. 실제 로그인 검증을 위해 보호 설정을 끄지 않는다.

개인 신청 링크는 URL의 # 뒤에 접근 값을 보관한다. 서버에는 해시만 저장하며, 행사 링크나 개인 확인 링크를 재발급하면 이전 링크는 무효화된다. 개인 확인 링크는 본인에게만 전달한다.

## 인수인계

- 후임 owner를 먼저 등록하고 현재 임원의 임기를 정리한다.
- Firebase 프로젝트 소유, GitHub 저장소, 도메인 갱신·과금 책임도 별도로 인계한다.
- 학기말 정보 정리 화면에서 대상을 검토한다. 회의 본문·게시글·내려받은 CSV·백업은 별도 점검한다.
- QR, 자동 알림, 외부인·팀 신청, 투표, 파일 첨부는 사용자 결정에 따라 제공하지 않는다.
- 기존 Firebase 컬렉션의 자동 이관은 수행하지 않는다. 새 데이터는 martini_v2_* 영역에 저장한다.
