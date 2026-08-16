export async function loadNamed(name: string): Promise<unknown> {
  return import(`./${name}.js`);
}
