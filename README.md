# Martini Class

마티니 칵테일 동아리의 정규 클래스 신청, 이벤트 클래스 신청, 출석부, 재고, 교육일정, 회의록, 임원 정보를 관리하는 Firebase 기반 정적 웹 프로젝트입니다.

## Maintainer Contact

홈페이지 유지보수나 인수인계가 필요한 경우 아래로 연락해주세요.

- E-Mail: dnacha4647@gmail.com

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