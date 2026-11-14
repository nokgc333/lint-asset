import { applyAboutLinks, buildAboutLinks, notifyDonateClick } from "./links";
import { THIRD_PARTY_COMPONENTS } from "./third-party";

export function setupAboutDialog(doc: Document): void {
  const dialog = doc.getElementById("about-dialog") as HTMLDialogElement;
  const opener = doc.getElementById("about-open");
  const closer = doc.getElementById("about-close");
  const list = doc.getElementById("about-third-party");
  if (!dialog || !opener || !closer || !list) return;

  applyAboutLinks(doc, buildAboutLinks());
  for (const link of doc.querySelectorAll('[data-link="donate"]')) {
    link.addEventListener("click", notifyDonateClick);
  }

  for (const component of THIRD_PARTY_COMPONENTS) {
    const item = doc.createElement("li");
    const link = doc.createElement("a");
    link.textContent = `${component.name}${component.version ? ` ${component.version}` : ""} - ${component.license}`;
    link.setAttribute("href", component.url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    item.append(link);
    list.append(item);
  }

  let fallback = false;
  const close = () => {
    if (!dialog.open) return;
    if (fallback) {
      dialog.removeAttribute("open");
      opener.focus();
    } else {
      dialog.close();
    }
  };
  opener.addEventListener("click", () => {
    if (dialog.open) return;
    try {
      dialog.showModal();
      fallback = false;
    } catch {
      fallback = true;
      dialog.setAttribute("open", "");
      closer.focus();
    }
  });
  closer.addEventListener("click", close);
  dialog.addEventListener("close", () => opener.focus());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      close();
  });
}
