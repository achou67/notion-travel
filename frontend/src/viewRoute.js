export function getView(pathname = "/") {
  const section = /^\/(shopping|packing|expenses)\/?$/.exec(pathname);
  return section?.[1] ?? "trips";
}
