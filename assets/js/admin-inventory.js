function getInventoryCategoryLabel(category) {
  return INVENTORY_CATEGORIES.find((item) => item.key === category)?.label || "기타";
}

function getInventoryItemName(item) {
  return String(item.itemName || item.typeName || getInventoryCategoryLabel(item.category)).trim();
}

function getInventoryProductName(item) {
  return String(item.productName || item.name || "").trim();
}

function getInventoryItemGroupOrder(category, itemName) {
  const orders = inventoryItems
    .filter((item) => (item.category || "etc") === category && getInventoryItemName(item) === itemName)
    .map((item) => Number(item.itemOrder))
    .filter((order) => Number.isFinite(order) && order > 0);

  return orders.length ? Math.min(...orders) : Number.POSITIVE_INFINITY;
}

function getNextInventoryItemOrder(category) {
  const orders = inventoryItems
    .filter((item) => (item.category || "etc") === category)
    .map((item) => Number(item.itemOrder))
    .filter((order) => Number.isFinite(order) && order > 0);

  return orders.length ? Math.max(...orders) + 1 : 1;
}

function getInventoryItemOrderForSave(category, itemName) {
  const order = getInventoryItemGroupOrder(category, itemName);

  return Number.isFinite(order) ? order : getNextInventoryItemOrder(category);
}

function formatInventoryQuantity(quantity) {
  const numericQuantity = Number(quantity);

  if (!Number.isFinite(numericQuantity)) return "0";

  return Number.isInteger(numericQuantity)
    ? String(numericQuantity)
    : numericQuantity.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function renderInventoryItems() {
  if (!inventoryList) return;

  if (!inventoryItems.length) {
    inventoryList.innerHTML = `<p class="empty-state">아직 등록된 재고가 없습니다.</p>`;
    return;
  }

  inventoryList.innerHTML = INVENTORY_CATEGORIES.map((category) => {
    const categoryItems = inventoryItems.filter((item) => (item.category || "etc") === category.key);
    const itemGroups = categoryItems.reduce((groups, item) => {
      const itemName = getInventoryItemName(item);

      if (!groups.has(itemName)) {
        groups.set(itemName, []);
      }

      groups.get(itemName).push(item);

      return groups;
    }, new Map());
    const itemMarkup = itemGroups.size
      ? Array.from(itemGroups.entries())
        .sort(([aName], [bName]) => {
          const aOrder = getInventoryItemGroupOrder(category.key, aName);
          const bOrder = getInventoryItemGroupOrder(category.key, bName);

          if (aOrder !== bOrder) return aOrder - bOrder;

          return aName.localeCompare(bName, "ko");
        })
        .map(([itemName, products]) => {
        const productMarkup = products.map((product) => {
          const productName = getInventoryProductName(product);
          const quantity = formatInventoryQuantity(product.quantity);
          const memo = product.memo
            ? `<p>${escapeHtml(product.memo)}</p>`
            : "";

          return `
            <article class="inventory-item" data-inventory-item="${product.id}">
              <div class="inventory-item__main">
                <h4>${escapeHtml(productName)}</h4>
                ${memo}
              </div>
              <div class="inventory-item__stock">
                <strong>${quantity}</strong>
                <span>${escapeHtml(product.unit)}</span>
              </div>
            </article>
          `;
        }).join("");

        return `
          <section
            class="inventory-product-group"
            draggable="true"
            data-inventory-group
            data-inventory-category="${escapeHtml(category.key)}"
            data-inventory-item-name="${escapeHtml(itemName)}"
          >
            <div class="inventory-product-group__header">
              <h3>${escapeHtml(itemName)}</h3>
            </div>
            <div class="inventory-product-group__items">
              ${productMarkup}
            </div>
          </section>
        `;
      }).join("")
      : `<p class="inventory-category-empty">등록된 재고가 없습니다.</p>`;

    return `
      <section class="inventory-category-board inventory-category-board--${category.key}">
        <div class="inventory-category-board__header">
          <span class="inventory-category inventory-category--${category.key}">
            ${escapeHtml(category.label)}
          </span>
          <strong>${categoryItems.length}개</strong>
        </div>
        <div class="inventory-category-board__items">
          ${itemMarkup}
        </div>
      </section>
    `;
  }).join("");
}

function resetInventoryForm() {
  if (!inventoryForm) return;

  editingInventoryItemId = "";
  inventoryForm.reset();
  inventoryForm.elements.quantity.value = "0";
  inventoryForm.elements.category.value = "alcohol";
  inventorySaveButton.textContent = "재고 저장";
  inventoryCancelButton.hidden = true;
  inventoryDeleteButton.hidden = true;
}

function fillInventoryForm(item) {
  if (!inventoryForm || !item) return;

  editingInventoryItemId = item.id;
  inventoryForm.elements.category.value = item.category || "etc";
  inventoryForm.elements.itemName.value = getInventoryItemName(item);
  inventoryForm.elements.name.value = getInventoryProductName(item);
  inventoryForm.elements.quantity.value = Number(item.quantity || 0);
  inventoryForm.elements.unit.value = item.unit || "";
  inventoryForm.elements.memo.value = item.memo || "";
  inventorySaveButton.textContent = "수정 저장";
  inventoryCancelButton.hidden = false;
  inventoryDeleteButton.hidden = false;
  setInventoryStatus(`${getInventoryProductName(item)} 재고를 수정하고 있습니다.`);
  inventoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function collectInventoryItemData() {
  const formData = new FormData(inventoryForm);
  const quantity = Number(formData.get("quantity"));

  return {
    id: editingInventoryItemId || undefined,
    category: String(formData.get("category") || "etc"),
    itemName: String(formData.get("itemName") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    productName: String(formData.get("name") || "").trim(),
    quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
    unit: String(formData.get("unit") || "").trim(),
    memo: String(formData.get("memo") || "").trim(),
    itemOrder: getInventoryItemOrderForSave(
      String(formData.get("category") || "etc"),
      String(formData.get("itemName") || "").trim(),
    ),
  };
}

async function handleInventorySubmit(event) {
  event.preventDefault();

  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.saveInventoryItem) return;

  try {
    inventorySaveButton.disabled = true;
    setInventoryStatus("재고를 저장하고 있습니다.");
    await martiniFirebase.saveInventoryItem(collectInventoryItemData());
    resetInventoryForm();
    setInventoryStatus("재고가 저장되었습니다.");
  } catch {
    setInventoryStatus("재고 저장에 실패했습니다. Firebase 권한을 확인해주세요.");
  } finally {
    inventorySaveButton.disabled = false;
  }
}

async function saveInventoryGroupOrder(category, orderedItemNames) {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.updateInventoryItemOrders) return;

  const updates = inventoryItems
    .filter((item) => (item.category || "etc") === category)
    .map((item) => {
      const orderIndex = orderedItemNames.indexOf(getInventoryItemName(item));

      if (orderIndex < 0) return null;

      return {
        id: item.id,
        itemOrder: orderIndex + 1,
      };
    })
    .filter(Boolean);

  if (!updates.length) return;

  await martiniFirebase.updateInventoryItemOrders(updates);
}

function bindInventoryActions() {
  inventoryForm?.addEventListener("submit", handleInventorySubmit);
  inventoryCancelButton?.addEventListener("click", () => {
    resetInventoryForm();
    setInventoryStatus("재고 목록을 관리하고 있습니다.");
  });

  inventoryDeleteButton?.addEventListener("click", async () => {
    const item = inventoryItems.find((inventoryItem) => inventoryItem.id === editingInventoryItemId);

    if (!item) return;

    const confirmed = window.confirm(`${getInventoryProductName(item)} 재고를 삭제할까요?`);

    if (!confirmed) return;

    try {
      inventoryDeleteButton.disabled = true;
      setInventoryStatus("재고를 삭제하고 있습니다.");
      await window.MartiniFirebase.deleteInventoryItem(item.id);
      resetInventoryForm();
      setInventoryStatus("재고가 삭제되었습니다.");
    } catch {
      setInventoryStatus("재고 삭제에 실패했습니다.");
    } finally {
      inventoryDeleteButton.disabled = false;
    }
  });

  inventoryList?.addEventListener("click", async (event) => {
    const itemElement = event.target.closest("[data-inventory-item]");

    if (!itemElement) return;

    const item = inventoryItems.find((inventoryItem) => inventoryItem.id === itemElement.dataset.inventoryItem);

    if (!item) return;

    fillInventoryForm(item);
  });

  inventoryList?.addEventListener("dragstart", (event) => {
    const groupElement = event.target.closest("[data-inventory-group]");

    if (!groupElement) return;

    groupElement.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      category: groupElement.dataset.inventoryCategory,
      itemName: groupElement.dataset.inventoryItemName,
    }));
  });

  inventoryList?.addEventListener("dragend", (event) => {
    event.target.closest("[data-inventory-group]")?.classList.remove("is-dragging");
    inventoryList.querySelectorAll(".is-drop-target").forEach((element) => {
      element.classList.remove("is-drop-target");
    });
  });

  inventoryList?.addEventListener("dragover", (event) => {
    const targetGroup = event.target.closest("[data-inventory-group]");
    const draggingGroup = inventoryList.querySelector("[data-inventory-group].is-dragging");

    if (!targetGroup || !draggingGroup || targetGroup === draggingGroup) return;
    if (targetGroup.dataset.inventoryCategory !== draggingGroup.dataset.inventoryCategory) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    inventoryList.querySelectorAll(".is-drop-target").forEach((element) => {
      if (element !== targetGroup) element.classList.remove("is-drop-target");
    });
    targetGroup.classList.add("is-drop-target");
  });

  inventoryList?.addEventListener("dragleave", (event) => {
    const targetGroup = event.target.closest("[data-inventory-group]");

    if (!targetGroup || targetGroup.contains(event.relatedTarget)) return;

    targetGroup.classList.remove("is-drop-target");
  });

  inventoryList?.addEventListener("drop", async (event) => {
    const targetGroup = event.target.closest("[data-inventory-group]");
    const draggingGroup = inventoryList.querySelector("[data-inventory-group].is-dragging");

    if (!targetGroup || !draggingGroup || targetGroup === draggingGroup) return;
    if (targetGroup.dataset.inventoryCategory !== draggingGroup.dataset.inventoryCategory) return;

    event.preventDefault();

    const groupList = targetGroup.closest(".inventory-category-board__items");

    if (!groupList) return;

    const targetRect = targetGroup.getBoundingClientRect();
    const shouldPlaceAfter = event.clientY > targetRect.top + targetRect.height / 2;

    if (shouldPlaceAfter) {
      targetGroup.after(draggingGroup);
    } else {
      targetGroup.before(draggingGroup);
    }

    targetGroup.classList.remove("is-drop-target");

    const orderedItemNames = Array.from(groupList.querySelectorAll("[data-inventory-group]"))
      .map((groupElement) => groupElement.dataset.inventoryItemName);

    try {
      setInventoryStatus("품목 순서를 저장하고 있습니다.");
      await saveInventoryGroupOrder(targetGroup.dataset.inventoryCategory, orderedItemNames);
      setInventoryStatus("품목 순서가 저장되었습니다.");
    } catch {
      renderInventoryItems();
      setInventoryStatus("품목 순서 저장에 실패했습니다.");
    }
  });
}

function subscribeInventoryItems() {
  const martiniFirebase = window.MartiniFirebase;

  if (!martiniFirebase?.subscribeInventoryItems) return;

  martiniFirebase.subscribeInventoryItems((items) => {
    inventoryItems = items;
    renderInventoryItems();
    refreshScheduleIngredientOptions();
    renderUsageCalculation();
    renderDashboardStats();
    setInventoryStatus("재고 목록을 관리하고 있습니다.");
  });
}
