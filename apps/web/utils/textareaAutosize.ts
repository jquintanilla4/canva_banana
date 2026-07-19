// Grow a textarea to fit its content up to a cap, then scroll inside it.
export const resizeTextareaToContent = (textarea: HTMLTextAreaElement, maxHeightPx: number) => {
  textarea.style.height = 'auto';
  textarea.style.maxHeight = `${maxHeightPx}px`;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeightPx)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
};
