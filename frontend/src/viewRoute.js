export function getView(pathname = "/") {
  const section = /^\/(shopping|packing)\/?$/.exec(pathname);
  return section?.[1] ?? "trips";
}
