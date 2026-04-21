export const convertWan26ImageMentions = (prompt: string): string => { // Convert @ImageN to "image N".
  return prompt.replace(/@Image(\d+)/g, (_, num) => `image ${num}`);
};
