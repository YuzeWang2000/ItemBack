import {
  BackgroundRemovalRunnerError,
  validateTransparentPng,
} from '../src/attachments/background-removal.runner';

function pngHeader(colorType: number) {
  const value = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  value[25] = colorType;
  return value;
}

describe('background removal output validation', () => {
  it('accepts PNG color types with an alpha channel', () => {
    expect(() => validateTransparentPng(pngHeader(6), 100)).not.toThrow();
    expect(() => validateTransparentPng(pngHeader(4), 100)).not.toThrow();
  });

  it('rejects opaque, malformed, and oversized results', () => {
    for (const value of [
      pngHeader(2),
      Buffer.from('not png'),
      pngHeader(6).subarray(0, 40),
      pngHeader(6),
    ]) {
      const limit = value.length > 60 && value[25] === 6 ? 10 : 100;
      expect(() => validateTransparentPng(value, limit)).toThrow(BackgroundRemovalRunnerError);
    }
  });
});
