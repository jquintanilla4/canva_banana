export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
  }
}

export const readRequestBody = async (request, maxBytes = MAX_JSON_BODY_BYTES) => {
  if (Number(request.headers['content-length']) > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const readJsonBody = async (request, maxBytes = MAX_JSON_BODY_BYTES) => {
  const body = await readRequestBody(request, maxBytes);
  return body.length === 0 ? {} : JSON.parse(body.toString('utf8'));
};
