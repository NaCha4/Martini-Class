# Martini Class

마티니 칵테일 동아리의 정규 클래스 신청, 개인 클래스, 출석부, 재고, 교육일정, 임원 배치를 관리하는 Firebase 기반 정적 웹 프로젝트입니다.

## 주요 기능

- 메인 페이지에서 정규 클래스 신청, 개인 클래스, 출석부, 관리 페이지로 이동
- Firebase 이메일/비밀번호 로그인
- 로그인한 임원만 출석부와 관리 페이지 접근
- 정규 클래스 신청 요일, 정원, 오픈/마감, 예약 오픈/예약 마감 관리
- 신청 페이지에서 이름과 학번으로 요일별 선착순 신청
- 출석부에서 주차별 신청자 불러오기, 출석/결석 체크, 누적 결석 확인
- 개인 클래스 게시글 작성, 썸네일 등록, 모집 상태 관리, 신청자 확인/삭제
- 재고를 분류, 품목, 상품 단위로 관리
- 교육일정에 주차별 칵테일 레시피와 재료 사용량 저장
- 교육일정과 현재 신청 인원을 기준으로 예상 재고 사용량과 부족 여부 계산
- 임원 조직도, 요일별 담당 임원, 이벤트 담당 임원 관리

## 페이지 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 메인 페이지 |
| `login.html` | 임원 로그인 페이지 |
| `vote.html` | 정규 클래스 신청 페이지 |
| `private-class.html` | 개인 클래스 목록, 상세, 신청 페이지 |
| `attendance.html` | 주차별 출석부 페이지 |
| `admin.html` | 관리 페이지 |

## 폴더 구조

```text
.
├─ assets
│  ├─ css
│  │  └─ main.css
│  ├─ images
│  └─ js
│     ├─ utils.js
│     ├─ firebase.js
│     ├─ main.js
│     ├─ login.js
│     ├─ vote.js
│     ├─ private-class.js
│     ├─ attendance.js
│     ├─ admin.js
│     ├─ admin-dashboard.js
│     ├─ admin-executive.js
│     ├─ admin-private-class.js
│     ├─ admin-inventory.js
│     ├─ admin-schedule.js
│     └─ admin-vote.js
├─ firestore.rules
├─ storage.rules
├─ firebase.json
└─ *.html
```

## Firebase 구성

프로젝트는 Firebase Web SDK compat 버전을 사용합니다. Firebase 설정은 [assets/js/firebase.js](assets/js/firebase.js)에 들어 있습니다.

사용 중인 Firebase 서비스:

- Authentication: 이메일/비밀번호 로그인
- Firestore Database: 신청, 출석, 개인 클래스, 재고, 교육일정, 임원 설정 저장
- Storage: 개인 클래스 썸네일 이미지 저장

Firebase 콘솔에서 필요한 설정:

1. Authentication에서 이메일/비밀번호 제공업체 활성화
2. 임원 계정을 Firebase Authentication 사용자로 직접 생성
3. Firestore Database 생성
4. Storage 생성
5. `firestore.rules`, `storage.rules` 배포

## Firestore 컬렉션

| 컬렉션/문서 | 용도 |
| --- | --- |
| `settings/voteConfig` | 정규 클래스 신청 설정 |
| `settings/executiveConfig` | 임원 조직도와 담당 배치 |
| `classVotes` | 정규 클래스 신청자 |
| `classVoteState` | 요일별 신청 인원 카운트 |
| `classAttendance` | 주차별 출석 기록 |
| `privateClasses` | 개인 클래스 게시글 |
| `privateClassApplications` | 개인 클래스 신청자 |
| `inventoryItems` | 재고 품목과 상품 |
| `classSchedules` | 교육일정과 주차별 레시피 |

## 로컬 실행

정적 HTML/CSS/JS 프로젝트라서 별도 빌드 과정은 없습니다.

브라우저에서 `index.html`을 열어 확인할 수 있습니다. Firebase SDK와 Firestore/Storage 연동을 안정적으로 확인하려면 로컬 서버로 실행하는 것을 권장합니다.

예시:

```bash
npx serve .
```

또는 Firebase CLI를 사용한다면:

```bash
firebase emulators:start
```

## 배포

Firebase CLI를 사용해 규칙을 배포할 수 있습니다.

```bash
firebase deploy --only firestore:rules,storage
```

Hosting 설정을 추가한 경우에는 Hosting도 함께 배포할 수 있습니다.

```bash
firebase deploy
```

## 개발 메모

- 공통 유틸은 `assets/js/utils.js`에 있습니다.
- Firebase 접근 함수는 `assets/js/firebase.js`에서 `window.MartiniFirebase`로 노출됩니다.
- 관리 페이지 공통 상태와 탭 초기화는 `assets/js/admin.js`에 있습니다.
- 관리 페이지 기능별 로직은 `admin-*.js` 파일로 분리되어 있습니다.
- CSS는 `assets/css/main.css` 하나에 통합되어 있습니다.

## 점검 명령

JavaScript 문법 검사는 다음 명령으로 확인할 수 있습니다.

```bash
Get-ChildItem assets/js -Filter *.js | ForEach-Object { node --check $_.FullName }
```
