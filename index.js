var _ = require('lodash')
var acorn = require('acorn-jsx')
var ASTQ = require('astq')
var fs = require('fs')
var astq = new ASTQ()
var graph = require('./graph.js')

if (process.argv.length < 3) {
  console.log('Usage: ' + __filename + ' <jsx_root_path> [output_png_path]')
  process.exit(-1)
}

var components = run(process.argv[2])
graph(components, process.argv[3] || __dirname + '/output.png')

function run(directory) {
  var components = {}
  findJsxFiles(directory).forEach(function(a) {
    var inspected = inspectJsx(a)
    components[inspected.component] = inspected
  })

  _.forEach(components, function(c) {
    c.uses = _.map(c.uses, function(x) {
      return components[x.name]
    })

    c.hocs = _(c.hocs)
    .filter(function(x) { return !!components[x] })
    .map(function(x) {
      var component = components[x]
      component.hoc = true
      return component
    })
    .value()
  })

  _.forEach(components, function(c) {
    if (c.hocs.length) {
      var used = c
      for (var i = c.hocs.length - 1; i >=0; i--) {
        c.hocs[i].uses.push(used)
        used = c.hocs[i]
      }
    }
  })

  return components
}

function findJsxFiles (dir, filelist) {
  var files = fs.readdirSync(dir)
  filelist = filelist || []
  files.forEach(function(file) {
    if (fs.statSync(dir + '/' + file).isDirectory()) {
      if (file.indexOf('node_modules') === -1) {
        filelist = findJsxFiles(dir + '/' + file, filelist)
      }
    } else {
      if (file.indexOf('.jsx') >= 0 && file.indexOf('.spec.jsx') === -1) {
        filelist.push(dir + '/' + file)
      }
    }
  })
  return filelist
}

function inspectJsx(file) {
  var code = fs.readFileSync(file, 'utf8')
  code = fixCode(code)

  try {
    var ast = acorn.parse(code, {
      ecmaVersion: 7,
      sourceType: 'module',
      plugins: { jsx: true }
    })

    var component = getClassName(file)
    var imports = getImports(ast)
    var uses = getComponents(ast, imports)
    var props = getPropTypes(ast)
    var hocs = getHocs(ast, imports)

    return {
      component: component,
      props: props,
      uses: uses,
      hocs: hocs
    }
  } catch (e) {
    console.log(e)
    var line = 1
    console.log(code.split('\n').map(function(a){return (line++) + ': ' + a}).join('\n'))
  }
}

function getClassName(file) {
  var result = file.split('/')
  result = result[result.length - 1]
  return result.split('.')[0]
}

function getImports(ast) {
  return astq.query(ast, '//ImportDeclaration/Literal').map(function(a) {
    var split = a.value.split('/')
    return split[split.length - 1]
  })
}

function getComponents(ast, imports) {
  var result = []
  var or = imports.map(function(imp) { return '@name=="' + imp + '"' })
  or = or.join(' || ')
  astq.query(ast, '//ClassBody//JSXOpeningElement[/:name JSXIdentifier [' + or + ']]').map(function(component) {
    var attributes = component.attributes.map(function(attr) {
      return attr.name.name
    })
    if (!_.find(result, { name: component.name.name })) {
      result.push({name: component.name.name, attributes: attributes})
    }
  })
  return result
}

function getPropTypes(ast) {
  var result = astq.query(ast, '//AssignmentExpression[/:left MemberExpression[/:property Identifier [@name == "propTypes"]]]')
  result = result[0].right.properties.map(function(a) {
    return a.key.name
  })

  return result
}

function getHocs(ast, imports) {
  var result = []
  if (astq.query(ast, '//ExportDefaultDeclaration/ClassDeclaration').length) {
    return result
  }

  var or = imports.map(function(imp) { return '@name=="' + imp + '"' })
  or = or.join(' || ')
  astq.query(ast, '//ExportDefaultDeclaration//CallExpression[/:callee Identifier [' + or + ']]').forEach(function(a) {
    result.push(a.callee.name)
  })
  return result
}

function fixCode(code) {
  code = fixFuckingStaticPropTypes(code)
  code = fixStatic(code)
  code = fixSpread(code)
  code = fixFlow(code)
  return code
}

function fixFuckingStaticPropTypes(code) {
  function parseClassName(code) {
    var start = code.indexOf('class ')
    var end = code.indexOf(' ', start + 'class '.length)
    return code.substring(start + 'class '.length, end)
  }

  var match = /static propTypes([^\}]*\})/g.exec(code)
  var props = null
  if (match) {
    code = code.split(match[0]).join('\n')
    props = match[1]
  } else {
    return code
  }

  props = parseClassName(code) + '.propTypes' + props

  if (code.indexOf('export default class') >= 0) {
    code += '\n\n' + props
  } else {
    var exportIndex = code.indexOf('export default')
    code = code.substring(0, exportIndex) + props + '\n\n' + code.substring(exportIndex)
  }

  return code
}

function fixStatic(code) {
  code = code.replace(/static\s\w+\s*=\s*\{([^}]*})/g, '')
  code = code.replace(/static\s\w+\s*=\s*\[([^\]]*\])/g, '')
  code = code.replace(/static[^;]+;/g, '')
  return code
}

function fixSpread(code) {
  code = code.replace(/[{][.]{3}[{][^}]+[}][}]/g, '')
  code = code.replace(/[{][.]{3}[^}]+[}]/g, '')
  code = code.replace(/[.]{3}/g, '')
  return code
}

function fixFlow(code) {
  code = code.replace(/^declare.*$/gm, '')
  code = code.replace(/[:] any/g, '')
  return code
}
