/**
 * A video URL that shows its first frame before it plays. With `preload="metadata"` and no poster,
 * browsers paint an empty black box until the person presses play; a `#t=` media fragment makes them
 * seek to a frame and paint it, without downloading the whole clip.
 */
export function withFirstFrame(src: string): string {
  return src.includes('#') ? src : `${src}#t=0.1`;
}
