import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFirebaseServices } from "../firebase-client.js";

const COLLECTION_NAME = "historyEntries";

function getCreatedAtMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  return new Date(value).getTime() || 0;
}

function sortHistory(records) {
  return [...records].sort((first, second) => {
    const yearCompare = String(second.year || "").localeCompare(String(first.year || ""), "ko-KR", { numeric: true });

    if (yearCompare !== 0) {
      return yearCompare;
    }

    return getCreatedAtMillis(second.createdAt) - getCreatedAtMillis(first.createdAt);
  });
}

function createHistorySection(entry) {
  const section = document.createElement("section");
  const year = document.createElement("span");
  const title = document.createElement("h2");
  const description = document.createElement("p");

  year.className = "timeline-year";
  year.textContent = entry.year;
  title.textContent = entry.title;
  description.textContent = entry.description;
  section.append(year, title, description);

  return section;
}

function createEmptyMessage() {
  const empty = document.createElement("p");
  empty.className = "static-empty";
  empty.textContent = "등록된 연혁이 없습니다.";
  return empty;
}

async function initHistoryPage() {
  const list = document.querySelector("[data-public-history-list]");

  if (!list) {
    return;
  }

  try {
    const { db } = await getFirebaseServices();
    const snapshots = await getDocs(collection(db, COLLECTION_NAME));
    const entries = snapshots.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    }));

    if (!entries.length) {
      list.replaceChildren(createEmptyMessage());
      return;
    }

    list.replaceChildren(...sortHistory(entries).map(createHistorySection));
  } catch {
    list.replaceChildren(createEmptyMessage());
  }
}

document.addEventListener("DOMContentLoaded", initHistoryPage);
