export function createRestrictedEnvironment(): NodeJS.ProcessEnv {
  const inherited = process.env;
  const environment: NodeJS.ProcessEnv = {
    PATH: inherited.PATH,
    NODE_ENV: 'test',
    LANG: inherited.LANG,
    LC_ALL: inherited.LC_ALL,
    SYSTEMROOT: inherited.SYSTEMROOT,
    SystemRoot: inherited.SystemRoot,
    WINDIR: inherited.WINDIR,
    COMSPEC: inherited.COMSPEC,
    TEMP: inherited.TEMP,
    TMP: inherited.TMP,
  };

  return Object.fromEntries(
    Object.entries(environment).filter(([, value]) => value !== undefined)
  );
}
