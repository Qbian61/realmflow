import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type UrlQueryCodec<T> = {
  parse: (rawValue: string | null) => T;
  serialize: (value: T) => string | null;
};

export type SetUrlQueryStateOptions = {
  replace?: boolean;
};

export function createEnumQueryCodec<const T extends string>(
  values: readonly T[],
  defaultValue: T,
): UrlQueryCodec<T> {
  const supported = new Set<string>(values);
  return {
    parse: (rawValue) =>
      rawValue !== null && supported.has(rawValue)
        ? (rawValue as T)
        : defaultValue,
    serialize: (value) => (value === defaultValue ? null : value),
  };
}

export function createTextQueryCodec(
  defaultValue = "",
): UrlQueryCodec<string> {
  return {
    parse: (rawValue) => rawValue?.trim() || defaultValue,
    serialize: (value) => {
      const normalized = value.trim();
      return normalized === defaultValue || normalized.length === 0
        ? null
        : normalized;
    },
  };
}

export function createPositiveIntegerQueryCodec(
  defaultValue = 1,
): UrlQueryCodec<number> {
  return {
    parse: (rawValue) => {
      if (rawValue === null || !/^\d+$/.test(rawValue)) return defaultValue;
      const value = Number(rawValue);
      return Number.isSafeInteger(value) && value > 0 ? value : defaultValue;
    },
    serialize: (value) =>
      Number.isSafeInteger(value) && value > 0 && value !== defaultValue
        ? String(value)
        : null,
  };
}

export function setQueryValue<T>(
  searchParams: URLSearchParams,
  key: string,
  codec: UrlQueryCodec<T>,
  value: T,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  const serialized = codec.serialize(value);
  if (serialized === null) next.delete(key);
  else next.set(key, serialized);
  return next;
}

export function useUrlQueryState<T>(
  key: string,
  codec: UrlQueryCodec<T>,
): [
  T,
  (value: T, options?: SetUrlQueryStateOptions) => void,
] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = codec.parse(searchParams.get(key));
  const setValue = useCallback(
    (nextValue: T, options?: SetUrlQueryStateOptions): void => {
      setSearchParams(
        (current) => setQueryValue(current, key, codec, nextValue),
        { replace: options?.replace ?? false },
      );
    },
    [codec, key, setSearchParams],
  );

  return [value, setValue];
}
