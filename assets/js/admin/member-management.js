import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { watchAdminAuth } from "../firebase-client.js?v=security-refactor-20260710";
import { createFirebaseErrorFormatter, createStatusSetter } from "../shared/common.js?v=security-refactor-20260710";

const COLLECTION_NAME = "members";

let memberContext;
let memberRecords = [];
let memberMode = null;
let memberSortMode = "name";

const setStatus = createStatusSetter("[data-members-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter();

function setFormEnabled(isEnabled) {
  document.querySelectorAll("[data-member-form] input, [data-member-form] select, [data-member-form] button, [data-members-export], [data-members-edit], [data-members-delete], [data-members-sort]").forEach((field) => {
    field.disabled = !isEnabled;
  });
}

function setMemberMode(nextMode) {
  memberMode = memberMode === nextMode ? null : nextMode;

  const editButton = document.querySelector("[data-members-edit]");
  const deleteButton = document.querySelector("[data-members-delete]");

  editButton?.classList.toggle("is-active", memberMode === "edit");
  editButton?.setAttribute("aria-pressed", String(memberMode === "edit"));
  deleteButton?.classList.toggle("is-active", memberMode === "delete");
  deleteButton?.setAttribute("aria-pressed", String(memberMode === "delete"));
  document.body.classList.toggle("is-member-edit-mode", memberMode === "edit");
  document.body.classList.toggle("is-member-delete-mode", memberMode === "delete");

  if (memberMode === "edit") {
    setStatus("수정할 부원을 선택해주세요.");
    return;
  }

  if (memberMode === "delete") {
    setStatus("삭제할 부원을 선택해주세요.");
    return;
  }

  setStatus("");
}

function normalizeMember(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const studentId = String(formData.get("studentId") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const enrollmentStatus = String(formData.get("enrollmentStatus") || "").trim();

  if (!name || !studentId || !department || !enrollmentStatus) {
    throw new Error("이름, 학번, 학과, 재학상태를 모두 입력해주세요.");
  }

  return {
    name,
    studentId,
    department,
    enrollmentStatus,
  };
}


function resetMemberForm() {
  const form = document.querySelector("[data-member-form]");

  if (!form) {
    return;
  }

  form.reset();
  form.elements.memberId.value = "";
  form.querySelector("[data-member-submit]").textContent = "Upload";
  form.querySelector("[data-member-cancel]").hidden = true;
}

function fillMemberForm(member) {
  const form = document.querySelector("[data-member-form]");

  if (!form) {
    return;
  }

  form.elements.memberId.value = member.id;
  form.elements.name.value = member.name;
  form.elements.studentId.value = member.studentId;
  form.elements.department.value = member.department;
  form.elements.enrollmentStatus.value = member.enrollmentStatus;
  form.querySelector("[data-member-submit]").textContent = "Update";
  form.querySelector("[data-member-cancel]").hidden = false;
  form.elements.name.focus();
}

function createMemberRow(member) {
  const row = document.createElement("article");
  const name = document.createElement("strong");
  const studentId = document.createElement("span");
  const department = document.createElement("span");
  const status = document.createElement("span");

  row.className = "admin-member-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `${member.name} 부원 선택`);
  name.textContent = member.name;
  studentId.textContent = member.studentId;
  department.textContent = member.department;
  status.textContent = member.enrollmentStatus;
  row.addEventListener("click", () => handleMemberRowAction(member));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleMemberRowAction(member);
    }
  });

  row.append(name, studentId, department, status);

  return row;
}

function handleMemberRowAction(member) {
  if (memberMode === "edit") {
    fillMemberForm(member);
    return;
  }

  if (memberMode === "delete") {
    deleteMember(member);
  }
}

function compareMemberName(first, second) {
  const nameCompare = String(first.name || "").localeCompare(String(second.name || ""), "ko-KR");

  if (nameCompare !== 0) {
    return nameCompare;
  }

  return String(first.studentId || "").localeCompare(String(second.studentId || ""), "ko-KR");
}

function sortMembers(records) {
  const statusOrder = {
    "재학": 0,
    "휴학": 1,
  };

  return [...records].sort((first, second) => {
    if (memberSortMode === "department") {
      const departmentCompare = String(first.department || "").localeCompare(String(second.department || ""), "ko-KR");

      return departmentCompare || compareMemberName(first, second);
    }

    if (memberSortMode === "studentId") {
      const studentIdCompare = String(first.studentId || "").localeCompare(String(second.studentId || ""), "ko-KR", { numeric: true });

      return studentIdCompare || compareMemberName(first, second);
    }

    if (memberSortMode === "status") {
      const firstStatus = statusOrder[first.enrollmentStatus] ?? 99;
      const secondStatus = statusOrder[second.enrollmentStatus] ?? 99;

      return firstStatus - secondStatus || compareMemberName(first, second);
    }

    return compareMemberName(first, second);
  });
}

function renderMembers(records) {
  const list = document.querySelector("[data-members-list]");

  if (!list) {
    return;
  }

  if (!records.length) {
    list.innerHTML = '<p class="admin-empty">등록된 부원이 없습니다.</p>';
    return;
  }

  const header = document.createElement("div");
  header.className = "admin-member-row admin-member-row--head";
  header.innerHTML = "<strong>이름</strong><span>학번</span><span>학과</span><span>재학상태</span>";

  list.replaceChildren(header, ...sortMembers(records).map(createMemberRow));
}

async function loadRemoteMembers(db) {
  const memberQuery = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
  const snapshots = await getDocs(memberQuery);

  memberRecords = snapshots.docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }));
  renderMembers(memberRecords);
}


async function refreshMembers() {
  if (!memberContext) {
    return;
  }

  setStatus("부원 목록을 불러오는 중입니다.");

  try {
    await loadRemoteMembers(memberContext.db);
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "부원 목록을 불러오지 못했습니다."), true);
  }
}

async function saveRemoteMember(form, values) {
  const id = form.elements.memberId.value;
  const nowFields = {
    ...values,
    updatedAt: serverTimestamp(),
  };

  if (id) {
    await setDoc(doc(memberContext.db, COLLECTION_NAME, id), nowFields, { merge: true });
    return;
  }

  const docRef = doc(collection(memberContext.db, COLLECTION_NAME));

  await setDoc(docRef, {
    ...nowFields,
    createdAt: serverTimestamp(),
  });
}


async function deleteRemoteMember(member) {
  await deleteDoc(doc(memberContext.db, COLLECTION_NAME, member.id));
}


async function deleteMember(member) {
  if (!window.confirm(`"${member.name}" 부원 정보를 삭제할까요?`)) {
    return;
  }

  setStatus("삭제 중입니다.");

  try {
    await deleteRemoteMember(member);

    resetMemberForm();
    await refreshMembers();
    setStatus("삭제되었습니다.");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "삭제에 실패했습니다."), true);
  }
}

function exportMembersToExcel() {
  if (!memberRecords.length) {
    setStatus("내보낼 부원 목록이 없습니다.", true);
    return;
  }

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const rows = sortMembers(memberRecords).map((member) => `
    <tr>
      <td>${escapeHtml(member.name)}</td>
      <td style="mso-number-format:'\\@';">${escapeHtml(member.studentId)}</td>
      <td>${escapeHtml(member.department)}</td>
      <td>${escapeHtml(member.enrollmentStatus)}</td>
    </tr>
  `).join("");
  const html = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <table>
          <thead>
            <tr><th>이름</th><th>학번</th><th>학과</th><th>재학상태</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `martini-members-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindMemberForm() {
  const form = document.querySelector("[data-member-form]");
  const cancel = document.querySelector("[data-member-cancel]");
  const exportButton = document.querySelector("[data-members-export]");
  const editButton = document.querySelector("[data-members-edit]");
  const deleteButton = document.querySelector("[data-members-delete]");
  const sortSelect = document.querySelector("[data-members-sort]");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("저장 중입니다.");

    try {
      const values = normalizeMember(form);
      await saveRemoteMember(form, values);

      resetMemberForm();
      await refreshMembers();
      setStatus("저장되었습니다.");
    } catch (error) {
      setStatus(getFirebaseErrorMessage(error, "저장에 실패했습니다."), true);
    }
  });

  cancel?.addEventListener("click", resetMemberForm);
  exportButton?.addEventListener("click", exportMembersToExcel);
  editButton?.addEventListener("click", () => setMemberMode("edit"));
  deleteButton?.addEventListener("click", () => setMemberMode("delete"));
  sortSelect?.addEventListener("change", () => {
    memberSortMode = sortSelect.value;
    renderMembers(memberRecords);
  });
}

async function initMemberManagement() {
  if (!document.querySelector("[data-members-app]")) {
    return;
  }

  bindMemberForm();
  setFormEnabled(false);

  try {
    await watchAdminAuth({
      onDenied: () => {
        memberContext = null;
        setFormEnabled(false);
        setStatus("관리자 로그인 후 부원을 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db }) => {
        memberContext = { user, db };
        setFormEnabled(true);
        await refreshMembers();
      },
    });
  } catch (error) {
    setFormEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initMemberManagement);
