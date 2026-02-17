export function isHtmlInputElement(el: unknown): el is HTMLInputElement {
  return typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement;
}

export function isHtmlTextAreaElement(el: unknown): el is HTMLTextAreaElement {
  return typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement;
}

export function getEventTargetValue(evt: Event): string {
  const t = evt.target;
  if (isHtmlInputElement(t) || isHtmlTextAreaElement(t)) return t.value;
  return '';
}

export function getEventTargetChecked(evt: Event): boolean {
  const t = evt.target;
  if (isHtmlInputElement(t)) return t.checked;
  return false;
}
