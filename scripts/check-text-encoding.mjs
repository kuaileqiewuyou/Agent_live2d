import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(process.cwd(), 'src')
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

const lineRules = [
  {
    code: 'private-use-char',
    pattern: /[\uE000-\uF8FF]/u,
    message: 'contains private-use unicode characters',
  },
  {
    code: 'replacement-char',
    pattern: /\uFFFD/u,
    message: 'contains replacement character (�)',
  },
  {
    code: 'euro-around-cjk',
    pattern: /(?:[\u4E00-\u9FFF]€|€[\u4E00-\u9FFF])/u,
    message: 'contains euro symbol inside CJK text, likely mojibake',
  },
  {
    code: 'known-mojibake-token',
    pattern: /(浼氳|褰撳|鏌ョ|鍔╂|鍔犺|鏈|闄|鍥炲|鎵ц|娓呯|妯″|璁板|鍏ㄩ|宸插|鍙|鑱婂|绛夊|鎽樿|鍐呭|鍚庣|閲嶅惎|鏈氨|璇︽儏|绔嬪嵆|妫€|涓\.\.\.|浼欎|鍏煎|寰呮満|璇磋瘽|鎬濊€冦|闅捐繃|鍏宠仈)/u,
    message: 'contains known mojibake token',
  },
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    if (exts.has(path.extname(entry.name))) {
      out.push(fullPath)
    }
  }
  return out
}

function compactLine(line) {
  return line.trim().replace(/\s+/g, ' ').slice(0, 180)
}

if (!fs.existsSync(rootDir)) {
  console.error(`Cannot find src directory: ${rootDir}`)
  process.exit(1)
}

const issues = []
for (const filePath of walk(rootDir)) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    const matchedRules = lineRules.filter(rule => rule.pattern.test(line))
    if (matchedRules.length === 0) return

    issues.push({
      file: path.relative(process.cwd(), filePath),
      line: index + 1,
      rules: matchedRules.map(rule => ({
        code: rule.code,
        message: rule.message,
      })),
      snippet: compactLine(line),
    })
  })
}

issues.sort((a, b) => {
  if (a.file !== b.file) return a.file.localeCompare(b.file)
  return a.line - b.line
})

if (issues.length > 0) {
  console.error(`Text encoding check failed: found ${issues.length} potential issue(s).`)
  for (const issue of issues) {
    const codeSummary = issue.rules.map(rule => rule.code).join(',')
    console.error(`- ${issue.file}:${issue.line} [${codeSummary}]`)
    for (const rule of issue.rules) {
      console.error(`  · ${rule.code}: ${rule.message}`)
    }
    console.error(`  ${issue.snippet}`)
  }
  process.exit(1)
}

console.log('Text encoding check passed: no suspicious mojibake text found in src/**.')
