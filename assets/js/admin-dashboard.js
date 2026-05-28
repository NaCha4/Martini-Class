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
