export function classifyProcessCommand(
  executable: string, args: readonly string[]
): 'safe' | 'unknown' | 'dangerous' {
  const name = executable.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''
  if (['sh', 'bash', 'zsh', 'fish', 'powershell', 'cmd', 'rm', 'sudo', 'curl', 'wget', 'ssh', 'scp'].includes(name)) {
    return 'dangerous'
  }
  if (args.some(arg => /(?:--(?:token|password|secret|credential)|https?:\/\/)/i.test(arg))) {
    return 'dangerous'
  }
  if (name === 'git' && args.some(arg => ['push', 'clean', 'reset'].includes(arg))) {
    return 'dangerous'
  }
  if (args.length === 1 && ['--version', '--help'].includes(args[0])) return 'safe'
  if (['npm', 'pnpm', 'yarn'].includes(name)) {
    if (args.length === 1 && args[0] === 'test') return 'safe'
    if (args.length === 2 && args[0] === 'run' && ['test', 'lint', 'build', 'typecheck'].includes(args[1])) return 'safe'
  }
  return 'unknown'
}
