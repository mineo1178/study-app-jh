export const findUndefinedPaths = (value, path = '$') => {
  if (value === undefined) return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => findUndefinedPaths(item, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => findUndefinedPaths(item, `${path}.${key}`));
  return [];
};
