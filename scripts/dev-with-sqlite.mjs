import { spawn } from 'node:child_process'

const modeArg = process.argv[2] === 'test' ? 'test' : 'prod'
const viteMode = modeArg === 'test' ? 'test' : 'production'
const vitePort = modeArg === 'test' ? '5174' : '5173'
const apiPort = modeArg === 'test' ? '6174' : '6173'

const children = []

const start = (name, command, args) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, API_PORT: apiPort },
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (closing) return
    console.log(`${name} 已退出：${signal ?? code}`)
    close(code ?? 0)
  })
  return child
}

let closing = false
const close = (exitCode = 0) => {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(exitCode), 200)
}

process.on('SIGINT', () => close(0))
process.on('SIGTERM', () => close(0))

console.log(`启动 ${modeArg} 环境：Vite ${vitePort}，SQLite API ${apiPort}`)
start('SQLite API', process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/sqlite-api.mjs', modeArg, apiPort])
start('Vite', 'vite', ['--mode', viteMode, '--host', 'localhost', '--port', vitePort, '--strictPort'])
