export const convertReveImageMentionsToXml = (prompt: string): string => { // Convert @ImageN to <img>N-1</img>.
  return prompt.replace(/@Image(\d+)/g, (_, num) => {
    const index = parseInt(num, 10) - 1; // Convert 1-indexed to 0-indexed.
    return `<img>${index}</img>`;
  });
};

export const convertWan26ImageMentions = (prompt: string): string => { // Convert @ImageN to "image N".
  return prompt.replace(/@Image(\d+)/g, (_, num) => `image ${num}`);
};
