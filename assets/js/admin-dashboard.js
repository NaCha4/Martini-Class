function setDashboardMemoStatus(message) {
  if (!dashboardMemoStatus) return;

  dashboardMemoStatus.textContent = message;
}

function formatDashboardMemoTime(value) {
  const date = normalizeConfigDate(value);

  if (!date) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderAdminMemo(memo = {}) {
  const content = String(memo.content || "");
  const updatedAt = formatDashboardMemoTime(memo.updatedAt);
  const updatedBy = memo.updatedBy ? ` / ${memo.updatedBy}` : "";
  const shouldReplaceInput = document.activeElement !== dashboardMemoInput
    || dashboardMemoInput.value === currentDashboardMemo;

  currentDashboardMemo = content;

  if (dashboardMemoInput && shouldReplaceInput) {
    dashboardMemoInput.value = content;
  }

  setDashboardMemoStatus(updatedAt ? `최근 저장 ${updatedAt}${updatedBy}` : "메모가 자동 저장됩니다.");
}

function subscribeAdminMemo() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeAdminMemo) return null;

  return martiniFirebase.subscribeAdminMemo(renderAdminMemo);
}

function queueDashboardMemoSave() {
  const martiniFirebase = window.MartiniFirebase;

  if (!dashboardMemoInput || !martiniFirebase?.saveAdminMemo) return;

  window.clearTimeout(dashboardMemoSaveTimer);
  setDashboardMemoStatus("저장 대기 중...");

  dashboardMemoSaveTimer = window.setTimeout(async () => {
    try {
      setDashboardMemoStatus("저장 중...");
      await martiniFirebase.saveAdminMemo(dashboardMemoInput.value);
      currentDashboardMemo = dashboardMemoInput.value;
      setDashboardMemoStatus("저장되었습니다.");
    } catch (error) {
      console.error("Admin memo save failed", error);
      setDashboardMemoStatus(error.message || "메모 저장에 실패했습니다.");
    }
  }, 700);
}

function bindDashboardMemoActions() {
  if (!dashboardMemoInput) return;

  dashboardMemoInput.addEventListener("input", queueDashboardMemoSave);
}

function renderDashboardStats() {
  const privateApplicationCount = privateClasses.reduce((count, privateClass) => (
    count + Number(privateClass.applicationCount || 0)
  ), 0);
  const activeDays = WEEKDAYS
    .map((weekday) => ({
      ...weekday,
      count: adminClassVotes.filter((vote) => vote.day === weekday.key).length,
      enabled: currentVoteConfig?.days?.[weekday.key]?.enabled === true,
    }))
    .filter((weekday) => weekday.enabled || weekday.count > 0);
  const visiblePrivateClasses = privateClasses
    .filter((privateClass) => ["open", "upcoming", "closed"].includes(getPrivateClassAutoStatus(privateClass)))
    .slice(0, 4);
  if (regularApplyCount) regularApplyCount.textContent = String(adminClassVotes.length);
  if (dashboardPrivateApplications) dashboardPrivateApplications.textContent = String(privateApplicationCount);

  if (dashboardApplyStatus) {
    const isOpen = isEffectivelyOpen(currentVoteConfig || getDefaultVoteConfig());

    dashboardApplyStatus.textContent = isOpen ? "오픈" : "마감";
  }

  if (dashboardVoteList) {
    dashboardVoteList.innerHTML = activeDays.length
      ? activeDays.map((weekday) => `
        <div class="dashboard-row">
          <span>${escapeHtml(weekday.label)}</span>
          <strong>${weekday.count}명</strong>
        </div>
      `).join("")
      : `<p class="empty-state">아직 신청 요일이 설정되지 않았습니다.</p>`;
  }

  if (dashboardPrivateList) {
    dashboardPrivateList.innerHTML = visiblePrivateClasses.length
      ? visiblePrivateClasses.map((privateClass) => {
        const capacity = Number(privateClass.capacity || 0);
        const applicationCount = Number(privateClass.applicationCount || 0);
        const countText = capacity > 0 ? `${applicationCount}/${capacity}명` : `${applicationCount}명`;
        const status = getPrivateClassAutoStatus(privateClass);

        return `
          <div class="dashboard-row">
            <span>${escapeHtml(privateClass.title || "신청 게시글")}</span>
            <strong>${escapeHtml(getPrivateClassStatusLabel(status))} · ${countText}</strong>
          </div>
        `;
      }).join("")
      : `<p class="empty-state">등록된 신청 게시글이 없습니다.</p>`;
  }

}
