export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string} [code]
   * @param {Record<string,string>} [fields]
   */
  constructor(status, message, code = 'error', fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const badRequest = (m, code = 'bad_request') => new HttpError(400, m, code);
export const unauthorized = (m = 'Please sign in to continue.') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You are not allowed to do that.', code = 'forbidden') => new HttpError(403, m, code);
export const notFound = (m = 'Not found.') => new HttpError(404, m, 'not_found');
export const conflict = (m, code = 'conflict', fields) => new HttpError(409, m, code, fields);
