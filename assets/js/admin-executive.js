function createLocalId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

let selectedExecutiveMemberId = "";

function getDefaultExecutiveConfig() {
  return {
    departments: [
      { id: createLocalId("dept"), name: "회장단", members: [] },
      { id: createLocalId("dept"), name: "교육부", members: [] },
      { id: createLocalId("dept"), name: "운영부", members: [] },
    ],
    assignments: WEEKDAYS.reduce((assignments, weekday) => {
      assignments[weekday.key] = [];
      return assignments;
    }, {}),
    events: [],
  };
}

function normalizeExecutiveConfig(config) {
  const baseConfig = config || getDefaultExecutiveConfig();
  const departments = Array.isArray(baseConfig.departments)
    ? baseConfig.departments.map((department) => ({
      id: department.id || createLocalId("dept"),
      name: department.name || "부서",
      members: Array.isArray(department.members)
        ? department.members.map((member) => ({
          id: member.id || createLocalId("member"),
          name: member.name || "",
        }))
        : [],
    }))
    : [];
  const memberIds = new Set(departments.flatMap((department) => department.members.map((member) => member.id)));
  const assignments = WEEKDAYS.reduce((nextAssignments, weekday) => {
    nextAssignments[weekday.key] = (baseConfig.assignments?.[weekday.key] || [])
      .filter((memberId) => memberIds.has(memberId));
    return nextAssignments;
  }, {});
  const events = Array.isArray(baseConfig.events)
    ? baseConfig.events.map((eventItem) => ({
      id: eventItem.id || createLocalId("event"),
      name: eventItem.name || "이벤트",
      assignees: Array.isArray(eventItem.assignees)
        ? eventItem.assignees.filter((memberId) => memberIds.has(memberId))
        : [],
    }))
    : [];

  return { departments, assignments, events };
}

function getExecutiveWorkingConfig() {
  return isExecutiveEditing ? executiveDraft : executiveConfig;
}

function getExecutiveMemberMap(config = getExecutiveWorkingConfig()) {
  const members = new Map();

  (config?.departments || []).forEach((department) => {
    department.members.forEach((member) => {
      members.set(member.id, { ...member, departmentName: department.name });
    });
  });

  return members;
}

function renderExecutiveControls() {
  if (!executiveEditButton) return;

  executiveEditButton.hidden = isExecutiveEditing;
  executiveSaveButton.hidden = !isExecutiveEditing;
  executiveCancelButton.hidden = !isExecutiveEditing;
  executiveAddDepartmentButton.hidden = !isExecutiveEditing;
}

function renderExecutiveOrg() {
  if (!executiveOrg) return;

  const config = getExecutiveWorkingConfig();

  if (!config?.departments?.length) {
    executiveOrg.innerHTML = `<p class="empty-state">등록된 부서가 없습니다.</p>`;
    return;
  }

  executiveOrg.innerHTML = config.departments.map((department) => {
    const memberMarkup = department.members.length
      ? department.members.map((member) => {
        if (isExecutiveEditing) {
          return `
            <div class="executive-member executive-member--edit" data-executive-member="${member.id}">
              <input type="text" value="${escapeHtml(member.name)}" placeholder="임원 이름" data-executive-member-name />
              <button type="button" aria-label="임원 삭제" data-remove-executive-member>×</button>
            </div>
          `;
        }

        return `
          <div class="executive-member${selectedExecutiveMemberId === member.id ? " is-selected" : ""}" draggable="true" data-executive-member="${member.id}">
            <strong>${escapeHtml(member.name || "이름 없음")}</strong>
          </div>
        `;
      }).join("")
      : `<p class="executive-empty">등록된 임원이 없습니다.</p>`;

    return `
      <article class="executive-department" data-executive-department="${department.id}">
        <div class="executive-department__header">
          ${isExecutiveEditing
            ? `<input type="text" value="${escapeHtml(department.name)}" placeholder="부서명" data-executive-department-name />`
            : `<h3>${escapeHtml(department.name)}</h3>`}
          ${isExecutiveEditing ? `<button type="button" aria-label="부서 삭제" data-remove-executive-department>×</button>` : ""}
        </div>
        <div class="executive-member-list">${memberMarkup}</div>
        ${isExecutiveEditing ? `<button class="auth-button auth-button--ghost" type="button" data-add-executive-member>임원 추가</button>` : ""}
      </article>
    `;
  }).join("");
}

function renderExecutiveDayBoard() {
  if (!executiveDayBoard) return;

  const config = getExecutiveWorkingConfig() || getDefaultExecutiveConfig();
  const memberMap = getExecutiveMemberMap(config);

  executiveDayBoard.innerHTML = WEEKDAYS.map((weekday) => {
    const isEnabled = currentVoteConfig?.days?.[weekday.key]?.enabled === true;
    const assignedMembers = (config.assignments?.[weekday.key] || [])
      .map((memberId) => memberMap.get(memberId))
      .filter(Boolean);

    return `
      <article class="executive-day${isEnabled ? " is-active" : ""}" data-executive-day="${weekday.key}">
        <div class="executive-day__header">
          <h3>${escapeHtml(weekday.label)}</h3>
          <span>${isEnabled ? "진행" : "미진행"}</span>
        </div>
        <ul class="executive-assignee-list">
          ${assignedMembers.length
            ? assignedMembers.map((member) => `
              <li>
                <span>${escapeHtml(member.name)}</span>
                <button type="button" aria-label="${escapeHtml(member.name)} 배치 삭제" data-remove-executive-assignment="${member.id}">×</button>
              </li>
            `).join("")
            : `<li class="executive-empty">배치된 임원이 없습니다.</li>`}
        </ul>
      </article>
    `;
  }).join("");
}

function renderExecutiveEventBoard() {
  if (!executiveEventBoard) return;

  const config = getExecutiveWorkingConfig() || getDefaultExecutiveConfig();
  const memberMap = getExecutiveMemberMap(config);

  if (!config.events?.length) {
    executiveEventBoard.innerHTML = `<p class="empty-state">등록된 이벤트가 없습니다.</p>`;
    return;
  }

  executiveEventBoard.innerHTML = config.events.map((eventItem) => {
    const assignees = (eventItem.assignees || [])
      .map((memberId) => memberMap.get(memberId))
      .filter(Boolean);

    return `
      <article class="executive-event" data-executive-event="${eventItem.id}">
        <div class="executive-event__header">
          <input type="text" value="${escapeHtml(eventItem.name)}" placeholder="이벤트 이름" data-executive-event-name />
          <button type="button" aria-label="${escapeHtml(eventItem.name)} 이벤트 삭제" data-remove-executive-event>×</button>
        </div>
        <ul class="executive-assignee-list">
          ${assignees.length
            ? assignees.map((member) => `
              <li>
                <span>${escapeHtml(member.name)}</span>
                <button type="button" aria-label="${escapeHtml(member.name)} 배치 삭제" data-remove-executive-event-assignment="${member.id}">×</button>
              </li>
            `).join("")
            : `<li class="executive-empty">배치된 임원이 없습니다.</li>`}
        </ul>
      </article>
    `;
  }).join("");
}

function renderExecutiveManagement() {
  renderExecutiveControls();
  renderExecutiveOrg();
  renderExecutiveDayBoard();
  renderExecutiveEventBoard();
}

function collectExecutiveDraftFromDom() {
  const previousConfig = getExecutiveWorkingConfig() || getDefaultExecutiveConfig();
  const departments = Array.from(executiveOrg?.querySelectorAll("[data-executive-department]") || []).map((departmentElement) => {
    const previousDepartment = previousConfig.departments.find((department) => department.id === departmentElement.dataset.executiveDepartment);
    const members = Array.from(departmentElement.querySelectorAll("[data-executive-member]")).map((memberElement) => {
      const previousMember = previousDepartment?.members.find((member) => member.id === memberElement.dataset.executiveMember);
      const name = memberElement.querySelector("[data-executive-member-name]")?.value.trim() || previousMember?.name || "";

      return {
        id: memberElement.dataset.executiveMember || createLocalId("member"),
        name,
      };
    }).filter((member) => member.name);
    const name = departmentElement.querySelector("[data-executive-department-name]")?.value.trim() || previousDepartment?.name || "";

    return {
      id: departmentElement.dataset.executiveDepartment || createLocalId("dept"),
      name: name || "부서",
      members,
    };
  });
  const memberIds = new Set(departments.flatMap((department) => department.members.map((member) => member.id)));
  const assignments = WEEKDAYS.reduce((nextAssignments, weekday) => {
    nextAssignments[weekday.key] = (previousConfig.assignments?.[weekday.key] || []).filter((memberId) => memberIds.has(memberId));
    return nextAssignments;
  }, {});
  const events = Array.from(executiveEventBoard?.querySelectorAll("[data-executive-event]") || []).map((eventElement) => {
    const previousEvent = previousConfig.events?.find((eventItem) => eventItem.id === eventElement.dataset.executiveEvent);
    const name = eventElement.querySelector("[data-executive-event-name]")?.value.trim() || previousEvent?.name || "";

    return {
      id: eventElement.dataset.executiveEvent || createLocalId("event"),
      name: name || "이벤트",
      assignees: (previousEvent?.assignees || []).filter((memberId) => memberIds.has(memberId)),
    };
  });

  return { departments, assignments, events };
}

async function saveExecutiveConfig(nextConfig) {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.saveExecutiveConfig) return;

  await martiniFirebase.saveExecutiveConfig(nextConfig);
  executiveConfig = nextConfig;
  renderExecutiveManagement();
}

function clearSelectedExecutiveMember() {
  selectedExecutiveMemberId = "";
  executiveOrg?.querySelectorAll(".executive-member.is-selected").forEach((member) => {
    member.classList.remove("is-selected");
  });
}

async function assignExecutiveMemberToDay(memberId, dayKey) {
  const nextConfig = normalizeExecutiveConfig(executiveConfig || getDefaultExecutiveConfig());

  if (!memberId || !dayKey || !getExecutiveMemberMap(nextConfig).has(memberId)) return;

  if (!nextConfig.assignments[dayKey].includes(memberId)) {
    nextConfig.assignments[dayKey].push(memberId);
  }

  try {
    await saveExecutiveConfig(nextConfig);
    clearSelectedExecutiveMember();
  } catch {
    return;
  }
}

async function assignExecutiveMemberToEvent(memberId, eventId) {
  const nextConfig = normalizeExecutiveConfig(executiveConfig || getDefaultExecutiveConfig());
  const eventItem = nextConfig.events.find((item) => item.id === eventId);

  if (!memberId || !eventItem || !getExecutiveMemberMap(nextConfig).has(memberId)) return;

  if (!eventItem.assignees.includes(memberId)) {
    eventItem.assignees.push(memberId);
  }

  try {
    await saveExecutiveConfig(nextConfig);
    clearSelectedExecutiveMember();
  } catch {
    return;
  }
}

function bindExecutiveActions() {
  executiveEditButton?.addEventListener("click", () => {
    clearSelectedExecutiveMember();
    executiveDraft = JSON.parse(JSON.stringify(executiveConfig || getDefaultExecutiveConfig()));
    isExecutiveEditing = true;
    renderExecutiveManagement();
  });

  executiveCancelButton?.addEventListener("click", () => {
    clearSelectedExecutiveMember();
    executiveDraft = null;
    isExecutiveEditing = false;
    renderExecutiveManagement();
  });

  executiveSaveButton?.addEventListener("click", async () => {
    try {
      executiveSaveButton.disabled = true;
      const nextConfig = normalizeExecutiveConfig(collectExecutiveDraftFromDom());
      await saveExecutiveConfig(nextConfig);
      executiveDraft = null;
      isExecutiveEditing = false;
    } catch {
      return;
    } finally {
      executiveSaveButton.disabled = false;
      renderExecutiveManagement();
    }
  });

  executiveAddDepartmentButton?.addEventListener("click", () => {
    executiveDraft = collectExecutiveDraftFromDom();
    executiveDraft.departments.push({ id: createLocalId("dept"), name: "새 부서", members: [] });
    renderExecutiveManagement();
  });

  executiveAddEventButton?.addEventListener("click", async () => {
    const nextConfig = isExecutiveEditing
      ? collectExecutiveDraftFromDom()
      : normalizeExecutiveConfig(executiveConfig || getDefaultExecutiveConfig());

    nextConfig.events.push({
      id: createLocalId("event"),
      name: "새 이벤트",
      assignees: [],
    });

    if (isExecutiveEditing) {
      executiveDraft = nextConfig;
      renderExecutiveManagement();
      return;
    }

    try {
      await saveExecutiveConfig(nextConfig);
    } catch {
      return;
    }
  });

  executiveOrg?.addEventListener("click", (event) => {
    const selectedMember = event.target.closest("[data-executive-member]");

    if (!isExecutiveEditing && selectedMember) {
      selectedExecutiveMemberId = selectedExecutiveMemberId === selectedMember.dataset.executiveMember
        ? ""
        : selectedMember.dataset.executiveMember;
      executiveOrg.querySelectorAll(".executive-member").forEach((member) => {
        member.classList.toggle("is-selected", member.dataset.executiveMember === selectedExecutiveMemberId);
      });
      return;
    }

    if (!isExecutiveEditing) return;

    const departmentElement = event.target.closest("[data-executive-department]");
    const addMemberButton = event.target.closest("[data-add-executive-member]");
    const removeMemberButton = event.target.closest("[data-remove-executive-member]");
    const removeDepartmentButton = event.target.closest("[data-remove-executive-department]");

    if (!departmentElement) return;

    executiveDraft = collectExecutiveDraftFromDom();
    const department = executiveDraft.departments.find((item) => item.id === departmentElement.dataset.executiveDepartment);

    if (addMemberButton && department) {
      department.members.push({ id: createLocalId("member"), name: "" });
      renderExecutiveManagement();
      return;
    }

    if (removeMemberButton) {
      const memberId = removeMemberButton.closest("[data-executive-member]")?.dataset.executiveMember;
      executiveDraft.departments.forEach((item) => {
        item.members = item.members.filter((member) => member.id !== memberId);
      });
      WEEKDAYS.forEach((weekday) => {
        executiveDraft.assignments[weekday.key] = (executiveDraft.assignments[weekday.key] || []).filter((id) => id !== memberId);
      });
      renderExecutiveManagement();
      return;
    }

    if (removeDepartmentButton) {
      const departmentId = departmentElement.dataset.executiveDepartment;
      const removedDepartment = executiveDraft.departments.find((item) => item.id === departmentId);
      const removedMemberIds = new Set((removedDepartment?.members || []).map((member) => member.id));

      executiveDraft.departments = executiveDraft.departments.filter((item) => item.id !== departmentId);
      WEEKDAYS.forEach((weekday) => {
        executiveDraft.assignments[weekday.key] = (executiveDraft.assignments[weekday.key] || []).filter((id) => !removedMemberIds.has(id));
      });
      executiveDraft.events.forEach((eventItem) => {
        eventItem.assignees = (eventItem.assignees || []).filter((id) => !removedMemberIds.has(id));
      });
      renderExecutiveManagement();
    }
  });

  executiveOrg?.addEventListener("dragstart", (event) => {
    const memberElement = event.target.closest("[data-executive-member]");

    if (!memberElement || isExecutiveEditing) return;

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", memberElement.dataset.executiveMember);
    memberElement.classList.add("is-dragging");
  });

  executiveOrg?.addEventListener("dragend", (event) => {
    event.target.closest("[data-executive-member]")?.classList.remove("is-dragging");
    executiveDayBoard?.querySelectorAll(".is-drop-target").forEach((day) => day.classList.remove("is-drop-target"));
  });

  executiveDayBoard?.addEventListener("dragover", (event) => {
    const dayElement = event.target.closest("[data-executive-day]");

    if (!dayElement?.classList.contains("is-active")) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dayElement.classList.add("is-drop-target");
  });

  executiveDayBoard?.addEventListener("dragleave", (event) => {
    const dayElement = event.target.closest("[data-executive-day]");

    if (!dayElement || dayElement.contains(event.relatedTarget)) return;

    dayElement.classList.remove("is-drop-target");
  });

  executiveDayBoard?.addEventListener("drop", async (event) => {
    const dayElement = event.target.closest("[data-executive-day]");

    if (!dayElement?.classList.contains("is-active")) return;

    event.preventDefault();
    dayElement.classList.remove("is-drop-target");

    const memberId = event.dataTransfer.getData("text/plain");
    const dayKey = dayElement.dataset.executiveDay;

    await assignExecutiveMemberToDay(memberId, dayKey);
  });

  executiveDayBoard?.addEventListener("click", async (event) => {
    const removeButton = event.target.closest("[data-remove-executive-assignment]");
    const dayElement = event.target.closest("[data-executive-day]");

    if (!removeButton && selectedExecutiveMemberId && dayElement?.classList.contains("is-active")) {
      await assignExecutiveMemberToDay(selectedExecutiveMemberId, dayElement.dataset.executiveDay);
      return;
    }

    if (!removeButton) return;

    const dayKey = dayElement?.dataset.executiveDay;
    const memberId = removeButton.dataset.removeExecutiveAssignment;
    const nextConfig = normalizeExecutiveConfig(executiveConfig || getDefaultExecutiveConfig());

    if (!dayKey || !memberId) return;

    nextConfig.assignments[dayKey] = nextConfig.assignments[dayKey].filter((id) => id !== memberId);

    try {
      await saveExecutiveConfig(nextConfig);
    } catch {
      return;
    }
  });

  executiveEventBoard?.addEventListener("change", async (event) => {
    const nameInput = event.target.closest("[data-executive-event-name]");

    if (!nameInput || isExecutiveEditing) return;

    const eventElement = nameInput.closest("[data-executive-event]");
    const nextConfig = normalizeExecutiveConfig(executiveConfig || getDefaultExecutiveConfig());
    const eventItem = nextConfig.events.find((item) => item.id === eventElement?.dataset.executiveEvent);

    if (!eventItem) return;

    eventItem.name = nameInput.value.trim() || "이벤트";

    try {
      await saveExecutiveConfig(nextConfig);
    } catch {
      return;
    }
  });

  executiveEventBoard?.addEventListener("dragover", (event) => {
    const eventElement = event.target.closest("[data-executive-event]");

    if (!eventElement) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    eventElement.classList.add("is-drop-target");
  });

  executiveEventBoard?.addEventListener("dragleave", (event) => {
    const eventElement = event.target.closest("[data-executive-event]");

    if (!eventElement || eventElement.contains(event.relatedTarget)) return;

    eventElement.classList.remove("is-drop-target");
  });

  executiveEventBoard?.addEventListener("drop", async (event) => {
    const eventElement = event.target.closest("[data-executive-event]");

    if (!eventElement) return;

    event.preventDefault();
    eventElement.classList.remove("is-drop-target");

    const memberId = event.dataTransfer.getData("text/plain");

    await assignExecutiveMemberToEvent(memberId, eventElement.dataset.executiveEvent);
  });

  executiveEventBoard?.addEventListener("click", async (event) => {
    const removeEventButton = event.target.closest("[data-remove-executive-event]");
    const removeAssignmentButton = event.target.closest("[data-remove-executive-event-assignment]");
    const eventElement = event.target.closest("[data-executive-event]");
    const nextConfig = normalizeExecutiveConfig(executiveConfig || getDefaultExecutiveConfig());
    const eventItem = nextConfig.events.find((item) => item.id === eventElement?.dataset.executiveEvent);

    if (
      selectedExecutiveMemberId
      && eventElement
      && !removeEventButton
      && !removeAssignmentButton
      && !event.target.closest("input, button")
    ) {
      await assignExecutiveMemberToEvent(selectedExecutiveMemberId, eventElement.dataset.executiveEvent);
      return;
    }

    if (!eventElement || (!removeEventButton && !removeAssignmentButton)) return;

    if (removeEventButton) {
      nextConfig.events = nextConfig.events.filter((item) => item.id !== eventElement.dataset.executiveEvent);
    }

    if (removeAssignmentButton && eventItem) {
      eventItem.assignees = eventItem.assignees.filter((memberId) => memberId !== removeAssignmentButton.dataset.removeExecutiveEventAssignment);
    }

    try {
      await saveExecutiveConfig(nextConfig);
    } catch {
      return;
    }
  });
}

function subscribeExecutiveConfig() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeExecutiveConfig) return null;

  return martiniFirebase.subscribeExecutiveConfig((config) => {
    executiveConfig = normalizeExecutiveConfig(config);

    if (!isExecutiveEditing) {
      renderExecutiveManagement();
    }
  });
}
