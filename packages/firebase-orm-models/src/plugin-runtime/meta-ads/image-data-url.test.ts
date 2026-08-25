import { describe, expect, it } from 'vitest';
import { InvalidImageDataUrlError, parseImageDataUrlBase64 } from './image-data-url';

describe('parseImageDataUrlBase64', () => {
  it('extracts the base64 payload from a data:image/png URL', () => {
    expect(parseImageDataUrlBase64('data:image/png;base64,AAAA')).toBe('AAAA');
  });

  it('extracts the base64 payload from a data:image/jpeg URL', () => {
    expect(parseImageDataUrlBase64('data:image/jpeg;base64,//79')).toBe('//79');
  });

  it('extracts the base64 payload including padding', () => {
    expect(parseImageDataUrlBase64('data:image/png;base64,AAA=')).toBe('AAA=');
  });

  it('throws InvalidImageDataUrlError for an unsupported mime type', () => {
    expect(() => parseImageDataUrlBase64('data:image/svg+xml;base64,AAAA')).toThrow(InvalidImageDataUrlError);
  });

  it('throws InvalidImageDataUrlError for a non-data URL', () => {
    expect(() => parseImageDataUrlBase64('https://example.com/image.png')).toThrow(InvalidImageDataUrlError);
  });

  it('throws InvalidImageDataUrlError for an empty string', () => {
    expect(() => parseImageDataUrlBase64('')).toThrow(InvalidImageDataUrlError);
  });
});
