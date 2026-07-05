import { execSync } from 'node:child_process'

const port = process.argv[2]

if (!port) {
  console.error('请提供要释放的端口号。')
  process.exit(1)
}

try {
  const output = execSync(`lsof -ti tcp:${port}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()

  if (!output) process.exit(0)

  const pids = Array.from(new Set(output.split('\n').map((item) => item.trim()).filter(Boolean)))
  if (!pids.length) process.exit(0)

  execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' })
  console.log(`已释放端口 ${port}，结束进程：${pids.join(', ')}`)
} catch {
  process.exit(0)
}