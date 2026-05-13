const WEEKDAYS = [
  { key: "monday", label: "월요일" },
  { key: "tuesday", label: "화요일" },
  { key: "wednesday", label: "수요일" },
  { key: "thursday", label: "목요일" },
  { key: "friday", label: "금요일" },
];

const WEEKS = Array.from({ length: 10 }, (_, index) => ({
  key: `week-${index + 1}`,
  label: `${index + 1}주차`,
  number: index + 1,
}));

const attendanceBoard = document.querySelector("[data-attendance-board]");
const attendanceMessage = document.querySelector("[data-attendance-message]");
const totalCountElement = document.querySelector("[data-attendance-total]");
const presentCountElement = document.querySelector("[data-attendance-present]");
const absentCountElement = document.querySelector("[data-attendance-absent]");
const weekListElement = document.querySelector("[data-attendance-week-list]");
const importCurrentVotesButton = document.querySelector("[data-import-current-votes]");
const absenceDashboard = document.querySelector("[data-absence-dashboard]");

let classVotes = [];
let attendanceRecords = [];
let selectedWeekKey = WEEKS[0].key;

function moveToPage(target) {
  if (!target) return;

  window.location.href = target;
}

function bindNavigation() {
  document.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => {
      moveToPage(element.dataset.route);
    });
  });
}

function bindAuthGuard() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) {
    moveToPage("./login.html");
    return;
  }

  martiniFirebase.subscribeAuth(({ user, isAdmin }) => {
    if (!user || !isAdmin) {
      moveToPage("./login.html");
    }
  });
}

function setAttendanceMessage(message) {
  if (!attendanceMessage) return;

  attendanceMessage.textContent = message;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectedWeek() {
  return WEEKS.find((week) => week.key === selectedWeekKey) || WEEKS[0];
}

function getWeekRecords(weekKey = selectedWeekKey) {
  return attendanceRecords
    .filter((record) => record.weekKey === weekKey)
    .sort((a, b) => {
      const aDayOrder = WEEKDAYS.findIndex((weekday) => weekday.key === a.day);
      const bDayOrder = WEEKDAYS.findIndex((weekday) => weekday.key === b.day);
      const aOrder = Number(a.order);
      const bOrder = Number(b.order);

      if (aDayOrder !== bDayOrder) return aDayOrder - bDayOrder;
      if (Number.isFinite(aOrder) && Number.isFinite(bOrder) && aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return String(a.studentId).localeCompare(String(b.studentId), "ko");
    });
}

function getAttendanceRecord(studentId) {
  return getWeekRecords().find((record) => record.studentId === studentId);
}

function getAttendanceStatus(studentId) {
  return getAttendanceRecord(studentId)?.status || "pending";
}

function groupRecordsByDay(records) {
  return records.reduce((groups, record) => {
    if (!groups[record.day]) groups[record.day] = [];
    groups[record.day].push(record);

    return groups;
  }, {});
}

function getWeekLabel(weekKey) {
  return WEEKS.find((week) => week.key === weekKey)?.label || weekKey;
}

function renderWeekSelector() {
  weekListElement.innerHTML = WEEKS.map((week) => `
    <button
      class="attendance-week-button ${week.key === selectedWeekKey ? "is-active" : ""}"
      type="button"
      data-attendance-week="${week.key}"
    >
      ${week.label}
    </button>
  `).join("");
}

function renderAttendanceStats() {
  const weekRecords = getWeekRecords();
  const presentCount = weekRecords.filter((record) => record.status === "present").length;
  const totalAbsentCount = attendanceRecords.filter((record) => record.status === "absent").length;

  if (totalCountElement) totalCountElement.textContent = String(weekRecords.length);
  if (presentCountElement) presentCountElement.textContent = String(presentCount);
  if (absentCountElement) absentCountElement.textContent = String(totalAbsentCount);
}

function renderAbsenceDashboard() {
  const absentGroups = attendanceRecords
    .filter((record) => record.status === "absent")
    .reduce((groups, record) => {
      if (!groups[record.studentId]) {
        groups[record.studentId] = {
          name: record.name,
          studentId: record.studentId,
          weeks: [],
        };
      }

      groups[record.studentId].weeks.push(record.weekKey);

      return groups;
    }, {});

  const absentStudents = Object.values(absentGroups)
    .map((student) => ({
      ...student,
      weeks: [...new Set(student.weeks)].sort((a, b) => {
        const aWeek = WEEKS.find((week) => week.key === a)?.number || 0;
        const bWeek = WEEKS.find((week) => week.key === b)?.number || 0;

        return aWeek - bWeek;
      }),
    }))
    .sort((a, b) => b.weeks.length - a.weeks.length || a.name.localeCompare(b.name, "ko"));

  if (!absentStudents.length) {
    absenceDashboard.innerHTML = `<p class="empty-state">아직 누적 결석자가 없습니다.</p>`;
    return;
  }

  absenceDashboard.innerHTML = absentStudents.map((student) => `
    <article class="absence-person">
      <div>
        <strong>${escapeHtml(student.name)}</strong>
        <span>${escapeHtml(student.studentId)}</span>
      </div>
      <div class="absence-person__meta">
        <strong>${student.weeks.length}회</strong>
        <span>${student.weeks.map(getWeekLabel).join(", ")}</span>
      </div>
    </article>
  `).join("");
}

function renderAttendanceBoard() {
  const week = getSelectedWeek();
  const weekRecords = getWeekRecords();
  const groupedRecords = groupRecordsByDay(weekRecords);
  const activeDays = WEEKDAYS.filter((weekday) => groupedRecords[weekday.key]?.length);

  renderAttendanceStats();
  renderAbsenceDashboard();

  if (!activeDays.length) {
    attendanceBoard.innerHTML = `
      <p class="empty-state">${week.label} 출석부 명단이 없습니다. 현재 신청자 목록으로 덮어쓰기를 눌러주세요.</p>
    `;
    return;
  }

  attendanceBoard.innerHTML = activeDays.map((weekday) => {
    const records = groupedRecords[weekday.key] || [];
    const absentCount = records.filter((record) => record.status === "absent").length;

    return `
      <article class="attendance-day">
        <div class="attendance-day__header">
          <div>
            <h2>${week.label} · ${weekday.label}</h2>
            <span>${records.length}명 신청 · 결석 ${absentCount}명</span>
          </div>
        </div>
        <ul class="attendance-list">
          ${records.map((record) => renderAttendanceMember(record, weekday)).join("")}
        </ul>
      </article>
    `;
  }).join("");
}

function renderAttendanceMember(record, weekday) {
  const status = getAttendanceStatus(record.studentId);
  const isPresent = status === "present";
  const isAbsent = status === "absent";

  return `
    <li class="attendance-member" data-student-id="${escapeHtml(record.studentId)}">
      <div>
        <strong>${escapeHtml(record.name)}</strong>
        <span>${escapeHtml(record.studentId)}</span>
      </div>
      <div class="attendance-actions" aria-label="${escapeHtml(record.name)} 출석 상태">
        <label class="attendance-check ${isPresent ? "is-active" : ""}">
          <input
            type="checkbox"
            data-attendance-present="${escapeHtml(record.studentId)}"
            ${isPresent ? "checked" : ""}
          />
          <span>출석</span>
        </label>
        <button
          class="attendance-absent ${isAbsent ? "is-active" : ""}"
          type="button"
          data-attendance-absent="${escapeHtml(record.studentId)}"
          data-day="${weekday.key}"
        >
          결석
        </button>
      </div>
    </li>
  `;
}

async function saveAttendanceStatus(studentId, status) {
  const martiniFirebase = window.MartiniFirebase;
  const record = getAttendanceRecord(studentId);

  if (!martiniFirebase?.saveClassAttendance || !record) return;

  const previousRecords = attendanceRecords;
  const nextRecord = {
    ...record,
    status,
  };

  attendanceRecords = attendanceRecords.map((attendanceRecord) => (
    attendanceRecord.weekKey === selectedWeekKey && attendanceRecord.studentId === studentId
      ? nextRecord
      : attendanceRecord
  ));
  renderAttendanceBoard();

  try {
    setAttendanceMessage("출석 상태를 저장하고 있습니다.");
    await martiniFirebase.saveClassAttendance(nextRecord);
    setAttendanceMessage("출석 상태가 저장되었습니다.");
  } catch {
    attendanceRecords = previousRecords;
    renderAttendanceBoard();
    setAttendanceMessage("출석 상태 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  }
}

function buildCurrentVoteRecords() {
  const week = getSelectedWeek();
  const existingRecords = new Map(
    getWeekRecords(week.key).map((record) => [record.studentId, record]),
  );

  return classVotes.map((vote, index) => {
    const previousRecord = existingRecords.get(vote.studentId);
    const isSameDay = previousRecord?.day === vote.day;

    return {
      weekKey: week.key,
      weekLabel: week.label,
      order: index,
      studentId: vote.studentId,
      name: vote.name,
      day: vote.day,
      dayLabel: vote.dayLabel || WEEKDAYS.find((weekday) => weekday.key === vote.day)?.label || "",
      status: isSameDay ? previousRecord.status || "pending" : "pending",
    };
  });
}

async function importCurrentVotesToWeek() {
  const martiniFirebase = window.MartiniFirebase;
  const week = getSelectedWeek();

  if (!martiniFirebase?.replaceWeekClassAttendance) return;

  if (!classVotes.length) {
    const confirmed = window.confirm(`${week.label} 출석부를 빈 명단으로 덮어쓸까요?`);

    if (!confirmed) return;
  } else {
    const confirmed = window.confirm(
      `${week.label} 출석부를 현재 신청자 ${classVotes.length}명 기준으로 덮어쓸까요? 같은 요일에 남아 있는 신청자의 출석/결석 상태는 유지됩니다.`,
    );

    if (!confirmed) return;
  }

  const nextRecords = buildCurrentVoteRecords();
  const otherWeekRecords = attendanceRecords.filter((record) => record.weekKey !== week.key);
  const previousRecords = attendanceRecords;

  attendanceRecords = [...otherWeekRecords, ...nextRecords];
  renderAttendanceBoard();

  try {
    importCurrentVotesButton.disabled = true;
    setAttendanceMessage(`${week.label} 출석부를 현재 신청자 목록으로 덮어쓰고 있습니다.`);
    await martiniFirebase.replaceWeekClassAttendance(week.key, nextRecords);
    setAttendanceMessage(`${week.label} 출석부가 현재 신청자 목록으로 갱신되었습니다.`);
  } catch {
    attendanceRecords = previousRecords;
    renderAttendanceBoard();
    setAttendanceMessage("출석부 명단 갱신에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    importCurrentVotesButton.disabled = false;
  }
}

function bindAttendanceActions() {
  weekListElement.addEventListener("click", (event) => {
    const weekButton = event.target.closest("[data-attendance-week]");

    if (!weekButton) return;

    selectedWeekKey = weekButton.dataset.attendanceWeek;
    renderWeekSelector();
    renderAttendanceBoard();
  });

  importCurrentVotesButton.addEventListener("click", importCurrentVotesToWeek);

  attendanceBoard.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-attendance-present]");

    if (!checkbox) return;

    saveAttendanceStatus(
      checkbox.dataset.attendancePresent,
      checkbox.checked ? "present" : "pending",
    );
  });

  attendanceBoard.addEventListener("click", (event) => {
    const absentButton = event.target.closest("[data-attendance-absent]");

    if (!absentButton) return;

    const studentId = absentButton.dataset.attendanceAbsent;
    const currentStatus = getAttendanceStatus(studentId);

    saveAttendanceStatus(studentId, currentStatus === "absent" ? "pending" : "absent");
  });
}

function subscribeAttendanceData() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassVotes || !martiniFirebase?.subscribeClassAttendance) {
    setAttendanceMessage("출석 정보를 불러올 수 없습니다.");
    return;
  }

  martiniFirebase.subscribeClassVotes((votes) => {
    classVotes = votes;
  });

  martiniFirebase.subscribeClassAttendance((attendance) => {
    attendanceRecords = attendance;
    renderAttendanceBoard();
    setAttendanceMessage("");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindAuthGuard();
  renderWeekSelector();
  bindAttendanceActions();
  subscribeAttendanceData();
});
