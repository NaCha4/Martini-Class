import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFirebaseServices } from "../firebase-client.js?v=security-refactor-20260710";
import { getTimestampMillis } from "../shared/common.js?v=security-refactor-20260710";

const COLLECTION_NAME = "faqEntries";
const LOADING_MESSAGE = "\uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.";
const EMPTY_MESSAGE = "등록된 자주 묻는 질문이 없습니다.";
const ERROR_MESSAGE = "자주 묻는 질문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";

function sortFaq(records) {
  return [...records].sort((first, second) => getTimestampMillis(second.createdAt) - getTimestampMillis(first.createdAt));
}

function createMessage(message) {
  const empty = document.createElement("p");
  empty.className = "static-empty";
  empty.textContent = message;
  return empty;
}

function bindFaqToggle(item, button, answer) {
  button.dataset.faqBound = "true";
  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";

    button.setAttribute("aria-expanded", String(!isOpen));
    answer.setAttribute("aria-hidden", String(isOpen));
    item.classList.toggle("is-open", !isOpen);
  });
}

function createFaqItem(entry, index) {
  const item = document.createElement("section");
  const button = document.createElement("button");
  const answer = document.createElement("div");
  const answerText = document.createElement("p");
  const answerId = `faq-answer-${entry.id || index}`;

  item.className = "faq-item";
  button.className = "faq-question";
  button.type = "button";
  button.textContent = entry.title;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", answerId);

  answer.className = "faq-answer";
  answer.id = answerId;
  answer.setAttribute("aria-hidden", "true");
  answerText.textContent = entry.description;
  answer.append(answerText);

  bindFaqToggle(item, button, answer);

  item.append(button, answer);
  return item;
}

async function initFaqPage() {
  const list = document.querySelector("[data-public-faq-list]");

  if (!list) {
    return;
  }

  list.replaceChildren(createMessage(LOADING_MESSAGE));

  try {
    const { db } = await getFirebaseServices();
    const snapshots = await getDocs(collection(db, COLLECTION_NAME));
    const entries = snapshots.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    }));

    if (!entries.length) {
      list.replaceChildren(createMessage(EMPTY_MESSAGE));
      return;
    }

    list.replaceChildren(...sortFaq(entries).map(createFaqItem));
  } catch {
    list.replaceChildren(createMessage(ERROR_MESSAGE));
  }
}

document.addEventListener("DOMContentLoaded", initFaqPage);
