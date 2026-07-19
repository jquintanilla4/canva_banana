const getWrappedLines = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  paragraphs.forEach(paragraph => {
    if (paragraph === '') {
      lines.push('');
      return;
    }

    const words = paragraph.split(' ');
    let line = '';

    words.forEach(word => {
      const appendWord = word === '' ? ' ' : `${word} `;
      const testLine = line + appendWord;
      const testWidth = context.measureText(testLine).width;

      if (testWidth > maxWidth && line) {
        lines.push(line.trimEnd());
        line = appendWord;
      } else {
        line = testLine;
      }
    });

    if (line) {
      lines.push(line.trimEnd());
    }
  });

  return lines;
};

export const fitTextWithinBox = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  initialFontSize: number,
  minFontSize = 8,
): { fontSize: number; lineHeight: number; lines: string[] } => {
  const sanitizedText = text.trim();
  if (sanitizedText.length === 0 || maxWidth <= 0 || maxHeight <= 0) {
    const fontSize = Math.max(minFontSize, Math.min(initialFontSize, 16));
    const lineHeight = fontSize * 1.2;
    return { fontSize, lineHeight, lines: [] };
  }

  let fontSize = Math.max(initialFontSize, minFontSize);
  let lines: string[] = [];
  let lineHeight = fontSize * 1.2;
  const minimumFontSize = Math.max(8, minFontSize);

  while (fontSize >= minimumFontSize) {
    context.font = `${fontSize}px sans-serif`;
    lineHeight = fontSize * 1.2;
    lines = getWrappedLines(context, sanitizedText, maxWidth);
    const requiredHeight = lines.length * lineHeight;

    if (requiredHeight <= maxHeight || fontSize === minimumFontSize) {
      return { fontSize, lineHeight, lines };
    }

    fontSize = Math.max(fontSize - 2, minimumFontSize);
  }

  context.font = `${minimumFontSize}px sans-serif`;
  lineHeight = minimumFontSize * 1.2;
  lines = getWrappedLines(context, sanitizedText, maxWidth);
  return { fontSize: minimumFontSize, lineHeight, lines };
};

