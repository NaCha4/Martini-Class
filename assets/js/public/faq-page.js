import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getFirebaseServices } from "../firebase-client.js";
import { getTimestampMillis } from "../shared/common.js";

const COLLECTION_NAME = "faqEntries";
const LOADING_MESSAGE = "\uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.";

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

function bindFaqInteractions(root) {
  root.querySelectorAll(".faq-question").forEach((button) => {
    if (button.dataset.faqBound === "true") {
      return;
    }

    const item = button.closest(".faq-item");
    const answerId = button.getAttribute("aria-controls");
    const answer = answerId ? document.getElementById(answerId) : null;

    if (!item || !answer) {
      return;
    }

    bindFaqToggle(item, button, answer);
  });
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
      list.replaceChildren(createMessage(LOADING_MESSAGE));
      return;
    }

    list.replaceChildren(...sortFaq(entries).map(createFaqItem));
  } catch {
    bindFaqInteractions(list);
  }
}

document.addEventListener("DOMContentLoaded", initFaqPage);
