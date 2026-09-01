export type Language = 'en' | 'ru';

type Primitive = string | number | boolean;

/**
 * Generates a union of every dot-path string key in a nested object type,
 * e.g. Paths<{a: {b: string}}> = 'a.b'. Used to type-check t() calls
 * against the real shape of the English translation dictionary, so a
 * typo'd or missing key is a compile error, not a runtime blank string.
 */
export type Paths<T> = T extends Primitive
  ? never
  : {
      [K in keyof T & string]: T[K] extends Primitive ? K : `${K}.${Paths<T[K]>}`;
    }[keyof T & string];
