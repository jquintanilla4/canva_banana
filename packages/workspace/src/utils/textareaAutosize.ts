export const resizeTextareaToContent = (textarea: HTMLTextAreaElement, maxHeightPx?: number) => {
  textarea.style.height = 'auto';
  textarea.style.maxHeight = maxHeightPx === undefined ? 'none' : `${maxHeightPx}px`;
  textarea.style.height = `${maxHeightPx === undefined ? textarea.scrollHeight : Math.min(textarea.scrollHeight, maxHeightPx)}px`;
  textarea.style.overflowY = maxHeightPx !== undefined && textarea.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
};
