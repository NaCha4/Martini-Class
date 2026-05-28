function getInventoryOptionLabel(item) {
  const category = getInventoryCategoryLabel(item.category);
  const itemName = getInventoryItemName(item);
  const productName = getInventoryProductName(item);
  const quantity = formatInventoryQuantity(item.quantity);
  const unit = item.unit || "";

  return `${category} / ${itemName} / ${productName} (${quantity}${unit})`;
}

function renderScheduleIngredientOptions(selectedId = "") {
  const options = inventoryItems.map((item) => {
    const selected = item.id === selectedId ? "selected" : "";

    return `<option value="${escapeHtml(item.id)}" ${selected}>${escapeHtml(getInventoryOptionLabel(item))}</option>`;
  }).join("");

  return `<option value="">재료 선택</option>${options}`;
}

function getInventoryItemById(itemId) {
  return inventoryItems.find((item) => item.id === itemId);
}

function getDefaultIngredientUnit(ingredient = {}) {
  const inventoryItem = getInventoryItemById(ingredient.inventoryItemId);

  return ingredient.unit || inventoryItem?.unit || "";
}

function createScheduleIngredientRow(ingredient = {}) {
  const amount = Number(ingredient.amountPerPerson || ingredient.amount || 0);
  const unit = getDefaultIngredientUnit(ingredient);

  return `
    <div class="schedule-ingredient-row" data-schedule-ingredient>
      <select data-schedule-ingredient-select>
        ${renderScheduleIngredientOptions(ingredient.inventoryItemId)}
      </select>
      <input type="number" min="0" step="0.1" value="${escapeHtml(amount || "")}" placeholder="1인 사용량" data-schedule-ingredient-amount />
      <input type="text" value="${escapeHtml(unit)}" placeholder="단위" data-schedule-ingredient-unit />
      <button type="button" aria-label="재료 삭제" data-remove-schedule-ingredient>×</button>
    </div>
  `;
}

function createScheduleCocktailBlock(index, cocktail = {}) {
  const ingredients = cocktail.ingredients?.length
    ? cocktail.ingredients.map(createScheduleIngredientRow).join("")
    : createScheduleIngredientRow();

  return `
    <section class="schedule-cocktail" data-schedule-cocktail>
      <label class="auth-field">
        <span>칵테일 ${index} 이름</span>
        <input type="text" value="${escapeHtml(cocktail.name || "")}" placeholder="마티니, 다이키리 등" data-schedule-cocktail-name />
      </label>
      <div class="schedule-ingredient-list" data-schedule-ingredient-list>
        ${ingredients}
      </div>
      <button class="auth-button auth-button--ghost" type="button" data-add-schedule-ingredient>
        재료 추가
      </button>
    </section>
  `;
}

function createScheduleWeekCard(weekNumber, week = {}) {
  const firstCocktail = week.cocktails?.[0] || {};
  const secondCocktail = week.cocktails?.[1] || {};
  const weekTheme = week.theme || "";

  return `
    <article class="schedule-week-card" data-schedule-week>
      <div class="schedule-week-card__header">
        <label class="schedule-week-number-field">
          <input type="number" min="1" value="${escapeHtml(week.weekNumber || weekNumber)}" readonly data-schedule-week-number />
          <span>주차</span>
        </label>
        <label class="schedule-week-theme-field">
          <span>테마</span>
          <input type="text" value="${escapeHtml(weekTheme)}" placeholder="미도리" data-schedule-week-theme />
        </label>
        <button type="button" aria-label="주차 삭제" data-remove-schedule-week>×</button>
      </div>
      <div class="schedule-cocktail-grid">
        ${createScheduleCocktailBlock(1, firstCocktail)}
        ${createScheduleCocktailBlock(2, secondCocktail)}
      </div>
    </article>
  `;
}

function getNextScheduleWeekNumber() {
  const weekNumbers = Array.from(scheduleWeekList?.querySelectorAll("[data-schedule-week-number]") || [])
    .map((input) => Number(input.value))
    .filter((value) => Number.isFinite(value));

  return weekNumbers.length ? Math.max(...weekNumbers) + 1 : 1;
}

function renumberScheduleWeeks() {
  if (!scheduleWeekList) return;

  Array.from(scheduleWeekList.querySelectorAll("[data-schedule-week-number]")).forEach((input, index) => {
    input.value = String(index + 1);
  });
}

function addScheduleWeek(week = null) {
  if (!scheduleWeekList) return;

  const weekNumber = week?.weekNumber || getNextScheduleWeekNumber();

  scheduleWeekList.insertAdjacentHTML("beforeend", createScheduleWeekCard(weekNumber, week || {}));
  renumberScheduleWeeks();
}

function setupDefaultScheduleWeeks() {
  if (!scheduleWeekList || scheduleWeekList.children.length) return;

  for (let weekNumber = 1; weekNumber <= 8; weekNumber += 1) {
    addScheduleWeek({ weekNumber });
  }
}

function refreshScheduleIngredientOptions() {
  document.querySelectorAll("[data-schedule-ingredient-select]").forEach((select) => {
    const selectedId = select.value;

    select.innerHTML = renderScheduleIngredientOptions(selectedId);
    select.value = selectedId;
  });
}

function collectScheduleData() {
  const formData = new FormData(scheduleForm);
  const weeks = Array.from(scheduleWeekList.querySelectorAll("[data-schedule-week]")).map((weekElement, index) => {
    const weekNumber = index + 1;
    const theme = weekElement.querySelector("[data-schedule-week-theme]")?.value.trim() || "";
    const cocktails = Array.from(weekElement.querySelectorAll("[data-schedule-cocktail]")).map((cocktailElement) => {
      const name = cocktailElement.querySelector("[data-schedule-cocktail-name]")?.value.trim() || "";
      const ingredients = Array.from(cocktailElement.querySelectorAll("[data-schedule-ingredient-select]"))
        .map((select) => {
          const row = select.closest("[data-schedule-ingredient]");
          const item = getInventoryItemById(select.value);
          const amountPerPerson = Number(row?.querySelector("[data-schedule-ingredient-amount]")?.value || 0);
          const unit = row?.querySelector("[data-schedule-ingredient-unit]")?.value.trim() || item?.unit || "";

          if (!item) return null;

          return {
          inventoryItemId: item.id,
          category: item.category || "etc",
          categoryLabel: getInventoryCategoryLabel(item.category),
          itemName: getInventoryItemName(item),
          productName: getInventoryProductName(item),
            amountPerPerson: Number.isFinite(amountPerPerson) && amountPerPerson > 0 ? amountPerPerson : 0,
            unit,
          };
        })
        .filter(Boolean);

      return {
        name,
        ingredients,
      };
    });

    return {
      weekNumber,
      theme,
      cocktails,
    };
  }).filter((week) => week.weekNumber > 0);

  return {
    id: editingClassScheduleId || undefined,
    title: String(formData.get("title") || "").trim(),
    weeks,
  };
}

function resetScheduleForm() {
  if (!scheduleForm || !scheduleWeekList) return;

  editingClassScheduleId = "";
  scheduleForm.reset();
  scheduleWeekList.innerHTML = "";
  setupDefaultScheduleWeeks();
  scheduleSaveButton.textContent = "교육일정 저장";
}

function loadScheduleForm(schedule) {
  if (!scheduleForm || !scheduleWeekList || !schedule) return;

  editingClassScheduleId = schedule.id;
  scheduleForm.elements.title.value = schedule.title || "";
  scheduleWeekList.innerHTML = "";

  (schedule.weeks || []).forEach((week) => {
    addScheduleWeek(week);
  });

  if (!scheduleWeekList.children.length) {
    setupDefaultScheduleWeeks();
  }

  scheduleSaveButton.textContent = "수정 저장";
  setScheduleStatus(`${schedule.title || "교육일정"} 레시피를 수정하고 있습니다.`);
  scheduleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderClassSchedules() {
  if (!scheduleList) return;

  if (!classSchedules.length) {
    scheduleList.innerHTML = `<p class="empty-state">아직 저장된 교육일정이 없습니다.</p>`;
    return;
  }

  scheduleList.innerHTML = classSchedules.map((schedule) => {
    const weeks = Array.isArray(schedule.weeks) ? schedule.weeks : [];
    const cocktailCount = weeks.reduce((count, week) => count + (week.cocktails?.filter((cocktail) => cocktail.name)?.length || 0), 0);
    const weekMarkup = weeks.map((week) => {
      const theme = String(week.theme || "").trim();
      const cocktailNames = (week.cocktails || [])
        .map((cocktail) => cocktail.name)
        .filter(Boolean)
        .join(" / ") || "칵테일 미정";

      return `
        <span>
          <strong>${escapeHtml(week.weekNumber)} 주차</strong>
          <span class="schedule-saved-week-detail">
            <em>${theme ? escapeHtml(theme) : ""}</em>
            <span>${escapeHtml(cocktailNames)}</span>
          </span>
        </span>
      `;
    }).join("");

    return `
      <article class="schedule-saved-card" data-schedule-id="${schedule.id}">
        <div>
          <h3>${escapeHtml(schedule.title || "교육일정")}</h3>
          <p>${weeks.length}주차 · 칵테일 ${cocktailCount}개</p>
          <div class="schedule-saved-weeks">${weekMarkup}</div>
        </div>
        <div class="schedule-saved-card__actions">
          <button class="auth-button auth-button--primary" type="button" data-load-schedule="${schedule.id}">
            불러오기
          </button>
          <button class="auth-button auth-button--ghost" type="button" data-delete-schedule="${schedule.id}">
            삭제
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function getSelectedUsageSchedule() {
  const selectedId = usageScheduleSelect?.value || classSchedules[0]?.id || "";

  return classSchedules.find((schedule) => schedule.id === selectedId) || classSchedules[0] || null;
}

function getSelectedUsageWeek(schedule = getSelectedUsageSchedule()) {
  const weeks = Array.isArray(schedule?.weeks) ? schedule.weeks : [];
  const selectedWeekNumber = Number(usageWeekSelect?.value || weeks[0]?.weekNumber || 0);

  return weeks.find((week) => Number(week.weekNumber) === selectedWeekNumber) || weeks[0] || null;
}

function renderUsageControls() {
  if (!usageScheduleSelect || !usageWeekSelect) return;

  const selectedScheduleId = usageScheduleSelect.value || classSchedules[0]?.id || "";

  usageScheduleSelect.innerHTML = classSchedules.length
    ? classSchedules.map((schedule) => {
      const selected = schedule.id === selectedScheduleId ? "selected" : "";

      return `<option value="${escapeHtml(schedule.id)}" ${selected}>${escapeHtml(schedule.title || "교육일정")}</option>`;
    }).join("")
    : `<option value="">저장된 교육일정 없음</option>`;

  const schedule = getSelectedUsageSchedule();
  const weeks = Array.isArray(schedule?.weeks) ? schedule.weeks : [];
  const selectedWeek = usageWeekSelect.value || weeks[0]?.weekNumber || "";

  usageWeekSelect.innerHTML = weeks.length
    ? weeks.map((week) => {
      const selected = String(week.weekNumber) === String(selectedWeek) ? "selected" : "";

      return `<option value="${escapeHtml(week.weekNumber)}" ${selected}>${escapeHtml(week.weekNumber)} 주차</option>`;
    }).join("")
    : `<option value="">주차 없음</option>`;
}

function getUsageAttendeeCount() {
  const attendeeCount = Number(usageAttendeesInput?.value || 0);

  return Number.isFinite(attendeeCount) && attendeeCount > 0 ? attendeeCount : 0;
}

function getUsageBufferRate() {
  const bufferRate = Number(usageBufferInput?.value || 0);

  return Number.isFinite(bufferRate) && bufferRate > 0 ? bufferRate / 100 : 0;
}

function getUsageRequirementRows() {
  const week = getSelectedUsageWeek();
  const attendeeCount = getUsageAttendeeCount();
  const multiplier = attendeeCount * (1 + getUsageBufferRate());
  const requirements = new Map();

  (week?.cocktails || []).forEach((cocktail) => {
    (cocktail.ingredients || []).forEach((ingredient) => {
      if (!ingredient.inventoryItemId) return;

      const amountPerPerson = Number(ingredient.amountPerPerson || 0);

      if (!Number.isFinite(amountPerPerson) || amountPerPerson <= 0) return;

      const requiredAmount = amountPerPerson * multiplier;
      const saved = requirements.get(ingredient.inventoryItemId) || {
        inventoryItemId: ingredient.inventoryItemId,
        itemName: ingredient.itemName,
        productName: ingredient.productName,
        unit: ingredient.unit,
        cocktails: new Set(),
        amountPerPerson: 0,
        requiredAmount: 0,
      };

      saved.itemName = ingredient.itemName || saved.itemName;
      saved.productName = ingredient.productName || saved.productName;
      saved.unit = ingredient.unit || saved.unit;
      saved.amountPerPerson += amountPerPerson;
      saved.requiredAmount += requiredAmount;

      if (cocktail.name) {
        saved.cocktails.add(cocktail.name);
      }

      requirements.set(ingredient.inventoryItemId, saved);
    });
  });

  return Array.from(requirements.values()).map((requirement) => {
    const inventoryItem = getInventoryItemById(requirement.inventoryItemId);
    const stockAmount = Number(inventoryItem?.quantity || 0);
    const stockUnit = inventoryItem?.unit || requirement.unit || "";
    const remainingAmount = stockAmount - requirement.requiredAmount;

    return {
      ...requirement,
      itemName: inventoryItem ? getInventoryItemName(inventoryItem) : requirement.itemName,
      productName: inventoryItem ? getInventoryProductName(inventoryItem) : requirement.productName,
      stockAmount,
      stockUnit,
      remainingAmount,
      isShort: remainingAmount < 0,
      hasUnitMismatch: Boolean(requirement.unit && stockUnit && requirement.unit !== stockUnit),
      cocktailNames: Array.from(requirement.cocktails).join(" / "),
    };
  });
}

function renderUsageCalculation() {
  if (!usageResult) return;

  renderUsageControls();

  const schedule = getSelectedUsageSchedule();
  const week = getSelectedUsageWeek(schedule);
  const attendeeCount = getUsageAttendeeCount();
  const rows = getUsageRequirementRows();

  if (!schedule || !week) {
    usageResult.innerHTML = `<p class="empty-state">저장된 교육일정이 없습니다. 교육 일정 탭에서 레시피를 먼저 저장해주세요.</p>`;
    return;
  }

  if (!attendeeCount) {
    usageResult.innerHTML = `<p class="empty-state">예상 인원을 입력하거나 현재 신청 인원을 불러오면 필요한 재고량을 계산합니다.</p>`;
    return;
  }

  if (!rows.length) {
    usageResult.innerHTML = `<p class="empty-state">선택한 주차에 등록된 재료가 없습니다.</p>`;
    return;
  }

  const rowMarkup = rows.map((row) => {
    const statusClass = row.isShort ? " is-short" : "";
    const statusText = row.isShort
      ? `${formatInventoryQuantity(Math.abs(row.remainingAmount))}${row.stockUnit} 부족`
      : `${formatInventoryQuantity(row.remainingAmount)}${row.stockUnit} 남음`;
    const unitNote = row.hasUnitMismatch
      ? `<small>재고 단위(${escapeHtml(row.stockUnit)})와 사용 단위(${escapeHtml(row.unit)})가 다릅니다.</small>`
      : "";

    return `
      <article class="usage-result-row${statusClass}">
        <div class="usage-result-row__name">
          <strong>${escapeHtml(row.productName || "재료")}</strong>
          <span>${escapeHtml(row.itemName || "")}${row.cocktailNames ? ` · ${escapeHtml(row.cocktailNames)}` : ""}</span>
          ${unitNote}
        </div>
        <div>
          <span>현재 재고</span>
          <strong>${formatInventoryQuantity(row.stockAmount)}${escapeHtml(row.stockUnit)}</strong>
        </div>
        <div>
          <span>예상 사용</span>
          <strong>${formatInventoryQuantity(row.requiredAmount)}${escapeHtml(row.unit || row.stockUnit)}</strong>
        </div>
        <div>
          <span>판정</span>
          <strong>${escapeHtml(statusText)}</strong>
        </div>
      </article>
    `;
  }).join("");

  usageResult.innerHTML = `
    <div class="usage-result-summary">
      <strong>${escapeHtml(schedule.title || "교육일정")} · ${escapeHtml(week.weekNumber)} 주차${week.theme ? ` ${escapeHtml(week.theme)}` : ""}</strong>
      <span>인원 ${attendeeCount}명 + 여유분 ${Number(usageBufferInput?.value || 0)}%</span>
    </div>
    <div class="usage-result-list">${rowMarkup}</div>
  `;
}

async function handleScheduleSubmit(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.saveClassSchedule) return;

  try {
    scheduleSaveButton.disabled = true;
    setScheduleStatus("교육일정을 저장하고 있습니다.");
    await martiniFirebase.saveClassSchedule(collectScheduleData());
    resetScheduleForm();
    setScheduleStatus("교육일정이 저장되었습니다.");
  } catch {
    setScheduleStatus("교육일정 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    scheduleSaveButton.disabled = false;
  }
}

function bindScheduleActions() {
  scheduleForm?.addEventListener("submit", handleScheduleSubmit);
  scheduleAddWeekButton?.addEventListener("click", () => {
    addScheduleWeek();
  });
  usageScheduleSelect?.addEventListener("change", renderUsageCalculation);
  usageWeekSelect?.addEventListener("change", renderUsageCalculation);
  usageAttendeesInput?.addEventListener("input", renderUsageCalculation);
  usageBufferInput?.addEventListener("input", renderUsageCalculation);
  usageLoadVotesButton?.addEventListener("click", () => {
    if (!usageAttendeesInput) return;

    usageAttendeesInput.value = String(adminClassVotes.length);
    renderUsageCalculation();
  });

  scheduleWeekList?.addEventListener("click", (event) => {
    const addIngredientButton = event.target.closest("[data-add-schedule-ingredient]");
    const removeIngredientButton = event.target.closest("[data-remove-schedule-ingredient]");
    const removeWeekButton = event.target.closest("[data-remove-schedule-week]");

    if (addIngredientButton) {
      const cocktail = addIngredientButton.closest("[data-schedule-cocktail]");
      const ingredientList = cocktail?.querySelector("[data-schedule-ingredient-list]");

      ingredientList?.insertAdjacentHTML("beforeend", createScheduleIngredientRow());
      return;
    }

    if (removeIngredientButton) {
      removeIngredientButton.closest("[data-schedule-ingredient]")?.remove();
      return;
    }

    if (removeWeekButton) {
      removeWeekButton.closest("[data-schedule-week]")?.remove();
      renumberScheduleWeeks();
    }
  });

  scheduleWeekList?.addEventListener("change", (event) => {
    const ingredientSelect = event.target.closest("[data-schedule-ingredient-select]");

    if (!ingredientSelect) return;

    const row = ingredientSelect.closest("[data-schedule-ingredient]");
    const unitInput = row?.querySelector("[data-schedule-ingredient-unit]");
    const inventoryItem = getInventoryItemById(ingredientSelect.value);

    if (unitInput && inventoryItem?.unit && !unitInput.value) {
      unitInput.value = inventoryItem.unit;
    }
  });

  scheduleList?.addEventListener("click", async (event) => {
    const loadButton = event.target.closest("[data-load-schedule]");
    const deleteButton = event.target.closest("[data-delete-schedule]");

    if (loadButton) {
      const schedule = classSchedules.find((item) => item.id === loadButton.dataset.loadSchedule);

      loadScheduleForm(schedule);
      return;
    }

    if (!deleteButton) return;

    const confirmed = window.confirm("이 교육일정을 삭제할까요?");

    if (!confirmed) return;

    try {
      deleteButton.disabled = true;
      setScheduleStatus("교육일정을 삭제하고 있습니다.");
      await window.MartiniFirebase.deleteClassSchedule(deleteButton.dataset.deleteSchedule);
      if (editingClassScheduleId === deleteButton.dataset.deleteSchedule) {
        resetScheduleForm();
      }
      setScheduleStatus("교육일정이 삭제되었습니다.");
    } catch {
      setScheduleStatus("교육일정 삭제에 실패했습니다.");
    } finally {
      deleteButton.disabled = false;
    }
  });
}

function subscribeClassSchedules() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeClassSchedules) return null;

  return martiniFirebase.subscribeClassSchedules((schedules) => {
    classSchedules = schedules;
    renderClassSchedules();
    renderUsageCalculation();
    renderDashboardStats();
    setScheduleStatus("교육일정을 관리하고 있습니다.");
  });
}
