function collectVoteConfig() {
  const formData = new FormData(voteConfigForm);
  const days = {};
  const capacity = Number(formData.get("vote-capacity"));
  const normalizedCapacity = Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULT_CAPACITY;
  const reservedOpenAt = getInputDate(applyOpenAtInput);
  const reservedCloseAt = getInputDate(applyCloseAtInput);

  WEEKDAYS.forEach((weekday) => {
    const enabled = formData.get(`${weekday.key}-enabled`) === "on";

    days[weekday.key] = {
      label: weekday.label,
      enabled,
      capacity: normalizedCapacity,
    };
  });

  return {
    isOpen: currentVoteConfig?.isOpen === true,
    reservedOpenAt,
    reservedCloseAt,
    capacity: normalizedCapacity,
    days,
  };
}

function isValidApplySchedule(config) {
  if (!config.reservedOpenAt || !config.reservedCloseAt) return true;

  return config.reservedCloseAt > config.reservedOpenAt;
}

function clearSelectedAdminVoteMember() {
  selectedAdminVoteStudentId = "";
  voteDayList?.querySelectorAll(".admin-vote-member.is-selected").forEach((member) => {
    member.classList.remove("is-selected");
  });
}

async function moveAdminVoteToDay(studentId, targetDay) {
  const targetWeekday = WEEKDAYS.find((weekday) => weekday.key === targetDay);
  const vote = adminClassVotes.find((classVote) => classVote.studentId === studentId);

  if (!studentId || !targetWeekday || vote?.day === targetDay) {
    clearSelectedAdminVoteMember();
    return;
  }

  try {
    setVoteConfigStatus(`${vote.name} 신청 요일을 이동하고 있습니다.`);
    await window.MartiniFirebase.moveClassVote(studentId, targetDay, targetWeekday.label);
    setVoteConfigStatus(`${vote.name} 신청 요일이 ${targetWeekday.label}로 변경되었습니다.`);
    clearSelectedAdminVoteMember();
  } catch {
    setVoteConfigStatus("신청 요일 변경에 실패했습니다.");
  }
}

function bindVoteCapacityToggles() {
  voteDayList?.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-vote-toggle]");

    if (!toggleButton) return;

    const row = toggleButton.closest("[data-vote-day]");
    const checkbox = row?.querySelector('input[type="checkbox"]');

    if (!row || !checkbox) return;

    checkbox.checked = !checkbox.checked;
    row.classList.toggle("is-active", checkbox.checked);
  });
}

function bindVoteMemberActions() {
  voteDayList?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-vote]");
    const member = event.target.closest("[data-student-id]");
    const row = event.target.closest("[data-vote-day]");

    if (!deleteButton && member) {
      selectedAdminVoteStudentId = selectedAdminVoteStudentId === member.dataset.studentId
        ? ""
        : member.dataset.studentId;
      voteDayList.querySelectorAll(".admin-vote-member").forEach((voteMember) => {
        voteMember.classList.toggle("is-selected", voteMember.dataset.studentId === selectedAdminVoteStudentId);
      });
      return;
    }

    if (!deleteButton && selectedAdminVoteStudentId && row) {
      await moveAdminVoteToDay(selectedAdminVoteStudentId, row.dataset.voteDay);
      return;
    }

    if (!deleteButton) return;

    const studentId = deleteButton.dataset.deleteVote;
    const confirmed = window.confirm("이 신청자를 삭제할까요?");

    if (!confirmed) return;

    try {
      setVoteConfigStatus("신청자를 삭제하고 있습니다.");
      await window.MartiniFirebase.deleteClassVote(studentId);
      setVoteConfigStatus("신청자가 삭제되었습니다.");
    } catch {
      setVoteConfigStatus("신청자 삭제에 실패했습니다.");
    }
  });

  voteDayList?.addEventListener("dragstart", (event) => {
    const member = event.target.closest("[data-student-id]");

    if (!member) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", member.dataset.studentId);
    member.classList.add("is-dragging");
  });

  voteDayList?.addEventListener("dragend", (event) => {
    event.target.closest("[data-student-id]")?.classList.remove("is-dragging");
    voteDayList.querySelectorAll(".is-drop-target").forEach((row) => {
      row.classList.remove("is-drop-target");
    });
  });

  voteDayList?.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    row.classList.add("is-drop-target");
  });

  voteDayList?.addEventListener("dragleave", (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row || row.contains(event.relatedTarget)) return;

    row.classList.remove("is-drop-target");
  });

  voteDayList?.addEventListener("drop", async (event) => {
    const row = event.target.closest("[data-vote-day]");

    if (!row) return;

    event.preventDefault();
    row.classList.remove("is-drop-target");

    const studentId = event.dataTransfer.getData("text/plain");
    const targetDay = row.dataset.voteDay;

    await moveAdminVoteToDay(studentId, targetDay);
  });
}

function subscribeAdminClassVotes() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassVotes) return;

  martiniFirebase.subscribeClassVotes((votes) => {
    adminClassVotes = votes;
    renderDashboardStats();
    renderAdminVoteMembers();
    renderUsageCalculation();
  });
}

function subscribeAdminAttendance() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassAttendance) return;

  martiniFirebase.subscribeClassAttendance((attendance) => {
    attendanceRecords = attendance;
    renderDashboardStats();
  });
}

async function loadVoteConfig() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase || !voteConfigForm) return;

  try {
    setVoteConfigStatus("저장된 설정을 불러오고 있습니다.");
    const savedConfig = await martiniFirebase.getVoteConfig();
    renderVoteConfig(normalizeVoteConfig(savedConfig));
    renderDashboardStats();
    setVoteConfigStatus("설정을 수정한 뒤 저장해주세요.");
  } catch {
    renderVoteConfig(getDefaultVoteConfig());
    renderDashboardStats();
    setVoteConfigStatus("설정을 불러오지 못했습니다. 새 설정을 저장할 수 있습니다.");
  }
}

async function handleVoteConfigSubmit(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    voteSaveButton.disabled = true;
    setVoteConfigStatus("설정을 저장하고 있습니다.");
    const nextConfig = collectVoteConfig();

    if (!isValidApplySchedule(nextConfig)) {
      setVoteConfigStatus("예약 마감 시간은 예약 오픈 시간보다 뒤여야 합니다.");
      return;
    }

    await martiniFirebase.saveVoteConfig(nextConfig);
    currentVoteConfig = nextConfig;
    renderApplyStatus(isEffectivelyOpen(nextConfig));
    renderApplySchedule(nextConfig);
    renderExecutiveDayBoard();
    setVoteConfigStatus("신청 설정이 저장되었습니다.");
  } catch {
    setVoteConfigStatus("설정 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    voteSaveButton.disabled = false;
  }
}

async function handleApplyToggle() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  const nextIsOpen = !isEffectivelyOpen(currentVoteConfig || getDefaultVoteConfig());

  try {
    applyToggleButton.disabled = true;
    setVoteConfigStatus(nextIsOpen ? "신청을 오픈하고 있습니다." : "신청을 마감하고 있습니다.");
    await martiniFirebase.saveVoteConfig({
      isOpen: nextIsOpen,
      reservedOpenAt: null,
      reservedCloseAt: null,
    });
    currentVoteConfig = {
      ...(currentVoteConfig || getDefaultVoteConfig()),
      isOpen: nextIsOpen,
      reservedOpenAt: null,
      reservedCloseAt: null,
    };
    renderApplyStatus(nextIsOpen);
    renderApplySchedule(currentVoteConfig);
    renderExecutiveDayBoard();
    setVoteConfigStatus(nextIsOpen ? "신청이 오픈되었습니다." : "신청이 마감되었습니다.");
  } catch {
    setVoteConfigStatus("신청 상태 변경에 실패했습니다.");
  } finally {
    applyToggleButton.disabled = false;
  }
}

async function handleApplyScheduleClear() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  try {
    applyScheduleClearButton.disabled = true;
    setVoteConfigStatus("신청 예약을 해제하고 있습니다.");
    await martiniFirebase.saveVoteConfig({
      reservedOpenAt: null,
      reservedCloseAt: null,
    });
    currentVoteConfig = {
      ...(currentVoteConfig || getDefaultVoteConfig()),
      reservedOpenAt: null,
      reservedCloseAt: null,
    };
    renderApplyStatus(isEffectivelyOpen(currentVoteConfig));
    renderApplySchedule(currentVoteConfig);
    setVoteConfigStatus("신청 예약이 해제되었습니다.");
  } catch {
    setVoteConfigStatus("신청 예약 해제에 실패했습니다.");
  } finally {
    applyScheduleClearButton.disabled = false;
  }
}

async function handleVoteReset() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase) return;

  const confirmed = window.confirm(
    "현재 신청된 모든 기록을 삭제하고 요일별 신청 인원을 0명으로 초기화할까요?",
  );

  if (!confirmed) return;

  try {
    voteResetButton.disabled = true;
    voteSaveButton.disabled = true;
    setVoteConfigStatus("신청 데이터를 초기화하고 있습니다.");
    await martiniFirebase.resetClassVotes(WEEKDAYS.map((weekday) => weekday.key));
    setVoteConfigStatus("신청 데이터가 모두 초기화되었습니다.");
  } catch {
    setVoteConfigStatus("초기화에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    voteResetButton.disabled = false;
    voteSaveButton.disabled = false;
  }
}
