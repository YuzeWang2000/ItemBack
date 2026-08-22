import { normalizeOriginalFilename } from '../src/attachments/attachments.service';

describe('attachment filename normalization', () => {
  it('restores UTF-8 Chinese filenames decoded as latin1 by multipart parsers', () => {
    const filename = '购买凭证-相机.jpg';
    const mojibake = Buffer.from(filename, 'utf8').toString('latin1');
    expect(normalizeOriginalFilename(mojibake)).toBe(filename);
  });

  it('keeps filenames that are already valid Unicode', () => {
    expect(normalizeOriginalFilename('说明书.pdf')).toBe('说明书.pdf');
    expect(normalizeOriginalFilename('résumé.pdf')).toBe('résumé.pdf');
  });

  it('removes client-side path fragments', () => {
    expect(normalizeOriginalFilename('../资料/发票.pdf')).toBe('发票.pdf');
    expect(normalizeOriginalFilename('C:\\fakepath\\照片.png')).toBe('照片.png');
  });
});
