# Martini Class

마티니 칵테일 동아리의 정규 클래스 신청, 이벤트 클래스 신청, 출석부, 재고, 교육일정, 회의록, 임원 정보를 관리하는 Firebase 기반 정적 웹 프로젝트입니다.

## Maintainer Contact

홈페이지 유지보수나 인수인계가 필요한 경우 아래로 연락해주세요.

- GitHub Issues: 이 저장소의 Issues 탭

## 주요 기능

- 정규 클래스 요일별 선착순 신청
- 정규 클래스 신청자 이름 목록 공개 표시
- 이벤트 클래스 게시글 작성, 썸네일 업로드, 신청자 관리
- 출석부 주차별 관리와 결석 현황 확인
- 재고 품목/상품 관리와 주차별 예상 사용량 계산
- 교육일정과 칵테일 레시피 저장
- 임원 조직도, 요일별 담당 임원, 이벤트 담당 임원 관리
- 회의록 양식/완료본 업로드 및 다운로드
- 관리자 전용 대시보드와 메모판

## 페이지 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 메인 페이지 |
| `login.html` | 관리자 로그인 |
| `vote.html` | 정규 클래스 신청 |
| `private-class.html` | 이벤트 클래스 목록, 상세, 신청 |
| `attendance.html` | 출석부 |
| `admin.html` | 관리자 페이지 |

## 폴더 구조

```text
.
├─ assets/
│  ├─ css/main.css
│  ├─ images/
│  └─ js/
│     ├─ firebase.js
│     ├─ vote.js
│     ├─ private-class.js
│     ├─ attendance.js
│     ├─ admin.js
│     └─ admin-*.js
├─ firestore.rules
├─ storage.rules
├─ firebase.json
├─ firestore.indexes.json
├─ SECURITY.md
└─ *.html
```

## Firebase 구성

프로젝트는 Firebase Web SDK compat 버전을 사용합니다. Firebase Web config와 App Check site key는 `assets/js/firebase.js`에 있습니다.

사용 중인 Firebase 서비스:

- Authentication: 관리자 이메일/비밀번호 로그인
- Firestore: 신청, 출석, 이벤트 클래스, 재고, 교육일정, 임원 설정, 회의록 메타데이터 저장
- Storage: 이벤트 클래스 썸네일, 회의록 파일 저장
- App Check: Firestore enforcement 활성화, Storage는 metrics 확인 후 enforcement 예정

Firebase 설정 파일:

- `firebase.json`: Firestore/Storage rules 연결
- `.firebaserc`: 기본 Firebase project id
- `firestore.rules`: Firestore Security Rules
- `storage.rules`: Storage Security Rules

## Firestore 컬렉션

| 컬렉션/문서 | 용도 |
| --- | --- |
| `settings/voteConfig` | 정규 클래스 신청 설정 |
| `settings/executiveConfig` | 임원 조직도와 담당 배치 |
| `settings/meetingMinutes` | 회의록 양식 등 기본 메타데이터 |
| `settings/meetingMinutesCompleted_*` | 완료 회의록 메타데이터 |
| `settings/adminMemoBoard` | 관리자 메모판 |
| `classVotes` | 정규 클래스 신청자 |
| `classVoteState` | 요일별 신청 인원 카운트 |
| `classAttendance` | 주차별 출석 기록 |
| `privateClasses` | 이벤트 클래스 게시글 |
| `privateClassApplications` | 이벤트 클래스 신청 내역 |
| `inventoryItems` | 재고 품목/상품 |
| `classSchedules` | 교육일정과 주차별 레시피 |

## 로컬 실행

정적 HTML/CSS/JS 프로젝트라 별도 빌드 과정은 없습니다.

간단한 로컬 서버 예시:

```powershell
python -m http.server 8080
```

또는 Node 기반 서버를 사용할 수 있습니다.

```powershell
npx serve .
```

Firebase Emulator를 사용할 경우:

```powershell
firebase emulators:start
```

## 검증 명령

JavaScript 문법 검사:

```powershell
Get-ChildItem assets/js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Git whitespace 검사:

```powershell
git diff --check
```

Firestore rules dry-run:

```powershell
firebase deploy --only firestore:rules --dry-run --project martini-class-d4d69
```

Storage rules dry-run:

```powershell
firebase deploy --only storage --dry-run --project martini-class-d4d69
```
