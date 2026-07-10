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
import { createFirebaseErrorFormatter, createStatusSetter, getTimestampMillis } from "../shared/common.js?v=security-refactor-20260710";

const MEMBERS_COLLECTION = "members";
const DEPARTMENTS_COLLECTION = "officerDepartments";

let executiveContext;
let members = [];
let departments = [];
let isExecutiveEditMode = false;
let areExecutiveControlsAvailable = false;
let activeDepartmentDrag = null;
let activeMemberDrag = null;

const setStatus = createStatusSetter("[data-executives-status]");
const getFirebaseErrorMessage = createFirebaseErrorFormatter();

function sortByName(records) {
  return [...records].sort((first, second) => {
    const nameCompare = String(first.name || "").localeCompare(String(second.name || ""), "ko-KR");

    if (nameCompare !== 0) {
      return nameCompare;
    }

    return String(first.studentId || "").localeCompare(String(second.studentId || ""), "ko-KR");
  });
}

function sortDepartments(records) {
  return [...records].sort((first, second) => {
    const firstHasOrder = Number.isFinite(first.order);
    const secondHasOrder = Number.isFinite(second.order);

    if (firstHasOrder && secondHasOrder && first.order !== second.order) {
      return first.order - second.order;
    }

    const firstCreatedAt = getCreatedAtMillis(first.createdAt);
    const secondCreatedAt = getCreatedAtMillis(second.createdAt);

    if (firstCreatedAt !== secondCreatedAt) {
      return firstCreatedAt - secondCreatedAt;
    }

    return String(first.name || "").localeCompare(String(second.name || ""), "ko-KR");
  });
}

function getOrderValue(value) {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function getNextDepartmentOrder() {
  const maxOrder = departments.reduce((max, department) => {
    const order = getOrderValue(department.order);

    return order === Number.MAX_SAFE_INTEGER ? max : Math.max(max, order);
  }, -1);

  return maxOrder + 1;
}

function getCreatedAtMillis(value) {
  return getTimestampMillis(value, Number.MAX_SAFE_INTEGER);
}

function setControlsEnabled(isEnabled) {
  areExecutiveControlsAvailable = isEnabled;

  if (!isEnabled) {
    isExecutiveEditMode = false;
  }

  const panel = document.querySelector('[data-admin-panel="executives"]');
  panel?.classList.toggle("is-executive-edit-mode", isExecutiveEditMode);

  document.querySelectorAll("[data-department-form] input, [data-department-form] button, [data-department-list] select, [data-department-list] button").forEach((field) => {
    field.disabled = !isEnabled || !isExecutiveEditMode;
  });

  document.querySelectorAll(".admin-department-card").forEach((card) => {
    card.draggable = false;
    card.querySelector(".admin-department-card__header")?.removeAttribute("draggable");
  });

  const editButton = document.querySelector("[data-executives-edit]");

  if (editButton) {
    editButton.disabled = !isEnabled;
    editButton.classList.toggle("is-active", isExecutiveEditMode);
    editButton.setAttribute("aria-pressed", String(isExecutiveEditMode));
  }
}

function syncExecutiveEditMode() {
  const panel = document.querySelector('[data-admin-panel="executives"]');
  const editButton = document.querySelector("[data-executives-edit]");

  panel?.classList.toggle("is-executive-edit-mode", isExecutiveEditMode);

  if (editButton) {
    editButton.classList.toggle("is-active", isExecutiveEditMode);
    editButton.setAttribute("aria-pressed", String(isExecutiveEditMode));
  }

  setControlsEnabled(areExecutiveControlsAvailable);
}

function setExecutiveEditMode(isEditMode) {
  isExecutiveEditMode = isEditMode;
  syncExecutiveEditMode();
}


async function loadRemoteData(db) {
  const [memberSnapshots, departmentSnapshots] = await Promise.all([
    getDocs(query(collection(db, MEMBERS_COLLECTION), orderBy("createdAt", "desc"))),
    getDocs(query(collection(db, DEPARTMENTS_COLLECTION), orderBy("createdAt", "asc"))),
  ]);

  members = sortByName(memberSnapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })));
  departments = sortDepartments(departmentSnapshots.docs.map((snapshot) => ({ id: snapshot.id, memberIds: [], ...snapshot.data() })));
}


function getAvailableMembers(department) {
  const assignedIds = new Set(department.memberIds || []);

  return members.filter((member) => !assignedIds.has(member.id));
}

function createMemberOption(member) {
  const option = document.createElement("option");

  option.value = member.id;
  option.textContent = member.name;

  return option;
}

function renderDepartmentCard(department) {
  const card = document.createElement("article");
  const header = document.createElement("div");
  const title = document.createElement("h3");
  const deleteButton = document.createElement("button");
  const assignForm = document.createElement("form");
  const select = document.createElement("select");
  const assignedList = document.createElement("div");
  const assignedIds = department.memberIds || [];
  const assignedMembers = assignedIds
    .map((memberId) => members.find((member) => member.id === memberId))
    .filter(Boolean);

  card.className = "admin-department-card";
  card.dataset.departmentId = department.id;
  card.draggable = false;
  header.className = "admin-department-card__header";
  title.textContent = department.name;
  deleteButton.className = "admin-executive-edit-control";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteDepartment(department));
  header.append(title, deleteButton);

  assignForm.className = "admin-department-assign";
  assignForm.classList.add("admin-executive-edit-control");
  select.name = "memberId";
  select.required = true;
  select.append(new Option("+", ""));
  getAvailableMembers(department).forEach((member) => select.append(createMemberOption(member)));
  select.disabled = !members.length || !getAvailableMembers(department).length;
  assignForm.append(select);
  select.addEventListener("change", () => {
    assignMember(department, select.value);
  });
  assignForm.addEventListener("submit", (event) => event.preventDefault());

  assignedList.className = "admin-assigned-list";

  if (!assignedMembers.length) {
    assignedList.innerHTML = '<p class="admin-empty">배치된 부원이 없습니다.</p>';
  } else {
    assignedList.replaceChildren(...assignedMembers.map((member) => {
      const row = document.createElement("div");
      const info = document.createElement("span");

      row.className = "admin-assigned-member";
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `${member.name} 배치 해제`);
      row.dataset.memberId = member.id;
      info.textContent = member.name;
      row.addEventListener("click", () => {
        if (row.dataset.skipClick === "true") {
          delete row.dataset.skipClick;
          return;
        }

        if (isExecutiveEditMode) {
          removeMember(department, member.id);
        }
      });
      row.addEventListener("dragstart", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      row.addEventListener("keydown", (event) => {
        if (isExecutiveEditMode && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          removeMember(department, member.id);
        }
      });
      row.append(info);
      bindMemberDragEvents(row, department, member);

      return row;
    }));
  }

  card.append(header, assignForm, assignedList);
  bindDepartmentDragEvents(card, department);

  return card;
}

function bindMemberDragEvents(row, sourceDepartment, member) {
  row.addEventListener("pointerdown", (event) => {
    if (!isExecutiveEditMode) {
      activeMemberDrag = null;
      return;
    }

    activeMemberDrag = {
      dragImage: null,
      memberId: member.id,
      memberName: member.name,
      pointerId: event.pointerId,
      row,
      sourceDepartmentId: sourceDepartment.id,
      startX: event.clientX,
      startY: event.clientY,
      targetDepartmentId: null,
      wasMoved: false,
    };
    row.setPointerCapture?.(event.pointerId);
  });

  row.addEventListener("pointermove", (event) => {
    updateMemberPointerDrag(event);
  });

  row.addEventListener("pointerup", () => {
    finishMemberPointerDrag();
  });

  row.addEventListener("pointercancel", () => {
    cleanupMemberPointerDrag();
  });
}

function bindDepartmentDragEvents(card, department) {
  const header = card.querySelector(".admin-department-card__header");

  card.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const isHeaderPointer = target instanceof Element && target.closest(".admin-department-card__header") === header;
    const isDeletePointer = target instanceof Element && Boolean(target.closest("button"));

    if (!isExecutiveEditMode || !isHeaderPointer || isDeletePointer) {
      activeDepartmentDrag = null;
      return;
    }

    event.preventDefault();
    activeDepartmentDrag = {
      card,
      departmentId: department.id,
      dragImage: null,
      insertAfterTarget: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetId: null,
      wasMoved: false,
    };
    card.setPointerCapture?.(event.pointerId);
  });

  card.addEventListener("pointerup", () => {
    finishDepartmentPointerDrag();
  });

  card.addEventListener("pointercancel", () => {
    cleanupDepartmentPointerDrag();
  });

  card.addEventListener("pointermove", (event) => {
    updateDepartmentPointerDrag(event);
  });

  card.addEventListener("dragstart", (event) => event.preventDefault());
}

function createAdminDragImage(name) {
  const dragImage = document.createElement("div");

  dragImage.className = "admin-drag-image";
  dragImage.textContent = name;
  document.body.append(dragImage);

  return dragImage;
}

function updateMemberPointerDrag(event) {
  if (!activeMemberDrag) {
    return;
  }

  const distance = Math.hypot(event.clientX - activeMemberDrag.startX, event.clientY - activeMemberDrag.startY);

  if (!activeMemberDrag.wasMoved && distance < 6) {
    return;
  }

  event.preventDefault();
  activeMemberDrag.wasMoved = true;
  activeMemberDrag.row.dataset.skipClick = "true";
  activeMemberDrag.row.classList.add("is-dragging");

  if (!activeMemberDrag.dragImage) {
    activeMemberDrag.dragImage = createAdminDragImage(activeMemberDrag.memberName);
  }

  activeMemberDrag.dragImage.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;

  document.querySelectorAll(".admin-department-card").forEach((item) => {
    item.classList.remove("is-member-drop-target");
  });

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".admin-department-card");

  if (!target || target.dataset.departmentId === activeMemberDrag.sourceDepartmentId) {
    activeMemberDrag.targetDepartmentId = null;
    return;
  }

  target.classList.add("is-member-drop-target");
  activeMemberDrag.targetDepartmentId = target.dataset.departmentId || null;
}

function finishMemberPointerDrag() {
  if (!activeMemberDrag) {
    return;
  }

  const dragState = activeMemberDrag;

  cleanupMemberPointerDrag();

  if (dragState.wasMoved && dragState.targetDepartmentId) {
    moveMemberToDepartment(dragState.sourceDepartmentId, dragState.targetDepartmentId, dragState.memberId);
  }
}

function cleanupMemberPointerDrag() {
  if (!activeMemberDrag) {
    return;
  }

  try {
    activeMemberDrag.row.releasePointerCapture?.(activeMemberDrag.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }

  activeMemberDrag.dragImage?.remove();
  activeMemberDrag.row.classList.remove("is-dragging");
  activeMemberDrag = null;
  document.querySelectorAll(".admin-department-card").forEach((item) => {
    item.classList.remove("is-member-drop-target");
  });
}

function updateDepartmentPointerDrag(event) {
  if (!activeDepartmentDrag) {
    return;
  }

  const distance = Math.hypot(event.clientX - activeDepartmentDrag.startX, event.clientY - activeDepartmentDrag.startY);

  if (!activeDepartmentDrag.wasMoved && distance < 6) {
    return;
  }

  event.preventDefault();
  activeDepartmentDrag.wasMoved = true;
  activeDepartmentDrag.card.classList.add("is-dragging");

  if (!activeDepartmentDrag.dragImage) {
    const department = departments.find((item) => item.id === activeDepartmentDrag.departmentId);
    activeDepartmentDrag.dragImage = createAdminDragImage(department?.name || "Section");
  }

  activeDepartmentDrag.dragImage.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;

  document.querySelectorAll(".admin-department-card").forEach((item) => {
    item.classList.remove("is-drop-target");
  });

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".admin-department-card");

  if (!target || target === activeDepartmentDrag.card) {
    activeDepartmentDrag.targetId = null;
    return;
  }

  target.classList.add("is-drop-target");
  activeDepartmentDrag.targetId = target.dataset.departmentId || null;
  activeDepartmentDrag.insertAfterTarget = shouldInsertAfter(event, target);
}

function finishDepartmentPointerDrag() {
  if (!activeDepartmentDrag) {
    return;
  }

  const dragState = activeDepartmentDrag;

  cleanupDepartmentPointerDrag();

  if (dragState.wasMoved && dragState.targetId) {
    reorderDepartments(dragState.departmentId, dragState.targetId, dragState.insertAfterTarget);
  }
}

function cleanupDepartmentPointerDrag() {
  if (!activeDepartmentDrag) {
    return;
  }

  try {
    activeDepartmentDrag.card.releasePointerCapture?.(activeDepartmentDrag.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }

  activeDepartmentDrag.dragImage?.remove();
  activeDepartmentDrag = null;
  document.querySelectorAll(".admin-department-card").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
}

function shouldInsertAfter(event, target) {
  const rect = target.getBoundingClientRect();
  const horizontalPosition = (event.clientX - rect.left) / rect.width;
  const verticalPosition = (event.clientY - rect.top) / rect.height;

  return horizontalPosition > 0.5 || verticalPosition > 0.58;
}

function renderDepartments() {
  const list = document.querySelector("[data-department-list]");

  if (!list) {
    return;
  }

  if (!departments.length) {
    list.innerHTML = '<p class="admin-empty">등록된 부서가 없습니다.</p>';
    return;
  }

  list.replaceChildren(...departments.map(renderDepartmentCard));
  setControlsEnabled(areExecutiveControlsAvailable);
}

async function refreshExecutives() {
  if (!executiveContext) {
    return false;
  }

  const context = executiveContext;
  setStatus("임원 정보를 불러오는 중입니다.");

  try {
    await loadRemoteData(context.db);

    if (executiveContext !== context) {
      return false;
    }

    renderDepartments();
    setStatus("");
    return true;
  } catch (error) {
    if (executiveContext !== context) {
      return false;
    }

    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "임원 정보를 불러오지 못했습니다."), true);
    return false;
  }
}

async function saveRemoteDepartment(department) {
  await setDoc(doc(executiveContext.db, DEPARTMENTS_COLLECTION, department.id), {
    name: department.name,
    memberIds: department.memberIds || [],
    order: Number.isFinite(department.order) ? department.order : null,
    updatedAt: serverTimestamp(),
    createdAt: department.createdAt || serverTimestamp(),
  }, { merge: true });
}


async function addDepartment(name) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("부서 이름을 입력해주세요.");
  }

  if (departments.some((department) => department.name === trimmedName)) {
    throw new Error("이미 등록된 부서입니다.");
  }

  const docRef = doc(collection(executiveContext.db, DEPARTMENTS_COLLECTION));

  await setDoc(docRef, {
    name: trimmedName,
    memberIds: [],
    order: getNextDepartmentOrder(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function deleteDepartment(department) {
  if (!window.confirm(`"${department.name}" 부서를 삭제할까요?`)) {
    return;
  }

  setStatus("");

  try {
    await deleteDoc(doc(executiveContext.db, DEPARTMENTS_COLLECTION, department.id));

    await refreshExecutives();
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "부서 삭제에 실패했습니다."), true);
  }
}

async function persistDepartment(department) {
  department.updatedAt = Date.now();
  await saveRemoteDepartment(department);
}

async function persistDepartmentOrders(nextDepartments) {
  const orderedDepartments = nextDepartments.map((department, index) => ({
    ...department,
    order: index,
    updatedAt: Date.now(),
  }));
  await Promise.all(orderedDepartments.map((department) => setDoc(doc(executiveContext.db, DEPARTMENTS_COLLECTION, department.id), {
    order: department.order,
    updatedAt: serverTimestamp(),
  }, { merge: true })));
}

async function reorderDepartments(sourceId, targetId, insertAfterTarget) {
  const sourceIndex = departments.findIndex((department) => department.id === sourceId);
  const targetIndex = departments.findIndex((department) => department.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return;
  }

  const nextDepartments = [...departments];
  const [source] = nextDepartments.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextDepartments.findIndex((department) => department.id === targetId);
  const insertIndex = adjustedTargetIndex + (insertAfterTarget ? 1 : 0);

  nextDepartments.splice(insertIndex, 0, source);
  departments = nextDepartments.map((department, index) => ({ ...department, order: index }));
  renderDepartments();
  setStatus("");

  try {
    await persistDepartmentOrders(departments);
    await refreshExecutives();
    setStatus("");
  } catch (error) {
    await refreshExecutives();
    setStatus(getFirebaseErrorMessage(error, "부서 순서 저장에 실패했습니다."), true);
  }
}

async function assignMember(department, memberId) {
  if (!memberId) {
    return;
  }

  const nextDepartment = {
    ...department,
    memberIds: Array.from(new Set([...(department.memberIds || []), memberId])),
  };

  setStatus("");

  try {
    await persistDepartment(nextDepartment);
    await refreshExecutives();
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "부원 배치에 실패했습니다."), true);
  }
}

async function removeMember(department, memberId) {
  const nextDepartment = {
    ...department,
    memberIds: (department.memberIds || []).filter((id) => id !== memberId),
  };

  setStatus("");

  try {
    await persistDepartment(nextDepartment);
    await refreshExecutives();
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "부원 배치 해제에 실패했습니다."), true);
  }
}

async function moveMemberToDepartment(sourceDepartmentId, targetDepartmentId, memberId) {
  if (sourceDepartmentId === targetDepartmentId) {
    return;
  }

  const sourceDepartment = departments.find((department) => department.id === sourceDepartmentId);
  const targetDepartment = departments.find((department) => department.id === targetDepartmentId);
  const member = members.find((item) => item.id === memberId);

  if (!sourceDepartment || !targetDepartment || !member) {
    return;
  }

  const nextSourceDepartment = {
    ...sourceDepartment,
    memberIds: (sourceDepartment.memberIds || []).filter((id) => id !== memberId),
  };
  const nextTargetDepartment = {
    ...targetDepartment,
    memberIds: Array.from(new Set([...(targetDepartment.memberIds || []), memberId])),
  };

  setStatus("");

  try {
    await Promise.all([
      persistDepartment(nextSourceDepartment),
      persistDepartment(nextTargetDepartment),
    ]);
    await refreshExecutives();
    setStatus("");
  } catch (error) {
    setStatus(getFirebaseErrorMessage(error, "부서 이동에 실패했습니다."), true);
  }
}

function bindDepartmentForm() {
  const form = document.querySelector("[data-department-form]");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    try {
      await addDepartment(form.elements.departmentName.value);
      form.reset();
      await refreshExecutives();
      setStatus("");
    } catch (error) {
      setStatus(getFirebaseErrorMessage(error, "부서 추가에 실패했습니다."), true);
    }
  });
}

function bindExecutiveEditButton() {
  const editButton = document.querySelector("[data-executives-edit]");

  editButton?.addEventListener("click", () => {
    setExecutiveEditMode(!isExecutiveEditMode);
  });
}

function bindDepartmentDragReset() {
  document.addEventListener("pointermove", (event) => {
    updateDepartmentPointerDrag(event);
    updateMemberPointerDrag(event);
  });

  document.addEventListener("pointerup", () => {
    finishDepartmentPointerDrag();
    finishMemberPointerDrag();
  });

  document.addEventListener("pointercancel", () => {
    cleanupDepartmentPointerDrag();
    cleanupMemberPointerDrag();
  });
}

async function initExecutiveManagement() {
  if (!document.querySelector("[data-executives-app]")) {
    return;
  }

  bindDepartmentForm();
  bindExecutiveEditButton();
  bindDepartmentDragReset();
  syncExecutiveEditMode();
  setControlsEnabled(false);

  try {
    await watchAdminAuth({
      onDenied: () => {
        executiveContext = null;
        setControlsEnabled(false);
        setStatus("관리자 로그인 후 임원을 관리할 수 있습니다.", true);
      },
      onAdmin: async (user, { db }) => {
        executiveContext = { user, db };
        const loaded = await refreshExecutives();

        setControlsEnabled(loaded);
      },
    });
  } catch (error) {
    setControlsEnabled(false);
    setStatus(getFirebaseErrorMessage(error, "Firebase 초기화에 실패했습니다."), true);
  }
}

document.addEventListener("DOMContentLoaded", initExecutiveManagement);
