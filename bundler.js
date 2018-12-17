const fs = require('fs')
const path = require('path')
const babelParser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const { transformFromAst } = require('@babel/core')

let ID = 0

function createAsset(filename) {
  const content = fs.readFileSync(filename, 'utf-8')

  const ast = babelParser.parse(content, {
    sourceType: 'module'
  })

  const dependencies = []

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value)
    }
  })

  const id = ID++

  const { code } = transformFromAst(ast, null, {
    presets: ['@babel/env']
  })

  return {
    id,
    code,
    filename,
    dependencies
  }
}

function createGraph(entry) {
  const mainAsset = createAsset(entry)

  const queue = [mainAsset]

  for (const asset of queue) {
    asset.mapping = {}

    const dirname = path.dirname(asset.filename)

    asset.dependencies.forEach(dep => {
      const absolutePath = path.resolve(dirname, dep + '.js')
      const child = createAsset(absolutePath)
      asset.mapping[dep] = child.id

      queue.push(child)
    })
  }

  return queue
}

function bundle(graph) {
  let modules = ''

  graph.forEach(mod => {
    modules += `${mod.id}: [
      function(exports, require, module) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ],`
  })

  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id]
        const module = { exports: {}}

        function localRequire(name) {
          return require(mapping[name])
        }

        fn(module.exports, localRequire, module)
        return module.exports
      }

      require(0)
    })({${modules}})
  `

  return result
}

const graph = createGraph('./src/entry.js')

fs.writeFileSync('./dist/bundle.js', bundle(graph))
