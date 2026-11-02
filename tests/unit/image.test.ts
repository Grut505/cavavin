import { describe, expect, it } from 'vitest';
import { dataUrlToBase64, fitSize, toDataUrl } from '../../src/scan/image';

describe('fitSize', () => {
  it('réduit au plus grand côté en gardant les proportions', () => {
    expect(fitSize(4000, 3000, 240)).toEqual({ width: 240, height: 180 });
    expect(fitSize(3000, 4000, 240)).toEqual({ width: 180, height: 240 });
  });
  it('n’agrandit jamais une petite image', () => {
    expect(fitSize(100, 50, 240)).toEqual({ width: 100, height: 50 });
  });
  it('garde au moins 1 px', () => {
    expect(fitSize(10000, 1, 240).height).toBe(1);
  });
});

describe('data URL', () => {
  it('retire et remet le préfixe', () => {
    expect(dataUrlToBase64('data:image/jpeg;base64,AAAA')).toBe('AAAA');
    expect(toDataUrl({ mime: 'image/jpeg', data: 'AAAA' })).toBe('data:image/jpeg;base64,AAAA');
  });
});
