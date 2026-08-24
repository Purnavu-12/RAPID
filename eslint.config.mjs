import next from 'eslint-config-next'

// components/ui and hooks are vendored, shadcn-generated files.
// Ignore them so generated patterns (e.g. setState-in-effect, Math.random)
// don't fail the lint gate.
const config = [
  ...next,
  {
    ignores: ['components/ui/**', 'hooks/**', 'lint-output.txt', 'lint-report.json'],
  },
]

export default config
